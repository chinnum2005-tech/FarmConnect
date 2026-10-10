import { Leaf, User, Menu, X, LogOut, Moon, Sun, Shield, Camera } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import NotificationBell from './NotificationBell';
import GlobalSearch from './GlobalSearch';
import LanguageSelector from './LanguageSelector';

interface NavbarProps {
  user?: any;
  onLogout?: () => void;
}

export default function Navbar({ user: propUser, onLogout: propLogout }: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const isOnLoginPage = location.pathname === '/login';

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData || propUser) {
      setIsLoggedIn(true);
      setUser(propUser || (userData ? JSON.parse(userData) : null));
    } else {
      setIsLoggedIn(false);
      setUser(null);
    }
  }, [propUser]);

  const handleLogout = () => {
    if (propLogout) {
      propLogout();
    } else {
      localStorage.removeItem('user');
    }
    setIsLoggedIn(false);
    setUser(null);
    navigate('/');
    window.location.reload();
  };

  const roleConfig: Record<string, { label: string; color: string }> = {
    FARMER: { label: '👨‍🌾 Farmer', color: 'bg-green-100 text-green-700' },
    DISTRIBUTOR: { label: '🚚 Distributor', color: 'bg-blue-100 text-blue-700' },
    ADMIN: { label: '🛡️ Admin', color: 'bg-purple-100 text-purple-700' },
    CONSUMER: { label: '👤 Consumer', color: 'bg-gray-100 text-gray-700' },
  };

  const currentUser = propUser || user;
  const roleInfo = currentUser?.role ? roleConfig[currentUser.role] : null;

  return (
    <nav className="bg-white dark:bg-gray-900 shadow-md border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to={isLoggedIn ? '/dashboard' : '/'} className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-green-600 rounded-lg">
              <Leaf className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-green-700 dark:text-green-400">FarmConnect</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-2 xl:gap-4">
            {/* Global Search */}
            <GlobalSearch />


            <Link
              to="/blockchain"
              className="flex items-center gap-1.5 px-3 py-2 text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors font-medium text-sm whitespace-nowrap"
            >
              <Shield className="flex-shrink-0 h-4 w-4" />
              <span className="hidden xl:inline whitespace-nowrap">Blockchain</span>
            </Link>

            {isLoggedIn && (currentUser?.role === 'FARMER' || currentUser?.role === 'ADMIN') && (
              <Link
                to="/gallery"
                className="flex items-center gap-1.5 px-3 py-2 text-gray-600 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors font-medium text-sm whitespace-nowrap"
              >
                <Camera className="flex-shrink-0 h-4 w-4" />
                <span className="hidden xl:inline whitespace-nowrap">Gallery</span>
              </Link>
            )}

            {/* Language Selector */}
            <LanguageSelector />

            {/* Dark Mode Toggle */}
            <button
              id="dark-mode-toggle"
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all"
              aria-label="Toggle dark mode"
            >
              {isDark ? (
                <Sun className="h-5 w-5 text-amber-500" />
              ) : (
                <Moon className="h-5 w-5 text-gray-500" />
              )}
            </button>

            {/* Notification Bell — only when logged in */}
            {isLoggedIn && <NotificationBell />}

            {/* Auth Section */}
            {isLoggedIn ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                    {currentUser?.firstName?.[0] || 'U'}
                  </div>
                  <div className="hidden xl:block">
                    <p className="text-sm font-semibold text-gray-800 dark:text-white leading-none">
                      {currentUser?.firstName || 'User'}
                    </p>
                    {roleInfo && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${roleInfo.color}`}>
                        {roleInfo.label}
                      </span>
                    )}
                  </div>
                </div>
                <Link
                  to="/profile"
                  className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-3 py-2 rounded-xl transition-colors font-medium text-sm border border-indigo-100 dark:border-indigo-800 whitespace-nowrap"
                >
                  <User className="flex-shrink-0 h-4 w-4" />
                  <span className="hidden xl:inline whitespace-nowrap">Profile</span>
                </Link>
                <button
                  onClick={handleLogout}
                  id="navbar-logout"
                  className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 px-3 py-2 rounded-xl transition-colors font-medium text-sm border border-red-100 dark:border-red-800 whitespace-nowrap"
                >
                  <LogOut className="flex-shrink-0 h-4 w-4" />
                  <span className="hidden xl:inline whitespace-nowrap">{t('nav.logout')}</span>
                </button>
              </div>
            ) : !isOnLoginPage ? (
              <Link
                to="/login"
                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl transition-colors font-medium text-sm shadow-md hover:shadow-lg"
              >
                <User className="h-4 w-4" />
                <span>{t('nav.login')}</span>
              </Link>
            ) : null}
          </div>

          {/* Mobile: Dark toggle + Hamburger */}
          <div className="lg:hidden flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            >
              {isDark ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-gray-500" />}
            </button>
            {isLoggedIn && <NotificationBell />}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {isOpen ? <X className="h-6 w-6 dark:text-white" /> : <Menu className="h-6 w-6 dark:text-white" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="lg:hidden py-4 border-t border-gray-100 dark:border-gray-800">
            <div className="flex flex-col space-y-2 px-2">
              <GlobalSearch />
              <Link to="/blockchain" className="flex items-center gap-2 px-3 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl font-medium" onClick={() => setIsOpen(false)}>
                <Shield className="h-4 w-4 text-purple-600" /> Blockchain Explorer
              </Link>
              {isLoggedIn && (currentUser?.role === 'FARMER' || currentUser?.role === 'ADMIN') && (
                <Link to="/gallery" className="flex items-center gap-2 px-3 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl font-medium" onClick={() => setIsOpen(false)}>
                  <Camera className="h-4 w-4 text-emerald-600" /> Farm Gallery
                </Link>
              )}
              <LanguageSelector />
              {isLoggedIn ? (
                <>
                  <Link to="/profile" className="flex items-center gap-2 px-3 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl font-medium" onClick={() => setIsOpen(false)}>
                    <User className="h-4 w-4 text-indigo-600" /> My Profile
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="bg-red-50 text-red-600 px-4 py-2.5 rounded-xl font-medium flex items-center gap-2"
                  >
                    <LogOut className="h-4 w-4" /> Logout ({currentUser?.firstName})
                  </button>
                </>
              ) : (
                <Link to="/login" className="bg-green-600 text-white px-4 py-2.5 rounded-xl font-medium text-center" onClick={() => setIsOpen(false)}>
                  Login
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
