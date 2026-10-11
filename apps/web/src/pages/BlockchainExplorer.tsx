import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, ExternalLink, Search, ChevronDown, ChevronUp,
  Clock, MapPin, CheckCircle, Package, Truck, Activity,
  AlertCircle, RefreshCw, ChevronLeft, ChevronRight,
  Store, MessageCircle, Camera, LogOut, ShoppingCart
} from 'lucide-react';
import MacDock, { DockItem } from '../components/ui/MacDock';
import { supplyChainService } from '../services/supplyChainService';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BlockchainEvent {
  id: string;
  hash: string | null;
  blockNumber: number | null;
  eventType: string;
  productId: string;
  productName: string;
  productSku: string;
  actor: string;
  actorRole: string;
  location: string;
  timestamp: string;
  verified: boolean;
  chainStatus?: string;
  metadata: Record<string, any> | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const eventConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  PLANTED:       { icon: Package,     color: 'text-lime-600',   bg: 'bg-lime-100',    label: 'Planted' },
  HARVESTED:     { icon: Package,     color: 'text-green-600',  bg: 'bg-green-100',   label: 'Harvested' },
  PROCESSED:     { icon: Activity,    color: 'text-orange-600', bg: 'bg-orange-100',  label: 'Processed' },
  PACKAGED:      { icon: Package,     color: 'text-blue-600',   bg: 'bg-blue-100',    label: 'Packaged' },
  SHIPPED:       { icon: Truck,       color: 'text-amber-600',  bg: 'bg-amber-100',   label: 'Shipped' },
  QUALITY_CHECK: { icon: CheckCircle, color: 'text-purple-600', bg: 'bg-purple-100',  label: 'Quality Check' },
  RECEIVED:      { icon: CheckCircle, color: 'text-teal-600',   bg: 'bg-teal-100',    label: 'Received' },
  RETAIL:        { icon: Activity,    color: 'text-pink-600',   bg: 'bg-pink-100',    label: 'At Retail' },
  SOLD:          { icon: Activity,    color: 'text-indigo-600', bg: 'bg-indigo-100',  label: 'Sold' },
};

