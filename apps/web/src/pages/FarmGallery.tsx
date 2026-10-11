import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Upload, X, ZoomIn, Trash2, MapPin, Calendar, Tag, Grid, List, Store, ShoppingCart, Shield, MessageCircle, LogOut } from 'lucide-react';
import MacDock, { DockItem } from '../components/ui/MacDock';

interface CropPhoto {
  id: string;
  url: string;
  caption: string;
  cropName: string;
  stage: string;
  location: string;
  uploadedAt: Date;
  tags: string[];
}

// Demo photos using placeholder gradients
const demoPhotos: CropPhoto[] = [
  {
    id: '1',
    url: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400&h=300&fit=crop',
    caption: 'Wheat Field A — Early germination stage',
    cropName: 'Wheat Field A',
    stage: 'GERMINATION',
    location: 'Block 1, Section A',
    uploadedAt: new Date(Date.now() - 2 * 86400000),
    tags: ['germination', 'wheat', 'healthy'],
  },
  {
    id: '2',
    url: 'https://images.unsplash.com/photo-1560493676-04071c5f467b?w=400&h=300&fit=crop',
    caption: 'Corn Field B — Vegetative stage, excellent growth',
    cropName: 'Corn Field B',
    stage: 'VEGETATIVE',
    location: 'Block 2, Section C',
    uploadedAt: new Date(Date.now() - 5 * 86400000),
    tags: ['vegetative', 'corn', 'healthy'],
  },
  {
    id: '3',
    url: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=400&h=300&fit=crop',
    caption: 'Rice Paddy D — Flowering beautifully',
    cropName: 'Rice Paddy D',
    stage: 'FLOWERING',
    location: 'Block 3, Section B',
    uploadedAt: new Date(Date.now() - 7 * 86400000),
    tags: ['flowering', 'rice', 'organic'],
  },
  {
    id: '4',
    url: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=400&h=300&fit=crop',
    caption: 'Soybean Field C — Maturing stage',
    cropName: 'Soybean Field C',
    stage: 'MATURING',
    location: 'Block 1, Section D',
    uploadedAt: new Date(Date.now() - 10 * 86400000),
    tags: ['maturing', 'soybean', 'good-condition'],
  },
  {
    id: '5',
    url: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400&h=300&fit=crop',
    caption: 'Overview of farm after rainfall',
    cropName: 'Full Farm',
    stage: 'VEGETATIVE',
    location: 'Green Valley Farm',
    uploadedAt: new Date(Date.now() - 14 * 86400000),
    tags: ['overview', 'rain', 'all-crops'],
  },
  {
    id: '6',
    url: 'https://images.unsplash.com/photo-1592982537447-7440770cbfc9?w=400&h=300&fit=crop',
    caption: 'Irrigation system working on wheat field',
    cropName: 'Wheat Field A',
    stage: 'VEGETATIVE',
    location: 'Block 1, Irrigation Zone',
    uploadedAt: new Date(Date.now() - 20 * 86400000),
    tags: ['irrigation', 'equipment', 'wheat'],
  },
];

const stageColors: Record<string, string> = {
  GERMINATION: 'bg-green-100 text-green-700',
  VEGETATIVE: 'bg-emerald-100 text-emerald-700',
  FLOWERING: 'bg-yellow-100 text-yellow-700',
  MATURING: 'bg-amber-100 text-amber-700',
  READY_FOR_HARVEST: 'bg-green-600 text-white',
  HARVESTED: 'bg-gray-100 text-gray-700',
};

