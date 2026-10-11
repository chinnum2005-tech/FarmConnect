import { useRef, useState, Fragment, useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { 
  Store, 
  ShoppingCart, 
  Shield, 
  MessageCircle, 
  Cloud, 
  Camera, 
  LogOut, 
  Truck, 
  LayoutGrid, 
  Users, 
  CheckCircle2,
  Package
} from 'lucide-react';

export interface DockItem {
  id: string;
  icon: any;
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  badge?: number;
  gradient?: string;
}

interface DockIconProps {
  item: DockItem;
  mouseX: ReturnType<typeof useMotionValue<number>>;
}

function DockIcon({ item, mouseX }: DockIconProps) {
  const ref = useRef<HTMLDivElement>(null);

  const distance = useTransform(mouseX, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  // Scale magnification — peak at 1.55x, falloff over 150px
  const scaleRaw = useTransform(distance, [-150, 0, 150], [1, 1.55, 1]);
  const scale = useSpring(scaleRaw, { mass: 0.1, stiffness: 200, damping: 15 });

  // Y lift — icon floats upward when hovered
  const yRaw = useTransform(distance, [-150, 0, 150], [0, -12, 0]);
  const y = useSpring(yRaw, { mass: 0.1, stiffness: 200, damping: 15 });

  const [hovered, setHovered] = useState(false);
  const Icon = item.icon;

  const gradient = item.gradient || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

  return (
    <div
      ref={ref}
      className="relative flex flex-col items-center select-none"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* High-Contrast Tooltip — strictly centered directly on this specific button */}
      <motion.div
        initial={{ opacity: 0, y: 6, scale: 0.9 }}
        animate={hovered ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 6, scale: 0.9 }}
        transition={{ duration: 0.15 }}
        className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap pointer-events-none z-50 shadow-2xl"
        style={{
          background: '#090d16',
          border: '1px solid rgba(255, 255, 255, 0.25)',
          color: '#ffffff',
          boxShadow: '0 12px 24px -4px rgba(0, 0, 0, 0.7), 0 6px 12px -2px rgba(0, 0, 0, 0.5)',
        }}
      >
        {item.label}
        {/* Tooltip Arrow */}
        <div 
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
          style={{ background: '#090d16', borderBottom: '1px solid rgba(255,255,255,0.25)', borderRight: '1px solid rgba(255,255,255,0.25)' }}
        />
      </motion.div>

      {/* Magnified & Floating Icon Container */}
      <motion.div
        onClick={item.onClick}
        whileTap={{ scale: 0.9 }}
        className="relative w-12 h-12 rounded-2xl flex items-center justify-center cursor-pointer overflow-hidden"
        style={{
          background: gradient,
          scale,
          y,
          transformOrigin: 'bottom center',
          boxShadow: hovered
            ? '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.25)'
            : '0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)',
          transition: 'box-shadow 0.2s ease',
        }}
      >
        {/* Glass sheen */}
        <div
          className="absolute inset-0 rounded-2xl"
          style={{
            background: 'linear-gradient(145deg, rgba(255,255,255,0.22) 0%, transparent 60%)',
          }}
        />
        <Icon size={22} className="relative z-10 text-white drop-shadow-sm" />

        {/* Active dot */}
        {item.active && (
          <span
            className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white"
            style={{ boxShadow: '0 0 4px rgba(255,255,255,0.8)' }}
          />
        )}

        {/* Badge */}
        {item.badge !== undefined && item.badge > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold text-white px-1"
            style={{ background: '#ef4444', boxShadow: '0 2px 6px rgba(239,68,68,0.5)' }}
          >
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
      </motion.div>
    </div>
  );
}

export function getRoleDockItems(user: any, activeId?: string): DockItem[] {
  const role = user?.role || 'CONSUMER';
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.clear();
    window.location.href = '/login';
  };

  if (role === 'FARMER') {
    return [
      { id: 'dashboard', icon: LayoutGrid, label: 'Farm Dashboard', gradient: 'linear-gradient(135deg,#10b981,#047857)', onClick: () => window.location.href='/farmer/dashboard', active: activeId === 'dashboard' },
      { id: 'market', icon: Store, label: 'Marketplace', gradient: 'linear-gradient(135deg,#06b6d4,#0e7490)', onClick: () => window.location.href='/marketplace', active: activeId === 'market' },
      { id: 'weather', icon: Cloud, label: 'Weather AI', gradient: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', onClick: () => window.location.href='/weather', active: activeId === 'weather' },
      { id: 'chatbot', icon: MessageCircle, label: 'AgroBot AI', gradient: 'linear-gradient(135deg,#6366f1,#4338ca)', onClick: () => window.location.href='/chatbot', active: activeId === 'chatbot' },
      { id: 'blockchain', icon: Shield, label: 'Blockchain Explorer', gradient: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', onClick: () => window.location.href='/blockchain', active: activeId === 'blockchain' },
      { id: 'gallery', icon: Camera, label: 'Farm Gallery', gradient: 'linear-gradient(135deg,#0ea5e9,#0369a1)', onClick: () => window.location.href='/gallery', active: activeId === 'gallery' },
      { id: 'logout', icon: LogOut, label: 'Logout', gradient: 'linear-gradient(135deg,#ef4444,#b91c1c)', onClick: handleLogout },
    ];
  }

  if (role === 'DISTRIBUTOR') {
    return [
      { id: 'dashboard', icon: Truck, label: 'Shipments Hub', gradient: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', onClick: () => window.location.href='/distributor/dashboard', active: activeId === 'dashboard' },
      { id: 'market', icon: Store, label: 'Marketplace', gradient: 'linear-gradient(135deg,#06b6d4,#0e7490)', onClick: () => window.location.href='/marketplace', active: activeId === 'market' },
      { id: 'trace', icon: Package, label: 'Product Trace', gradient: 'linear-gradient(135deg,#f59e0b,#d97706)', onClick: () => window.location.href='/product-trace', active: activeId === 'trace' },
      { id: 'chatbot', icon: MessageCircle, label: 'AgroBot AI', gradient: 'linear-gradient(135deg,#6366f1,#4338ca)', onClick: () => window.location.href='/chatbot', active: activeId === 'chatbot' },
      { id: 'blockchain', icon: Shield, label: 'Blockchain Ledger', gradient: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', onClick: () => window.location.href='/blockchain', active: activeId === 'blockchain' },
      { id: 'logout', icon: LogOut, label: 'Logout', gradient: 'linear-gradient(135deg,#ef4444,#b91c1c)', onClick: handleLogout },
    ];
  }

  if (role === 'ADMIN') {
    return [
      { id: 'dashboard', icon: LayoutGrid, label: 'Admin Dashboard', gradient: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', onClick: () => window.location.href='/admin/dashboard', active: activeId === 'dashboard' },
      { id: 'users', icon: Users, label: 'User Directory', gradient: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', onClick: () => window.location.href='/admin/dashboard', active: activeId === 'users' },
      { id: 'chatbot', icon: MessageCircle, label: 'AgroBot AI', gradient: 'linear-gradient(135deg,#6366f1,#4338ca)', onClick: () => window.location.href='/chatbot', active: activeId === 'chatbot' },
      { id: 'blockchain', icon: Shield, label: 'Blockchain Ledger', gradient: 'linear-gradient(135deg,#ec4899,#be185d)', onClick: () => window.location.href='/blockchain', active: activeId === 'blockchain' },
      { id: 'gallery', icon: Camera, label: 'Farm Gallery', gradient: 'linear-gradient(135deg,#0ea5e9,#0369a1)', onClick: () => window.location.href='/gallery', active: activeId === 'gallery' },
      { id: 'logout', icon: LogOut, label: 'Logout', gradient: 'linear-gradient(135deg,#ef4444,#b91c1c)', onClick: handleLogout },
    ];
  }

  // CONSUMER default
  return [
    { id: 'market', icon: Store, label: 'Marketplace', gradient: 'linear-gradient(135deg,#06b6d4,#0e7490)', onClick: () => window.location.href='/marketplace', active: activeId === 'market' },
    { id: 'orders', icon: ShoppingCart, label: 'My Cart & Orders', gradient: 'linear-gradient(135deg,#f59e0b,#d97706)', onClick: () => window.location.href='/marketplace', active: activeId === 'orders' },
    { id: 'verify', icon: CheckCircle2, label: 'Verify Harvest', gradient: 'linear-gradient(135deg,#10b981,#047857)', onClick: () => window.location.href='/verify', active: activeId === 'verify' },
    { id: 'chatbot', icon: MessageCircle, label: 'AgroBot AI', gradient: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', onClick: () => window.location.href='/chatbot', active: activeId === 'chatbot' },
    { id: 'blockchain', icon: Shield, label: 'Blockchain Provenance', gradient: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', onClick: () => window.location.href='/blockchain', active: activeId === 'blockchain' },
    { id: 'gallery', icon: Camera, label: 'Farm Gallery', gradient: 'linear-gradient(135deg,#0ea5e9,#0369a1)', onClick: () => window.location.href='/gallery', active: activeId === 'gallery' },
    { id: 'logout', icon: LogOut, label: 'Logout', gradient: 'linear-gradient(135deg,#ef4444,#b91c1c)', onClick: handleLogout },
  ];
}

interface MacDockProps {
  items?: DockItem[];
  activeId?: string;
}

export default function MacDock({ items, activeId }: MacDockProps) {
  const mouseX = useMotionValue(Infinity);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY < 10);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
  const user = userStr ? JSON.parse(userStr) : null;
  const effectiveItems = items || getRoleDockItems(user, activeId);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={visible ? { y: 0, opacity: 1 } : { y: 100, opacity: 0 }}
        transition={{ type: 'tween', duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        onMouseMove={(e) => mouseX.set(e.clientX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        className="flex items-end gap-5 px-6 py-3.5 rounded-[32px]"
        style={{
          background: 'rgba(18, 18, 24, 0.72)',
          backdropFilter: 'blur(28px) saturate(180%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow:
            '0 32px 64px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        {effectiveItems.map((item, i) => (
          <Fragment key={item.id}>
            {/* Separator before last item (Logout) */}
            {i === effectiveItems.length - 1 && (
              <div
                className="self-center h-8 w-px mx-1 rounded-full"
                style={{ background: 'rgba(255,255,255,0.12)' }}
              />
            )}
            <DockIcon item={item} mouseX={mouseX} />
          </Fragment>
        ))}
      </motion.div>
    </div>
  );
}
