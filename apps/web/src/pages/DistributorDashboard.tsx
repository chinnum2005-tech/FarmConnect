import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Truck, Package, MapPin, CheckCircle, Clock, TrendingUp, AlertCircle, LogOut, Store, BarChart3 } from 'lucide-react';
import MacDock, { DockItem } from '../components/ui/MacDock';
import Card from '../components/Card';
import Timeline from '../components/Timeline';
import BlockchainBadge from '../components/BlockchainBadge';
import { shipmentService } from '../services/shipmentService';
import { supplyChainService } from '../services/supplyChainService';
import { AnimatePresence } from 'framer-motion';

interface Shipment {
  id: string;
  status: 'ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED';
  currentLocation?: string;
  estimatedDelivery?: string;
  actualDelivery?: string;
  order: {
    id: string;
    totalPrice: number;
    shippingAddress: string;
    consumerName: string;
    items: {
      name: string;
      quantity: number;
      farmName: string;
    }[];
  };
}

interface SCEvent {
  id: string;
  eventType: string;
  timestamp: string;
  location?: string;
  product?: { name: string };
  transactionHash?: string;
}

export default function DistributorDashboard() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [events, setEvents] = useState<SCEvent[]>([]);
  const [loading, setLoading] = useState(true);
  
  // For the Event Recording form
  const [selectedShipmentId, setSelectedShipmentId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [currentLocation, setCurrentLocation] = useState('');
  const [updating, setUpdating] = useState(false);
  const [lastTxHash, setLastTxHash] = useState('');

  // For Claiming Shipments
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [availableShipments, setAvailableShipments] = useState<any[]>([]);
  const [claiming, setClaiming] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [shipmentsRes, eventsRes] = await Promise.all([
        shipmentService.getMyShipments(),
        supplyChainService.getRecentEvents(10) // fetch 10 recent
      ]);
      if (shipmentsRes.success) setShipments(shipmentsRes.data);
      if (eventsRes.success) setEvents(eventsRes.data);
    } catch (error) {
      console.error('Failed to load dashboard data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenClaimModal = async () => {
    setShowClaimModal(true);
    try {
      const res = await shipmentService.getAvailableShipments();
      if (res.success) {
        setAvailableShipments(res.data);
      }
    } catch (error) {
      console.error('Failed to fetch available shipments', error);
      alert('Failed to fetch available shipments');
    }
  };

  const handleClaimShipment = async (shipmentId: string) => {
    setClaiming(true);
    try {
      await shipmentService.claimShipment(shipmentId);
      alert('Shipment claimed successfully!');
      setAvailableShipments(prev => prev.filter(s => s.id !== shipmentId));
      loadData(); // Refresh my shipments
    } catch (error) {
      console.error('Failed to claim shipment', error);
      alert('Failed to claim shipment');
    } finally {
      setClaiming(false);
    }
  };

  const handleUpdateStatus = async (shipmentId: string, newStatus: string) => {
    try {
      await shipmentService.updateShipmentStatus(
        shipmentId,
        newStatus as any,
        'Auto-updated location'
      );
      alert(`Shipment status updated to ${newStatus}`);
      loadData();
    } catch (error) {
      console.error(error);
      alert('Failed to update shipment status');
    }
  };

  const handleRecordEvent = async () => {
    if (!selectedShipmentId || !selectedStatus) {
      alert('Please select a shipment and status');
      return;
    }
    setUpdating(true);
    try {
      const updateRes = await shipmentService.updateShipmentStatus(
        selectedShipmentId,
        selectedStatus as any,
        currentLocation || 'Unknown Location'
      );
      
      const genuineTxHash = updateRes?.data?.transactionHash || null;
      if (genuineTxHash) {
        setLastTxHash(genuineTxHash);
        alert('Event status updated and anchored on-chain!');
      } else {
        setLastTxHash('');
        alert('Event status updated in database successfully.');
      }
      
      loadData();
      setSelectedShipmentId('');
      setSelectedStatus('');
      setCurrentLocation('');
    } catch (error) {
      console.error(error);
      alert('Failed to record event');
    } finally {
      setUpdating(false);
    }
  };

  const activeCount = shipments.filter(s => ['PICKED_UP', 'IN_TRANSIT'].includes(s.status)).length;
  const deliveredCount = shipments.filter(s => s.status === 'DELIVERED').length;
  const pendingCount = shipments.filter(s => s.status === 'ASSIGNED').length;

  const dockItems: DockItem[] = [
    { id: 'overview',   icon: BarChart3,    label: 'Overview',       active: true, gradient: 'linear-gradient(135deg,#3b82f6,#1d4ed8)',  onClick: () => window.location.href='/distributor/dashboard' },
    { id: 'shipment',   icon: Package,      label: 'New Shipment',               gradient: 'linear-gradient(135deg,#22c55e,#15803d)',  onClick: () => window.location.href='/supply-chain' },
    { id: 'track',      icon: MapPin,       label: 'Track Shipments',            gradient: 'linear-gradient(135deg,#f59e0b,#d97706)',  onClick: () => window.location.href='/supply-chain' },
    { id: 'transit',    icon: Truck,        label: 'In Transit',                 gradient: 'linear-gradient(135deg,#10b981,#047857)',  onClick: () => window.location.href='/supply-chain' },
    { id: 'history',    icon: Clock,        label: 'History',                    gradient: 'linear-gradient(135deg,#8b5cf6,#6d28d9)',  onClick: () => window.location.href='/supply-chain' },
    { id: 'blockchain', icon: CheckCircle,  label: 'Blockchain Log',             gradient: 'linear-gradient(135deg,#06b6d4,#0e7490)',  onClick: () => window.location.href='/supply-chain' },
    { id: 'market',     icon: Store,        label: 'Marketplace',                gradient: 'linear-gradient(135deg,#ec4899,#be185d)',  onClick: () => window.location.href='/marketplace' },
    { id: 'logout',     icon: LogOut,       label: 'Logout',                     gradient: 'linear-gradient(135deg,#ef4444,#b91c1c)',  onClick: () => { localStorage.removeItem('token'); localStorage.removeItem('user'); sessionStorage.clear(); window.location.href='/login'; } },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="p-8 pb-28">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h2 className="text-3xl font-bold text-accent mb-2">
            Transport Dashboard 🚚
          </h2>
          <p className="text-gray-600">Manage shipments and update supply chain events</p>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {[
            { title: 'Active Shipments', value: activeCount.toString(), icon: Truck, color: 'bg-primary' },
            { title: 'Delivered', value: deliveredCount.toString(), icon: CheckCircle, color: 'bg-accent' },
            { title: 'Pending', value: pendingCount.toString(), icon: Clock, color: 'bg-primary-dark' },
            { title: 'Total Orders', value: shipments.length.toString(), icon: MapPin, color: 'bg-primary-light' }
          ].map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card gradient className="hover:shadow-xl transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-gray-600 text-sm font-medium">{stat.title}</h3>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
                  </div>
                  <div className={`${stat.color} p-3 rounded-lg`}>
                    <stat.icon className="text-white h-6 w-6" />
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Active Shipments */}
        <Card 
          title="My Shipments" 
          icon={<Truck className="h-6 w-6" />}
          action={
            <button 
              onClick={handleOpenClaimModal}
              className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm transition-colors"
            >
              + Find Shipments
            </button>
          }
        >
          {loading ? (
             <div className="py-8 text-center text-gray-500">Loading shipments...</div>
          ) : shipments.length === 0 ? (
             <div className="py-8 text-center text-gray-500">No shipments assigned to you yet.</div>
          ) : (
            <div className="space-y-4">
              {shipments.map((shipment) => {
                const mainProduct = shipment.order.items[0];
                return (
                <motion.div
                  key={shipment.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <Package className="h-5 w-5 text-primary" />
                        <h3 className="font-bold text-gray-900">Order #{shipment.order.id.slice(-6).toUpperCase()}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          ['PICKED_UP', 'IN_TRANSIT'].includes(shipment.status)
                            ? 'bg-blue-100 text-blue-700'
                            : shipment.status === 'DELIVERED'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {shipment.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <Package className="h-4 w-4" />
                          <span>{mainProduct?.name} ({mainProduct?.quantity} units)</span>
                        </div>
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <MapPin className="h-4 w-4" />
                          <span>From: {mainProduct?.farmName || 'Unknown Farm'}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <Truck className="h-4 w-4" />
                          <span>To: {shipment.order.shippingAddress}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-sm text-gray-600">
                          <Clock className="h-4 w-4" />
                          <span>ETA: {shipment.estimatedDelivery ? new Date(shipment.estimatedDelivery).toLocaleDateString() : 'TBD'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col space-y-2">
                      {['PICKED_UP', 'IN_TRANSIT'].includes(shipment.status) && (
                        <button
                          onClick={() => handleUpdateStatus(shipment.id, 'DELIVERED')}
                          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center space-x-1 justify-center"
                        >
                          <CheckCircle className="h-4 w-4" />
                          <span>Mark Delivered</span>
                        </button>
                      )}
                      {shipment.status === 'ASSIGNED' && (
                        <button
                          onClick={() => handleUpdateStatus(shipment.id, 'PICKED_UP')}
                          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center space-x-1 justify-center"
                        >
                          <Truck className="h-4 w-4" />
                          <span>Pick Up</span>
                        </button>
                      )}
                      <button className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm transition-colors">
                        View Details
                      </button>
                    </div>
                  </div>
                </motion.div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Supply Chain Timeline */}
        <div className="mt-8">
          <Card title="Recent Supply Chain Events" icon={<TrendingUp className="h-6 w-6" />}>
            {loading ? (
              <div className="py-4 text-center text-gray-500">Loading events...</div>
            ) : events.length === 0 ? (
              <div className="py-4 text-center text-gray-500">No recent events recorded.</div>
            ) : (
              <Timeline events={events.map((evt, i) => ({
                icon: evt.eventType === 'DELIVERED' || evt.eventType === 'RECEIVED' ? <CheckCircle className="h-8 w-8" /> : 
                      evt.eventType === 'SHIPPED' ? <Truck className="h-8 w-8" /> : <Package className="h-8 w-8" />,
                title: evt.eventType.replace('_', ' '),
                description: `${evt.product?.name || 'Product'} at ${evt.location || 'Unknown Location'}`,
                date: new Date(evt.timestamp).toLocaleString(),
                status: i === 0 ? 'current' : 'completed'
              }))} />
            )}
          </Card>
        </div>

        {/* Blockchain Recording */}
        <div className="mt-8">
          <Card 
            title="Blockchain Event Recording" 
            icon={<CheckCircle className="h-6 w-6" />}
            gradient
          >
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-lg border-2 border-primary/20">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="h-6 w-6 text-primary mt-1" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-2">
                      Record Supply Chain Event
                    </h4>
                    <p className="text-sm text-gray-600 mb-4">
                      Update shipment location and status on the Polygon blockchain for immutable tracking
                    </p>
                    
                    <div className="flex flex-col md:flex-row gap-3">
                      <select 
                        value={selectedShipmentId}
                        onChange={(e) => setSelectedShipmentId(e.target.value)}
                        className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Select Shipment</option>
                        {shipments.filter(s => s.status !== 'DELIVERED').map(s => (
                          <option key={s.id} value={s.id}>Order #{s.order.id.slice(-6).toUpperCase()}</option>
                        ))}
                      </select>

                      <select 
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Select Event Type</option>
                        <option value="PICKED_UP">Pickup Confirmed</option>
                        <option value="IN_TRANSIT">In Transit</option>
                        <option value="DELIVERED">Delivered</option>
                      </select>
                      
                      <input 
                        type="text" 
                        placeholder="Current Location"
                        value={currentLocation}
                        onChange={(e) => setCurrentLocation(e.target.value)}
                        className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      />

                      <button 
                        onClick={handleRecordEvent}
                        disabled={updating}
                        className="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-lg transition-colors font-semibold disabled:opacity-50"
                      >
                        {updating ? 'Recording...' : 'Record on Blockchain'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {lastTxHash && (
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-6 w-6 text-green-600" />
                      <div>
                        <p className="font-semibold text-green-900">Last Sync Successful</p>
                        <p className="text-sm text-green-700">All events recorded on blockchain</p>
                      </div>
                    </div>
                    <BlockchainBadge hash={lastTxHash} />
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Claim Shipment Modal */}
      <AnimatePresence>
        {showClaimModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Package className="h-6 w-6 text-primary" /> Available Shipments
                </h3>
                <button onClick={() => setShowClaimModal(false)} className="text-gray-500 hover:text-gray-800 text-xl font-bold">✕</button>
              </div>
              
              {availableShipments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Truck className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  <p>No available shipments to claim right now.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {availableShipments.map((s) => (
                    <div key={s.id} className="border rounded-xl p-4 flex flex-col md:flex-row justify-between md:items-center gap-4 hover:border-primary/50 transition-colors">
                      <div>
                        <p className="font-bold text-gray-900">Order #{s.order.id.slice(-6).toUpperCase()} • ₹{s.order.totalPrice}</p>
                        <div className="text-sm text-gray-600 mt-2 space-y-1">
                          <p className="flex items-center gap-1"><MapPin className="h-3 w-3" /> <span className="font-medium text-gray-800">From:</span> {s.pickupLocation}</p>
                          <p className="flex items-center gap-1"><Truck className="h-3 w-3" /> <span className="font-medium text-gray-800">To:</span> {s.deliveryLocation}</p>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {s.order.items.map((item: any, i: number) => (
                            <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                              {item.quantity}x {item.name}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button 
                        onClick={() => handleClaimShipment(s.id)}
                        disabled={claiming}
                        className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium whitespace-nowrap transition-colors"
                      >
                        {claiming ? 'Claiming...' : 'Claim Shipment'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* macOS-style magnification dock */}
      <MacDock items={dockItems} />
    </div>
  );
}
