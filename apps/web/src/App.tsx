import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';

// Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import FarmerDashboard from './pages/FarmerDashboardNew';
import SupplyChainDashboard from './pages/SupplyChainDashboard';
import AdminDashboard from './pages/AdminDashboardNew';
import DistributorDashboard from './pages/DistributorDashboard';
import Marketplace from './pages/Marketplace';
import Farms from './pages/Farms';
import Crops from './pages/Crops';
import SupplyChain from './pages/SupplyChain';
import Verify from './pages/Verify';
import ProductTracePro from './pages/ProductTracePro';
import MapDemo from './pages/MapDemo';
import Chatbot from './pages/Chatbot';
import BlockchainExplorer from './pages/BlockchainExplorer';
import FarmGallery from './pages/FarmGallery';
import WeatherIntelligence from './pages/WeatherIntelligence';
import Profile from './pages/Profile';

// Admin Pages
import UsersPage from './pages/admin/UsersPage';
import FarmsPage from './pages/admin/FarmsPage';
import ProductsPage from './pages/admin/ProductsPage';
import AnalyticsPage from './pages/admin/AnalyticsPage';
import VerificationPage from './pages/admin/VerificationPage';
import SettingsPage from './pages/admin/SettingsPage';

// Components
import { ToastContainer } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import { NetworkStatus } from './components/NetworkStatus';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import ConflictResolutionModal from './components/ConflictResolutionModal';

// Types
import { User } from './types';

// Inner component that uses useLocation (must be inside Router)
function AppContent({
  user,
  isAuthenticated,
  handleLogin,
  handleLogout,
  loading,
}: {
  user: User | null;
  isAuthenticated: boolean;
  handleLogin: (user: User) => void;
  handleLogout: () => void;
  loading: boolean;
}) {
  const location = useLocation();
  const hideNavbar = location.pathname === '/login' || location.pathname === '/';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-950 to-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-400 mx-auto mb-4"></div>
          <p className="text-green-400 text-sm font-medium">Loading FarmConnect...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark:bg-gray-950 transition-colors duration-300">
      {!hideNavbar && <Navbar user={user} onLogout={handleLogout} />}
      <main className="flex-1">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" /> : <Landing />} />
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login onLogin={handleLogin} />}
          />

          {/* Role-based dashboard routes */}
          <Route
            path="/farmer/dashboard"
            element={isAuthenticated && user?.role === 'FARMER' ? <FarmerDashboard /> : <Navigate to="/login" />}
          />
          <Route
            path="/distributor/dashboard"
            element={isAuthenticated && user?.role === 'DISTRIBUTOR' ? <DistributorDashboard /> : <Navigate to="/login" />}
          />
          <Route
            path="/admin/dashboard"
            element={isAuthenticated && user?.role === 'ADMIN' ? <AdminDashboard /> : <Navigate to="/login" />}
          />

          {/* Generic dashboard redirect */}
          <Route
            path="/dashboard"
            element={
              isAuthenticated ? (
                user?.role === 'FARMER' ? <Navigate to="/farmer/dashboard" /> :
                user?.role === 'DISTRIBUTOR' ? <Navigate to="/distributor/dashboard" /> :
                user?.role === 'ADMIN' ? <Navigate to="/admin/dashboard" /> :
                <Navigate to="/marketplace" />
              ) : <Navigate to="/login" />
            }
          />

          {/* Public pages */}
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/verify/:id" element={<Verify />} />
          <Route path="/trace/:productId" element={<ProductTracePro />} />
          <Route path="/map-demo" element={<MapDemo />} />
          <Route path="/chatbot" element={<Chatbot />} />
          <Route path="/blockchain" element={<BlockchainExplorer />} />
          <Route path="/weather" element={<WeatherIntelligence />} />

          {/* Authenticated pages */}
          <Route path="/farms" element={isAuthenticated ? <Farms user={user!} onLogout={handleLogout} /> : <Navigate to="/login" />} />
          <Route path="/crops" element={isAuthenticated ? <Crops user={user!} onLogout={handleLogout} /> : <Navigate to="/login" />} />
          <Route path="/supply-chain" element={isAuthenticated ? <SupplyChain user={user!} onLogout={handleLogout} /> : <Navigate to="/login" />} />
          <Route path="/gallery" element={isAuthenticated ? <FarmGallery /> : <Navigate to="/login" />} />
          <Route path="/profile" element={isAuthenticated ? <Profile /> : <Navigate to="/login" />} />

          {/* Protected Admin Routes */}
          <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['ADMIN']}><UsersPage /></ProtectedRoute>} />
          <Route path="/admin/farms" element={<ProtectedRoute allowedRoles={['ADMIN']}><FarmsPage /></ProtectedRoute>} />
          <Route path="/admin/products" element={<ProtectedRoute allowedRoles={['ADMIN']}><ProductsPage /></ProtectedRoute>} />
          <Route path="/admin/analytics" element={<ProtectedRoute allowedRoles={['ADMIN']}><AnalyticsPage /></ProtectedRoute>} />
          <Route path="/admin/verifications" element={<ProtectedRoute allowedRoles={['ADMIN']}><VerificationPage /></ProtectedRoute>} />
          <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={['ADMIN']}><SettingsPage /></ProtectedRoute>} />

          {/* Default redirect */}
          <Route path="/*" element={<Navigate to="/dashboard" />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const userData = localStorage.getItem('user');
      
      if (userData) {
        try {
          // Import authService dynamically to avoid circular dependency issues if any
          const { authService } = await import('./services/authService');
          const freshUser = await authService.getMe();
          if (freshUser) {
            setIsAuthenticated(true);
            setUser(freshUser);
          } else {
            handleLogout(); // Token invalid
          }
        } catch (error) {
          console.error("Session verification failed:", error);
          handleLogout();
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const handleLogin = (userData: User) => {
    localStorage.setItem('user', JSON.stringify(userData));
    setIsAuthenticated(true);
    setUser(userData);
  };

  const handleLogout = async () => {
    const { authService } = await import('./services/authService');
    await authService.logout();
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <NotificationProvider>
          <Router>
            <AuthProvider>
              <NetworkStatus />
              <AppContent
                user={user}
                isAuthenticated={isAuthenticated}
                handleLogin={handleLogin}
                handleLogout={handleLogout}
                loading={loading}
              />
              <ToastContainer />
              <ConflictResolutionModal />
            </AuthProvider>
          </Router>
        </NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
