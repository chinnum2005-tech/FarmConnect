import { motion, useScroll, useTransform } from 'framer-motion';
import { Leaf, Shield, TrendingUp, Truck, QrCode, CheckCircle, ArrowRight, Sparkles, Globe, Users, Star, LogIn } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRef } from 'react';

const Landing = () => {
  const { t } = useTranslation();
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 overflow-x-hidden">
      {/* Landing-specific sticky header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-green-600 rounded-lg">
              <Leaf className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-green-700 dark:text-green-400">FarmConnect</span>
          </div>

          {/* Login / Sign Up */}
          <Link
            to="/login"
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-xl font-semibold text-sm shadow-md hover:shadow-lg transition-all duration-200"
          >
            <LogIn className="h-4 w-4" />
            Login / Sign Up
          </Link>
        </div>
      </header>
      {/* Hero Section */}
      <section ref={heroRef} className="relative min-h-screen flex items-center overflow-hidden bg-gradient-to-br from-emerald-50 via-teal-50/80 to-cyan-100/60 dark:from-slate-900 dark:via-teal-950 dark:to-slate-900">
        {/* Animated background */}
        <motion.div className="absolute inset-0" style={{ y: heroY }}>
          <div className="absolute inset-0 opacity-40 dark:opacity-20"
            style={{ backgroundImage: 'radial-gradient(circle at 25% 25%, #34d399 0%, transparent 50%), radial-gradient(circle at 75% 75%, #2dd4bf 0%, transparent 50%)' }}
          />
          {/* Animated orbs */}
          <motion.div
            animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-20 left-10 w-80 h-80 bg-emerald-400/30 rounded-full blur-3xl mix-blend-multiply dark:mix-blend-normal"
          />
          <motion.div
            animate={{ x: [0, -40, 0], y: [0, 40, 0] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
            className="absolute bottom-20 right-10 w-96 h-96 bg-teal-400/30 rounded-full blur-3xl mix-blend-multiply dark:mix-blend-normal"
          />
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-cyan-400/20 rounded-full blur-3xl mix-blend-multiply dark:mix-blend-normal"
          />
        </motion.div>

        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-10"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.2) 1px, transparent 1px)', backgroundSize: '60px 60px' }}
        />

        {/* Floating particles */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 bg-emerald-400/60 rounded-full"
            style={{ left: `${15 + i * 15}%`, top: `${20 + (i % 3) * 20}%` }}
            animate={{ y: [-10, 10, -10], opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 3 + i * 0.5, repeat: Infinity, delay: i * 0.3 }}
          />
        ))}

        <motion.div style={{ opacity: heroOpacity }} className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 w-full">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            className="text-center"
          >
            {/* Badge */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="inline-flex items-center gap-2 mb-6 px-5 py-2.5 bg-white/70 dark:bg-white/10 backdrop-blur-md border border-white/50 dark:border-white/20 rounded-full text-emerald-800 dark:text-emerald-100 font-semibold shadow-xl shadow-emerald-500/10"
            >
              <Sparkles className="h-4 w-4 text-emerald-500 dark:text-yellow-300" />
              🌱 {t('hero.badge')}
              <Sparkles className="h-4 w-4 text-emerald-500 dark:text-yellow-300" />
            </motion.div>

            <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 dark:text-white mb-6 leading-tight">
              {t('hero.title')}<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 dark:from-emerald-300 dark:via-teal-300 dark:to-cyan-300">
                {t('hero.subtitle')}
              </span>
            </h1>

            <p className="text-xl text-slate-600 dark:text-white/85 mb-10 max-w-3xl mx-auto leading-relaxed">
              {t('hero.description')}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                to="/verify"
                className="group relative bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 px-10 py-4 rounded-2xl font-bold text-lg shadow-xl shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all duration-300 flex items-center gap-3 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                <QrCode className="h-5 w-5 text-white relative z-10" />
                <span className="relative z-10">{t('hero.scanQR')}</span>
                <ArrowRight className="h-5 w-5 relative z-10 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/marketplace"
                className="group bg-white/80 dark:bg-white/10 backdrop-blur-md hover:bg-white dark:hover:bg-white/20 border border-white/50 dark:border-white/30 text-slate-800 dark:text-white px-10 py-4 rounded-2xl font-bold text-lg transition-all duration-300 flex items-center gap-3 shadow-lg"
              >
                🛒 {t('hero.browseMarket')}
              </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-8 mt-16 max-w-2xl mx-auto">
              {[
                { value: '500+', label: t('stats.farmers'), icon: '👨‍🌾' },
                { value: '10K+', label: t('stats.products'), icon: '🌾' },
                { value: '50K+', label: t('stats.verifications'), icon: '✅' },
              ].map((stat, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + index * 0.15 }}
                  className="text-center bg-white/70 dark:bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/50 dark:border-white/10 shadow-xl shadow-emerald-500/5 dark:shadow-none"
                >
                  <div className="text-2xl mb-1">{stat.icon}</div>
                  <div className="text-3xl font-bold text-slate-900 dark:text-white">{stat.value}</div>
                  <div className="text-slate-600 dark:text-white/70 text-sm mt-1">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>

        {/* Wave decoration */}
        <div className="absolute bottom-0 left-0 right-0 z-10">
          <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full block dark:hidden">
            <path d="M0 100L60 91C120 82 240 64 360 58C480 52 600 58 720 64C840 70 960 76 1080 79C1200 82 1320 82 1380 82L1440 82V100H0Z" fill="white"/>
          </svg>
          <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full hidden dark:block">
            <path d="M0 100L60 91C120 82 240 64 360 58C480 52 600 58 720 64C840 70 960 76 1080 79C1200 82 1320 82 1380 82L1440 82V100H0Z" fill="rgb(3 7 18)"/>
          </svg>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-white dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="inline-block px-4 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full text-sm font-semibold mb-4">
              Why FarmConnect?
            </span>
            <h2 className="text-5xl font-extrabold text-gray-900 dark:text-white mb-4">
              {t('features.title')}
            </h2>
            <p className="text-xl text-gray-500 dark:text-gray-400 max-w-3xl mx-auto">
              {t('features.subtitle')}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Shield, title: t('features.blockchain'), description: t('features.blockchainDesc'), gradient: 'from-green-500 to-emerald-600', bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-100 dark:border-green-800' },
              { icon: TrendingUp, title: t('features.ai'), description: t('features.aiDesc'), gradient: 'from-amber-500 to-orange-600', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-100 dark:border-amber-800' },
              { icon: Truck, title: t('features.tracking'), description: t('features.trackingDesc'), gradient: 'from-blue-500 to-cyan-600', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-100 dark:border-blue-800' },
              { icon: CheckCircle, title: t('features.transparency'), description: t('features.transparencyDesc'), gradient: 'from-purple-500 to-pink-600', bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-100 dark:border-purple-800' },
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                whileHover={{ y: -6, transition: { duration: 0.2 } }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                className={`${feature.bg} border ${feature.border} rounded-2xl p-8 shadow-sm hover:shadow-xl transition-all duration-300 group`}
              >
                <div className={`mb-6 inline-flex p-4 rounded-2xl bg-gradient-to-br ${feature.gradient} text-white shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                  <feature.icon className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{feature.title}</h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-sm">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="inline-block px-4 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-sm font-semibold mb-4">
              Simple Process
            </span>
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {t('howItWorks.title')}
            </h2>
            <p className="text-lg text-gray-500 dark:text-gray-400">
              {t('howItWorks.subtitle')}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { step: '01', title: t('howItWorks.step1'), description: t('howItWorks.step1Desc'), icon: '🌾', color: 'from-green-500 to-emerald-600' },
              { step: '02', title: t('howItWorks.step2'), description: t('howItWorks.step2Desc'), icon: '🚚', color: 'from-blue-500 to-cyan-600' },
              { step: '03', title: t('howItWorks.step3'), description: t('howItWorks.step3Desc'), icon: '🏪', color: 'from-purple-500 to-violet-600' },
              { step: '04', title: t('howItWorks.step4'), description: t('howItWorks.step4Desc'), icon: '🔍', color: 'from-amber-500 to-orange-600' },
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: index * 0.12 }}
                viewport={{ once: true }}
                className="relative text-center group"
              >
                {index < 3 && (
                  <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-green-200 to-green-300 dark:from-green-800 dark:to-green-700" />
                )}
                <div className="relative z-10">
                  <div className={`w-24 h-24 bg-gradient-to-br ${item.color} rounded-2xl flex items-center justify-center text-4xl mx-auto mb-4 shadow-xl group-hover:shadow-2xl group-hover:scale-105 transition-all duration-300`}>
                    {item.icon}
                  </div>
                  <div className="text-xs font-bold text-gray-400 dark:text-gray-500 mb-2 tracking-widest">STEP {item.step}</div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{item.title}</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Indicators */}
      <section className="py-16 bg-white dark:bg-gray-950 border-y border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { icon: Users, value: '500+', label: 'Registered Farmers', color: 'text-green-600' },
              { icon: Globe, value: '18', label: 'States Covered', color: 'text-blue-600' },
              { icon: Star, value: '4.9★', label: 'Average Rating', color: 'text-amber-500' },
              { icon: Shield, value: '100%', label: 'Verified Products', color: 'text-purple-600' },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
                className="group"
              >
                <item.icon className={`h-8 w-8 ${item.color} mx-auto mb-3 group-hover:scale-110 transition-transform`} />
                <div className="text-3xl font-extrabold text-gray-900 dark:text-white">{item.value}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{item.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 relative overflow-hidden">
        <div className="absolute inset-0">
          <motion.div
            animate={{ scale: [1, 1.3, 1], opacity: [0.1, 0.2, 0.1] }}
            transition={{ duration: 8, repeat: Infinity }}
            className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl"
          />
          <motion.div
            animate={{ scale: [1.3, 1, 1.3], opacity: [0.1, 0.2, 0.1] }}
            transition={{ duration: 6, repeat: Infinity, delay: 2 }}
            className="absolute bottom-0 left-0 w-80 h-80 bg-yellow-300 rounded-full blur-3xl"
          />
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              {t('cta.title')}
            </h2>
            <p className="text-xl text-white/90 mb-10">
              {t('cta.subtitle')}
            </p>
            <Link
              to="/login"
              className="group inline-flex items-center gap-3 bg-white text-emerald-700 hover:bg-emerald-50 px-10 py-4 rounded-2xl font-bold text-lg shadow-2xl hover:shadow-white/20 transition-all duration-300"
            >
              {t('cta.button')}
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
            {/* Brand */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-2 bg-indigo-600 rounded-xl">
                  <Leaf className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold">FarmConnect</span>
              </div>
              <p className="text-gray-400 leading-relaxed mb-4 max-w-sm">
                {t('footer.description')}
              </p>
              <div className="flex gap-3">
                {['🇮🇳 Made in India', '🌱 Sustainable', '🔒 Secure'].map((tag) => (
                  <span key={tag} className="text-xs bg-gray-800 text-gray-400 px-3 py-1.5 rounded-full">{tag}</span>
                ))}
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h3 className="font-bold mb-4 text-lg text-white">{t('footer.quickLinks')}</h3>
              <ul className="space-y-2.5 text-gray-400">
                <li><Link to="/verify" className="hover:text-indigo-400 transition-colors flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5" />{t('nav.verify')}</Link></li>
                <li><Link to="/marketplace" className="hover:text-indigo-400 transition-colors flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5" />Marketplace</Link></li>
                <li><Link to="/weather" className="hover:text-indigo-400 transition-colors flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5" />Weather Intelligence</Link></li>
                <li><Link to="/blockchain" className="hover:text-indigo-400 transition-colors flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5" />Blockchain Explorer</Link></li>
                <li><Link to="/login" className="hover:text-indigo-400 transition-colors flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5" />{t('nav.login')}</Link></li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h3 className="font-bold mb-4 text-lg text-white">{t('footer.contact')}</h3>
              <p className="text-gray-400 leading-relaxed text-sm">
                {t('footer.trust')}
              </p>
              <div className="mt-4 p-3 bg-indigo-900/30 border border-indigo-800/50 rounded-xl">
                <div className="flex items-center gap-2 text-indigo-400 text-sm font-medium">
                  <CheckCircle className="h-4 w-4" />
                  Platform Status: All Systems Operational
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-gray-500 text-sm">
              © 2026 FarmConnect. {t('footer.rights')}
            </p>
            <div className="flex gap-4 text-gray-500 text-sm">
              <a href="#" className="hover:text-gray-300 transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-gray-300 transition-colors">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
