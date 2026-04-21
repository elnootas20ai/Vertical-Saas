import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Loader2, ShoppingCart, Plus, Minus, X, MapPin, Phone, Clock,
  Truck, Store, ChevronRight, CheckCircle, AlertCircle, Search,
  Tag, ShoppingBag, Layers, Package,
} from 'lucide-react';
import {
  getPublicStorefront,
  getPublicShippingRates,
  createPublicWebOrder,
  type WebConfig,
  type PublicCatalogItem,
  type WebOrderItem,
  type VolumeDiscountRule,
  type ShippingOption,
} from '../../lib/webApi';

interface CartItem extends WebOrderItem {}

type OrderType = 'delivery' | 'pickup';
type Step = 'menu' | 'cart' | 'checkout' | 'success' | 'error';

function computeVolumeDiscount(
  rules: VolumeDiscountRule[],
  items: CartItem[],
): { rule: VolumeDiscountRule | null; discountAmount: number } {
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  if (!rules?.length || totalQty <= 0) return { rule: null, discountAmount: 0 };

  const active = [...rules].filter((r) => r.active).sort((a, b) => b.minQuantity - a.minQuantity);
  let matched: VolumeDiscountRule | null = null;
  for (const r of active) {
    const max = r.maxQuantity != null ? r.maxQuantity : Infinity;
    if (totalQty >= r.minQuantity && totalQty <= max) { matched = r; break; }
  }
  if (!matched) return { rule: null, discountAmount: 0 };

  let amount = 0;
  if (matched.discountType === 'percentage') {
    amount = Math.round(subtotal * (Math.min(matched.discountValue, 100) / 100) * 100) / 100;
  } else {
    amount = Math.min(matched.discountValue, subtotal);
  }
  return { rule: matched, discountAmount: amount };
}

