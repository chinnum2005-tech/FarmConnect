import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Leaf, Eye, EyeOff, Lock, Mail, User, ChevronRight,
  Sparkles, Shield, Zap, AlertCircle, WifiOff
} from 'lucide-react';
import { authService } from '../services/authService';

interface LoginProps {
  onLogin: (user: any) => void;
}

// Login component

export default function Login({ onLogin }: LoginProps) {
  const { t } = useTranslation();
  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '', firstName: '', lastName: '', role: 'CONSUMER' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        const response = await authService.register(formData);
        if (response.success && response.data) {
          localStorage.setItem('user', JSON.stringify(response.data.user));
          onLogin(response.data.user);
        } else {
          setError(response.message || 'Registration failed');
        }
      } else {
        const response = await authService.login(formData.email, formData.password);
        if (response.success && response.data) {
          localStorage.setItem('user', JSON.stringify(response.data.user));
          onLogin(response.data.user);
        } else {
          setError(response.message || 'Login failed');
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Authentication failed. Please check if the backend is running on port 3001.');
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-green-950 to-slate-900">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-green-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-400/15 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl animate-pulse delay-500" />
      </div>

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 py-12 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">

        {/* Left panel — Branding */}
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7 }}
          className="hidden lg:block text-white"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 bg-green-500 rounded-xl shadow-lg shadow-green-500/30">
              <Leaf className="h-7 w-7 text-white" />
            </div>
            <span className="text-2xl font-bold">FarmConnect</span>
          </div>

          <h1 className="text-4xl font-extrabold leading-tight mb-4">
            Blockchain-Powered<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-300">
              Farm to Table
            </span><br />
            Traceability
          </h1>
          <p className="text-slate-300 text-lg leading-relaxed mb-8">
            Connect farmers, distributors and consumers with verified, blockchain-backed supply chain data.
          </p>

          <div className="space-y-4">
            {[
              { icon: Shield, text: 'Blockchain-verified authenticity for every product' },
              { icon: Zap,    text: 'AI-powered crop recommendation and yield prediction' },
              { icon: Sparkles, text: 'Real-time supply chain tracking across India' },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.15 }}
                className="flex items-center gap-3 text-slate-300"
              >
                <div className="p-1.5 bg-green-500/20 rounded-lg">
                  <item.icon className="h-4 w-4 text-green-400" />
                </div>
                <span>{item.text}</span>
              </motion.div>
            ))}
          </div>


        </motion.div>

        {/* Right panel — Form */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl"
        >
          {/* Logo (mobile) */}
          <div className="flex items-center gap-2 mb-6 lg:hidden">
            <div className="p-2 bg-green-500 rounded-lg">
              <Leaf className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">FarmConnect</span>
          </div>

          {/* Sign In / Register toggle */}
          <div className="flex gap-1 bg-white/10 rounded-xl p-1 mb-6">
            {['Sign In', 'Register'].map((tab, i) => (
              <button
                key={tab}
                onClick={() => { setIsRegister(i === 1); setError(''); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  isRegister === (i === 1)
                    ? 'bg-green-500 text-white shadow-lg'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 rounded-xl mb-4 text-sm"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 text-sm font-medium mb-1.5 block">{t('auth.firstName')}</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="firstName"
                      type="text"
                      required={isRegister}
                      placeholder="John"
                      aria-label="First Name"
                      className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all text-sm"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-slate-300 text-sm font-medium mb-1.5 block">{t('auth.lastName')}</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      id="lastName"
                      type="text"
                      required={isRegister}
                      placeholder="Farmer"
                      aria-label="Last Name"
                      className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all text-sm"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="text-slate-300 text-sm font-medium mb-1.5 block">{t('auth.email')}</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  aria-label="Email Address"
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="text-slate-300 text-sm font-medium mb-1.5 block">{t('auth.password')}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  placeholder="••••••••"
                  aria-label="Password"
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-xl pl-10 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {isRegister && (
              <div>
                <label className="text-slate-300 text-sm font-medium mb-1.5 block">{t('auth.role')}</label>
                <select
                  id="role"
                  aria-label="Account Role"
                  className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                  <option value="CONSUMER"    className="bg-slate-800">Consumer</option>
                  <option value="FARMER"      className="bg-slate-800">Farmer</option>
                  <option value="DISTRIBUTOR" className="bg-slate-800">Distributor</option>
                </select>
              </div>
            )}

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-green-500/25 hover:shadow-green-500/40 transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-60"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {isRegister ? t('auth.register') : t('auth.signIn')}
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </motion.button>
          </form>



          <p className="text-center text-slate-400 text-sm mt-5">
            {isRegister ? (
              <>Already have an account?{' '}
                <button onClick={() => setIsRegister(false)} className="text-green-400 hover:text-green-300 font-semibold transition-colors">Sign in</button>
              </>
            ) : (
              <>New to FarmConnect?{' '}
                <button onClick={() => setIsRegister(true)} className="text-green-400 hover:text-green-300 font-semibold transition-colors">Create account</button>
              </>
            )}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
