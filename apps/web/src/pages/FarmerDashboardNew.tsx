import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MacDock, { DockItem } from '../components/ui/MacDock';
import { 
  Leaf, Plus, QrCode, Upload, CheckCircle, Package, TrendingUp, 
  Sun, Cloud, Droplets, Wind, Thermometer, Calendar, MapPin,
  DollarSign, Eye, ShoppingCart, BarChart3, PieChart, Activity, LogOut, Store,
  Camera, Shield
} from 'lucide-react';
import { cropService, farmService, verifyService, orderService } from '../services';
import { QRCodeSVG } from 'qrcode.react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, PieChart as RechartsPie, Pie, Cell, Legend
} from 'recharts';
import PricePrediction from '../components/PricePrediction';
import PDFReportButton from '../components/PDFReportButton';

const COLORS = ['#16a34a', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6'];

export default function FarmerDashboard() {
  const [crops, setCrops] = useState<any[]>([]);
  const [farm, setFarm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showQRModal, setShowQRModal] = useState(false);
  const [selectedCrop, setSelectedCrop] = useState<any>(null);
  const [stats, setStats] = useState({
    totalCrops: 0,
    totalArea: 0,
    estimatedYield: 0,
    totalRevenue: 0,
  });
  
  // Get current user from localStorage
  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  })();
  const userName = currentUser?.firstName || 'Farmer';

  // Mock weather data (can be replaced with real API)
  const weather = {
    temp: 28,
    condition: 'Partly Cloudy',
    humidity: 65,
    windSpeed: 12,
    rainfall: 45,
    forecast: [
      { day: 'Mon', temp: 28, rain: 40 },
      { day: 'Tue', temp: 30, rain: 20 },
      { day: 'Wed', temp: 27, rain: 60 },
      { day: 'Thu', temp: 29, rain: 30 },
      { day: 'Fri', temp: 31, rain: 10 },
    ]
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const [orders, setOrders] = useState<any[]>([]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load farm
      try {
        const farmRes = await farmService.getMyFarm();
        if (farmRes.data) {
          setFarm(farmRes.data);
        }
      } catch (err) {
        // Use mock farm data
        setFarm({
          id: '1',
          name: 'Green Valley Farm',
          size: 150.5,
          certification: 'USDA Organic',
          location: { address: 'Agricultural Valley, CA' }
        });
      }

      let fetchedOrders: any[] = [];
      try {
        const ordersRes = await orderService.getFarmerOrders();
        if (ordersRes.data) {
          fetchedOrders = ordersRes.data;
          setOrders(fetchedOrders);
        }
      } catch (err) {
        console.error('Failed to load orders', err);
      }

      // Load crops
      try {
        const cropsRes = await cropService.getMyCrops();
        if (cropsRes.data) {
          setCrops(cropsRes.data);
        }
      } catch (err) {
        // Mock crop data
        const mockCrops = [
          { id: '1', name: 'Wheat Field A', type: 'WHEAT', growthStage: 'VEGETATIVE', area: 50, estimatedYield: 2250, plantedAt: '2026-03-01' },
          { id: '2', name: 'Corn Field B', type: 'CORN', growthStage: 'FLOWERING', area: 35, estimatedYield: 3150, plantedAt: '2026-03-05' },
          { id: '3', name: 'Soybean Field C', type: 'SOYBEANS', growthStage: 'MATURING', area: 40, estimatedYield: 1600, plantedAt: '2026-03-10' },
          { id: '4', name: 'Rice Paddy D', type: 'RICE', growthStage: 'PLANTED', area: 25, estimatedYield: 1800, plantedAt: '2026-03-12' },
        ];
        setCrops(mockCrops);
      }

      // Calculate stats
      setStats(prev => ({
        ...prev,
        totalRevenue: fetchedOrders.reduce((sum, order) => sum + (order.totalPrice || 0), 0)
      }));

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQR = async (cropId: string) => {
    try {
      const response = await verifyService.generateQRCode(cropId);
      setSelectedCrop(response.data);
      setShowQRModal(true);
    } catch (error) {
      console.error('Failed to generate QR:', error);
      alert('Failed to generate QR code');
    }
  };

  const getGrowthStageColor = (stage: string) => {
    const colors: Record<string, string> = {
      PLANTED: 'bg-blue-100 text-blue-800',
      GERMINATION: 'bg-green-100 text-green-800',
      VEGETATIVE: 'bg-green-200 text-green-800',
      FLOWERING: 'bg-yellow-100 text-yellow-800',
      FRUITING: 'bg-orange-100 text-orange-800',
      MATURING: 'bg-amber-100 text-amber-800',
      READY_FOR_HARVEST: 'bg-green-600 text-white',
      HARVESTED: 'bg-gray-100 text-gray-800',
    };
    return colors[stage] || 'bg-gray-100 text-gray-800';
  };

  const getCropTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      WHEAT: '🌾',
      CORN: '🌽',
      RICE: '🌾',
      SOYBEANS: '🫘',
      BARLEY: '🌾',
      OATS: '🌾',
      CANOLA: '🌻',
      SORGHUM: '🌾',
    };
    return icons[type] || '🌱';
  };

  const handleDispatchOrder = async (orderId: string) => {
    try {
      await orderService.updateOrderStatus(orderId, 'ASSIGNED');
      alert('Order successfully dispatched to Distributor!');
      loadDashboardData(); // Refresh the orders
    } catch (error) {
      console.error('Failed to dispatch order:', error);
      alert('Failed to dispatch order. Please try again.');
    }
  };

  // Chart data
  const yieldData = crops.map(crop => ({
    name: crop.name.split(' ')[0],
    estimated: crop.estimatedYield || 0,
    actual: (crop.estimatedYield || 0) * 0.95, // Mock actual
  }));

  const cropDistribution = crops.map(crop => ({
    name: crop.type,
    value: crop.area || 0,
  }));

  const revenueData = [
    { month: 'Jan', revenue: 12000 },
    { month: 'Feb', revenue: 15000 },
    { month: 'Mar', revenue: 18000 },
    { month: 'Apr', revenue: 22000 },
    { month: 'May', revenue: 28000 },
    { month: 'Jun', revenue: 35000 },
  ];

  const dockItems: DockItem[] = [
    { id: 'dashboard', icon: Leaf,         label: 'Dashboard',    active: true, gradient: 'linear-gradient(135deg,#22c55e,#15803d)',  onClick: () => window.location.href='/farmer/dashboard' },
    { id: 'farms',     icon: MapPin,        label: 'My Farms',                  gradient: 'linear-gradient(135deg,#10b981,#047857)',  onClick: () => window.location.href='/farms' },
    { id: 'crops',     icon: Package,       label: 'Crops',                     gradient: 'linear-gradient(135deg,#f59e0b,#d97706)',  onClick: () => window.location.href='/crops' },
    { id: 'weather',   icon: Sun,           label: 'Weather AI',                gradient: 'linear-gradient(135deg,#3b82f6,#1d4ed8)',  onClick: () => window.location.href='/weather' },
    { id: 'gallery',   icon: Camera,        label: 'Farm Gallery',              gradient: 'linear-gradient(135deg,#0ea5e9,#0369a1)',  onClick: () => window.location.href='/gallery' },
    { id: 'blockchain',icon: Shield,        label: 'Blockchain',                gradient: 'linear-gradient(135deg,#8b5cf6,#6d28d9)',  onClick: () => window.location.href='/blockchain' },
    { id: 'market',    icon: Store,         label: 'Marketplace',               gradient: 'linear-gradient(135deg,#06b6d4,#0e7490)',  onClick: () => window.location.href='/marketplace' },
    { id: 'logout',    icon: LogOut,        label: 'Logout',                    gradient: 'linear-gradient(135deg,#ef4444,#b91c1c)',  onClick: () => { localStorage.removeItem('user'); window.location.href='/login'; } },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading your farm dashboard...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-yellow-50">
      <div className="p-8 pb-28">
        {/* Welcome Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 bg-gradient-to-r from-green-600 to-emerald-600 rounded-3xl p-8 text-white shadow-2xl"
        >
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">Welcome back, {userName}! 👨‍🌾</h1>
              <p className="text-green-100 text-lg">{farm?.name || 'Green Valley Farm'}</p>
              <div className="flex items-center gap-4 mt-4 text-green-50">
                <span className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  {farm?.location?.address || 'Agricultural Valley, CA'}
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  {farm?.certification || 'USDA Organic'}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-5xl font-bold mb-2">{weather.temp}°C</div>
              <div className="flex items-center gap-2 text-green-50">
                <Cloud className="h-6 w-6" />
                {weather.condition}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Weather Widget */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8 bg-white rounded-2xl p-6 shadow-lg"
        >
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Sun className="h-6 w-6 text-yellow-500" />
            Weather Conditions
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl">
              <Thermometer className="h-8 w-8 text-blue-600" />
              <div>
                <div className="text-2xl font-bold text-blue-900">{weather.temp}°C</div>
                <div className="text-sm text-blue-700">Temperature</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-cyan-50 rounded-xl">
              <Droplets className="h-8 w-8 text-cyan-600" />
              <div>
                <div className="text-2xl font-bold text-cyan-900">{weather.humidity}%</div>
                <div className="text-sm text-cyan-700">Humidity</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-xl">
              <Wind className="h-8 w-8 text-purple-600" />
              <div>
                <div className="text-2xl font-bold text-purple-900">{weather.windSpeed} km/h</div>
                <div className="text-sm text-purple-700">Wind Speed</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-xl">
              <Cloud className="h-8 w-8 text-indigo-600" />
              <div>
                <div className="text-2xl font-bold text-indigo-900">{weather.rainfall} mm</div>
                <div className="text-sm text-indigo-700">Rainfall</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl">
              <Activity className="h-8 w-8 text-green-600" />
              <div>
                <div className="text-2xl font-bold text-green-900">Good</div>
                <div className="text-sm text-green-700">Growing Index</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {[
            { title: 'Total Crops', value: stats.totalCrops, subValue: 'active fields', icon: Package, color: 'from-green-500 to-emerald-600' },
            { title: 'Total Area', value: `${stats.totalArea} ha`, subValue: 'cultivated land', icon: Leaf, color: 'from-blue-500 to-cyan-600' },
            { title: 'Est. Yield', value: `${(stats.estimatedYield / 1000).toFixed(1)}K kg`, subValue: 'expected harvest', icon: TrendingUp, color: 'from-amber-500 to-orange-600' },
            { title: 'Est. Revenue', value: `₹${(stats.totalRevenue / 1000).toFixed(0)}K`, subValue: 'projected income', icon: DollarSign, color: 'from-purple-500 to-pink-600' },
          ].map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.05 }}
              className={`bg-gradient-to-br ${stat.color} rounded-2xl p-6 text-white shadow-xl hover:shadow-2xl transition-all transform hover:-translate-y-1`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-white/80 text-sm mb-1">{stat.title}</p>
                  <h3 className="text-3xl font-bold">{stat.value}</h3>
                  <p className="text-white/70 text-xs mt-1">{stat.subValue}</p>
                </div>
                <stat.icon className="h-10 w-10 opacity-80" />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Yield Comparison Chart */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-2xl p-6 shadow-lg"
          >
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-blue-600" />
              Yield Prediction by Crop
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={yieldData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <RechartsTooltip />
                <Legend />
                <Bar dataKey="estimated" fill="#16a34a" name="Estimated (kg)" />
                <Bar dataKey="actual" fill="#fbbf24" name="Expected (kg)" />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Crop Distribution Pie Chart */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-2xl p-6 shadow-lg"
          >
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <PieChart className="h-6 w-6 text-purple-600" />
              Land Distribution
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPie>
                <Pie
                  data={cropDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {cropDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </RechartsPie>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* Revenue Trend */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-2xl p-6 shadow-lg mb-8"
        >
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-green-600" />
            Revenue Trend (Last 6 Months)
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <RechartsTooltip />
              <Area type="monotone" dataKey="revenue" stroke="#16a34a" fill="#dcfce7" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* My Crops Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          {/* Price Prediction Section */}
          <div className="mb-8">
            <PricePrediction />
          </div>

          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <Package className="h-6 w-6 text-green-600" />
              Your Crops
            </h2>
            <div className="flex items-center gap-3">
              <PDFReportButton
                reportTitle="Farmer Dashboard Report"
                fileName="farmer-report.pdf"
                reportType="crop"
                variant="secondary"
              />
              <button className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-3 rounded-xl font-semibold hover:shadow-lg transition-all flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add New Crop
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {crops.map((crop, index) => (
              <motion.div
                key={crop.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.7 + index * 0.05 }}
                className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="text-4xl">{getCropTypeIcon(crop.type)}</div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getGrowthStageColor(crop.growthStage)}`}>
                    {crop.growthStage.replace(/_/g, ' ')}
                  </span>
                </div>
                
                <h3 className="text-lg font-bold text-gray-800 mb-2">{crop.name}</h3>
                
                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  <div className="flex justify-between">
                    <span>Type:</span>
                    <span className="font-medium">{crop.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Area:</span>
                    <span className="font-medium">{crop.area} ha</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Est. Yield:</span>
                    <span className="font-medium text-green-600">{crop.estimatedYield} kg</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleGenerateQR(crop.id)}
                    className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <QrCode className="h-4 w-4" />
                    Generate QR
                  </button>
                  <button className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors">
                    View Details
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Incoming Orders Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-12"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <ShoppingCart className="h-6 w-6 text-blue-600" />
              Incoming Orders
            </h2>
          </div>

          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {orders.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No incoming orders at the moment.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-gray-700">
                      <th className="p-4 font-semibold border-b">Order ID</th>
                      <th className="p-4 font-semibold border-b">Date</th>
                      <th className="p-4 font-semibold border-b">Status</th>
                      <th className="p-4 font-semibold border-b">Amount</th>
                      <th className="p-4 font-semibold border-b text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} className="border-b hover:bg-gray-50 transition-colors">
                        <td className="p-4 font-mono text-sm">{order.id.slice(0, 8)}...</td>
                        <td className="p-4 text-sm text-gray-600">{new Date(order.createdAt).toLocaleDateString()}</td>
                        <td className="p-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            order.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                            order.status === 'ASSIGNED' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="p-4 font-medium">₹{(order.totalPrice / 100).toFixed(2)}</td>
                        <td className="p-4 text-right">
                          {order.status === 'PENDING' && (
                            <button
                              onClick={() => handleDispatchOrder(order.id)}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors inline-flex items-center gap-2"
                            >
                              <Package className="w-4 h-4" />
                              Dispatch
                            </button>
                          )}
                          {order.status !== 'PENDING' && (
                            <span className="text-gray-500 text-sm italic">Dispatched</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* macOS-style magnification dock */}
      <MacDock items={dockItems} />

      {/* QR Code Modal */}
      <AnimatePresence>
        {showQRModal && selectedCrop && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowQRModal(false)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-gray-800 mb-2">QR Code Generated!</h3>
                <p className="text-gray-600">{selectedCrop.name}</p>
              </div>
              
              <div className="bg-white p-6 rounded-2xl shadow-inner mb-6">
                <QRCodeSVG
                  value={
                    (selectedCrop.qrCode && selectedCrop.qrCode.length < 500)
                      ? selectedCrop.qrCode
                      : `FARMCONNECT-${selectedCrop.id}`
                  }
                  size={250}
                  level="H"
                  includeMargin={true}
                />
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Crop ID:</span>
                  <span className="font-medium truncate max-w-[150px]" title={selectedCrop.qrCode || `FARMCONNECT-${selectedCrop.id}`}>
                    {(selectedCrop.qrCode && selectedCrop.qrCode.length < 30) 
                      ? selectedCrop.qrCode 
                      : `FARMCONNECT-${selectedCrop.id}`}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Blockchain Hash:</span>
                  <span className="font-mono text-xs">0x{Math.random().toString(16).substr(2, 40)}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowQRModal(false)}
                  className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-xl font-semibold hover:bg-gray-300 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => window.open(`/trace/${selectedCrop.id}`, '_blank')}
                  className="flex-1 bg-green-600 text-white py-3 rounded-xl font-semibold hover:bg-green-700 transition-colors"
                >
                  View Trace
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
