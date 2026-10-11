import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';

interface NavItem {
  name: string;
  href: string;
  icon: ReactNode;
}

interface SidebarProps {
  navigation: NavItem[];
  user?: { firstName: string; lastName: string; role: string };
  onLogout?: () => void;
}

export default function Sidebar({ navigation, user, onLogout }: SidebarProps) {
  const location = useLocation();

  return (
    <div className="fixed inset-y-0 left-0 w-64 bg-white shadow-xl border-r border-secondary/20 z-40">
      {/* Header */}
      <div className="flex items-center justify-between h-16 bg-primary px-6">
        <span className="text-white text-xl font-bold">FarmConnect</span>
        <button
          onClick={() => {
            if (onLogout) {
              onLogout();
            } else {
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              sessionStorage.clear();
              window.location.href = '/login';
            }
          }}
          className="flex items-center gap-2 text-white hover:bg-primary-dark px-3 py-2 rounded-lg transition-colors"
          title="Logout"
        >
          <span className="text-sm font-medium">Logout</span>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>

      {/* User Info */}
      {user && (
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-secondary to-secondary-light rounded-full flex items-center justify-center">
              <span className="text-primary-dark font-bold text-lg">
                {user.firstName[0]}{user.lastName[0]}
              </span>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-gray-500">{user.role}</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="mt-4 px-4">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href;

          return (
            <Link key={item.name} to={item.href}>
              <motion.div
                whileHover={{ x: 4 }}
                className={`flex items-center px-4 py-3 mb-2 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-primary text-white shadow-md'
                    : 'text-gray-700 hover:bg-secondary-light hover:text-primary-dark'
                }`}
              >
                <Icon size={20} className="mr-3" />
                <span className="font-medium">{item.name}</span>
              </motion.div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
