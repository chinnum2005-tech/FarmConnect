import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, MapPin, Phone, Mail, Save, Home, AlertCircle, CheckCircle2,
  Sparkles, RefreshCw, Layers, Droplets, Beaker, ShieldCheck,
  CheckCircle, Globe, Satellite, ArrowRight, X
} from 'lucide-react';
import { authService, farmService } from '../services';
import FarmerOnboardingWizard from '../components/FarmerOnboardingWizard';
import { soilIntelligenceService, SoilIntelligenceResult } from '../services/soilIntelligenceService';
import { toast } from '../components/Toast';

export default function Profile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // User Profile State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('FARMER');

  // Farm Details State
  const [hasFarm, setHasFarm] = useState(false);
  const [farmData, setFarmData] = useState<any>(null);
  const [farmName, setFarmName] = useState('');
  const [farmSize, setFarmSize] = useState(0);
  const [farmAddress, setFarmAddress] = useState('');
  const [farmLat, setFarmLat] = useState<number | undefined>();
  const [farmLng, setFarmLng] = useState<number | undefined>();
  const [certification, setCertification] = useState('STANDARD');
  const [isManualLatLngChange, setIsManualLatLngChange] = useState(false);

  // Soil and Onboarding State
  const [soilData, setSoilData] = useState<SoilIntelligenceResult | null>(null);
  const [showWizardModal, setShowWizardModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load user profile
      const user = await authService.getMe();
      if (user) {
        setCurrentUser(user);
        setFirstName(user.firstName || '');
        setLastName(user.lastName || '');
        setPhone(user.phone || '');
        setEmail(user.email || '');
        setRole(user.role || 'FARMER');
      }

      // Load farm details
      try {
        const farmRes = await farmService.getMyFarm();
        if (farmRes.data) {
          setHasFarm(true);
          setFarmData(farmRes.data);
          setFarmName(farmRes.data.name || '');
          setFarmSize(farmRes.data.size || 0);
          setCertification(farmRes.data.certification || 'STANDARD');
          setFarmAddress(farmRes.data.location?.address || '');
          const lat = farmRes.data.location?.lat;
          const lng = farmRes.data.location?.lng;
          setFarmLat(lat);
          setFarmLng(lng);

          // Fetch soil intelligence telemetry for this location
          if (lat !== undefined && lng !== undefined) {
            try {
              const soil = await soilIntelligenceService.fetchSoilData(lat, lng);
              setSoilData(soil);
            } catch (err) {
              console.warn('Soil fetch note:', err);
            }
          }
        } else {
          setHasFarm(false);
        }
      } catch (e: any) {
        if (e.response?.status !== 404) {
          console.warn("Could not load farm details:", e);
        }
        setHasFarm(false);
      }
      
    } catch (err: any) {
      setError("Failed to load profile data.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      // 1. Update user profile
      await authService.updateProfile({
        firstName,
        lastName,
        phone
      });

      // 2. Update farm details if they have one
      if (hasFarm) {
        const locationData: any = {
          address: farmAddress,
        };

        if (farmLat !== undefined && farmLng !== undefined) {
          locationData.lat = Number(farmLat);
          locationData.lng = Number(farmLng);
        }

        await farmService.updateMyFarm({
          name: farmName,
          size: Number(farmSize),
          certification: certification,
          location: locationData
        });
      }

      toast.success("Profile and Farm details saved successfully!");
      setSuccessMsg("Profile and Farm details saved successfully! Your dashboard real-time data will now reflect your new location.");
      setTimeout(() => setSuccessMsg(null), 5000);
      loadData();
      
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || "Failed to save profile.";
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFarmAddress(e.target.value);
    setIsManualLatLngChange(false);
  };

  const handleLatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFarmLat(e.target.value ? Number(e.target.value) : undefined);
    setIsManualLatLngChange(true);
  };

  const handleLngChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFarmLng(e.target.value ? Number(e.target.value) : undefined);
    setIsManualLatLngChange(true);
  };

  useEffect(() => {
    if (isManualLatLngChange && farmLat !== undefined && farmLng !== undefined) {
      const timer = setTimeout(async () => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${farmLat}&lon=${farmLng}&zoom=10`, {
             headers: { 'User-Agent': 'AgroTrace-App/1.0.0' }
          });
          const data = await res.json();
          if (data && data.display_name) {
            setFarmAddress(data.display_name);
          }
        } catch (e) {
          console.warn("Auto geocoding failed", e);
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [farmLat, farmLng, isManualLatLngChange]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-emerald-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100"
        >
          <div className="bg-gradient-to-r from-green-600 via-emerald-600 to-teal-700 px-8 py-10 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
                  {role} Account
                </span>
                {hasFarm && (
                  <span className="px-3 py-1 bg-emerald-400/30 text-emerald-100 border border-emerald-300/30 rounded-full text-xs font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-300" />
                    Onboarding Completed
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-bold">{firstName} {lastName}</h1>
              <p className="text-green-100 text-sm mt-1">{email}</p>
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => window.location.href = '/farmer/dashboard'}
                className="bg-white/20 hover:bg-white/30 px-5 py-2.5 rounded-xl backdrop-blur-sm transition flex items-center gap-2 text-sm font-semibold shadow"
              >
                <Home className="h-4 w-4" />
                Farmer Dashboard
              </button>
            </div>
          </div>

          <div className="p-8">
            {error && (
              <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {successMsg && (
              <div className="mb-6 bg-green-50 border-l-4 border-green-500 p-4 rounded-r-xl flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                <p className="text-green-700 text-sm">{successMsg}</p>
              </div>
            )}

            {/* FARM ONBOARDING STATUS SECTION */}
            <section className="mb-10 p-6 bg-gradient-to-br from-slate-900 to-emerald-950 text-white rounded-3xl shadow-xl relative overflow-hidden">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
                    <Globe className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                      🌾 Farm Onboarding & Geospatial Intelligence
                    </h2>
                    <p className="text-xs text-gray-300 mt-0.5">
                      Coordinates, pedology soil chemistry (ISRIC SoilGrids 2.0), and satellite vegetation telemetry.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowWizardModal(true)}
                  className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {hasFarm ? 'Re-run Onboarding Wizard' : 'Start Onboarding Wizard'}
                </button>
              </div>

              {/* Onboarding Steps Progress Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div className="bg-white/5 border border-white/10 p-3 rounded-2xl text-center">
                  <div className="text-[11px] text-gray-400">Step 1: Farm Details</div>
                  <div className="font-bold text-emerald-400 text-xs mt-1 flex items-center justify-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> {hasFarm ? 'Verified' : 'Pending'}
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 p-3 rounded-2xl text-center">
                  <div className="text-[11px] text-gray-400">Step 2: Map Pinning</div>
                  <div className="font-bold text-emerald-400 text-xs mt-1 flex items-center justify-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> {farmLat ? `${farmLat.toFixed(2)}°N, ${farmLng?.toFixed(2)}°E` : 'Pending'}
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 p-3 rounded-2xl text-center">
                  <div className="text-[11px] text-gray-400">Step 3: Soil Pedology</div>
                  <div className="font-bold text-emerald-400 text-xs mt-1 flex items-center justify-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> ISRIC SoilGrids
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 p-3 rounded-2xl text-center">
                  <div className="text-[11px] text-gray-400">Step 4: Crop AI Match</div>
                  <div className="font-bold text-emerald-400 text-xs mt-1 flex items-center justify-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> LightGBM Ready
                  </div>
                </div>
              </div>

              {/* Soil Telemetry Indicators if available */}
              {soilData && (
                <div className="bg-black/30 border border-emerald-500/20 rounded-2xl p-4">
                  <div className="text-xs font-bold text-emerald-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    Auto-Extracted Soil Health at Registered Coordinates:
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                    <div className="bg-white/5 p-2 rounded-xl text-center">
                      <span className="text-gray-400 text-[10px] block">Soil Type</span>
                      <span className="font-bold text-emerald-300">{soilData.soilType}</span>
                    </div>
                    <div className="bg-white/5 p-2 rounded-xl text-center">
                      <span className="text-gray-400 text-[10px] block">Soil pH</span>
                      <span className="font-bold text-white">{soilData.pH}</span>
                    </div>
                    <div className="bg-white/5 p-2 rounded-xl text-center">
                      <span className="text-gray-400 text-[10px] block">Nitrogen (N)</span>
                      <span className="font-bold text-blue-400">{soilData.N} mg/kg</span>
                    </div>
                    <div className="bg-white/5 p-2 rounded-xl text-center">
                      <span className="text-gray-400 text-[10px] block">Phosphorus (P)</span>
                      <span className="font-bold text-amber-400">{soilData.P} mg/kg</span>
                    </div>
                    <div className="bg-white/5 p-2 rounded-xl text-center col-span-2 sm:col-span-1">
                      <span className="text-gray-400 text-[10px] block">Moisture (0-7cm)</span>
                      <span className="font-bold text-cyan-400">{soilData.moisture}%</span>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <form onSubmit={handleSave} className="space-y-10">
              
              {/* Personal Details Section */}
              <section>
                <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2 border-b pb-2">
                  <User className="h-6 w-6 text-green-600" />
                  Personal Information
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                      <Mail className="h-4 w-4" /> Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      disabled
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">Email cannot be changed.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                      <Phone className="h-4 w-4" /> Phone Number
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all text-sm"
                      placeholder="+91 98765 43210"
                    />
                  </div>
                </div>
              </section>

              {/* Farm Details Section */}
              {hasFarm && (
                <section>
                  <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2 border-b pb-2">
                    <Home className="h-6 w-6 text-blue-600" />
                    Farm Settings & Certification
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Farm Name</label>
                      <input
                        type="text"
                        value={farmName}
                        onChange={(e) => setFarmName(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Farm Size (Hectares)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={farmSize}
                        onChange={(e) => setFarmSize(Number(e.target.value))}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Certification Level</label>
                      <select
                        value={certification}
                        onChange={(e) => setCertification(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                      >
                        <option value="ORGANIC">🌿 USDA / India NPOP Organic Certified</option>
                        <option value="FAIR_TRADE">🤝 FairTrade Certified</option>
                        <option value="STANDARD">🌾 Standard Good Agricultural Practice (GAP)</option>
                        <option value="REGENERATIVE">🌱 Regenerative Organic Certified</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-red-500" /> 
                        Farm Location (Address / City)
                      </label>
                      <input
                        type="text"
                        value={farmAddress}
                        onChange={handleAddressChange}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all text-sm"
                        placeholder="e.g. Rajanukunte, Yelahanka, Bengaluru"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Latitude (°N)</label>
                      <input
                        type="number"
                        step="any"
                        value={farmLat ?? ''}
                        onChange={handleLatChange}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all text-sm"
                        placeholder="e.g. 21.1458"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Longitude (°E)</label>
                      <input
                        type="number"
                        step="any"
                        value={farmLng ?? ''}
                        onChange={handleLngChange}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all text-sm"
                        placeholder="e.g. 79.0882"
                        required
                      />
                    </div>

                    <div className="md:col-span-2">
                      <p className="text-xs text-gray-500">
                        🛰️ Note: Updating coordinates automatically re-links Sentinel-2 optical NDVI satellite feeds and regional Open-Meteo telemetry on your dashboard.
                      </p>
                    </div>
                  </div>
                </section>
              )}
              
              {!hasFarm && (
                <div className="bg-yellow-50 p-6 rounded-2xl border border-yellow-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-yellow-800 font-bold mb-1">No Farm Registered Yet</h4>
                    <p className="text-yellow-700 text-xs">
                      Complete your farm onboarding to enable AI yield forecasting, Sentinel-2 vegetation index, and product batch QR codes.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowWizardModal(true)}
                    className="px-5 py-2.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow whitespace-nowrap"
                  >
                    <Sparkles className="w-4 h-4" /> Start Onboarding
                  </button>
                </div>
              )}

              <div className="pt-6 border-t flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-8 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-70 text-sm"
                >
                  {saving ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  ) : (
                    <Save className="h-5 w-5" />
                  )}
                  {saving ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>

            </form>
          </div>
        </motion.div>
      </div>

      {/* Onboarding Wizard Modal */}
      <AnimatePresence>
        {showWizardModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => setShowWizardModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-emerald-500/30 rounded-3xl p-6 max-w-4xl w-full shadow-2xl my-8 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/10">
                <div className="flex items-center gap-2 text-white">
                  <Globe className="w-5 h-5 text-emerald-400" />
                  <span className="font-bold text-lg">Farm Onboarding & Geospatial Scanner</span>
                </div>
                <button
                  onClick={() => setShowWizardModal(false)}
                  className="p-1.5 bg-white/10 hover:bg-white/20 text-gray-300 rounded-xl transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <FarmerOnboardingWizard
                userName={`${firstName} ${lastName}`.trim() || 'Farmer'}
                initialData={{ farm: farmData, soil: soilData }}
                onComplete={(createdFarm) => {
                  setShowWizardModal(false);
                  toast.success("Farm onboarding details updated!");
                  loadData();
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
