import { useEffect, useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { supplyChainService } from '../services/supplyChainService';
import { MapPin, Play, Pause } from 'lucide-react';

interface SupplyChainEvent {
  id: string;
  eventType: string;
  title: string;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  timestamp: string;
}

interface SupplyChainMapProps {
  productId: string;
  height?: string;
}

// Custom marker icons for different event types
const getEventIcon = (eventType: string) => {
  const colors: Record<string, string> = {
    '🌾 Harvested': '#16a34a',
    '📦 Packaged': '#2563eb',
    '🚚 Shipped': '#f59e0b',
    '✅ Received': '#dc2626',
    '🏪 Available': '#9333ea',
  };

  const color = colors[eventType] || '#6b7280';

  return new L.DivIcon({
    html: `
      <div style="
        background-color: ${color};
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
      ">
        📍
      </div>
    `,
    className: 'custom-marker',
    iconSize: [30, 30] as [number, number],
    iconAnchor: [15, 15] as [number, number],
  });
};

// Static memoized icon for the moving truck to prevent flicker
const truckIcon = new L.DivIcon({
  html: `
    <div style="position: relative; display: flex; align-items: center; justify-content: center;">
      <div style="
        position: absolute;
        width: 36px;
        height: 36px;
        background-color: rgba(22, 163, 74, 0.4);
        border-radius: 50%;
        animation: ping-pulse 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
      "></div>
      <div style="
        background-color: #16a34a;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        z-index: 10;
      ">
        🚚
      </div>
    </div>
    <style>
      @keyframes ping-pulse {
        0% { transform: scale(0.8); opacity: 1; }
        100% { transform: scale(1.8); opacity: 0; }
      }
    </style>
  `,
  className: 'moving-truck-marker',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

// Component that manages its own RAF loop to move the marker without triggering React renders
function AnimatedTruck({ 
  pathCoordinates, 
  isPlaying, 
  speed,
  snapTarget
}: { 
  pathCoordinates: [number, number][]; 
  isPlaying: boolean; 
  speed: number;
  snapTarget?: { index: number; trigger: number } | null;
}) {
  const markerRef = useRef<L.Marker>(null);
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>();
  
  const stateRef = useRef({
    currentSegment: 0,
    progress: 0 // 0 to 1
  });

  // Handle snap-to-checkpoint immediately
  useEffect(() => {
    if (snapTarget && snapTarget.index >= 0 && snapTarget.index < pathCoordinates.length) {
      const idx = snapTarget.index;
      if (idx >= pathCoordinates.length - 1) {
        stateRef.current.currentSegment = Math.max(0, pathCoordinates.length - 2);
        stateRef.current.progress = 1.0;
      } else {
        stateRef.current.currentSegment = idx;
        stateRef.current.progress = 0.0;
      }
      if (markerRef.current) {
        markerRef.current.setLatLng(pathCoordinates[idx]);
      }
    }
  }, [snapTarget, pathCoordinates]);

  const animate = useCallback((time: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = time;
    const deltaTime = Math.min(time - lastTimeRef.current, 100); // Cap frame delta to prevent high-speed overshoots
    lastTimeRef.current = time;

    if (isPlaying && pathCoordinates.length > 1) {
      const state = stateRef.current;
      const speedFactor = 0.0003 * speed; 
      state.progress += deltaTime * speedFactor;

      // Handle multi-segment advancement smoothly when running at 5x speed
      while (state.progress >= 1) {
        state.progress -= 1;
        state.currentSegment++;
        if (state.currentSegment >= pathCoordinates.length - 1) {
          state.currentSegment = 0; // Loop smoothly to start
        }
      }

      const p1 = pathCoordinates[state.currentSegment];
      const p2 = pathCoordinates[state.currentSegment + 1];
      
      if (p1 && p2) {
        const lat = p1[0] + (p2[0] - p1[0]) * state.progress;
        const lng = p1[1] + (p2[1] - p1[1]) * state.progress;

        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        }
      }
    }
    
    requestRef.current = requestAnimationFrame(animate);
  }, [isPlaying, pathCoordinates, speed]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [animate]);

  if (pathCoordinates.length < 2) return null;

  return (
    <Marker 
      ref={markerRef} 
      position={pathCoordinates[0]} 
      icon={truckIcon} 
      zIndexOffset={1000} 
    />
  );
}

export default function SupplyChainMap({ productId, height = '400px' }: SupplyChainMapProps) {
  const [events, setEvents] = useState<SupplyChainEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Animation state
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [snapTarget, setSnapTarget] = useState<{ index: number; trigger: number } | null>(null);

  useEffect(() => {
    if (productId) {
      loadMapData(productId);
    }
  }, [productId]);

  const loadMapData = async (id: string) => {
    try {
      setLoading(true);
      setError('');
      const response = await supplyChainService.getProductTraceability(id);
      
      if (response.success && response.data) {
        setEvents(response.data);
      } else {
        setEvents([]);
      }
    } catch (err: any) {
      console.error('Error loading map:', err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const eventsWithCoordinates = events.filter(
    (event) => event.latitude && event.longitude
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center bg-gray-100 rounded-xl" style={{ height }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading map...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center bg-red-50 rounded-xl border border-red-200" style={{ height }}>
        <div className="text-center text-red-600">
          <p className="font-semibold">⚠️ {error}</p>
        </div>
      </div>
    );
  }

  if (eventsWithCoordinates.length === 0) {
    return (
      <div className="flex items-center justify-center bg-gray-50 rounded-xl border border-gray-200" style={{ height }}>
        <div className="text-center text-gray-500">
          <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="font-medium">No location data available</p>
          <p className="text-sm">Locations will appear here as products move through the supply chain</p>
        </div>
      </div>
    );
  }

  const avgLat = eventsWithCoordinates.reduce((sum, e) => sum + (e.latitude || 0), 0) / eventsWithCoordinates.length;
  const avgLng = eventsWithCoordinates.reduce((sum, e) => sum + (e.longitude || 0), 0) / eventsWithCoordinates.length;

  const pathCoordinates = eventsWithCoordinates.map(e => [e.latitude || 0, e.longitude || 0] as [number, number]);

  return (
    <div className="rounded-xl overflow-hidden shadow-lg border border-gray-200">
      <div className="bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-green-600" />
            Product Journey Map
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Live simulation of movement from farm to customer
          </p>
        </div>
      </div>

      <MapContainer
        center={[avgLat, avgLng]}
        zoom={6}
        scrollWheelZoom={true}
        className="w-full relative z-0"
        style={{ height }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {pathCoordinates.length > 1 && (
          <Polyline
            positions={pathCoordinates}
            color="#16a34a"
            weight={4}
            opacity={0.6}
            dashArray="10, 10"
          />
        )}

        {/* The animated marker component */}
        {pathCoordinates.length > 1 && (
          <AnimatedTruck 
            pathCoordinates={pathCoordinates} 
            isPlaying={isPlaying} 
            speed={speed} 
            snapTarget={snapTarget}
          />
        )}

        {eventsWithCoordinates.map((event, index) => (
          <Marker
            key={event.id}
            position={[event.latitude || 0, event.longitude || 0]}
            icon={getEventIcon(event.title)}
            eventHandlers={{
              click: () => {
                setSnapTarget({ index, trigger: Date.now() });
              }
            }}
          >
            <Popup>
              <div className="p-2">
                <h4 className="font-bold text-gray-900 mb-1">{event.title}</h4>
                <p className="text-sm text-gray-700 mb-1">
                  <MapPin className="inline w-3 h-3 mr-1" />
                  {event.location}
                </p>
                <p className="text-xs text-gray-500 mb-2">
                  {new Date(event.timestamp).toLocaleDateString()}
                </p>
                <button
                  type="button"
                  onClick={() => setSnapTarget({ index, trigger: Date.now() })}
                  className="px-2 py-1 bg-green-600 text-white text-xs font-semibold rounded hover:bg-green-700 transition"
                >
                  Snap Truck Here 🚚
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Animation Controls */}
      {pathCoordinates.length > 1 && (
        <div className="bg-slate-50 px-6 py-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm shadow-sm"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              {isPlaying ? 'Pause Simulation' : 'Play Simulation'}
            </button>
            <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden text-sm font-medium shadow-sm">
              {[0.5, 1, 2, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-3 py-1.5 border-r border-gray-200 last:border-r-0 transition-colors ${
                    speed === s ? 'bg-green-100 text-green-700 font-bold' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
          <div className="text-xs text-gray-500 font-medium px-3 py-1 bg-white rounded-full border border-gray-200 shadow-sm flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
            Simulation Active
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="bg-white px-6 py-3 border-t border-gray-200">
        <div className="flex flex-wrap gap-4 justify-center">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full bg-green-600"></div>
            <span>Harvested</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full bg-blue-600"></div>
            <span>Processed</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full bg-amber-600"></div>
            <span>In Transit</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full bg-red-600"></div>
            <span>Delivered</span>
          </div>
        </div>
      </div>
    </div>
  );
}