export function WebStorefront() {
  const { slug } = useParams<{ slug: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<WebConfig | null>(null);
  const [catalog, setCatalog] = useState<PublicCatalogItem[]>([]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [step, setStep] = useState<Step>('menu');
  const [orderType, setOrderType] = useState<OrderType>('delivery');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoError, setPromoError] = useState('');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerPostalCode, setCustomerPostalCode] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');

  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [selectedShippingId, setSelectedShippingId] = useState('');
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingError, setShippingError] = useState('');
  const [shippingZoneName, setShippingZoneName] = useState('');

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    getPublicStorefront(slug)
      .then((res) => {
        setConfig(res.config);
        setCatalog(res.catalog);
        if (res.config.deliveryEnabled) setOrderType('delivery');
        else if (res.config.pickupEnabled) setOrderType('pickup');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  const categories = useMemo(() => {
    const cats = new Set(catalog.map((i) => i.category));
    return ['all', ...Array.from(cats)];
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    return catalog.filter((item) => {
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const matchesSearch = !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [catalog, selectedCategory, searchQuery]);

  const cartTotal = useMemo(() => cart.reduce((s, i) => s + i.total, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);

  const selectedShipping = shippingOptions.find((o) => o.id === selectedShippingId);
  const isZoneMode = config?.shippingMode === 'zones';
  const deliveryFee = orderType === 'delivery'
    ? (isZoneMode && selectedShipping ? selectedShipping.rate : (config?.deliveryFee || 0))
    : 0;

  const { rule: volumeRule, discountAmount: volumeDiscountAmount } = useMemo(
    () => computeVolumeDiscount(config?.volumeDiscounts || [], cart),
    [config?.volumeDiscounts, cart],
  );

  const finalTotal = cartTotal - promoDiscount - volumeDiscountAmount + deliveryFee;

  const addToCart = (item: PublicCatalogItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item._id);
      if (existing) {
        return prev.map((c) =>
          c.id === item._id
            ? { ...c, quantity: c.quantity + 1, total: (c.quantity + 1) * c.unitPrice }
            : c,
        );
      }
      return [...prev, { id: item._id, name: item.name, quantity: 1, unitPrice: item.unitPrice, total: item.unitPrice }];
    });
  };

  const updateCartQuantity = (id: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((c) => {
          if (c.id !== id) return c;
          const qty = c.quantity + delta;
          return qty <= 0 ? null : { ...c, quantity: qty, total: qty * c.unitPrice };
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const removeFromCart = (id: string) => setCart((prev) => prev.filter((c) => c.id !== id));

  const applyPromo = () => {
    if (!promoCode || !config) return;
    const promo = config.promos.find(
      (p) => p.code.toLowerCase() === promoCode.toLowerCase() && p.active,
    );
    if (!promo) {
      setPromoError('Código no válido');
      setPromoDiscount(0);
      return;
    }
    setPromoError('');
    if (promo.discountType === 'percentage') {
      setPromoDiscount(cartTotal * (promo.discountValue / 100));
    } else {
      setPromoDiscount(promo.discountValue);
    }
  };

  const shippingDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchShippingRates = useCallback(async (postalCode: string) => {
    if (!slug || !config || config.shippingMode !== 'zones') return;
    const pc = postalCode.trim();
    if (pc.length < 3) {
      setShippingOptions([]);
      setSelectedShippingId('');
      setShippingError('');
      setShippingZoneName('');
      return;
    }
    setShippingLoading(true);
    setShippingError('');
    try {
      const res = await getPublicShippingRates(slug, pc);
      setShippingOptions(res.options || []);
      setShippingZoneName(res.zone?.name || '');
      if (res.options.length > 0) {
        setSelectedShippingId(res.options[0].id);
      } else {
        setSelectedShippingId('');
      }
      if (res.error) setShippingError(res.error);
    } catch {
      setShippingError('Error al consultar tarifas');
      setShippingOptions([]);
    } finally {
      setShippingLoading(false);
    }
  }, [slug, config]);

  const handlePostalCodeChange = (value: string) => {
    setCustomerPostalCode(value);
    clearTimeout(shippingDebounceRef.current);
    shippingDebounceRef.current = setTimeout(() => fetchShippingRates(value), 400);
  };

  const handleSubmit = async () => {
    if (!slug || !config) return;
    setSubmitting(true);
    try {
      const result = await createPublicWebOrder(slug, {
        customerName,
        customerPhone,
        customerEmail,
        customerAddress,
        customerPostalCode,
        orderType,
        items: cart,
        notes,
        promoCode: promoDiscount > 0 ? promoCode : '',
        promoDiscount,
        volumeDiscount: volumeDiscountAmount,
        volumeDiscountLabel: volumeRule?.label || '',
        selectedShippingOptionId: selectedShippingId,
      } as Record<string, unknown>);
      setConfirmMessage(result.message);
      setStep('success');
      setCart([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al enviar pedido');
      setStep('error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error && !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Tienda no disponible</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!config) return null;

  const primary = config.primaryColor || '#f59e0b';
  const secondary = config.secondaryColor || '#1f2937';

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: config.backgroundColor }}>
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: `${config.accentColor}20` }}>
            <CheckCircle className="w-10 h-10" style={{ color: config.accentColor }} />
          </div>
          <h1 className="text-2xl font-bold mb-3" style={{ color: secondary }}>¡Pedido enviado!</h1>
          <p className="text-gray-600 mb-6">{confirmMessage}</p>
          <button
            onClick={() => { setStep('menu'); setPromoCode(''); setPromoDiscount(0); }}
            className="px-6 py-3 rounded-xl text-white font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: primary }}
          >
            Volver al menú
          </button>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: config.backgroundColor }}>
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-3 text-gray-900">Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => setStep('cart')}
            className="px-6 py-3 rounded-xl text-white font-medium"
            style={{ backgroundColor: primary }}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: config.backgroundColor }}>
      {/* Header */}
      <header className="sticky top-0 z-30 shadow-sm" style={{ backgroundColor: secondary }}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {config.storeLogo ? (
              <img src={config.storeLogo} alt={config.storeName} className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: primary }}>
                {config.storeName.charAt(0)}
              </div>
            )}
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">{config.storeName}</h1>
              {config.isOpen ? (
                <span className="text-xs text-green-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full" /> Abierto
                </span>
              ) : (
                <span className="text-xs text-red-300">Cerrado</span>
              )}
            </div>
          </div>
          <button
            onClick={() => setStep(step === 'menu' ? 'cart' : 'menu')}
            className="relative p-2 rounded-xl text-white transition-colors hover:bg-white/10"
          >
            <ShoppingCart className="w-6 h-6" />
            {cartCount > 0 && (
              <span
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs text-white flex items-center justify-center font-bold"
                style={{ backgroundColor: primary }}
              >
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {!config.isOpen && (
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-red-700 font-medium">{config.closedMessage}</p>
          </div>
        </div>
      )}

      {config.isOpen && (
        <>
          {/* Info bar */}
          <div className="max-w-4xl mx-auto px-4 pt-4 pb-2">
            {config.welcomeMessage && (
              <p className="text-gray-600 text-sm mb-3">{config.welcomeMessage}</p>
            )}
            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              {config.address && (
                <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {config.address}</span>
              )}
              {config.phone && (
                <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {config.phone}</span>
              )}
              {config.estimatedDeliveryTime && (
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {config.estimatedDeliveryTime}</span>
              )}
            </div>
          </div>

          {/* Order type selector */}
          <div className="max-w-4xl mx-auto px-4 py-3">
            <div className="flex gap-2">
              {config.deliveryEnabled && (
                <button
                  onClick={() => setOrderType('delivery')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all border ${
                    orderType === 'delivery' ? 'border-transparent text-white shadow-sm' : 'border-gray-200 text-gray-600 bg-white'
                  }`}
                  style={orderType === 'delivery' ? { backgroundColor: primary } : {}}
                >
                  <Truck className="w-4 h-4" /> A domicilio
                </button>
              )}
              {config.pickupEnabled && (
                <button
                  onClick={() => setOrderType('pickup')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium transition-all border ${
                    orderType === 'pickup' ? 'border-transparent text-white shadow-sm' : 'border-gray-200 text-gray-600 bg-white'
                  }`}
                  style={orderType === 'pickup' ? { backgroundColor: primary } : {}}
                >
                  <Store className="w-4 h-4" /> Recoger
                </button>
              )}
            </div>
          </div>

          {step === 'menu' && (
            <div className="max-w-4xl mx-auto px-4 pb-32">
              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar productos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ '--tw-ring-color': `${primary}40` } as React.CSSProperties}
                />
              </div>

              {/* Categories */}
              {categories.length > 2 && (
                <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-none">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-all ${
                        selectedCategory === cat ? 'text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200'
                      }`}
                      style={selectedCategory === cat ? { backgroundColor: primary } : {}}
                    >
                      {cat === 'all' ? 'Todo' : cat}
                    </button>
                  ))}
                </div>
              )}

              {/* Promos banner */}
              {config.promos.filter((p) => p.active).length > 0 && (
                <div className="mb-4 p-3 rounded-xl border border-dashed" style={{ borderColor: primary, backgroundColor: `${primary}08` }}>
                  <div className="flex items-center gap-2 mb-1">
                    <Tag className="w-4 h-4" style={{ color: primary }} />
                    <span className="text-sm font-semibold" style={{ color: primary }}>Promociones</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {config.promos.filter((p) => p.active).map((p) => (
                      <span key={p.id} className="text-xs bg-white rounded-lg px-2 py-1 border border-gray-100">
                        <strong>{p.code}</strong>: {p.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Volume discounts banner */}
              {(config.volumeDiscounts || []).filter((r) => r.active).length > 0 && (
                <div className="mb-4 p-3 rounded-xl border border-dashed border-emerald-300" style={{ backgroundColor: '#10b98108' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <Layers className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-semibold text-emerald-600">Descuentos por volumen</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(config.volumeDiscounts || []).filter((r) => r.active).map((r) => (
                      <span key={r.id} className="text-xs bg-white rounded-lg px-2 py-1 border border-gray-100">
                        {r.label || `${r.minQuantity}+ uds: ${r.discountType === 'percentage' ? `${r.discountValue}%` : `${r.discountValue}€`}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Product grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredCatalog.map((item) => {
                  const inCart = cart.find((c) => c.id === item._id);
                  const isAvailable = item.available !== false;
                  return (
                    <div key={item._id} className={`bg-white rounded-xl border border-gray-100 p-4 flex gap-3 shadow-sm transition-shadow ${isAvailable ? 'hover:shadow-md' : 'opacity-60'}`}>
                      <div className="relative flex-shrink-0">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className={`w-20 h-20 rounded-lg object-cover ${!isAvailable ? 'grayscale' : ''}`} />
                        ) : (
                          <div className="w-20 h-20 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${primary}10` }}>
                            <ShoppingBag className="w-8 h-8" style={{ color: `${primary}60` }} />
                          </div>
                        )}
                        {!isAvailable && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                            <span className="text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded">AGOTADO</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 text-sm truncate">{item.name}</h3>
                        {item.description && (
                          <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{item.description}</p>
                        )}
                        {item.allergens.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {item.allergens.map((a) => (
                              <span key={a} className="text-[10px] px-1.5 py-0.5 bg-orange-50 text-orange-600 rounded">
                                {a}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <span className="font-bold text-sm" style={{ color: isAvailable ? primary : '#9ca3af' }}>
                            {item.unitPrice.toFixed(2)} {config.currency === 'EUR' ? '€' : config.currency}
                          </span>
                          {!isAvailable ? (
                            <span className="text-xs text-red-500 font-semibold">No disponible</span>
                          ) : inCart ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => updateCartQuantity(item._id, -1)}
                                className="w-7 h-7 rounded-full flex items-center justify-center border border-gray-200 text-gray-500 hover:bg-gray-50"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="text-sm font-semibold w-5 text-center">{inCart.quantity}</span>
                              <button
                                onClick={() => updateCartQuantity(item._id, 1)}
                                className="w-7 h-7 rounded-full flex items-center justify-center text-white"
                                style={{ backgroundColor: primary }}
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => addToCart(item)}
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white shadow-sm hover:opacity-90 transition-opacity"
                              style={{ backgroundColor: primary }}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredCatalog.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No hay productos disponibles</p>
                </div>
              )}
            </div>
          )}

          {step === 'cart' && (
            <div className="max-w-4xl mx-auto px-4 pb-32">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" /> Tu pedido
              </h2>

              {cart.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Tu carrito está vacío</p>
                  <button onClick={() => setStep('menu')} className="mt-4 text-sm font-medium" style={{ color: primary }}>
                    Ver menú
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-2 mb-4">
                    {cart.map((item) => (
                      <div key={item.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-gray-900 truncate">{item.name}</p>
                          <p className="text-xs text-gray-500">{item.unitPrice.toFixed(2)} € x {item.quantity}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateCartQuantity(item.id, -1)} className="w-7 h-7 rounded-full flex items-center justify-center border border-gray-200 text-gray-500 hover:bg-gray-50">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-sm font-semibold w-5 text-center">{item.quantity}</span>
                          <button onClick={() => updateCartQuantity(item.id, 1)} className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: primary }}>
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => removeFromCart(item.id)} className="ml-1 text-gray-400 hover:text-red-500">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <span className="font-bold text-sm w-16 text-right" style={{ color: primary }}>
                          {item.total.toFixed(2)} €
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Promo */}
                  <div className="bg-white rounded-xl border border-gray-100 p-3 mb-4">
                    <label className="text-xs text-gray-500 font-medium mb-1 block">Código promocional</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value)}
                        placeholder="Ej: DESCUENTO10"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': `${primary}40` } as React.CSSProperties}
                      />
                      <button onClick={applyPromo} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: primary }}>
                        Aplicar
                      </button>
                    </div>
                    {promoError && <p className="text-xs text-red-500 mt-1">{promoError}</p>}
                    {promoDiscount > 0 && <p className="text-xs text-green-600 mt-1">Descuento de {promoDiscount.toFixed(2)} € aplicado</p>}
                  </div>

                  {/* Totals */}
                  <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Subtotal</span>
                      <span>{cartTotal.toFixed(2)} €</span>
                    </div>
                    {promoDiscount > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Dto. promo</span>
                        <span>-{promoDiscount.toFixed(2)} €</span>
                      </div>
                    )}
                    {volumeDiscountAmount > 0 && (
                      <div className="flex justify-between text-sm text-emerald-600">
                        <span className="flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5" />
                          Dto. volumen {volumeRule?.label ? `(${volumeRule.label})` : ''}
                        </span>
                        <span>-{volumeDiscountAmount.toFixed(2)} €</span>
                      </div>
                    )}
                    {orderType === 'delivery' && (
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>Envío</span>
                        <span>{deliveryFee > 0 ? `${deliveryFee.toFixed(2)} €` : 'Gratis'}</span>
                      </div>
                    )}
                    <div className="border-t border-gray-100 pt-2 flex justify-between font-bold">
                      <span>Total</span>
                      <span style={{ color: primary }}>{finalTotal.toFixed(2)} €</span>
                    </div>
                    {config.minimumOrder > 0 && cartTotal < config.minimumOrder && (
                      <p className="text-xs text-orange-600 mt-1">
                        Pedido mínimo: {config.minimumOrder.toFixed(2)} €
                      </p>
                    )}
                    {(() => {
                      const activeRules = (config.volumeDiscounts || []).filter((r) => r.active).sort((a, b) => a.minQuantity - b.minQuantity);
                      const nextTier = activeRules.find((r) => r.minQuantity > cartCount);
                      if (!nextTier) return null;
                      const remaining = nextTier.minQuantity - cartCount;
                      return (
                        <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          Añade {remaining} {remaining === 1 ? 'artículo' : 'artículos'} más para obtener {nextTier.discountType === 'percentage' ? `${nextTier.discountValue}%` : `${nextTier.discountValue}€`} de descuento
                        </p>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
          )}

          {step === 'checkout' && (
            <div className="max-w-4xl mx-auto px-4 pb-32">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Completa tu pedido</h2>
              <div className="space-y-3">
                <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">Nombre *</label>
                    <input
                      type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': `${primary}40` } as React.CSSProperties}
                      placeholder="Tu nombre"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">Teléfono *</label>
                    <input
                      type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': `${primary}40` } as React.CSSProperties}
                      placeholder="Ej: 612 345 678"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">Email</label>
                    <input
                      type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': `${primary}40` } as React.CSSProperties}
                      placeholder="tu@email.com"
                    />
                  </div>
                  {orderType === 'delivery' && (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="text-xs text-gray-500 font-medium mb-1 block">Dirección de entrega *</label>
                          <input
                            type="text" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)}
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2"
                            style={{ '--tw-ring-color': `${primary}40` } as React.CSSProperties}
                            placeholder="Calle, número, piso..."
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 font-medium mb-1 block">C.P. {isZoneMode ? '*' : ''}</label>
                          <input
                            type="text" value={customerPostalCode}
                            onChange={(e) => handlePostalCodeChange(e.target.value)}
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2"
                            style={{ '--tw-ring-color': `${primary}40` } as React.CSSProperties}
                            placeholder="28001"
                            maxLength={10}
                          />
                        </div>
                      </div>

                      {isZoneMode && orderType === 'delivery' && customerPostalCode.trim().length >= 3 && (
                        <div className="bg-gray-50 rounded-xl border border-gray-100 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Package className="w-4 h-4 text-gray-500" />
                            <span className="text-xs font-semibold text-gray-700">Opciones de envío</span>
                            {shippingLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                            {shippingZoneName && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">{shippingZoneName}</span>
                            )}
                          </div>
                          {shippingError && (
                            <p className="text-xs text-red-500 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> {shippingError}
                            </p>
                          )}
                          {!shippingLoading && shippingOptions.length > 0 && (
                            <div className="space-y-1.5">
                              {shippingOptions.map((opt) => (
                                <label
                                  key={opt.id}
                                  className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                                    selectedShippingId === opt.id
                                      ? 'border-transparent ring-2 bg-white shadow-sm'
                                      : 'border-gray-200 bg-white hover:border-gray-300'
                                  }`}
                                  style={selectedShippingId === opt.id ? { '--tw-ring-color': `${primary}60` } as React.CSSProperties : {}}
                                >
                                  <input
                                    type="radio"
                                    name="shipping-option"
                                    checked={selectedShippingId === opt.id}
                                    onChange={() => setSelectedShippingId(opt.id)}
                                    className="sr-only"
                                  />
                                  <div
                                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                      selectedShippingId === opt.id ? 'border-transparent' : 'border-gray-300'
                                    }`}
                                    style={selectedShippingId === opt.id ? { backgroundColor: primary } : {}}
                                  >
                                    {selectedShippingId === opt.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900">{opt.carrier}</p>
                                    {opt.estimatedTime && <p className="text-xs text-gray-500">{opt.estimatedTime}</p>}
                                  </div>
                                  <span className="font-bold text-sm" style={{ color: primary }}>
                                    {opt.rate > 0 ? `${opt.rate.toFixed(2)} €` : 'Gratis'}
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                          {!shippingLoading && shippingOptions.length === 0 && !shippingError && (
                            <p className="text-xs text-gray-400">Introduce tu código postal para ver opciones de envío</p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  <div>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">Notas</label>
                    <textarea
                      value={notes} onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 resize-none"
                      style={{ '--tw-ring-color': `${primary}40` } as React.CSSProperties}
                      rows={2}
                      placeholder="Instrucciones especiales..."
                    />
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-1.5">
                  <h3 className="font-semibold text-sm text-gray-900 mb-2">Resumen</h3>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Subtotal ({cartCount} {cartCount === 1 ? 'artículo' : 'artículos'})</span>
                    <span>{cartTotal.toFixed(2)} €</span>
                  </div>
                  {promoDiscount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Dto. promo</span>
                      <span>-{promoDiscount.toFixed(2)} €</span>
                    </div>
                  )}
                  {volumeDiscountAmount > 0 && (
                    <div className="flex justify-between text-sm text-emerald-600">
                      <span>Dto. volumen</span>
                      <span>-{volumeDiscountAmount.toFixed(2)} €</span>
                    </div>
                  )}
                  {orderType === 'delivery' && (
                    <div className="flex justify-between text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5" />
                        Envío {selectedShipping ? `(${selectedShipping.carrier})` : ''}
                      </span>
                      <span>{deliveryFee > 0 ? `${deliveryFee.toFixed(2)} €` : 'Gratis'}</span>
                    </div>
                  )}
                  <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-base">
                    <span>Total</span>
                    <span style={{ color: primary }}>{finalTotal.toFixed(2)} €</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bottom bar */}
          {cart.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 p-4">
              <div className="max-w-4xl mx-auto">
                {step === 'menu' && (
                  <button
                    onClick={() => setStep('cart')}
                    className="w-full py-3.5 rounded-xl text-white font-medium flex items-center justify-between px-5 hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: primary }}
                  >
                    <span className="flex items-center gap-2">
                      <ShoppingCart className="w-5 h-5" />
                      Ver pedido ({cartCount})
                    </span>
                    <span>{finalTotal.toFixed(2)} €</span>
                  </button>
                )}
                {step === 'cart' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStep('menu')}
                      className="py-3.5 px-5 rounded-xl border border-gray-200 font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Añadir más
                    </button>
                    <button
                      onClick={() => setStep('checkout')}
                      disabled={config.minimumOrder > 0 && cartTotal < config.minimumOrder}
                      className="flex-1 py-3.5 rounded-xl text-white font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                      style={{ backgroundColor: primary }}
                    >
                      Continuar <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {step === 'checkout' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStep('cart')}
                      className="py-3.5 px-5 rounded-xl border border-gray-200 font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Atrás
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting || !customerName || !customerPhone || (orderType === 'delivery' && !customerAddress) || (orderType === 'delivery' && isZoneMode && (!selectedShippingId || shippingOptions.length === 0))}
                      className="flex-1 py-3.5 rounded-xl text-white font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                      style={{ backgroundColor: config.accentColor }}
                    >
                      {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar pedido'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
