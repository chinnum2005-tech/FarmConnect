import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Leaf, Star, Truck, CheckCircle, Search, Filter, IndianRupee, Eye, X, Store, MessageCircle, Shield, Camera, LogOut, Package } from 'lucide-react';
import MacDock, { DockItem } from '../components/ui/MacDock';
import Card from '../components/Card';
import { productService, orderService } from '../services';

interface Product {
  id: string;
  name: string;
  farmName: string;
  price: number;
  unit: string;
  rating: number;
  image: string;
  certified: boolean;
  location: string;
  cropType?: string;
  batchNumber?: string;
  availableQuantity?: number;
}

export function getProductCategory(product: { cropType?: string; name?: string }): string {
  const type = (product.cropType || '').toUpperCase().trim();
  const name = (product.name || '').toLowerCase().trim();

  // 1. Grains & Cereals
  if (
    ['WHEAT', 'RICE', 'BARLEY', 'OATS', 'CORN', 'SORGHUM'].includes(type) ||
    name.includes('wheat') || name.includes('rice') || name.includes('paddy') ||
    name.includes('corn') || name.includes('maize') || name.includes('barley') ||
    name.includes('oat') || name.includes('sorghum') || name.includes('millet')
  ) {
    return 'GRAINS';
  }

  // 2. Vegetables
  if (
    name.includes('tomato') || name.includes('potato') || name.includes('onion') ||
    name.includes('spinach') || name.includes('cabbage') || name.includes('carrot') ||
    name.includes('vegetable') || name.includes('cucumber') || name.includes('lettuce')
  ) {
    return 'VEGETABLES';
  }

  // 3. Fruits
  if (
    name.includes('apple') || name.includes('mango') || name.includes('banana') ||
    name.includes('orange') || name.includes('grape') || name.includes('fruit') ||
    name.includes('papaya') || name.includes('guava') || name.includes('lemon')
  ) {
    return 'FRUITS';
  }

  // 4. Spices & Oilseeds
  if (
    type === 'CANOLA' || type === 'SOYBEANS' ||
    name.includes('canola') || name.includes('mustard') || name.includes('soy') ||
    name.includes('chili') || name.includes('pepper') || name.includes('turmeric') ||
    name.includes('cumin') || name.includes('coriander') || name.includes('cardamom') ||
    name.includes('spice')
  ) {
    return 'SPICES';
  }

  // 5. Dairy & Honey
  if (
    name.includes('milk') || name.includes('honey') || name.includes('ghee') ||
    name.includes('butter') || name.includes('paneer') || name.includes('cheese') ||
    name.includes('dairy')
  ) {
    return 'DAIRY';
  }

  if (type === 'OTHER') return 'VEGETABLES';
  return 'GRAINS';
}

