import { useState, useEffect } from 'react';

import { motion } from 'framer-motion';
import MacDock, { DockItem } from '../components/ui/MacDock';
import { 
  Users, Package, TrendingUp, DollarSign, Activity, BarChart3, 
  PieChart, MapPin, ShoppingCart, Eye, Bell, Search, Filter, Settings, LogOut, AlertCircle
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, PieChart as RechartsPie, Pie, Cell, LineChart, Line, Legend
} from 'recharts';

import api from '../services/api';

const COLORS = ['#16a34a', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899'];

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalFarms: 0,
    totalProducts: 0,
    totalRevenue: 0,
    activeOrders: 0,
    verificationRate: 0,
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [platformStats, setPlatformStats] = useState<any[]>([]);
  const [userDistribution, setUserDistribution] = useState<any[]>([]);
  const [predictionDataSources, setPredictionDataSources] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/admin/stats');
      if (res.data && res.data.success) {
        const payload = res.data.data;
        setStats(payload.stats);
        setPlatformStats(payload.platformStats);
        setUserDistribution(payload.userDistribution);
        setPredictionDataSources(payload.predictionDataSources);
        setTopProducts(payload.topProducts);
        setRecentActivity(payload.recentTransactions);
      } else {
        throw new Error(res.data?.message || 'Failed to load dashboard stats');
      }
    } catch (err: any) {
      console.error('Failed to load admin dashboard data:', err);
      setError(err.message || 'Failed to load admin stats. Please verify the backend server.');
    } finally {
      setLoading(false);
    }
  };

  const navigation = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: BarChart3 },
    { name: 'Users', href: '/admin/users', icon: Users },
    { name: 'Farms', href: '/admin/farms', icon: MapPin },
    { name: 'Products', href: '/admin/products', icon: Package },
    { name: 'Analytics', href: '/admin/analytics', icon: PieChart },
    { name: 'Verifications', href: '/admin/verifications', icon: Eye },
    { name: 'Settings', href: '/admin/settings', icon: Activity },
  ];

  const dockItems: DockItem[] = [
    { id: 'dashboard', icon: BarChart3,  label: 'Dashboard',     active: true, gradient: 'linear-gradient(135deg,#3b82f6,#1d4ed8)',   onClick: () => window.location.href='/admin/dashboard' },
    { id: 'users',     icon: Users,      label: 'Users',         badge: 3,     gradient: 'linear-gradient(135deg,#22c55e,#15803d)',   onClick: () => window.location.href='/admin/users' },
    { id: 'farms',     icon: MapPin,     label: 'Farms',                       gradient: 'linear-gradient(135deg,#10b981,#047857)',   onClick: () => window.location.href='/admin/farms' },
    { id: 'products',  icon: Package,    label: 'Products',                    gradient: 'linear-gradient(135deg,#f59e0b,#d97706)',   onClick: () => window.location.href='/admin/products' },
    { id: 'analytics', icon: PieChart,   label: 'Analytics',                   gradient: 'linear-gradient(135deg,#8b5cf6,#6d28d9)',   onClick: () => window.location.href='/admin/analytics' },
    { id: 'verify',    icon: Eye,        label: 'Verifications',               gradient: 'linear-gradient(135deg,#ec4899,#be185d)',   onClick: () => window.location.href='/admin/verifications' },
    { id: 'settings',  icon: Settings,   label: 'Settings',                    gradient: 'linear-gradient(135deg,#64748b,#334155)',   onClick: () => window.location.href='/admin/settings' },
    { id: 'logout',    icon: LogOut,     label: 'Logout',                      gradient: 'linear-gradient(135deg,#ef4444,#b91c1c)',   onClick: () => { localStorage.removeItem('token'); localStorage.removeItem('user'); sessionStorage.clear(); window.location.href='/login'; } },
  ];

  const user = { firstName: 'Admin', lastName: 'User', role: 'ADMIN' };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="text-center p-8 max-w-md bg-white rounded-3xl shadow-xl">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Failed to Load Admin Stats</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all shadow-md"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <div className="p-8 pb-28">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
              <p className="text-gray-600 text-lg">Platform overview and analytics</p>
            </div>
            <div className="flex gap-4">
              <button className="p-3 bg-white rounded-xl shadow-md hover:shadow-lg transition-all">
                <Bell className="h-6 w-6 text-gray-600" />
              </button>
              <button className="p-3 bg-white rounded-xl shadow-md hover:shadow-lg transition-all">
                <Search className="h-6 w-6 text-gray-600" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[
            { title: 'Total Users', value: stats.totalUsers.toLocaleString(), subValue: '+12% from last month', icon: Users, color: 'from-blue-500 to-cyan-600' },
            { title: 'Total Farms', value: stats.totalFarms.toLocaleString(), subValue: '+8 new this week', icon: MapPin, color: 'from-green-500 to-emerald-600' },
            { title: 'Total Products', value: stats.totalProducts.toLocaleString(), subValue: '950 active listings', icon: Package, color: 'from-amber-500 to-orange-600' },
            { title: 'Total Revenue', value: `₹${(stats.totalRevenue / 1000).toFixed(0)}K`, subValue: '+18% growth', icon: DollarSign, color: 'from-purple-500 to-pink-600' },
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
          {/* Platform Growth */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-2xl p-6 shadow-lg"
          >
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-blue-600" />
              Platform Growth (Users)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={platformStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <RechartsTooltip />
                <Area type="monotone" dataKey="users" stroke="#3b82f6" fill="#dbeafe" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          {/* User Distribution */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-2xl p-6 shadow-lg"
          >
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <PieChart className="h-6 w-6 text-purple-600" />
              User Distribution
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPie>
                <Pie
                  data={userDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {userDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend />
              </RechartsPie>
            </ResponsiveContainer>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Revenue Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white rounded-2xl p-6 shadow-lg lg:col-span-2"
          >
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <DollarSign className="h-6 w-6 text-green-600" />
              Revenue & Products Trend
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={platformStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <RechartsTooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" fill="#16a34a" name="Revenue (₹)" />
                <Bar yAxisId="right" dataKey="products" fill="#f59e0b" name="Products" />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Yield Prediction Provenance Data Source Distribution */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="bg-white rounded-2xl p-6 shadow-lg"
          >
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <PieChart className="h-6 w-6 text-indigo-600" />
              Prediction Data Sources
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPie>
                <Pie
                  data={predictionDataSources}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {predictionDataSources.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value, name, props) => [value, props.payload.name]} />
                <Legend layout="horizontal" align="center" verticalAlign="bottom" wrapperStyle={{ fontSize: '10px' }} />
              </RechartsPie>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Products */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-white rounded-2xl p-6 shadow-lg"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Package className="h-6 w-6 text-green-600" />
                Top Performing Products
              </h3>
              <button className="text-blue-600 hover:text-blue-700 text-sm font-semibold">
                View All
              </button>
            </div>
            
            <div className="space-y-4">
              {topProducts.map((product, index) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 + index * 0.05 }}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <span className="text-lg font-bold text-green-600">#{index + 1}</span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">{product.name}</h4>
                      <p className="text-sm text-gray-600">{product.farmer}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-green-600">{product.revenue}</div>
                    <div className="text-sm text-gray-600">{product.quantity}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Recent Activity */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.7 }}
            className="bg-white rounded-2xl p-6 shadow-lg"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Activity className="h-6 w-6 text-blue-600" />
                Recent Activity
              </h3>
              <button className="text-blue-600 hover:text-blue-700 text-sm font-semibold">
                View All
              </button>
            </div>
            
            <div className="space-y-4">
              {recentActivity.map((activity, index) => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.8 + index * 0.05 }}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      activity.type === 'Order' ? 'bg-green-100' :
                      activity.type === 'Verification' ? 'bg-blue-100' :
                      activity.type === 'Shipment' ? 'bg-purple-100' :
                      'bg-gray-100'
                    }`}>
                      {activity.type === 'Order' && <ShoppingCart className="h-5 w-5 text-green-600" />}
                      {activity.type === 'Verification' && <Eye className="h-5 w-5 text-blue-600" />}
                      {activity.type === 'Shipment' && <Package className="h-5 w-5 text-purple-600" />}
                      {activity.type === 'Registration' && <Users className="h-5 w-5 text-gray-600" />}
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">{activity.type}</h4>
                      <p className="text-sm text-gray-600">{activity.user}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">{activity.amount}</div>
                    <div className="text-xs text-gray-500">{activity.time}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* macOS-style magnification dock */}
      <MacDock items={dockItems} />
    </div>
  );
}
