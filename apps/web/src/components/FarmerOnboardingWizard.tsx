import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Leaf, MapPin, Sparkles, CheckCircle, ArrowRight, ArrowLeft,
  Search, Shield, Sprout, Activity, Beaker, HelpCircle, AlertCircle, Loader2,
  Layers, Droplets, Thermometer, Globe, RefreshCw, Navigation, Crosshair
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { farmService } from '../services/farmService';
import { cropService } from '../services/cropService';
import { soilIntelligenceService, SoilIntelligenceResult } from '../services/soilIntelligenceService';
import api from '../services/api';
import { toast } from './Toast';

// Fix leaflet default icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface FarmMapPickerProps {
  lat: number;
  lng: number;
  onLocationChange: (lat: number, lng: number) => void;
  isScanningSoil: boolean;
  onUseCurrentLocation?: () => void;
  isLocating?: boolean;
}

function FarmMapPicker({ lat, lng, onLocationChange, isScanningSoil, onUseCurrentLocation, isLocating }: FarmMapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize Leaflet map
    const map = L.map(mapContainerRef.current, {
      center: [lat, lng],
      zoom: 12,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    // Custom pulse pin
    const customIcon = L.divIcon({
      className: 'custom-map-pin',
      html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; transform: translate(-50%, -100%);">
          <div style="position: absolute; width: 36px; height: 36px; background-color: rgba(34, 197, 94, 0.4); border-radius: 50%;"></div>
          <div style="background: linear-gradient(135deg, #22c55e, #15803d); width: 32px; height: 32px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;">
            <span style="transform: rotate(45deg); font-size: 16px;">🌾</span>
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
    });

    const marker = L.marker([lat, lng], { draggable: true, icon: customIcon }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onLocationChange(pos.lat, pos.lng);
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      onLocationChange(e.latlng.lat, e.latlng.lng);
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;

    // Call invalidateSize after Framer-Motion transition settles
    const timers = [
      setTimeout(() => map.invalidateSize(), 50),
      setTimeout(() => map.invalidateSize(), 200),
      setTimeout(() => map.invalidateSize(), 500),
      setTimeout(() => map.invalidateSize(), 1000),
    ];

    return () => {
      timers.forEach(clearTimeout);
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Update view & marker when lat/lng updates from search or external change
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current) {
      const center = mapInstanceRef.current.getCenter();
      if (Math.abs(center.lat - lat) > 0.0005 || Math.abs(center.lng - lng) > 0.0005) {
        mapInstanceRef.current.setView([lat, lng], 13, { animate: true });
        markerRef.current.setLatLng([lat, lng]);
      }
    }
  }, [lat, lng]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/20 shadow-inner w-full" style={{ height: '320px', minHeight: '320px' }}>
      <div ref={mapContainerRef} className="h-full w-full" style={{ height: '100%', minHeight: '320px', zIndex: 1 }} />
      
      {/* Floating GPS Button on Map */}
      {onUseCurrentLocation && (
        <div className="absolute top-3 right-3 z-[400]">
          <button
            type="button"
            onClick={onUseCurrentLocation}
            disabled={isLocating}
            title="Locate my farm using GPS"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/90 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 text-xs font-bold rounded-xl backdrop-blur-md border border-emerald-500/40 shadow-xl transition active:scale-95"
          >
            {isLocating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            ) : (
              <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>{isLocating ? 'Detecting GPS...' : '📍 My Location'}</span>
          </button>
        </div>
      )}

      {isScanningSoil && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-8 h-8 text-green-400 animate-spin" />
          <span className="text-xs font-semibold text-green-300">
            Querying ISRIC SoilGrids 2.0 & Open-Meteo Telemetry...
          </span>
        </div>
      )}
    </div>
  );
}

export interface InitialOnboardingData {
  farm?: any;
  soil?: SoilIntelligenceResult | null;
  crop?: any;
}

interface FarmerOnboardingWizardProps {
  userName: string;
  initialData?: InitialOnboardingData;
  onComplete: (farm: any) => void;
}

export default function FarmerOnboardingWizard({ userName, initialData, onComplete }: FarmerOnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [existingFarmId, setExistingFarmId] = useState<string | null>(initialData?.farm?.id || null);

  // Step 1: Farm Details
  const [farmData, setFarmData] = useState({
    name: initialData?.farm?.name || '',
    size: initialData?.farm?.size || 10,
    certification: initialData?.farm?.certification || 'USDA Organic',
    description: initialData?.farm?.description || '',
  });

  // Step 2: Location & Map
  const [location, setLocation] = useState<{ lat: number; lng: number; address: string }>({
    lat: initialData?.farm?.location?.lat ?? 21.1458, // Default Nagpur if not set
    lng: initialData?.farm?.location?.lng ?? 79.0882,
    address: initialData?.farm?.location?.address || 'Nagpur, Maharashtra, India',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isScanningSoil, setIsScanningSoil] = useState(false);
  const [soilScanResult, setSoilScanResult] = useState<SoilIntelligenceResult | null>(initialData?.soil || null);

  // Step 3: Soil Test
  const [soilData, setSoilData] = useState({
    N: initialData?.soil?.N ?? 45,
    P: initialData?.soil?.P ?? 22,
    K: initialData?.soil?.K ?? 35,
    pH: initialData?.soil?.pH ?? 6.8,
    moisture: initialData?.soil?.moisture ?? 32,
    soilType: initialData?.soil?.soilType || 'Rich Loamy Soil',
  });
  const [recommendedCrops, setRecommendedCrops] = useState<Array<{ name: string; type: string; confidence: number; reason: string }>>([]);

  // Step 4: First Crop Batch
  const [cropData, setCropData] = useState({
    name: initialData?.crop?.name || 'Field 1 - Active Harvest Batch',
    type: initialData?.crop?.type || 'WHEAT',
    variety: initialData?.crop?.variety || 'Sharbati High Yield',
    plantingDate: initialData?.crop?.plantingDate ? new Date(initialData.crop.plantingDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    expectedHarvest: initialData?.crop?.expectedHarvest ? new Date(initialData.crop.expectedHarvest).toISOString().split('T')[0] : new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    area: initialData?.crop?.area || 5,
  });

  // Auto scan soil on coordinates change
  const scanGeospatialSoil = useCallback(async (lat: number, lng: number) => {
    setIsScanningSoil(true);
    try {
      const res = await soilIntelligenceService.fetchSoilData(lat, lng);
      setSoilScanResult(res);
      setSoilData({
        N: res.N,
        P: res.P,
        K: res.K,
        pH: res.pH,
        moisture: res.moisture,
        soilType: res.soilType,
      });
    } catch (err) {
      console.warn('Geospatial soil scan note:', err);
    } finally {
      setIsScanningSoil(false);
    }
  }, []);

  // Fetch existing farm on mount if not provided via props
  useEffect(() => {
    if (!initialData?.farm) {
      farmService.getMyFarm().then((res) => {
        if (res.data) {
          const farm = res.data;
          setExistingFarmId(farm.id);
          setFarmData({
            name: farm.name || '',
            size: farm.size || 10,
            certification: farm.certification || 'USDA Organic',
            description: farm.description || '',
          });
          if (farm.location?.lat !== undefined && farm.location?.lng !== undefined) {
            const newLoc = {
              lat: Number(farm.location.lat),
              lng: Number(farm.location.lng),
              address: farm.location.address || 'Registered Farm Location',
            };
            setLocation(newLoc);
            scanGeospatialSoil(newLoc.lat, newLoc.lng);
          }
        }
      }).catch(() => {
        // Fresh farm onboarding
      });
    }
  }, [initialData, scanGeospatialSoil]);

  const updateLocationFromLatLng = async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`,
        { headers: { 'User-Agent': 'AgroTrace-App/1.0.0' } }
      );
      const data = await res.json();
      const addr = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      setLocation({ lat, lng, address: addr });
    } catch {
      setLocation((prev) => ({ ...prev, lat, lng, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` }));
    }
    // Automatically trigger Soil & Micro-climate analysis
    scanGeospatialSoil(lat, lng);
  };

  const handleSearchLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`,
        { headers: { 'User-Agent': 'AgroTrace-App/1.0.0' } }
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const item = data[0];
        const newLat = parseFloat(item.lat);
        const newLng = parseFloat(item.lon);
        setLocation({
          lat: newLat,
          lng: newLng,
          address: item.display_name,
        });
        scanGeospatialSoil(newLat, newLng);
        toast.success(`Location set to: ${item.display_name.split(',')[0]}`);
      } else {
        toast.error('Location not found. Please try searching another city/region.');
      }
    } catch {
      toast.error('Failed to search location.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        toast.success('Live GPS coordinates acquired!');
        await updateLocationFromLatLng(latitude, longitude);
        setIsLocating(false);
      },
      (err) => {
        setIsLocating(false);
        console.warn('Geolocation error:', err);
        if (err.code === 1) {
          toast.error('Location permission was denied. Please enable location permissions in your browser.');
        } else if (err.code === 2) {
          toast.error('Location position unavailable. Please search manually.');
        } else {
          toast.error('Could not acquire GPS location. Please use search.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Compute AI Crop recommendations based on location and soil
  useEffect(() => {
    const recs: Array<{ name: string; type: string; confidence: number; reason: string }> = [];
    const { N, P, K, pH } = soilData;

    if (pH >= 6.0 && pH <= 7.5 && N >= 40) {
      recs.push({
        name: 'Wheat (Sharbati / Durum)',
        type: 'WHEAT',
        confidence: 96,
        reason: `Optimal pH (${pH}) and balanced Nitrogen (${N} mg/kg) provide ideal conditions for high-protein wheat grain filling.`,
      });
    }
    if (N >= 50 && K >= 30) {
      recs.push({
        name: 'Basmati Rice (Paddy)',
        type: 'RICE',
        confidence: 93,
        reason: `High Nitrogen availability (${N} mg/kg) and strong moisture retention in your zone support rapid tiller development.`,
      });
    }
    if (P >= 20 && pH >= 6.2 && pH <= 7.8) {
      recs.push({
        name: 'Maize / Sweet Corn',
        type: 'CORN',
        confidence: 89,
        reason: `Phosphorus levels (${P} mg/kg) ensure strong root establishment and uniform cob development.`,
      });
    }
    if (K >= 25) {
      recs.push({
        name: 'Soybeans (Organic)',
        type: 'SOYBEANS',
        confidence: 87,
        reason: `Potassium level (${K} mg/kg) enhances nodulation and natural drought resistance.`,
      });
    }
    if (recs.length === 0) {
      recs.push({
        name: 'Sorghum / Millets',
        type: 'SORGHUM',
        confidence: 85,
        reason: 'Hardy crop resilient to variable soil nutrient distributions.',
      });
    }
    setRecommendedCrops(recs);
  }, [soilData, location]);

  const handleFinishOnboarding = async () => {
    setSubmitting(true);
    try {
      let savedFarm: any = null;

      const farmPayload = {
        name: farmData.name || `${userName}'s Farm`,
        description: farmData.description || 'Verified organic farm on AgroTrace.',
        location: {
          lat: Number(location.lat),
          lng: Number(location.lng),
          address: location.address,
        },
        size: Number(farmData.size) || 10,
        certification: farmData.certification,
      };

      if (existingFarmId) {
        // Update existing farm
        const updateRes = await farmService.updateMyFarm(farmPayload);
        savedFarm = updateRes.data || { id: existingFarmId, ...farmPayload };
      } else {
        // Create new farm
        const farmRes = await farmService.createFarm(farmPayload);
        savedFarm = farmRes.data;
      }

      // 2. Create / Link Field & Soil
      try {
        const fieldRes = await api.post('/fields', {
          name: `${farmPayload.name} - Field 1`,
          polygon: { lat: location.lat, lng: location.lng },
        });
        const fieldId = fieldRes.data?.data?.field?.id;
        if (fieldId) {
          await api.post(`/fields/${fieldId}/soil`, {
            N: soilData.N,
            P: soilData.P,
            K: soilData.K,
            pH: soilData.pH,
          });
        }
      } catch (err) {
        console.warn('Field/soil link note:', err);
      }

      // 3. Create First / Updated Crop Batch
      try {
        await cropService.createCrop({
          name: cropData.name || 'Crop Batch 1',
          type: cropData.type,
          variety: cropData.variety,
          plantingDate: cropData.plantingDate,
          expectedHarvest: cropData.expectedHarvest,
          area: Math.min(Number(cropData.area) || 2, Number(farmData.size) || 10),
          farmId: savedFarm.id,
        });
      } catch (err) {
        console.warn('Crop registration step note:', err);
      }

      toast.success('🎉 Farm Onboarding & Geospatial Configuration Saved Successfully!');
      onComplete(savedFarm);
    } catch (err: any) {
      console.error('Onboarding failed:', err);
      toast.error(err.response?.data?.message || err.message || 'Failed to complete onboarding');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full text-white flex flex-col justify-center items-center p-2 sm:p-4 relative">
      <div className="w-full max-w-3xl bg-slate-900/90 border border-white/10 rounded-3xl p-6 sm:p-10 shadow-2xl backdrop-blur-2xl relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-full text-xs font-semibold uppercase tracking-wider mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            {existingFarmId ? 'Farm Re-Onboarding & Geospatial Calibration' : 'Farmer Onboarding & Farm Setup'}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold">
            {existingFarmId ? `Update Farm Configuration, ${userName}` : `Welcome to AgroTrace, ${userName}! 👨‍🌾`}
          </h1>
          <p className="text-gray-400 mt-2 text-xs sm:text-sm">
            {existingFarmId 
              ? 'Your existing farm data is pre-populated below. Review or adjust coordinates, soil telemetry, and crop batches.'
              : 'Let\'s configure your farm, link satellite NDVI indexing, analyze your soil chemistry, and setup your first crop.'}
          </p>
        </div>

        {/* Step Indicator */}
        <div className="grid grid-cols-4 gap-2 sm:gap-4 mb-8">
          {[
            { num: 1, label: 'Farm Profile' },
            { num: 2, label: 'Satellite GPS' },
            { num: 3, label: 'Soil Analysis' },
            { num: 4, label: 'First Crop' },
          ].map((s) => (
            <div key={s.num} className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                  step === s.num
                    ? 'bg-green-500 text-black shadow-lg shadow-green-500/30 ring-2 ring-green-400'
                    : step > s.num
                    ? 'bg-green-600 text-white'
                    : 'bg-white/10 text-gray-400'
                }`}
              >
                {step > s.num ? <CheckCircle className="w-5 h-5" /> : s.num}
              </div>
              <span className="text-[11px] font-medium text-gray-300 mt-2 text-center">{s.label}</span>
            </div>
          ))}
        </div>

        {/* STEP 1: Farm Details */}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="border-b border-white/10 pb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Leaf className="w-5 h-5 text-green-400" />
                  Farm Profile & Certification
                </h2>
                <p className="text-gray-400 text-xs mt-1">Enter your farm's identification and acreage.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                    Farm Name
                  </label>
                  <input
                    type="text"
                    value={farmData.name}
                    onChange={(e) => setFarmData({ ...farmData, name: e.target.value })}
                    placeholder="e.g. Green Valley Agro Estate"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-400 text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                    Total Farm Size (Hectares)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={farmData.size}
                    onChange={(e) => setFarmData({ ...farmData, size: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-green-400 text-sm font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                    Certification Status
                  </label>
                  <select
                    value={farmData.certification}
                    onChange={(e) => setFarmData({ ...farmData, certification: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-green-400 text-sm"
                  >
                    <option value="USDA Organic">🌿 USDA Organic Certified</option>
                    <option value="India NPOP Organic">🇮🇳 India NPOP Organic</option>
                    <option value="FairTrade Certified">🤝 FairTrade Certified</option>
                    <option value="Standard GAP">🌾 Standard Good Agricultural Practice</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                    Farm Description (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={farmData.description}
                    onChange={(e) => setFarmData({ ...farmData, description: e.target.value })}
                    placeholder="Describe your soil cultivation methods, organic standards, and irrigation sources..."
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-400 text-sm resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  disabled={!farmData.name}
                  onClick={() => setStep(2)}
                  className="px-6 py-3 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-bold rounded-xl transition flex items-center gap-2 shadow-lg shadow-green-500/20 text-sm"
                >
                  Next: Pin Location on Map <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Location Map */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="border-b border-white/10 pb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-red-400" />
                  Farm Geolocation & Sentinel-2 Satellite Anchor
                </h2>
                <p className="text-gray-400 text-xs mt-1">
                  Search your city or drag the pin directly over your farm to automatically pull ISRIC soil layers and satellite weather.
                </p>
              </div>

              {/* Search Bar & Use Current Location Button */}
              <div className="flex flex-col sm:flex-row gap-2">
                <form onSubmit={handleSearchLocation} className="flex flex-1 gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search city, district, or region (e.g. Nashik, Punjab, Bengaluru)..."
                      className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-400 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSearching}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition flex items-center gap-2 border border-white/10 text-sm shrink-0"
                  >
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={isLocating}
                  className="px-4 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 hover:text-emerald-300 font-semibold rounded-xl transition flex items-center justify-center gap-2 border border-emerald-500/30 text-sm shrink-0 shadow-sm"
                >
                  {isLocating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Navigation className="w-4 h-4 text-emerald-400" />
                  )}
                  <span>{isLocating ? 'Locating...' : 'Use Current Location'}</span>
                </button>
              </div>

              {/* Interactive Leaflet Map with isolated lifecycle */}
              <FarmMapPicker
                lat={location.lat}
                lng={location.lng}
                onLocationChange={updateLocationFromLatLng}
                isScanningSoil={isScanningSoil}
                onUseCurrentLocation={handleUseCurrentLocation}
                isLocating={isLocating}
              />

              {/* Location Badge */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-green-400 shrink-0" />
                  <span className="text-gray-300 line-clamp-1">{location.address}</span>
                </div>
                <div className="text-emerald-400 font-mono font-bold shrink-0">
                  {location.lat.toFixed(4)}°N, {location.lng.toFixed(4)}°E
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition flex items-center gap-2 text-sm"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-6 py-2.5 bg-green-500 hover:bg-green-400 text-black font-bold rounded-xl transition flex items-center gap-2 shadow-lg shadow-green-500/20 text-sm"
                >
                  Next: Soil Pedology & Chemistry <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Soil Analysis */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="border-b border-white/10 pb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Beaker className="w-5 h-5 text-emerald-400" />
                  Soil Pedology & Chemistry Profile
                </h2>
                <p className="text-gray-400 text-xs mt-1">
                  Derived via ISRIC SoilGrids 2.0 pedological layers for your farm's exact latitude & longitude. You can fine-tune values below.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                  <label className="text-[11px] text-gray-400 block mb-1">Nitrogen (N) mg/kg</label>
                  <input
                    type="number"
                    value={soilData.N}
                    onChange={(e) => setSoilData({ ...soilData, N: Number(e.target.value) })}
                    className="w-full bg-transparent text-lg font-bold text-blue-400 focus:outline-none"
                  />
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                  <label className="text-[11px] text-gray-400 block mb-1">Phosphorus (P) mg/kg</label>
                  <input
                    type="number"
                    value={soilData.P}
                    onChange={(e) => setSoilData({ ...soilData, P: Number(e.target.value) })}
                    className="w-full bg-transparent text-lg font-bold text-amber-400 focus:outline-none"
                  />
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                  <label className="text-[11px] text-gray-400 block mb-1">Potassium (K) mg/kg</label>
                  <input
                    type="number"
                    value={soilData.K}
                    onChange={(e) => setSoilData({ ...soilData, K: Number(e.target.value) })}
                    className="w-full bg-transparent text-lg font-bold text-emerald-400 focus:outline-none"
                  />
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                  <label className="text-[11px] text-gray-400 block mb-1">Soil pH (0-14)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={soilData.pH}
                    onChange={(e) => setSoilData({ ...soilData, pH: Number(e.target.value) })}
                    className="w-full bg-transparent text-lg font-bold text-purple-400 focus:outline-none"
                  />
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                  <label className="text-[11px] text-gray-400 block mb-1">Moisture (0-7cm %)</label>
                  <input
                    type="number"
                    value={soilData.moisture}
                    onChange={(e) => setSoilData({ ...soilData, moisture: Number(e.target.value) })}
                    className="w-full bg-transparent text-lg font-bold text-cyan-400 focus:outline-none"
                  />
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                  <label className="text-[11px] text-gray-400 block mb-1">Soil Classification</label>
                  <input
                    type="text"
                    value={soilData.soilType}
                    onChange={(e) => setSoilData({ ...soilData, soilType: e.target.value })}
                    className="w-full bg-transparent text-xs font-bold text-white focus:outline-none mt-1"
                  />
                </div>
              </div>

              {/* AI Recommended Crops Preview */}
              <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs uppercase tracking-wider mb-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  Real-Time AI Crop Compatibility Match
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {recommendedCrops.slice(0, 2).map((rec, i) => (
                    <div key={i} className="bg-white/5 p-3 rounded-xl border border-white/5">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-sm text-white">{rec.name}</span>
                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full text-[10px] font-bold">
                          {rec.confidence}% Match
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 line-clamp-2">{rec.reason}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition flex items-center gap-2 text-sm"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="px-6 py-2.5 bg-green-500 hover:bg-green-400 text-black font-bold rounded-xl transition flex items-center gap-2 shadow-lg shadow-green-500/20 text-sm"
                >
                  Next: Configure Crop Batch <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 4: First Crop Batch */}
          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="border-b border-white/10 pb-4">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Sprout className="w-5 h-5 text-green-400" />
                  Cultivation Batch Setup & Sowing Date
                </h2>
                <p className="text-gray-400 text-xs mt-1">
                  Configure your crop batch to activate the LightGBM yield regressor and Sentinel-2 canopy health index.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                    Crop Type
                  </label>
                  <select
                    value={cropData.type}
                    onChange={(e) => {
                      const type = e.target.value;
                      setCropData({
                        ...cropData,
                        type,
                        name: `${farmData.name || 'Farm'} - ${type} Batch 1`,
                      });
                    }}
                    className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-green-400 text-sm font-semibold"
                  >
                    <option value="WHEAT">🌾 Wheat (Rabi Season)</option>
                    <option value="RICE">🍚 Basmati Rice / Paddy (Kharif)</option>
                    <option value="CORN">🌽 Hybrid Maize / Corn</option>
                    <option value="SOYBEANS">🌱 Organic Soybeans</option>
                    <option value="COTTON">☁️ Cotton</option>
                    <option value="SUGARCANE">🎋 Sugarcane</option>
                    <option value="PULSES">🫘 Pulses & Legumes</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                    Crop Variety
                  </label>
                  <input
                    type="text"
                    value={cropData.variety}
                    onChange={(e) => setCropData({ ...cropData, variety: e.target.value })}
                    placeholder="e.g. Sharbati C-306 / Pusa 1121"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-400 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                    Planting / Sowing Date
                  </label>
                  <input
                    type="date"
                    value={cropData.plantingDate}
                    onChange={(e) => setCropData({ ...cropData, plantingDate: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-green-400 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                    Expected Harvest Date
                  </label>
                  <input
                    type="date"
                    value={cropData.expectedHarvest}
                    onChange={(e) => setCropData({ ...cropData, expectedHarvest: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-green-400 text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                    Cultivated Area for this Crop (Hectares)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    max={farmData.size}
                    value={cropData.area}
                    onChange={(e) => setCropData({ ...cropData, area: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-green-400 text-sm font-semibold"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Must be $\le$ Total Farm Size ({farmData.size} ha).</p>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition flex items-center gap-2 text-sm"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleFinishOnboarding}
                  className="px-8 py-3 bg-gradient-to-r from-green-500 via-emerald-400 to-teal-400 hover:opacity-90 disabled:opacity-50 text-black font-extrabold rounded-xl transition flex items-center gap-2 shadow-xl shadow-green-500/30 text-sm"
                >
                  {submitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Sparkles className="w-5 h-5" />
                  )}
                  {submitting ? 'Saving Configuration...' : existingFarmId ? 'Save & Update Farm Configuration' : 'Complete Setup & Enter Dashboard'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
