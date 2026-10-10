import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Leaf, Users, Package, MapPin, BarChart3, ShieldCheck, Truck, QrCode, Bot, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SearchItem {
  id: string;
  label: string;
  description: string;
  icon: any;
  href: string;
  category: string;
  keywords: string[];
  allowedRoles?: string[];
}

const searchItems: SearchItem[] = [
  { id: '1', label: 'Farmer Dashboard', description: 'View your crops, yield and revenue', icon: Leaf, href: '/dashboard', category: 'Pages', keywords: ['farm', 'crops', 'yield', 'revenue'], allowedRoles: ['FARMER'] },
  { id: '2', label: 'Admin Dashboard', description: 'Platform overview and analytics', icon: BarChart3, href: '/admin/dashboard', category: 'Pages', keywords: ['admin', 'analytics', 'stats'], allowedRoles: ['ADMIN'] },
  { id: '3', label: 'Distributor Dashboard', description: 'Manage shipments and supply chain', icon: Truck, href: '/distributor/dashboard', category: 'Pages', keywords: ['distributor', 'shipment', 'transport'], allowedRoles: ['DISTRIBUTOR'] },
  { id: '4', label: 'Marketplace', description: 'Browse and buy farm products', icon: Package, href: '/marketplace', category: 'Pages', keywords: ['buy', 'shop', 'products', 'market'] },
  { id: '5', label: 'Verify Product', description: 'Scan QR code to verify authenticity', icon: QrCode, href: '/verify', category: 'Features', keywords: ['verify', 'qr', 'scan', 'authenticate'] },
  { id: '6', label: 'Supply Chain', description: 'Track products across supply chain', icon: ShieldCheck, href: '/supply-chain', category: 'Features', keywords: ['supply', 'chain', 'track', 'blockchain'] },
  { id: '7', label: 'Admin Users', description: 'Manage platform users', icon: Users, href: '/admin/users', category: 'Admin', keywords: ['users', 'manage', 'accounts'], allowedRoles: ['ADMIN'] },
  { id: '8', label: 'Admin Farms', description: 'View and manage all farms', icon: MapPin, href: '/admin/farms', category: 'Admin', keywords: ['farms', 'locations', 'manage'], allowedRoles: ['ADMIN'] },
  { id: '9', label: 'Admin Products', description: 'View all products and crops', icon: Package, href: '/admin/products', category: 'Admin', keywords: ['products', 'crops', 'inventory'], allowedRoles: ['ADMIN'] },
  { id: '10', label: 'Analytics', description: 'Platform analytics and reports', icon: BarChart3, href: '/admin/analytics', category: 'Admin', keywords: ['analytics', 'reports', 'charts', 'data'], allowedRoles: ['ADMIN'] },
  { id: '11', label: 'AI Assistant', description: 'Ask questions about farming', icon: Bot, href: '/chatbot', category: 'Features', keywords: ['ai', 'chat', 'assistant', 'help', 'bot'] },
  { id: '13', label: 'Blockchain Explorer', description: 'View on-chain transaction history', icon: ShieldCheck, href: '/blockchain', category: 'Blockchain', keywords: ['blockchain', 'transactions', 'explorer', 'hash'] },
  { id: '14', label: 'My Crops', description: 'Manage your crop batches', icon: Leaf, href: '/crops', category: 'Farmer', keywords: ['crops', 'batches', 'growing'], allowedRoles: ['FARMER'] },
  { id: '15', label: 'My Farms', description: 'View your registered farms', icon: MapPin, href: '/farms', category: 'Farmer', keywords: ['farms', 'land', 'location'], allowedRoles: ['FARMER'] },
];

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [userRole, setUserRole] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        setUserRole(user.role);
      } catch (e) {}
    }
  }, []);

  const roleFilteredItems = searchItems.filter(item => 
    !item.allowedRoles || (userRole && item.allowedRoles.includes(userRole))
  );

  const filtered = query.trim() === ''
    ? roleFilteredItems.slice(0, 8)
    : roleFilteredItems.filter(item =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.description.toLowerCase().includes(query.toLowerCase()) ||
        item.keywords.some(k => k.includes(query.toLowerCase()))
      );

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelected(0);
    }
  }, [open]);

  useEffect(() => { setSelected(0); }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); if (filtered[selected]) handleSelect(filtered[selected]); }
  };

  const handleSelect = (item: SearchItem) => {
    navigate(item.href);
    setOpen(false);
  };

  const grouped = filtered.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, SearchItem[]>);

  let idx = 0;

  return (
    <>
      <button
        id="global-search-trigger"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all text-sm"
        aria-label="Open search (Ctrl+K)"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden sm:inline px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 text-xs rounded border border-gray-200 dark:border-gray-600 font-mono">⌘K</kbd>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-start justify-center pt-24 px-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Search Input */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <Search className="h-5 w-5 text-gray-400 flex-shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search pages, features, settings..."
                  className="flex-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 outline-none text-base"
                  id="global-search-input"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600 transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="px-2 py-1 text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                  Esc
                </button>
              </div>

              {/* Results */}
              <div className="max-h-96 overflow-y-auto py-2">
                {filtered.length === 0 ? (
                  <div className="py-10 text-center text-gray-400">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No results for "{query}"</p>
                  </div>
                ) : (
                  Object.entries(grouped).map(([category, items]) => (
                    <div key={category}>
                      <p className="px-5 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                        {category}
                      </p>
                      {items.map((item) => {
                        const currentIdx = idx++;
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleSelect(item)}
                            onMouseEnter={() => setSelected(currentIdx)}
                            className={`w-full flex items-center gap-4 px-5 py-3 transition-colors text-left ${
                              selected === currentIdx
                                ? 'bg-green-50 dark:bg-green-900/20'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                          >
                            <div className={`flex-shrink-0 p-2 rounded-lg ${
                              selected === currentIdx ? 'bg-green-100 dark:bg-green-800' : 'bg-gray-100 dark:bg-gray-800'
                            }`}>
                              <Icon className={`h-4 w-4 ${selected === currentIdx ? 'text-green-600' : 'text-gray-500 dark:text-gray-400'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${selected === currentIdx ? 'text-green-700 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
                                {item.label}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.description}</p>
                            </div>
                            {selected === currentIdx && (
                              <kbd className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded border border-gray-200 dark:border-gray-600">↵</kbd>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-400">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1"><kbd className="font-mono">↑↓</kbd> navigate</span>
                  <span className="flex items-center gap-1"><kbd className="font-mono">↵</kbd> select</span>
                  <span className="flex items-center gap-1"><kbd className="font-mono">Esc</kbd> close</span>
                </div>
                <span>FarmConnect Search</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
