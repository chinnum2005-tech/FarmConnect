import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, BarChart3, AlertTriangle, Loader2,
  MapPin, Store, Calendar, ArrowUpRight, ArrowDownRight, ShieldCheck, CheckCircle2
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { marketService, MarketPrediction } from '../services/marketService';

const trendConfig = {
  rising: { color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', icon: TrendingUp, label: 'Rising' },
  falling: { color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800', icon: TrendingDown, label: 'Declining' },
  stable: { color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800', icon: BarChart3, label: 'Stable' },
};

const CROPS = [
  { key: 'WHEAT', label: '🌾 Wheat', apiCrop: 'wheat' },
  { key: 'RICE', label: '🍚 Rice / Paddy', apiCrop: 'rice' },
  { key: 'CORN', label: '🌽 Corn / Maize', apiCrop: 'maize' },
  { key: 'SOYBEANS', label: '🌱 Soybeans', apiCrop: 'soybeans' },
  { key: 'COTTON', label: '☁️ Cotton', apiCrop: 'cotton' },
  { key: 'PULSES', label: '🫘 Pulses', apiCrop: 'pulses' },
];

interface PricePredictionProps {
  address?: string;
  lat?: number;
  lng?: number;
}

export default function PricePrediction({ address, lat, lng }: PricePredictionProps) {
  const [selectedCrop, setSelectedCrop] = useState<string>('WHEAT');
  const [prediction, setPrediction] = useState<MarketPrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError('');

    const cropObj = CROPS.find(c => c.key === selectedCrop) || CROPS[0];
    
    marketService.getMarketPrediction(cropObj.apiCrop, address, lat, lng)
      .then(data => {
        if (isMounted) {
          setPrediction(data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err.message || 'Failed to fetch market data');
          setLoading(false);
        }
      });

    return () => { isMounted = false; };
  }, [selectedCrop, address, lat, lng]);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-gray-500 min-h-[380px]">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600 mb-4" />
          <p className="font-medium text-sm">Querying Agmarknet DMI Mandi API for your farm location...</p>
        </div>
      );
    }

    if (error || !prediction) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-red-500 min-h-[380px]">
          <AlertTriangle className="h-8 w-8 mb-4" />
          <p>{error || 'No mandi data available for this zone'}</p>
        </div>
      );
    }

    const currentPrice = prediction.currentModalPrice || prediction.currentMSP;
    const isPriceUp = currentPrice >= prediction.currentMSP;
    const priceChange = (((currentPrice - prediction.currentMSP) / prediction.currentMSP) * 100).toFixed(1);

    // Determine trend based on projection
    let trend: 'rising' | 'falling' | 'stable' = 'stable';
    if (prediction.projectedSeries && prediction.projectedSeries.length > 0) {
      const futurePrice = prediction.projectedSeries[prediction.projectedSeries.length - 1].price;
      if (futurePrice > currentPrice * 1.04) trend = 'rising';
      else if (futurePrice < currentPrice * 0.96) trend = 'falling';
    }

    const TrendIcon = trendConfig[trend].icon;

    // Chart Data
    const chartData = [
      ...prediction.historicalSeries.map(h => ({
        month: new Date(h.date).toLocaleDateString('en-IN', { month: 'short' }),
        historical: h.price,
        msp: prediction.currentMSP,
      })),
      ...prediction.projectedSeries.map(p => ({
        month: new Date(p.date).toLocaleDateString('en-IN', { month: 'short' }),
        projected: p.price,
        msp: prediction.currentMSP,
      })),
    ];

    return (
      <div className="p-6 space-y-6 animate-in fade-in duration-500">
        {/* Farm Location & Regional Mandi Header Banner */}
        <div className="bg-slate-900 text-white rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-purple-500/20 shadow-inner">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/20 border border-purple-400/30 rounded-xl text-purple-400">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white">{prediction.marketName || 'Regional APMC Mandi'}</span>
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full text-[10px] font-bold">
                  📍 {prediction.state}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {prediction.district ? `District: ${prediction.district}` : 'Serving Registered Farm Region'} • Live Arrivals
              </p>
            </div>
          </div>
          <div className="text-xs text-gray-400 flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
            <Calendar className="w-3.5 h-3.5 text-purple-400" />
            <span>Arrivals: {prediction.arrivalDate || 'Today'}</span>
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card 1: Official Government MSP */}
          <div className="bg-gray-50 dark:bg-gray-700/60 rounded-2xl p-4 border border-gray-200/60 dark:border-gray-600">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Government MSP</span>
              <ShieldCheck className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-2xl font-black text-gray-900 dark:text-white">₹{prediction.currentMSP}</p>
            <p className="text-[11px] text-gray-500 mt-1">₹ per quintal benchmark</p>
          </div>

          {/* Card 2: Live Local Mandi Modal Price */}
          <div className={`rounded-2xl p-4 ${trendConfig[trend].bg} border ${trendConfig[trend].border}`}>
            <div className="flex justify-between items-center mb-1">
              <span className={`text-xs font-semibold ${trendConfig[trend].color}`}>Live Mandi Modal Price</span>
              <TrendIcon className={`w-4 h-4 ${trendConfig[trend].color}`} />
            </div>
            <p className={`text-2xl font-black ${trendConfig[trend].color}`}>
              {prediction.currentModalPrice ? `₹${prediction.currentModalPrice}` : 'N/A'}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`text-xs font-bold flex items-center ${isPriceUp ? 'text-emerald-600' : 'text-red-500'}`}>
                {isPriceUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {isPriceUp ? '+' : ''}{priceChange}% vs MSP
              </span>
              {prediction.minPrice && prediction.maxPrice && (
                <span className="text-[10px] text-gray-500">
                  (Range: ₹{prediction.minPrice} - ₹{prediction.maxPrice})
                </span>
              )}
            </div>
          </div>

          {/* Card 3: 6-Month Trend Outlook */}
          <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-4">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">6-Month Trend Forecast</span>
              <BarChart3 className="w-4 h-4 text-indigo-500" />
            </div>
            <p className="text-lg font-black text-indigo-900 dark:text-indigo-200">
              {trend === 'rising' ? '📈 Bullish / Rising' : trend === 'falling' ? '📉 Bearish / Declining' : '⚖️ Stable Equilibrium'}
            </p>
            <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-1 font-mono">
              {prediction.trendFitMetric}
            </p>
          </div>
        </div>

        {/* Price Chart */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="font-bold text-gray-800 dark:text-white text-sm">6-Month Price Trend & Projections</h3>
              <p className="text-xs text-gray-500">Derived from authentic {prediction.state} historical market series</p>
            </div>
            <span className="text-xs text-gray-500 flex items-center gap-2">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" /> Historical
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 inline-block" /> Forecast
              </span>
            </span>
          </div>

          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="projGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: any) => [`₹${value}/quintal`, 'Price']} />
                <ReferenceLine
                  y={prediction.currentMSP}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{ value: `MSP ₹${prediction.currentMSP}`, fill: '#ef4444', fontSize: 10, position: 'top' }}
                />
                <Area type="monotone" dataKey="historical" stroke="#8b5cf6" fill="url(#priceGradient)" strokeWidth={2.5} dot={{ fill: '#8b5cf6', r: 4 }} name="Historical" />
                <Area type="monotone" dataKey="projected" stroke="#818cf8" strokeDasharray="4 4" fill="url(#projGradient)" strokeWidth={2} dot={{ fill: '#818cf8', r: 3 }} name="Projected" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Nearby District Mandis Comparison */}
        {prediction.nearbyMandis && prediction.nearbyMandis.length > 0 && (
          <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
            <h4 className="font-bold text-xs text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-purple-600" />
              Nearby Mandi Price Comparison ({prediction.state})
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {prediction.nearbyMandis.map((mandi, idx) => (
                <div key={idx} className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl border border-gray-200/60 dark:border-gray-600 flex flex-col justify-between">
                  <div>
                    <span className="font-bold text-xs text-gray-900 dark:text-white line-clamp-1">{mandi.market}</span>
                    <span className="text-[10px] text-gray-500 block">{mandi.district}</span>
                  </div>
                  <div className="mt-2 flex justify-between items-baseline">
                    <span className="text-xs font-extrabold text-purple-600 dark:text-purple-400">₹{mandi.modalPrice}</span>
                    <span className="text-[9px] text-gray-400">₹{mandi.minPrice}-{mandi.maxPrice}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Data Source Details */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 text-[11px] text-gray-500 dark:text-gray-400 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border border-gray-200/50 dark:border-gray-700">
          <div><strong>Data Source:</strong> {prediction.dataSource}</div>
          <div><strong>Last Synchronized:</strong> {prediction.lastUpdated}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-700">
      {/* Header */}
      <div className="p-6 bg-gradient-to-r from-purple-700 via-indigo-700 to-slate-900 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md border border-white/20">
              <TrendingUp className="h-6 w-6 text-purple-300" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">📊 Live Mandi Market Intelligence</h2>
              <p className="text-purple-200 text-xs mt-0.5">
                Real-time wholesale APMC rates tailored to your registered farm location
              </p>
            </div>
          </div>
          {address && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-xs font-semibold text-purple-200 border border-white/10">
              <MapPin className="w-3.5 h-3.5 text-purple-300 shrink-0" />
              <span className="line-clamp-1 max-w-[200px]">{address.split(',')[0]}</span>
            </div>
          )}
        </div>

        {/* Crop Selector Tabs */}
        <div className="flex flex-wrap gap-2 pt-2">
          {CROPS.map(crop => (
            <button
              key={crop.key}
              onClick={() => setSelectedCrop(crop.key)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedCrop === crop.key
                  ? 'bg-white text-purple-900 shadow-md scale-105'
                  : 'bg-white/15 text-purple-100 hover:bg-white/25'
              }`}
            >
              {crop.label}
            </button>
          ))}
        </div>
      </div>

      {renderContent()}
    </div>
  );
}