export default function FarmGallery() {
  const [photos, setPhotos] = useState<CropPhoto[]>(demoPhotos);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedPhoto, setSelectedPhoto] = useState<CropPhoto | null>(null);
  const [filterStage, setFilterStage] = useState('All');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stages = ['All', ...Array.from(new Set(photos.map(p => p.stage)))];

  const filtered = filterStage === 'All' ? photos : photos.filter(p => p.stage === filterStage);

  const handleUpload = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const newPhoto: CropPhoto = {
        id: Date.now().toString(),
        url: e.target?.result as string,
        caption: file.name.replace(/\.[^/.]+$/, ''),
        cropName: 'My Crop',
        stage: 'VEGETATIVE',
        location: 'My Farm',
        uploadedAt: new Date(),
        tags: ['new'],
      };
      setPhotos(prev => [newPhoto, ...prev]);
    };
    reader.readAsDataURL(file);
  };

  const handleDelete = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
    if (selectedPhoto?.id === id) setSelectedPhoto(null);
  };

  const isAuthenticated = !!localStorage.getItem('user');

  const dockItems: DockItem[] = [
    { id: 'market',    icon: Store,         label: 'Marketplace',               gradient: 'linear-gradient(135deg,#06b6d4,#0e7490)',  onClick: () => window.location.href='/marketplace' },
    { id: 'orders',    icon: ShoppingCart,  label: 'My Orders',                  gradient: 'linear-gradient(135deg,#f59e0b,#d97706)',  onClick: () => window.location.href='/marketplace' },
    { id: 'blockchain',icon: Shield,        label: 'Blockchain',                gradient: 'linear-gradient(135deg,#8b5cf6,#6d28d9)',  onClick: () => window.location.href='/blockchain' },
    { id: 'chatbot',   icon: MessageCircle, label: 'AgroBot AI',                gradient: 'linear-gradient(135deg,#3b82f6,#1d4ed8)',  onClick: () => window.location.href='/chatbot' },
    { id: 'gallery',   icon: Camera,        label: 'Farm Gallery', active: true, gradient: 'linear-gradient(135deg,#0ea5e9,#0369a1)',  onClick: () => window.location.href='/gallery' },
    { id: 'logout',    icon: LogOut,        label: 'Logout',                    gradient: 'linear-gradient(135deg,#ef4444,#b91c1c)',  onClick: () => { localStorage.removeItem('token'); localStorage.removeItem('user'); sessionStorage.clear(); window.location.href='/login'; } },
  ];

  return (
    <div className={`min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900 p-6 ${isAuthenticated ? 'pb-32' : ''}`}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-3xl p-8 text-white shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-white/20 rounded-2xl">
                <Camera className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">📸 Farm Photo Gallery</h1>
                <p className="text-emerald-100 mt-1">Timestamped crop photos with GPS metadata</p>
              </div>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-6 py-3 bg-white text-emerald-700 rounded-xl font-bold hover:bg-emerald-50 transition-colors shadow-lg"
            >
              <Upload className="h-5 w-5" />
              Upload Photo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            {[
              { label: 'Total Photos', value: photos.length },
              { label: 'Crops Documented', value: new Set(photos.map(p => p.cropName)).size },
              { label: 'This Month', value: photos.filter(p => Date.now() - p.uploadedAt.getTime() < 30 * 86400000).length },
            ].map((stat, i) => (
              <div key={i} className="bg-white/20 backdrop-blur-sm rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-emerald-100 text-sm">{stat.label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Controls */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {stages.map(stage => (
              <button
                key={stage}
                onClick={() => setFilterStage(stage)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  filterStage === stage
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-emerald-300'
                }`}
              >
                {stage === 'All' ? '🌿 All Photos' : stage.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-emerald-100 text-emerald-600' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Grid className="h-5 w-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-emerald-100 text-emerald-600' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <List className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Photo Grid */}
        <div className={`${viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}`}>
          {filtered.map((photo, index) => (
            <motion.div
              key={photo.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              className={`bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-all group ${viewMode === 'list' ? 'flex items-center gap-4 p-4' : ''}`}
            >
              <div className={`relative overflow-hidden ${viewMode === 'grid' ? 'h-52' : 'w-28 h-24 flex-shrink-0 rounded-xl'}`}>
                <img
                  src={photo.url}
                  alt={photo.caption}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  crossOrigin="anonymous"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => setSelectedPhoto(photo)}
                    className="p-2 bg-white/90 rounded-lg hover:bg-white transition-colors"
                  >
                    <ZoomIn className="h-4 w-4 text-gray-700" />
                  </button>
                  <button
                    onClick={() => handleDelete(photo.id)}
                    className="p-2 bg-red-500/90 rounded-lg hover:bg-red-500 transition-colors"
                  >
                    <Trash2 className="h-4 w-4 text-white" />
                  </button>
                </div>
                <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-lg text-xs font-semibold ${stageColors[photo.stage] || 'bg-gray-100 text-gray-700'}`}>
                  {photo.stage.replace(/_/g, ' ')}
                </span>
              </div>

              <div className={viewMode === 'grid' ? 'p-4' : 'flex-1 min-w-0'}>
                <h3 className="font-bold text-gray-900 dark:text-white text-sm truncate">{photo.caption}</h3>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                  <MapPin className="h-3 w-3" />
                  <span>{photo.location}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  <Calendar className="h-3 w-3" />
                  <span>{photo.uploadedAt.toLocaleDateString()}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {photo.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-full text-xs">
                      <Tag className="h-2.5 w-2.5" />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <Camera className="h-16 w-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No photos yet</p>
            <p className="text-sm mt-2">Upload your first crop photo to get started</p>
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      <AnimatePresence>
        {selectedPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedPhoto(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="max-w-3xl w-full bg-white dark:bg-gray-900 rounded-3xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <img
                src={selectedPhoto.url}
                alt={selectedPhoto.caption}
                className="w-full max-h-[60vh] object-cover"
                crossOrigin="anonymous"
              />
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{selectedPhoto.caption}</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{selectedPhoto.cropName}</p>
                  </div>
                  <button onClick={() => setSelectedPhoto(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <MapPin className="h-4 w-4" /> {selectedPhoto.location}
                  </div>
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Calendar className="h-4 w-4" /> {selectedPhoto.uploadedAt.toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {selectedPhoto.tags.map(tag => (
                    <span key={tag} className="px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-medium">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* macOS-style magnification dock */}
      {isAuthenticated && <MacDock items={dockItems} />}
    </div>
  );
}