const PAGE_SIZE = 10;

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60)   return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)   return `${minutes}m ago`;
  const hours   = Math.floor(minutes / 60);
  if (hours   < 24)   return `${hours}h ago`;
  const days    = Math.floor(hours / 24);
  return `${days}d ago`;
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-white/10 rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-white/10 rounded w-1/4" />
          <div className="h-4 bg-white/10 rounded w-1/2" />
          <div className="h-3 bg-white/10 rounded w-1/3" />
        </div>
        <div className="text-right space-y-2">
          <div className="h-3 bg-white/10 rounded w-20" />
          <div className="h-3 bg-white/10 rounded w-16" />
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BlockchainExplorer() {
  const [events,   setEvents]   = useState<BlockchainEvent[]>([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [search,   setSearch]   = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page,     setPage]     = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Debounce search input by 400ms
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await supplyChainService.getAllEvents({
        search: debouncedSearch || undefined,
        limit:  PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setEvents(result.data  || []);
      setTotal(result.total  || 0);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load blockchain events. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page]);

  const isAuthenticated = !!localStorage.getItem('user');

  const dockItems: DockItem[] = [
    { id: 'market',    icon: Store,         label: 'Marketplace',               gradient: 'linear-gradient(135deg,#06b6d4,#0e7490)',  onClick: () => window.location.href='/marketplace' },
    { id: 'orders',    icon: ShoppingCart,  label: 'My Orders',                  gradient: 'linear-gradient(135deg,#f59e0b,#d97706)',  onClick: () => window.location.href='/marketplace' },
    { id: 'blockchain',icon: Shield,        label: 'Blockchain', active: true,  gradient: 'linear-gradient(135deg,#8b5cf6,#6d28d9)',  onClick: () => window.location.href='/blockchain' },
    { id: 'chatbot',   icon: MessageCircle, label: 'AgroBot AI',                gradient: 'linear-gradient(135deg,#3b82f6,#1d4ed8)',  onClick: () => window.location.href='/chatbot' },
    { id: 'gallery',   icon: Camera,        label: 'Farm Gallery',              gradient: 'linear-gradient(135deg,#0ea5e9,#0369a1)',  onClick: () => window.location.href='/gallery' },
    { id: 'logout',    icon: LogOut,        label: 'Logout',                    gradient: 'linear-gradient(135deg,#ef4444,#b91c1c)',  onClick: () => { localStorage.removeItem('token'); localStorage.removeItem('user'); sessionStorage.clear(); window.location.href='/login'; } },
  ];

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const totalPages  = Math.ceil(total / PAGE_SIZE);
  const verifiedCount = events.filter(e => e.verified).length;

  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 p-6 ${isAuthenticated ? 'pb-32' : ''}`}>
      <div className="max-w-5xl mx-auto">

        {/* ── Header ── */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-600/30 border border-purple-500/50 rounded-2xl backdrop-blur-sm">
                <Shield className="h-8 w-8 text-purple-400" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">⛓️ Blockchain Transaction Explorer</h1>
                <p className="text-slate-400">Live supply chain events from your database</p>
              </div>
            </div>
            <button
              onClick={fetchEvents}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Network Status */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Total Events',     value: total.toLocaleString(), sub: 'in database' },
              { label: 'On this page',     value: events.length.toString(), sub: `of ${total} total` },
              { label: 'Verified On-Chain',value: verifiedCount.toString(), sub: 'with tx hash' },
            ].map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-4"
              >
                <p className="text-slate-400 text-xs mb-1">{stat.label}</p>
                <p className="text-white font-bold text-lg">{stat.value}</p>
                <p className="text-slate-500 text-xs">{stat.sub}</p>
              </motion.div>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by product, actor, location, event type, or tx hash..."
              className="w-full bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-slate-400 rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>
        </motion.div>

        {/* ── Error State ── */}
        {error && (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-2xl p-5 mb-6">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Could not load events</p>
              <p className="text-sm text-red-400 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* ── Transactions ── */}
        <div className="space-y-3">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            : events.map((tx, index) => {
                const cfg    = eventConfig[tx.eventType] || eventConfig.HARVESTED;
                const Icon   = cfg.icon;
                const isOpen = expanded === tx.id;

                return (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden hover:border-purple-500/50 transition-all"
                  >
                    {/* Row */}
                    <div className="p-5 cursor-pointer" onClick={() => setExpanded(isOpen ? null : tx.id)}>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className={`flex-shrink-0 p-3 rounded-xl ${cfg.bg}`}>
                            <Icon className={`h-5 w-5 ${cfg.color}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${cfg.bg} ${cfg.color}`}>
                                {cfg.label}
                              </span>
                              {tx.chainStatus === 'SIMULATED_FALLBACK' ? (
                                <span className="flex items-center gap-1 text-xs text-orange-400 font-bold border border-orange-400/50 bg-orange-400/10 px-2 py-0.5 rounded-lg">
                                  <AlertCircle className="w-3 h-3" />
                                  Simulated (Local)
                                </span>
                              ) : tx.verified ? (
                                <span className="flex items-center gap-1 text-xs text-green-400">
                                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                                  On-Chain
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-xs text-slate-500">
                                  <div className="w-1.5 h-1.5 bg-slate-500 rounded-full" />
                                  DB Only
                                </span>
                              )}
                            </div>
                            <p className="text-white font-semibold">{tx.productName}</p>
                            <p className="text-slate-400 text-xs font-mono">
                              {tx.hash ? shortHash(tx.hash) : 'No tx hash yet'}
                            </p>
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0">
                          <div className="flex items-center justify-end gap-2 text-slate-400 text-xs mb-1">
                            <Clock className="h-3 w-3" />
                            {timeAgo(tx.timestamp)}
                          </div>
                          <p className="text-slate-400 text-xs">
                            {tx.blockNumber ? `Block #${tx.blockNumber.toLocaleString()}` : 'Not on-chain'}
                          </p>
                          {isOpen
                            ? <ChevronUp   className="h-4 w-4 text-slate-400 ml-auto mt-1" />
                            : <ChevronDown className="h-4 w-4 text-slate-400 ml-auto mt-1" />
                          }
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-white/10"
                        >
                          <div className="p-5 grid grid-cols-2 gap-4">
                            <div className="space-y-3">
                              <div>
                                <p className="text-slate-500 text-xs mb-1">Transaction Hash</p>
                                <p className="text-purple-400 font-mono text-xs break-all">
                                  {tx.hash || '— Not yet recorded on-chain —'}
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-500 text-xs mb-1">Actor / Role</p>
                                <p className="text-white text-sm">
                                  {tx.actor} <span className="text-slate-400 text-xs">({tx.actorRole})</span>
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-500 text-xs mb-1">Location</p>
                                <div className="flex items-center gap-1 text-white text-sm">
                                  <MapPin className="h-3 w-3 text-slate-400" />
                                  {tx.location}
                                </div>
                              </div>
                              {tx.productSku && (
                                <div>
                                  <p className="text-slate-500 text-xs mb-1">Product SKU</p>
                                  <p className="text-white text-sm font-mono">{tx.productSku}</p>
                                </div>
                              )}
                            </div>
                            <div className="space-y-3">
                              <div>
                                <p className="text-slate-500 text-xs mb-1">Block Number</p>
                                <p className="text-white text-sm font-mono">
                                  {tx.blockNumber ? `#${tx.blockNumber.toLocaleString()}` : '—'}
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-500 text-xs mb-1">Timestamp</p>
                                <p className="text-white text-sm">
                                  {new Date(tx.timestamp).toLocaleString()}
                                </p>
                              </div>
                              {tx.metadata && Object.keys(tx.metadata).length > 0 && (
                                <div>
                                  <p className="text-slate-500 text-xs mb-1">Metadata</p>
                                  <pre className="text-slate-300 text-xs bg-white/5 rounded-lg p-2 overflow-auto max-h-24">
                                    {JSON.stringify(tx.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                            {tx.hash && (
                              <div className="col-span-2">
                                <a
                                  href={`https://mumbai.polygonscan.com/tx/${tx.hash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-medium transition-colors"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  View on PolygonScan
                                </a>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })
          }
        </div>

        {/* ── Empty State ── */}
        {!loading && !error && events.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">No events found</p>
            {debouncedSearch && (
              <p className="text-sm mt-1">Try clearing the search or check your database has seeded data.</p>
            )}
          </div>
        )}

        {/* ── Pagination ── */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <span className="text-slate-400 text-sm">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="flex items-center gap-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm disabled:opacity-40 transition-colors"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

      </div>
      
      {/* macOS-style magnification dock */}
      {isAuthenticated && <MacDock items={dockItems} />}
    </div>
  );
}
