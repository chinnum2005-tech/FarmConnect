import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  QrCode,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  HelpCircle,
  WifiOff,
  ShieldCheck,
  ShieldAlert,
  Leaf,
  MapPin,
  Calendar,
  User,
  Truck,
  Package,
  Store,
  MessageCircle,
  Shield,
  Camera,
  LogOut,
  Hash,
  Database,
  ExternalLink,
} from 'lucide-react';
import MacDock, { DockItem } from '../components/ui/MacDock';
import { verifyService } from '../services';

export default function Verify() {
  const { id } = useParams<{ id: string }>(); // Get product/crop ID from URL
  const [qrCode, setQrCode] = useState('');
  const [dbResult, setDbResult] = useState<any>(null);
  const [onChainResult, setOnChainResult] = useState<any>(null);
  const [onChainLoading, setOnChainLoading] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-verify if ID is in URL (from QR scan)
  useEffect(() => {
    if (id && !qrCode) {
      setQrCode(id);
      executeVerification(id);
    }
  }, [id]);

  const executeVerification = async (identifier: string) => {
    setError('');
    setLoading(true);
    setOnChainLoading(true);
    setDbResult(null);
    setOnChainResult(null);

    let foundDb = false;

    // 1. Fetch Database Traceability Record
    try {
      const dbResponse = await verifyService.verifyProduct(identifier);
      if (dbResponse?.success && dbResponse.data) {
        setDbResult(dbResponse.data);
        foundDb = true;
      }
    } catch (err: any) {
      // It's possible the identifier is a pure on-chain batch ID rather than a MongoDB ID
      console.info('Database record not located for identifier:', identifier);
    } finally {
      setLoading(false);
    }

    // 2. Fetch Independent On-Chain Cryptographic Verification
    try {
      const onChainResponse = await verifyService.verifyOnChain(identifier);
      if (onChainResponse?.success && onChainResponse.data) {
        setOnChainResult(onChainResponse.data);
      } else {
        setOnChainResult({
          status: 'UNAVAILABLE',
          match: false,
          details: 'On-chain verification returned no data.',
        });
      }
    } catch (err: any) {
      const errStatus = err?.response?.data?.data?.status || 'UNAVAILABLE';
      const errDetails = err?.response?.data?.message || err?.message || 'Blockchain RPC or contract unreachable';
      setOnChainResult({
        status: errStatus,
        match: false,
        details: errDetails,
      });
    } finally {
      setOnChainLoading(false);
    }

    if (!foundDb && !onChainResult) {
      setError('No product, crop, or on-chain batch record found for this identifier.');
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrCode.trim()) return;
    executeVerification(qrCode.trim());
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType?.toLowerCase()) {
      case 'planted': return <Leaf className="h-6 w-6" />;
      case 'harvested': return <Package className="h-6 w-6" />;
      case 'shipped': return <Truck className="h-6 w-6" />;
      case 'received': return <CheckCircle className="h-6 w-6" />;
      default: return <MapPin className="h-6 w-6" />;
    }
  };

  const isAuthenticated = !!localStorage.getItem('user');

  const dockItems: DockItem[] = [
    { id: 'market',    icon: Store,         label: 'Marketplace',               gradient: 'linear-gradient(135deg,#06b6d4,#0e7490)',  onClick: () => window.location.href='/marketplace' },
    { id: 'trace',     icon: QrCode,        label: 'Traceability', active: true, gradient: 'linear-gradient(135deg,#10b981,#047857)',  onClick: () => window.location.href='/verify' },
    { id: 'blockchain',icon: Shield,        label: 'Blockchain',                gradient: 'linear-gradient(135deg,#8b5cf6,#6d28d9)',  onClick: () => window.location.href='/blockchain' },
    { id: 'chatbot',   icon: MessageCircle, label: 'AgroBot AI',                gradient: 'linear-gradient(135deg,#3b82f6,#1d4ed8)',  onClick: () => window.location.href='/chatbot' },
    { id: 'gallery',   icon: Camera,        label: 'Farm Gallery',              gradient: 'linear-gradient(135deg,#0ea5e9,#0369a1)',  onClick: () => window.location.href='/gallery' },
    { id: 'logout',    icon: LogOut,        label: 'Logout',                    gradient: 'linear-gradient(135deg,#ef4444,#b91c1c)',  onClick: () => { localStorage.removeItem('token'); localStorage.removeItem('user'); sessionStorage.clear(); window.location.href='/login'; } },
  ];

  // Render on-chain status banner configuration
  const renderOnChainBanner = () => {
    if (!onChainResult) return null;

    switch (onChainResult.status) {
      case 'VERIFIED':
        return (
          <div className="bg-gradient-to-r from-emerald-600 to-green-600 rounded-2xl p-6 text-white shadow-xl">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <ShieldCheck className="h-10 w-10 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-0.5 bg-white/20 text-white font-mono text-xs rounded-full uppercase tracking-wider font-bold">
                      STATUS: VERIFIED
                    </span>
                    <span className="text-xs bg-white/10 px-2 py-0.5 rounded">Polygon / EVM</span>
                  </div>
                  <h2 className="text-2xl font-bold mt-1">Cryptographically Verified On-Chain ✓</h2>
                  <p className="text-white/90 text-sm mt-0.5">
                    Off-chain produce evidence matches the immutable on-chain cryptographic commitment.
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/80 uppercase tracking-wider">On-Chain Batch</p>
                <p className="text-sm font-mono font-bold truncate max-w-[220px]">
                  {onChainResult.batchIdBytes32 ? `${onChainResult.batchIdBytes32.slice(0, 10)}...${onChainResult.batchIdBytes32.slice(-8)}` : onChainResult.batchId}
                </p>
              </div>
            </div>
          </div>
        );

      case 'MISMATCH':
        return (
          <div className="bg-gradient-to-r from-rose-600 to-red-700 rounded-2xl p-6 text-white shadow-xl">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <AlertTriangle className="h-10 w-10 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-0.5 bg-red-950/60 text-white font-mono text-xs rounded-full uppercase tracking-wider font-bold">
                      STATUS: MISMATCH
                    </span>
                    <span className="text-xs bg-white/10 px-2 py-0.5 rounded">Integrity Violation</span>
                  </div>
                  <h2 className="text-2xl font-bold mt-1">Evidence Hash Mismatch Detected ⚠️</h2>
                  <p className="text-white/90 text-sm mt-0.5">
                    The produce batch exists on-chain, but the cryptographic evidence hash does NOT match the commitment. Potential tampering detected.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'PENDING':
        return (
          <div className="bg-gradient-to-r from-amber-500 to-yellow-600 rounded-2xl p-6 text-white shadow-xl">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <Clock className="h-10 w-10 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-0.5 bg-amber-950/40 text-white font-mono text-xs rounded-full uppercase tracking-wider font-bold">
                      STATUS: PENDING
                    </span>
                    <span className="text-xs bg-white/10 px-2 py-0.5 rounded">Awaiting Confirmation</span>
                  </div>
                  <h2 className="text-2xl font-bold mt-1">On-Chain Transaction In-Flight ⏳</h2>
                  <p className="text-white/90 text-sm mt-0.5">
                    Transaction has been broadcast to the network and is waiting for block mining and confirmation depth.
                  </p>
                </div>
              </div>
              {onChainResult.transactionHash && (
                <div className="text-right">
                  <p className="text-xs text-white/80">Pending Tx Hash</p>
                  <p className="text-xs font-mono font-bold truncate max-w-[200px]">{onChainResult.transactionHash}</p>
                </div>
              )}
            </div>
          </div>
        );

      case 'NOT_FOUND':
        return (
          <div className="bg-gradient-to-r from-slate-600 to-gray-700 rounded-2xl p-6 text-white shadow-xl">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <HelpCircle className="h-10 w-10 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-0.5 bg-slate-900/60 text-white font-mono text-xs rounded-full uppercase tracking-wider font-bold">
                      STATUS: NOT_FOUND
                    </span>
                    <span className="text-xs bg-white/10 px-2 py-0.5 rounded">Not Registered</span>
                  </div>
                  <h2 className="text-2xl font-bold mt-1">Not Registered On-Chain</h2>
                  <p className="text-white/90 text-sm mt-0.5">
                    This batch has not yet been registered or committed to the blockchain registry.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'UNAVAILABLE':
      default:
        return (
          <div className="bg-gradient-to-r from-slate-700 to-zinc-800 rounded-2xl p-6 text-white shadow-xl">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <WifiOff className="h-10 w-10 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-0.5 bg-zinc-900/70 text-white font-mono text-xs rounded-full uppercase tracking-wider font-bold">
                      STATUS: UNAVAILABLE
                    </span>
                    <span className="text-xs bg-white/10 px-2 py-0.5 rounded">Node Offline</span>
                  </div>
                  <h2 className="text-2xl font-bold mt-1">Blockchain Node Offline / Unreachable</h2>
                  <p className="text-white/90 text-sm mt-0.5">
                    {onChainResult.details || 'Unable to communicate with the blockchain RPC node or contract registry.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br from-background via-secondary-light to-background ${isAuthenticated ? 'pb-32' : ''}`}>
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-secondary/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <motion.div 
            className="flex items-center space-x-3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <Leaf className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-primary">AgroTrace & FarmConnect</span>
          </motion.div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <h1 className="text-4xl sm:text-5xl font-bold text-accent mb-4">
            {id ? '🔍 Verifying Produce Traceability...' : 'Track Your Food Journey'}
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            {id 
              ? `Authenticating produce identifier: ${id}`
              : 'Scan a QR code or enter an identifier to verify product authenticity, on-chain cryptographic proof, and farm-to-table history.'
            }
          </p>
        </motion.div>

        {/* Search Form */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 mb-8 border border-secondary/20"
        >
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label htmlFor="qrCode" className="block text-sm font-semibold text-gray-700 mb-2">
                Product ID, Crop ID, or QR Code Payload
              </label>
              <div className="relative">
                <QrCode className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  id="qrCode"
                  required
                  className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-base sm:text-lg font-mono"
                  value={qrCode}
                  onChange={(e) => setQrCode(e.target.value)}
                  placeholder="e.g. 65c5437419ec... or BATCH-101"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || onChainLoading}
              className="w-full py-4 px-6 bg-gradient-to-r from-primary to-primary-light text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.01] disabled:opacity-50 disabled:transform-none text-lg flex items-center justify-center gap-2"
            >
              {(loading || onChainLoading) ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Verifying Cryptographic & Database Records...
                </>
              ) : (
                'Verify Produce Journey'
              )}
            </button>
          </form>
        </motion.div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border-l-4 border-red-500 p-6 rounded-xl mb-8 shadow-sm"
          >
            <div className="flex items-start">
              <XCircle className="h-6 w-6 text-red-500 mr-3 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold text-red-800">Verification Notice</h3>
                <p className="text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Results Container */}
        {(onChainResult || dbResult) && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-8"
          >
            {/* 1. Cryptographic Blockchain Status Banner */}
            {renderOnChainBanner()}

            {/* 2. Cryptographic Proof Details Card */}
            {onChainResult && (
              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-4">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-bold text-gray-900">Cryptographic Proof & On-Chain Integrity</h3>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase font-mono ${
                    onChainResult.status === 'VERIFIED' ? 'bg-green-100 text-green-700' :
                    onChainResult.status === 'MISMATCH' ? 'bg-red-100 text-red-700' :
                    onChainResult.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {onChainResult.status}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                    <p className="text-xs text-gray-500 font-semibold mb-1">COMPUTED EVIDENCE HASH (SHA-256)</p>
                    <p className="font-mono text-xs text-gray-800 break-all select-all">
                      {onChainResult.computedEvidenceHash || 'N/A'}
                    </p>
                  </div>

                  <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                    <p className="text-xs text-gray-500 font-semibold mb-1">ON-CHAIN EVIDENCE HASH</p>
                    <p className="font-mono text-xs text-gray-800 break-all select-all">
                      {onChainResult.onChainEvidenceHash || (onChainResult.onChainBatchExists ? 'Unmatched' : 'Not Registered')}
                    </p>
                  </div>

                  {onChainResult.transactionHash && (
                    <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 md:col-span-2">
                      <p className="text-xs text-gray-500 font-semibold mb-1">TRANSACTION HASH</p>
                      <p className="font-mono text-xs text-primary break-all select-all flex items-center gap-1.5">
                        <Hash className="h-3.5 w-3.5 flex-shrink-0" />
                        {onChainResult.transactionHash}
                      </p>
                    </div>
                  )}

                  {onChainResult.timestamp && (
                    <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                      <p className="text-xs text-gray-500 font-semibold mb-1">ON-CHAIN REGISTRATION TIMESTAMP</p>
                      <p className="text-xs text-gray-800 font-medium">
                        {new Date(onChainResult.timestamp).toLocaleString()}
                      </p>
                    </div>
                  )}

                  <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                    <p className="text-xs text-gray-500 font-semibold mb-1">VERIFICATION DETAILS</p>
                    <p className="text-xs text-gray-700">
                      {onChainResult.details}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Database Traceability Record (Product & Farm Information) */}
            {dbResult ? (
              <div className="space-y-6">
                <div className="flex items-center gap-2 pt-2">
                  <Database className="h-5 w-5 text-accent" />
                  <h3 className="text-xl font-bold text-gray-900">Database Traceability Record</h3>
                  <span className="text-xs bg-primary-light/10 text-primary px-2.5 py-0.5 rounded-full font-medium">
                    Off-Chain Registry
                  </span>
                </div>

                {/* Product Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Crop / Product Info */}
                  <div className="bg-white rounded-xl shadow-lg p-6 border border-secondary/20">
                    <div className="flex items-center space-x-3 mb-4">
                      <Package className="h-6 w-6 text-primary" />
                      <h4 className="text-lg font-bold text-accent">Product & Crop Attributes</h4>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-gray-500">Name</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {dbResult.crop?.name || dbResult.product?.name || 'Produce Item'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Crop Type</p>
                        <p className="text-base font-semibold text-gray-900">{dbResult.crop?.type || 'PRODUCE'}</p>
                      </div>
                      {dbResult.crop?.variety && (
                        <div>
                          <p className="text-sm text-gray-500">Variety</p>
                          <p className="text-base font-medium text-gray-900">{dbResult.crop.variety}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-sm text-gray-500">Growth Stage</p>
                        <span className="inline-block px-3 py-1 bg-primary-light/20 text-primary rounded-full text-xs font-bold uppercase tracking-wider mt-1">
                          {dbResult.crop?.growthStage || 'ACTIVE'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Farm Origin Info */}
                  <div className="bg-white rounded-xl shadow-lg p-6 border border-secondary/20">
                    <div className="flex items-center space-x-3 mb-4">
                      <Leaf className="h-6 w-6 text-primary" />
                      <h4 className="text-lg font-bold text-accent">Farm Origin & Farmer</h4>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-gray-500">Farm Name</p>
                        <p className="text-lg font-semibold text-gray-900">{dbResult.farm?.name || 'AgroTrace Partner Farm'}</p>
                      </div>
                      {dbResult.farm?.farmer && (
                        <div>
                          <p className="text-sm text-gray-500">Farmer</p>
                          <div className="flex items-center space-x-2 text-gray-900">
                            <User className="h-4 w-4 text-gray-400" />
                            <span className="font-semibold">
                              {dbResult.farm.farmer.firstName} {dbResult.farm.farmer.lastName}
                            </span>
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="text-sm text-gray-500">Farm Location</p>
                        <div className="flex items-center space-x-2 text-gray-900">
                          <MapPin className="h-4 w-4 text-gray-400" />
                          <span className="font-semibold">{dbResult.farm?.location || 'Verified Agricultural Region'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Supply Chain Timeline */}
                {dbResult.supplyChainEvents && dbResult.supplyChainEvents.length > 0 && (
                  <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8 border border-secondary/20">
                    <div className="flex items-center space-x-3 mb-6">
                      <Truck className="h-6 w-6 text-primary" />
                      <h4 className="text-xl font-bold text-accent">Product Journey Timeline</h4>
                    </div>
                    
                    <div className="relative">
                      {/* Timeline line */}
                      <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary to-secondary"></div>
                      
                      <div className="space-y-6">
                        {dbResult.supplyChainEvents.map((event: any, index: number) => (
                          <motion.div
                            key={event.id || index}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="relative flex items-start space-x-4"
                          >
                            <div className="absolute left-0 w-16 h-16 bg-gradient-to-br from-primary to-primary-light text-white rounded-full flex items-center justify-center z-10 shadow-lg">
                              {getEventIcon(event.eventType)}
                            </div>
                            <div className="ml-20 flex-1 bg-gradient-to-r from-secondary-light/30 to-transparent p-4 rounded-xl border-l-4 border-primary">
                              <div className="flex justify-between items-start flex-wrap gap-2">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h5 className="font-bold text-base sm:text-lg text-gray-900">{event.eventType}</h5>
                                    {event.chainStatus === 'CONFIRMED' && (
                                      <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-mono font-bold">
                                        ON-CHAIN
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-gray-600 text-sm mt-1">{event.description || 'Supply chain milestone recorded'}</p>
                                  {event.transactionHash && (
                                    <p className="text-[11px] font-mono text-gray-500 mt-1 truncate max-w-xs sm:max-w-md">
                                      Tx: {event.transactionHash}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right">
                                  <div className="flex items-center space-x-1.5 text-gray-600">
                                    <Calendar className="h-3.5 w-3.5" />
                                    <span className="text-xs font-medium">
                                      {new Date(event.timestamp || event.date).toLocaleDateString('en-US', {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric'
                                      })}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center text-gray-600">
                <Database className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm font-semibold">No direct off-chain database profile found for this identifier.</p>
                <p className="text-xs text-gray-500 mt-1">Verified on-chain commitments are displayed above.</p>
              </div>
            )}
          </motion.div>
        )}

        {/* Footer CTA */}
        {!dbResult && !onChainResult && !error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-center mt-12"
          >
            <p className="text-gray-600 mb-4">Want to track your products in real-time?</p>
            <a href="/login" className="inline-block bg-primary hover:bg-primary-dark text-white font-semibold px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
              Sign In to Your Account
            </a>
          </motion.div>
        )}
      </div>
      
      {/* macOS-style magnification dock */}
      {isAuthenticated && <MacDock items={dockItems} />}
    </div>
  );
}