export default function Marketplace() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [cart, setCart] = useState<any[]>([]);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [orderQuantity, setOrderQuantity] = useState(1);
  const [showCart, setShowCart] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutProcessing, setCheckoutProcessing] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({
    cardName: '',
    cardNumber: '',
    expiry: '',
    cvc: '',
    address: ''
  });
  const [showMyOrdersModal, setShowMyOrdersModal] = useState(false);
  const [myOrders, setMyOrders] = useState<any[]>([]);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const response = await productService.getAllProducts();
      if (response.success && response.data) {
        setProducts(response.data);
      } else {
        showToast('Failed to load products. Please try again.', 'error');
        setProducts([]);
      }
    } catch (error) {
      console.error('Failed to load products:', error);
      showToast('Error connecting to server. Products unavailable.', 'error');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };



  const categories = [
    { id: 'ALL', name: 'All Products', icon: '🛒' },
    { id: 'GRAINS', name: 'Grains & Cereals', icon: '🌾' },
    { id: 'VEGETABLES', name: 'Vegetables', icon: '🥬' },
    { id: 'FRUITS', name: 'Fruits', icon: '🍎' },
    { id: 'SPICES', name: 'Spices', icon: '🌶️' },
    { id: 'DAIRY', name: 'Dairy & Honey', icon: '🍯' },
  ];

  const [toast, setToast] = useState<{msg: string; type: 'success'|'error'} | null>(null);

  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const addToCart = (product: Product) => {
    // Check if already in cart
    if (cart.find(item => item.id === product.id)) {
      showToast(`${product.name} is already in cart`, 'error');
      return;
    }
    setCart([...cart, { ...product, cartQuantity: 1 }]);
    showToast(`${product.name} added to cart!`);
  };

  const updateCartQuantity = (productId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.id === productId) {
        const newQ = (item.cartQuantity || 1) + delta;
        if (newQ < 1) return item;
        if (item.availableQuantity !== undefined && newQ > item.availableQuantity) {
          showToast('Demand exceeds available stock!', 'error');
          return item;
        }
        return { ...item, cartQuantity: newQ };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.id !== productId));
  };

  const handleBuyNow = async (product: Product) => {
    setSelectedProduct(product);
    setShowOrderModal(true);
  };

  const proceedToCheckoutFromBuyNow = () => {
    console.log('Proceeding to checkout. Current state:', { showOrderModal, showCheckoutModal });
    setShowOrderModal(false);
    setShowCheckoutModal(true);
  };

  const processCheckout = async () => {
    if (!checkoutForm.address.trim()) {
      showToast('Please enter a shipping address', 'error');
      return;
    }
    
    setCheckoutProcessing(true);
    
    try {
      if (selectedProduct) {
        // Single Product Checkout
        const response = await orderService.createOrder({
          productId: selectedProduct.id,
          quantity: orderQuantity,
          shippingAddress: checkoutForm.address,
        });
        if (!response.success) throw new Error('Order creation failed');
        
        // Redirect to Stripe Checkout
        if (response.data?.checkoutUrl) {
          window.location.href = response.data.checkoutUrl;
          return;
        }
        
        showToast('Payment intent created! Order confirmed.', 'success');
        setSelectedProduct(null);
      } else if (cart.length > 0) {
        // Cart Checkout
        const response = await orderService.createOrder({
          items: cart.map(item => ({ productId: item.id, quantity: item.cartQuantity || 1 })),
          shippingAddress: checkoutForm.address,
        });
        if (!response.success) throw new Error('Order creation failed');
        
        // Redirect to Stripe Checkout
        if (response.data?.checkoutUrl) {
          window.location.href = response.data.checkoutUrl;
          return;
        }

        setCart([]);
        showToast('Payment intent created! Cart orders confirmed.', 'success');
      } else {
        throw new Error('Nothing to checkout');
      }
      
      setShowCheckoutModal(false);
      setShowCart(false);
    } catch (error: any) {
      console.error('Checkout error:', error);
      showToast(error.response?.data?.message || error.message || 'Payment failed. Please try again.', 'error');
    } finally {
      setCheckoutProcessing(false);
    }
  };

  const handleViewTraceability = (productId: string) => {
    navigate(`/trace/${productId}`);
  };

  const handleTrackOrder = async () => {
    try {
      const response = await orderService.getMyOrders();
      if (response.success && response.data) {
        setMyOrders(response.data);
        setShowMyOrdersModal(true);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      showToast('Failed to load orders', 'error');
    }
  };

  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  })();
  const isAuthenticated = !!localStorage.getItem('user');

  const dockItems: DockItem[] = [
    { id: 'market',    icon: Store,         label: 'Marketplace',  active: true, gradient: 'linear-gradient(135deg,#06b6d4,#0e7490)',  onClick: () => window.location.href='/marketplace' },
    { id: 'orders',    icon: ShoppingCart,  label: 'My Orders',                  gradient: 'linear-gradient(135deg,#f59e0b,#d97706)',  onClick: handleTrackOrder },
    { id: 'blockchain',icon: Shield,        label: 'Blockchain',                gradient: 'linear-gradient(135deg,#8b5cf6,#6d28d9)',  onClick: () => window.location.href='/blockchain' },
    { id: 'chatbot',   icon: MessageCircle, label: 'AgroBot AI',                gradient: 'linear-gradient(135deg,#3b82f6,#1d4ed8)',  onClick: () => window.location.href='/chatbot' },
    { id: 'gallery',   icon: Camera,        label: 'Farm Gallery',              gradient: 'linear-gradient(135deg,#0ea5e9,#0369a1)',  onClick: () => window.location.href='/gallery' },
    { id: 'logout',    icon: LogOut,        label: 'Logout',                    gradient: 'linear-gradient(135deg,#ef4444,#b91c1c)',  onClick: () => { localStorage.removeItem('token'); localStorage.removeItem('user'); sessionStorage.clear(); window.location.href='/login'; } },
  ];

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.farmName.toLowerCase().includes(searchTerm.toLowerCase());
    const productCategory = getProductCategory(product);
    const matchesCategory = selectedCategory === 'ALL' || productCategory === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Skeleton loader component
  const SkeletonCard = () => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 animate-pulse">
      <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl mb-4" />
      <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded-full mb-2" />
      <div className="h-4 bg-gray-100 dark:bg-gray-600 rounded-full w-2/3 mb-4" />
      <div className="flex gap-2">
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg flex-1" />
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg flex-1" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pt-16 font-sans">
      {/* Global Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 z-[99999] p-4 rounded-xl flex items-center space-x-3 shadow-2xl ${
              toast.type === 'success' 
                ? 'bg-green-100 text-green-800 border border-green-200' 
                : 'bg-red-100 text-red-800 border border-red-200'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center font-bold text-xs">!</div>
            )}
            <span className="font-medium">{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className={`min-h-screen bg-background ${isAuthenticated ? 'pb-32' : ''}`}>
      
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-primary to-primary-light text-white py-16 relative">
        <div className="absolute top-4 right-4 sm:top-8 sm:right-8 z-10">
          <button 
            onClick={() => setShowCart(true)} 
            className="relative p-3 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full transition-colors"
          >
            <ShoppingCart className="h-6 w-6" />
            {cart.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {cart.length}
              </span>
            )}
          </button>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <h1 className="text-5xl font-bold mb-4">
              🌾 Direct from Farmers to You
            </h1>
            <p className="text-xl mb-8">
              Fresh, organic, and blockchain-verified agricultural products
            </p>
            
            {/* Search Bar */}
            <div className="max-w-2xl mx-auto relative">
              <input
                type="text"
                placeholder="Search for products, farms, or categories..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-6 py-4 rounded-full text-gray-900 shadow-lg focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <Search className="absolute right-4 top-4 h-6 w-6 text-gray-400" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-8 bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-4 overflow-x-auto pb-4">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`flex items-center space-x-2 px-6 py-3 rounded-full whitespace-nowrap transition-all ${
                  selectedCategory === category.id
                    ? 'bg-primary text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span className="text-xl">{category.icon}</span>
                <span className="font-medium">{category.name}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Products Grid */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold text-accent">
              Featured Products ({filteredProducts.length})
            </h2>
            <div className="flex gap-2">
              <button 
                onClick={handleTrackOrder}
                className="flex items-center space-x-2 bg-green-100 text-green-700 px-4 py-2 rounded-lg hover:bg-green-200"
              >
                <Truck className="h-5 w-5" />
                <span>Track Orders</span>
              </button>
              <button className="flex items-center space-x-2 bg-gray-100 px-4 py-2 rounded-lg hover:bg-gray-200">
                <Filter className="h-5 w-5" />
                <span>Filter</span>
              </button>
            </div>
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Loading skeletons */}
            {loading && [...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
            {/* Actual products */}
            {!loading && filteredProducts.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card gradient className="hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
                  <div className="p-6">
                    {/* Product Image & Badge */}
                    <div className="relative mb-4">
                      <div className="text-8xl text-center">{product.image}</div>
                      {product.certified && (
                        <div className="absolute top-2 right-2 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-semibold flex items-center space-x-1">
                          <CheckCircle className="h-3 w-3" />
                          <span>Organic Certified</span>
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                      {product.name}
                    </h3>
                    
                    <div className="flex items-center space-x-2 mb-3">
                      <Leaf className="h-4 w-4 text-primary" />
                      <span className="text-sm text-gray-600">{product.farmName}</span>
                    </div>

                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="font-semibold">{product.rating}</span>
                      </div>
                      <span className="text-sm text-gray-500 flex items-center space-x-1">
                        <Truck className="h-3 w-3" />
                        <span>{product.location}</span>
                      </span>
                    </div>

                    {/* Price & Action Buttons */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-2xl font-bold text-primary">₹{(product.price * 1.05).toFixed(2)}</span>
                          <span className="text-sm text-gray-500 ml-1">/ {product.unit}</span>
                          <div className="text-[10px] text-gray-400 italic leading-tight">
                            Includes 5% distributor fee
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => addToCart(product)}
                            className="flex-1 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center space-x-2"
                          >
                            <ShoppingCart className="h-4 w-4" />
                            <span>Add to Cart</span>
                          </button>
                          <button
                            onClick={() => handleBuyNow(product)}
                            className="flex-1 bg-accent hover:bg-accent-dark text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center space-x-2"
                          >
                            <IndianRupee className="h-4 w-4" />
                            <span>Buy Now</span>
                          </button>
                        </div>
                        <button
                          onClick={() => handleViewTraceability(product.id)}
                          className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-lg transition-colors flex items-center justify-center space-x-2 border border-blue-200"
                        >
                          <Eye className="h-4 w-4" />
                          <span>View Traceability</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
        </div>

          {!loading && filteredProducts.length === 0 && (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">🔍</div>
              <p className="text-2xl text-gray-500 dark:text-gray-400 font-semibold">
                {selectedCategory !== 'ALL'
                  ? `No products currently listed in "${categories.find(c => c.id === selectedCategory)?.name || selectedCategory}"`
                  : 'No products found'}
              </p>
              <p className="text-gray-400 mt-2 max-w-md mx-auto">
                {selectedCategory !== 'ALL'
                  ? 'There are currently no active harvest batches under this category. Clear the filter to browse all available harvests.'
                  : 'Try adjusting your search query or clear all filters.'}
              </p>
              <button
                onClick={() => { setSearchTerm(''); setSelectedCategory('ALL'); }}
                className="mt-6 px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors shadow-md"
              >
                View All Products
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Order Modal */}
      {showOrderModal && selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-accent">Place Order</h3>
              <button
                onClick={() => setShowOrderModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-4xl text-center mb-2">{selectedProduct.image}</div>
                <h4 className="font-bold text-lg text-gray-900 text-center">{selectedProduct.name}</h4>
                <p className="text-sm text-gray-600 text-center">{selectedProduct.farmName}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quantity (kg) 
                  {selectedProduct.availableQuantity !== undefined && (
                    <span className="text-gray-500 ml-2">
                      (Max: {selectedProduct.availableQuantity}kg)
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  min="1"
                  max={selectedProduct.availableQuantity}
                  value={orderQuantity}
                  onChange={(e) => setOrderQuantity(parseFloat(e.target.value) || 1)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-700">Price per kg:</span>
                  <span className="font-semibold">₹{selectedProduct.price}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-700">Total Quantity:</span>
                  <span className="font-semibold">{orderQuantity} kg</span>
                </div>
                <div className="border-t border-gray-300 my-2"></div>
                <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <span className="text-gray-600">Total (incl. 5% distributor fee):</span>
                  <span className="text-2xl font-bold text-primary">₹{(selectedProduct.price * 1.05 * orderQuantity).toFixed(2)}</span>
                </div>
              </div>

              <div className="text-sm text-gray-600">
                <p>📦 Delivery in 3-5 business days</p>
                <p>✓ Blockchain verified product</p>
                <p>✓ Direct from farmer</p>
              </div>
              
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setShowOrderModal(false);
                  setShowCheckoutModal(true);
                }}
                disabled={selectedProduct.availableQuantity != null && orderQuantity > Number(selectedProduct.availableQuantity)}
                className={`w-full py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 ${
                  selectedProduct.availableQuantity != null && orderQuantity > Number(selectedProduct.availableQuantity)
                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                    : 'bg-accent hover:bg-accent-dark text-white'
                } relative z-[100]`}
              >
                {selectedProduct.availableQuantity != null && orderQuantity > Number(selectedProduct.availableQuantity) ? (
                  <span>Demand Exceeds Available Stock</span>
                ) : (
                  <>
                    <ShoppingCart className="h-5 w-5" />
                    <span>Proceed to Payment</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* My Orders Modal */}
      {showMyOrdersModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-6 md:p-8 max-w-4xl w-full shadow-2xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-accent flex items-center gap-2">
                <Package className="h-6 w-6" /> My Orders
              </h3>
              <button
                onClick={() => setShowMyOrdersModal(false)}
                className="text-gray-400 hover:text-gray-600 font-bold text-xl"
              >
                ✕
              </button>
            </div>

            {myOrders.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-5xl mb-4">📦</div>
                <p className="text-xl font-semibold">No orders yet</p>
                <p>Start shopping to see your orders here!</p>
              </div>
            ) : (
              <div className="space-y-6">
                {myOrders.map((order) => (
                  <div key={order.id} className="border border-gray-200 rounded-xl p-4 md:p-6 hover:border-primary/30 transition-colors bg-gray-50/50">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 pb-4 border-b border-gray-100">
                      <div>
                        <p className="font-bold text-gray-900 text-lg">Order #{order.id.slice(-6).toUpperCase()}</p>
                        <p className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleDateString()} • ₹{order.totalPrice}</p>
                      </div>
                      <div className="mt-2 md:mt-0">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          order.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {order.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      {order.items.map((item: any, i: number) => (
                        <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white rounded-lg border border-gray-100">
                          <div className="flex items-center gap-4">
                            <div className="text-4xl bg-gray-50 p-2 rounded-lg">{item.image}</div>
                            <div>
                              <p className="font-bold text-gray-900">{item.name}</p>
                              <p className="text-sm text-gray-600">{item.farmName} • {item.quantity} kg</p>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setShowMyOrdersModal(false);
                              handleViewTraceability(item.productId);
                            }}
                            className="bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 text-sm whitespace-nowrap"
                          >
                            <Eye className="w-4 h-4" />
                            View Traceability & Crop Status
                          </button>
                        </div>
                      ))}
                    </div>
                    
                    {order.shipment && (
                      <div className="mt-4 pt-4 border-t border-gray-100 flex items-start gap-3 bg-white p-4 rounded-lg">
                        <Truck className="w-5 h-5 text-gray-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-gray-800">Shipment Status: <span className="text-primary">{order.shipment.status.replace('_', ' ')}</span></p>
                          {order.shipment.estimatedDelivery && (
                            <p className="text-xs text-gray-500 mt-1">ETA: {new Date(order.shipment.estimatedDelivery).toLocaleDateString()}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Cart Slide-over */}
      <AnimatePresence>
        {showCart && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50" 
              onClick={() => setShowCart(false)}
            />
            <motion.div 
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-md bg-white h-full shadow-2xl relative z-50 flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h2 className="text-2xl font-bold flex items-center"><ShoppingCart className="mr-2" /> Your Cart</h2>
                <button onClick={() => setShowCart(false)} className="text-gray-400 hover:text-gray-700">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6">
                {cart.length === 0 ? (
                  <div className="text-center text-gray-500 mt-20">
                    <ShoppingCart className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p>Your cart is empty.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {cart.map(item => (
                      <div key={item.id} className="flex items-center gap-4 border border-gray-100 p-4 rounded-xl shadow-sm">
                        <div className="text-4xl bg-gray-50 p-2 rounded-lg">{item.image}</div>
                        <div className="flex-1">
                          <h4 className="font-bold text-gray-900">{item.name}</h4>
                          <p className="text-sm text-gray-500">₹{item.price} / kg</p>
                          <div className="flex items-center gap-3 mt-2">
                            <button onClick={() => updateCartQuantity(item.id, -1)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold hover:bg-gray-200">-</button>
                            <span className="font-semibold">{item.cartQuantity} kg</span>
                            <button onClick={() => updateCartQuantity(item.id, 1)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold hover:bg-gray-200">+</button>
                          </div>
                        </div>
                        <div className="text-right flex flex-col justify-between h-full">
                          <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600 self-end mb-4"><X className="w-5 h-5"/></button>
                          <span className="font-bold text-primary">₹{(item.price * item.cartQuantity).toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {cart.length > 0 && (
                <div className="p-6 bg-gray-50 border-t border-gray-100">
                  <div className="flex justify-between mb-2 text-gray-600">
                    <span>Subtotal</span>
                    <span>₹{cart.reduce((sum, item) => sum + (item.price * item.cartQuantity), 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between mb-4 text-gray-600">
                    <span>Platform Fee (5%)</span>
                    <span>₹{cart.reduce((sum, item) => sum + (item.price * item.cartQuantity * 0.05), 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between mb-6 text-xl font-bold">
                    <span>Total</span>
                    <span className="text-primary">₹{cart.reduce((sum, item) => sum + (item.price * item.cartQuantity * 1.05), 0).toFixed(2)}</span>
                  </div>
                  <button 
                    onClick={() => {
                      setSelectedProduct(null); // Ensure we are doing a cart checkout
                      setShowCheckoutModal(true);
                    }} 
                    className="w-full py-4 bg-accent text-white font-bold rounded-xl hover:bg-accent-dark transition-colors shadow-lg"
                  >
                    Proceed to Checkout
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dummy Checkout Modal */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 backdrop-blur-sm" style={{ zIndex: 9999 }}>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden"
          >
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 p-6 text-white flex justify-between items-center">
              <h3 className="text-2xl font-bold flex items-center"><Shield className="mr-2" /> Secure Checkout</h3>
              <button onClick={() => setShowCheckoutModal(false)} className="text-gray-400 hover:text-white transition-colors"><X/></button>
            </div>
            
            <div className="p-8">
              <div className="space-y-4 mb-8">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Address</label>
                  <textarea rows={3} value={checkoutForm.address} onChange={e => setCheckoutForm({...checkoutForm, address: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="Enter your full shipping address..." required />
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-gray-600 font-medium">Total Amount to Pay:</span>
                  <span className="text-3xl font-black text-gray-900">
                    ₹{selectedProduct 
                      ? (selectedProduct.price * 1.05 * orderQuantity).toFixed(2)
                      : cart.reduce((sum, item) => sum + (item.price * item.cartQuantity * 1.05), 0).toFixed(2)}
                  </span>
                </div>
                
                <button
                  onClick={processCheckout}
                  disabled={checkoutProcessing}
                  className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex justify-center items-center gap-2 ${
                    checkoutProcessing 
                      ? 'bg-gray-400 text-white cursor-wait' 
                      : 'bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-1'
                  }`}
                >
                  {checkoutProcessing ? (
                    <>
                      <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Processing Payment...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-6 h-6" />
                      <span>Pay Securely</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Footer CTA */}
      <section className="bg-accent text-white py-12">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Want to sell your products directly?
          </h2>
          <p className="text-xl mb-6">
            Join our farmer community and reach customers nationwide
          </p>
          <button className="bg-white text-accent hover:bg-secondary-light px-8 py-4 rounded-xl font-bold text-lg transition-all transform hover:scale-105">
            Register as Farmer →
          </button>
        </div>
      </section>
      
      {/* macOS-style magnification dock */}
      {isAuthenticated && <MacDock items={dockItems} />}
      </div>
    </div>
  );
}
