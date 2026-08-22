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
  type PublicWebStore,
  type WebOrderItem,
  type VolumeDiscountRule,
  type ShippingOption,
} from '../../lib/webApi';
import { resolveWebBrandTheme } from '../../lib/webBrandThemes';
import { readMesaQrLock } from '../../lib/mesaQr';

interface CartItem extends WebOrderItem {}

type OrderType = 'delivery' | 'pickup';
type Step = 'pick_store' | 'where' | 'menu' | 'cart' | 'checkout' | 'success' | 'error';

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
  const mesaLock = useMemo(() => readMesaQrLock(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<WebConfig | null>(null);
  const [catalog, setCatalog] = useState<PublicCatalogItem[]>([]);
  const [stores, setStores] = useState<PublicWebStore[]>([]);
  const [selectedStore, setSelectedStore] = useState<PublicWebStore | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [step, setStep] = useState<Step>('menu');
  const [orderType, setOrderType] = useState<OrderType>(() => (mesaLock ? 'pickup' : 'delivery'));
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
        const list = Array.isArray(res.stores) ? res.stores : [];
        setStores(list);
        if (mesaLock) {
          // QR mesa: tienda fijada / sin elegir otra mesa. Carta directa.
          setOrderType('pickup');
          if (list.length === 1) {
            setSelectedStore(list[0]);
            setStep('menu');
          } else if (list.length > 1) {
            setSelectedStore(null);
            setStep('pick_store');
          } else {
            setSelectedStore(null);
            setStep('menu');
          }
          return;
        }
        // Siempre landing de marca primero (estilo grupo); luego menú
        if (list.length === 1) {
          setSelectedStore(list[0]);
          setStep('pick_store');
        } else if (list.length > 1) {
          setSelectedStore(null);
          setStep('pick_store');
        } else {
          setSelectedStore(null);
          setStep('menu');
        }
        if (res.config.deliveryEnabled) setOrderType('delivery');
        else if (res.config.pickupEnabled) setOrderType('pickup');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug, mesaLock]);

  useEffect(() => {
    const id = 'web-storefront-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Archivo+Black&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,400&display=swap';
    document.head.appendChild(link);
  }, []);

  const pickStore = (store: PublicWebStore) => {
    setSelectedStore(store);
    setCart([]);
    setStep('where');
  };

  const goToMenu = () => {
    if (stores.length === 1 && !selectedStore) {
      setSelectedStore(stores[0]);
    }
    if (stores.length > 1 && !selectedStore) return;
    setStep('where');
  };

  const canEnterMenu =
    orderType === 'pickup' ||
    (orderType === 'delivery' &&
      customerAddress.trim().length >= 4 &&
      (config?.shippingMode !== 'zones' || customerPostalCode.trim().length >= 3));

  const categories = useMemo(() => {
    const cats = new Set(
      catalog.map((i) => String(i.category || '').trim() || 'Carta'),
    );
    return ['all', ...Array.from(cats)];
  }, [catalog]);

  const menuSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const map = new Map<string, PublicCatalogItem[]>();
    for (const item of catalog) {
      if (selectedCategory !== 'all') {
        const cat = String(item.category || '').trim() || 'Carta';
        if (cat !== selectedCategory) continue;
      }
      if (q) {
        const hay = `${item.name} ${item.description || ''}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const cat = String(item.category || '').trim() || 'Carta';
      const list = map.get(cat) || [];
      list.push(item);
      map.set(cat, list);
    }
    return [...map.entries()].map(([category, items]) => ({
      category,
      items: [...items].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es')),
    }));
  }, [catalog, selectedCategory, searchQuery]);

  const filteredCatalog = useMemo(
    () => menuSections.flatMap((s) => s.items),
    [menuSections],
  );

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

  const confirmWhere = () => {
    if (!canEnterMenu) return;
    if (orderType === 'delivery' && customerPostalCode.trim().length >= 3) {
      void fetchShippingRates(customerPostalCode);
    }
    setStep('menu');
  };

  const handleSubmit = async () => {
    if (!slug || !config) return;
    setSubmitting(true);
    try {
      const mesaNote = mesaLock
        ? `Mesa ${mesaLock.tableName || mesaLock.tableNumber}`
        : '';
      const mergedNotes = [mesaNote, notes].map((s) => String(s || '').trim()).filter(Boolean).join(' · ');
      const result = await createPublicWebOrder(slug, {
        customerName,
        customerPhone,
        customerEmail,
        customerAddress,
        customerPostalCode,
        orderType: mesaLock ? 'pickup' : orderType,
        items: cart,
        notes: mergedNotes,
        promoCode: promoDiscount > 0 ? promoCode : '',
        promoDiscount,
        volumeDiscount: volumeDiscountAmount,
        volumeDiscountLabel: volumeRule?.label || '',
        selectedShippingOptionId: selectedShippingId,
        salesPointId: selectedStore?.id || '',
        salesPointName: selectedStore?.name || '',
        ...(mesaLock
          ? {
              tableId: mesaLock.tableId,
              tableNumber: mesaLock.tableNumber,
              tableName: mesaLock.tableName,
              mesaToken: mesaLock.token,
            }
          : {}),
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

  const brand = resolveWebBrandTheme(config, slug);
  const primary = brand.primaryColor;
  const ctaAccent = brand.accentColor;

  if (step === 'pick_store') {
    const brandName = brand.storeName;
    const headline = brand.welcomeMessage;
    const about =
      brand.storeDescription ||
      'Comida con actitud, hecha para disfrutar. Elige tu local y pide a domicilio o para recoger.';

    return (
      <div
        className="relative min-h-screen overflow-x-hidden"
        style={{
          backgroundColor: '#0A0A0A',
          color: '#F8F8F8',
          fontFamily: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 z-0"
          aria-hidden
          style={{
            background: `
              radial-gradient(ellipse 70% 45% at 50% 28%, ${ctaAccent}18 0%, transparent 65%),
              linear-gradient(180deg, #141414 0%, #0A0A0A 45%, #080808 100%)
            `,
          }}
        />

        <div className="relative z-10">
          <section className="mx-auto flex max-w-lg flex-col px-5 pb-6 pt-5 sm:px-6">
            <header className="flex shrink-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                {brand.wordmark ? (
                  <img
                    src={brand.wordmark}
                    alt={brandName}
                    className="h-7 w-auto max-w-[180px] object-contain object-left sm:h-8"
                  />
                ) : brand.storeLogo ? (
                  <img src={brand.storeLogo} alt="" className="h-9 w-9 object-contain" />
                ) : (
                  <span
                    className="text-sm font-bold tracking-[0.14em] uppercase"
                    style={{ fontFamily: '"Archivo Black", sans-serif', color: primary }}
                  >
                    {brandName}
                  </span>
                )}
              </div>
              {!config.isOpen ? (
                <span className="rounded-full bg-rose-500/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-300">
                  Cerrado
                </span>
              ) : (
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white/70">
                  Abierto
                </span>
              )}
            </header>

            <div className="mt-10 flex flex-col items-center text-center sm:mt-12">
              <p
                className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em]"
                style={{ color: primary }}
              >
                {brandName}
              </p>
              <h1
                className="max-w-md text-[clamp(1.55rem,4.8vw,2.15rem)] leading-[1.15] tracking-tight text-white"
                style={{ fontFamily: '"Archivo Black", sans-serif' }}
              >
                {headline}
              </h1>
              <p className="mt-2 max-w-xs text-sm text-white/45">
                Elige tu local
              </p>

              <div className="mt-6 flex w-full flex-col gap-3.5">
                {stores.length === 0 ? (
                  <button
                    type="button"
                    onClick={goToMenu}
                    className="min-h-[4.25rem] w-full rounded-2xl px-5 text-base font-bold text-white transition hover:brightness-110"
                    style={{
                      backgroundColor: ctaAccent,
                      boxShadow: `0 12px 32px ${ctaAccent}55`,
                    }}
                  >
                    Ver carta y pedir
                  </button>
                ) : (
                  stores.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => pickStore(s)}
                      className="group flex min-h-[4.5rem] w-full items-center justify-between gap-3 rounded-2xl px-5 py-3.5 text-left text-white transition hover:brightness-110 active:scale-[0.99]"
                      style={{
                        background: `linear-gradient(135deg, ${ctaAccent} 0%, ${primary} 100%)`,
                        boxShadow: `0 14px 36px ${primary}40`,
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-white/85">
                          Pedir en
                        </span>
                        <span
                          className="mt-0.5 block truncate text-xl font-bold sm:text-[1.35rem]"
                          style={{ fontFamily: '"Archivo Black", sans-serif' }}
                        >
                          {s.name}
                        </span>
                        {s.address ? (
                          <span className="mt-0.5 block truncate text-xs text-white/80">{s.address}</span>
                        ) : null}
                      </span>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/20">
                        <ChevronRight className="h-5 w-5 transition group-hover:translate-x-0.5" />
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="px-5 py-10 sm:px-8">
            <div className="mx-auto max-w-lg border-t border-white/10 pt-10 text-center">
              <p
                className="text-[11px] font-bold uppercase tracking-[0.2em]"
                style={{ color: primary }}
              >
                Quiénes somos
              </p>
              <h2
                className="mx-auto mt-3 max-w-lg text-2xl leading-tight text-white sm:text-3xl"
                style={{ fontFamily: '"Archivo Black", sans-serif' }}
              >
                ¿Qué hacemos en {brandName}?
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-white/55 sm:text-base">
                {about}
              </p>
            </div>
          </section>

          <footer className="px-5 py-10 sm:px-8">
            <div className="mx-auto flex max-w-lg flex-col items-center gap-3 border-t border-white/10 pt-8 text-center">
              {brand.wordmark ? (
                <img src={brand.wordmark} alt={brandName} className="h-6 w-auto object-contain opacity-90" />
              ) : (
                <p
                  className="text-xs tracking-[0.16em] uppercase"
                  style={{ fontFamily: '"Archivo Black", sans-serif', color: primary }}
                >
                  {brandName}
                </p>
              )}
              {config.address ? (
                <p className="flex items-center justify-center gap-2 text-sm text-white/45">
                  <MapPin className="h-4 w-4 shrink-0" />
                  {config.address}
                </p>
              ) : null}
              {config.phone ? (
                <a
                  href={`tel:${config.phone.replace(/\s/g, '')}`}
                  className="flex items-center justify-center gap-2 text-sm text-white/45 hover:text-white"
                >
                  <Phone className="h-4 w-4 shrink-0" />
                  {config.phone}
                </a>
              ) : null}
              <p className="text-[11px] text-white/30">Pedido online · Vertial</p>
            </div>
          </footer>
        </div>
      </div>
    );
  }

  if (step === 'where') {
    const storeLabel = selectedStore
      ? `${selectedStore.name}${selectedStore.code ? ` · ${selectedStore.code}` : ''}`
      : brand.storeName;

    return (
      <div
        className="relative min-h-screen overflow-x-hidden"
        style={{
          backgroundColor: '#0A0A0A',
          color: '#F8F8F8',
          fontFamily: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden
          style={{
            background: `
              radial-gradient(ellipse 70% 50% at 50% 30%, ${ctaAccent}1f 0%, transparent 62%),
              linear-gradient(180deg, #141414 0%, #0A0A0A 50%, #080808 100%)
            `,
          }}
        />

        <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-lg flex-col px-5 py-5 sm:px-6">
          <header className="flex shrink-0 items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStep(stores.length > 0 ? 'pick_store' : 'where')}
              className="text-sm font-semibold text-white/55 hover:text-white"
            >
              ← Atrás
            </button>
            {brand.wordmark ? (
              <img src={brand.wordmark} alt="" className="h-6 w-auto object-contain" />
            ) : brand.storeLogo ? (
              <img src={brand.storeLogo} alt="" className="h-7 w-7 object-contain" />
            ) : (
              <span className="w-12" />
            )}
            <span className="w-12" />
          </header>

          <div className="mt-10 flex flex-1 flex-col pb-8 pt-2 sm:mt-12">
            <div className="text-center">
              <p
                className="text-[11px] font-bold uppercase tracking-[0.2em]"
                style={{ color: primary }}
              >
                {storeLabel}
              </p>
              <h1
                className="mt-3 text-[clamp(1.7rem,5vw,2.35rem)] leading-tight text-white"
                style={{ fontFamily: '"Archivo Black", sans-serif' }}
              >
                ¿Cómo lo quieres?
              </h1>
              <p className="mt-2 text-sm text-white/50">
                Elige y te enseñamos la carta
              </p>
            </div>

            <div className="mt-6 grid gap-3">
              {config.deliveryEnabled ? (
                <button
                  type="button"
                  onClick={() => setOrderType('delivery')}
                  className={`flex min-h-[4.25rem] items-center gap-4 rounded-2xl px-4 text-left transition ${
                    orderType === 'delivery'
                      ? 'text-white shadow-lg'
                      : 'border border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
                  }`}
                  style={
                    orderType === 'delivery'
                      ? {
                          background: `linear-gradient(135deg, ${ctaAccent} 0%, ${primary} 100%)`,
                          boxShadow: `0 14px 36px ${primary}40`,
                        }
                      : undefined
                  }
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-black/20">
                    <Truck className="h-6 w-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block text-lg font-bold"
                      style={{ fontFamily: '"Archivo Black", sans-serif' }}
                    >
                      A domicilio
                    </span>
                    <span className="block text-xs opacity-80">
                      Te lo llevamos a tu calle
                    </span>
                  </span>
                  {orderType === 'delivery' ? (
                    <CheckCircle className="h-5 w-5 shrink-0" />
                  ) : null}
                </button>
              ) : null}

              {config.pickupEnabled ? (
                <button
                  type="button"
                  onClick={() => setOrderType('pickup')}
                  className={`flex min-h-[4.25rem] items-center gap-4 rounded-2xl px-4 text-left transition ${
                    orderType === 'pickup'
                      ? 'text-white shadow-lg'
                      : 'border border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
                  }`}
                  style={
                    orderType === 'pickup'
                      ? {
                          background: `linear-gradient(135deg, ${ctaAccent} 0%, ${primary} 100%)`,
                          boxShadow: `0 14px 36px ${primary}40`,
                        }
                      : undefined
                  }
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-black/20">
                    <Store className="h-6 w-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block text-lg font-bold"
                      style={{ fontFamily: '"Archivo Black", sans-serif' }}
                    >
                      Recoger
                    </span>
                    <span className="block text-xs opacity-80">
                      {selectedStore?.address || 'En el local'}
                    </span>
                  </span>
                  {orderType === 'pickup' ? (
                    <CheckCircle className="h-5 w-5 shrink-0" />
                  ) : null}
                </button>
              ) : null}
            </div>

            {orderType === 'delivery' ? (
              <div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-black/35 p-4">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" style={{ color: ctaAccent }} />
                  <p className="text-sm font-bold text-white">¿A qué calle te lo mandamos?</p>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-white/45">
                    Calle y número *
                  </label>
                  <input
                    type="text"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Ej. Carrer Martí Pujol 12, 2º 1ª"
                    autoFocus
                    autoComplete="street-address"
                    className="min-h-12 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-medium text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-white/45">
                    Código postal {isZoneMode ? '*' : '(opcional)'}
                  </label>
                  <input
                    type="text"
                    value={customerPostalCode}
                    onChange={(e) => handlePostalCodeChange(e.target.value)}
                    placeholder="08915"
                    maxLength={10}
                    inputMode="numeric"
                    autoComplete="postal-code"
                    className="min-h-12 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-medium text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none"
                  />
                </div>
                {isZoneMode && shippingLoading ? (
                  <p className="flex items-center gap-2 text-xs text-white/50">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Comprobando zona…
                  </p>
                ) : null}
                {isZoneMode && shippingError ? (
                  <p className="text-xs text-rose-300">{shippingError}</p>
                ) : null}
                {isZoneMode && shippingZoneName && !shippingError ? (
                  <p className="text-xs font-semibold" style={{ color: ctaAccent }}>
                    Zona: {shippingZoneName}
                    {shippingOptions[0] ? ` · desde ${shippingOptions[0].rate.toFixed(2).replace('.', ',')} €` : ''}
                  </p>
                ) : null}
              </div>
            ) : null}

            <button
              type="button"
              onClick={confirmWhere}
              disabled={
                !canEnterMenu ||
                (orderType === 'delivery' && isZoneMode && customerPostalCode.trim().length >= 3 && shippingOptions.length === 0 && !shippingLoading)
              }
              className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-bold text-white transition enabled:hover:brightness-110 disabled:opacity-40"
              style={{
                background: `linear-gradient(135deg, ${ctaAccent} 0%, ${primary} 100%)`,
                boxShadow: canEnterMenu ? `0 12px 32px ${primary}45` : undefined,
              }}
            >
              Ver la carta
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: config.backgroundColor }}>
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: `${config.accentColor}20` }}>
            <CheckCircle className="w-10 h-10" style={{ color: config.accentColor }} />
          </div>
          <h1 className="text-2xl font-bold mb-3 text-stone-900">¡Pedido enviado!</h1>
          <p className="text-gray-600 mb-6">{confirmMessage}</p>
          <button
            onClick={() => {
              setPromoCode('');
              setPromoDiscount(0);
              setStep(stores.length > 1 ? 'pick_store' : 'where');
            }}
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
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {mesaLock ? (
        <div className="bg-emerald-700 px-4 py-2 text-center text-sm font-semibold text-white">
          Pedido en {mesaLock.tableName}
          {mesaLock.tableNumber ? ` · mesa ${mesaLock.tableNumber}` : ''}
        </div>
      ) : null}
      {/* Header tipo app delivery */}
      <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex items-center gap-3">
            {brand.storeLogo ? (
              <img src={brand.storeLogo} alt="" className="h-11 w-11 rounded-xl object-contain bg-black p-1" />
            ) : (
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl text-lg font-black text-white"
                style={{ backgroundColor: primary }}
              >
                {brand.storeName.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-base font-black tracking-tight text-stone-900">
                {selectedStore?.name || brand.storeName}
              </h1>
              <button
                type="button"
                onClick={() => setStep('where')}
                className="flex max-w-full items-center gap-1 truncate text-left text-xs font-semibold"
                style={{ color: primary }}
              >
                {orderType === 'delivery' ? (
                  <>
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {customerAddress.trim() || 'Indica tu calle'}
                      {customerPostalCode.trim() ? ` · ${customerPostalCode}` : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <Store className="h-3 w-3 shrink-0" />
                    <span className="truncate">Recoger en local · Cambiar</span>
                  </>
                )}
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStep(step === 'menu' ? 'cart' : 'menu')}
            className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-white"
            aria-label="Carrito"
          >
            <ShoppingCart className="h-5 w-5 text-stone-800" />
            {cartCount > 0 ? (
              <span
                className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                style={{ backgroundColor: primary }}
              >
                {cartCount}
              </span>
            ) : null}
          </button>
        </div>
      </header>

      {!config.isOpen && (
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm font-semibold text-rose-800">
            {config.closedMessage}
          </div>
        </div>
      )}

      {config.isOpen && (
        <>
          {/* Hero + modo pedido */}
          <div className="border-b border-stone-200 bg-white">
            {config.bannerImage ? (
              <div className="mx-auto max-w-3xl px-4 pt-3">
                <img
                  src={config.bannerImage}
                  alt=""
                  className="h-28 w-full rounded-2xl object-cover sm:h-36"
                />
              </div>
            ) : null}
            <div className="mx-auto max-w-3xl space-y-3 px-4 py-4">
              {brand.welcomeMessage ? (
                <p className="text-sm text-stone-600">{brand.welcomeMessage}</p>
              ) : null}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                {config.estimatedDeliveryTime ? (
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Clock className="h-3.5 w-3.5" /> {config.estimatedDeliveryTime}
                  </span>
                ) : null}
                {config.minimumOrder > 0 ? (
                  <span className="font-semibold">Mín. {config.minimumOrder.toFixed(2)} €</span>
                ) : null}
                {selectedStore?.address || config.address ? (
                  <span className="inline-flex items-center gap-1 truncate">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {selectedStore?.address || config.address}
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {config.deliveryEnabled ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOrderType('delivery');
                      if (customerAddress.trim().length < 4) setStep('where');
                    }}
                    className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors ${
                      orderType === 'delivery'
                        ? 'text-white'
                        : 'border border-stone-200 bg-stone-50 text-stone-700'
                    }`}
                    style={orderType === 'delivery' ? { backgroundColor: primary } : undefined}
                  >
                    <Truck className="h-4 w-4" /> A domicilio
                  </button>
                ) : null}
                {config.pickupEnabled ? (
                  <button
                    type="button"
                    onClick={() => setOrderType('pickup')}
                    className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors ${
                      orderType === 'pickup'
                        ? 'text-white'
                        : 'border border-stone-200 bg-stone-50 text-stone-700'
                    }`}
                    style={orderType === 'pickup' ? { backgroundColor: primary } : undefined}
                  >
                    <Store className="h-4 w-4" /> Recoger
                  </button>
                ) : null}
              </div>
              {orderType === 'delivery' && customerAddress.trim() ? (
                <button
                  type="button"
                  onClick={() => setStep('where')}
                  className="flex w-full items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-left text-sm"
                >
                  <MapPin className="h-4 w-4 shrink-0" style={{ color: primary }} />
                  <span className="min-w-0 flex-1 truncate font-semibold text-stone-800">
                    {customerAddress}
                    {customerPostalCode ? ` · ${customerPostalCode}` : ''}
                  </span>
                  <span className="text-xs font-bold" style={{ color: primary }}>Editar</span>
                </button>
              ) : null}
            </div>
          </div>

          {step === 'menu' && (
            <div className="mx-auto max-w-3xl pb-28">
              {/* Buscador */}
              <div className="sticky top-[57px] z-20 border-b border-stone-200 bg-stone-50/95 px-4 py-3 backdrop-blur">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    type="search"
                    placeholder="Buscar en la carta…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-stone-200 bg-white pl-10 pr-3 text-sm font-medium text-stone-900 placeholder:text-stone-400 focus:border-[var(--v-blue,#2563eb)] focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                {categories.length > 2 ? (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {categories.map((cat) => {
                      const active = selectedCategory === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-colors ${
                            active
                              ? 'text-white'
                              : 'border border-stone-200 bg-white text-stone-700'
                          }`}
                          style={active ? { backgroundColor: primary } : undefined}
                        >
                          {cat === 'all' ? 'Toda la carta' : cat}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {/* Carta por secciones (estilo Glovo / McD) */}
              <div className="space-y-6 px-4 pt-4">
                {menuSections.map((section) => (
                  <section key={section.category} id={`cat-${section.category}`}>
                    <h2 className="mb-3 text-lg font-black tracking-tight text-stone-900">
                      {section.category}
                    </h2>
                    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                      {section.items.map((item, idx) => {
                        const inCart = cart.find((c) => c.id === item._id);
                        const available = item.available !== false;
                        return (
                          <div
                            key={item._id}
                            className={`flex gap-3 p-3 sm:p-4 ${
                              idx > 0 ? 'border-t border-stone-100' : ''
                            } ${available ? '' : 'opacity-55'}`}
                          >
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-bold text-stone-900 sm:text-[15px]">
                                {item.name}
                              </h3>
                              {item.description ? (
                                <p className="mt-0.5 line-clamp-2 text-xs text-stone-500 sm:text-[13px]">
                                  {item.description}
                                </p>
                              ) : null}
                              <p className="mt-2 text-sm font-black tabular-nums text-stone-900">
                                {Number(item.unitPrice || 0).toFixed(2).replace('.', ',')} €
                              </p>
                              {!available ? (
                                <p className="mt-1 text-[11px] font-bold uppercase text-rose-600">
                                  Agotado
                                </p>
                              ) : inCart ? (
                                <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-1.5 py-1">
                                  <button
                                    type="button"
                                    onClick={() => updateCartQuantity(item._id, -1)}
                                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-stone-700"
                                  >
                                    <Minus className="h-3.5 w-3.5" />
                                  </button>
                                  <span className="w-5 text-center text-sm font-bold">{inCart.quantity}</span>
                                  <button
                                    type="button"
                                    onClick={() => updateCartQuantity(item._id, 1)}
                                    className="flex h-8 w-8 items-center justify-center rounded-full text-white"
                                    style={{ backgroundColor: primary }}
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => addToCart(item)}
                                  className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-bold text-white"
                                  style={{ backgroundColor: primary }}
                                >
                                  <Plus className="h-3.5 w-3.5" /> Añadir
                                </button>
                              )}
                            </div>
                            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-stone-100 sm:h-28 sm:w-28">
                              {item.image ? (
                                <img
                                  src={item.image}
                                  alt=""
                                  className={`h-full w-full object-cover ${available ? '' : 'grayscale'}`}
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                  <ShoppingBag className="h-8 w-8 text-stone-300" />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}

                {filteredCatalog.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-12 text-center">
                    <ShoppingBag className="mx-auto mb-3 h-10 w-10 text-stone-300" />
                    <p className="font-bold text-stone-800">Sin productos en la carta</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {searchQuery
                        ? 'Prueba otra búsqueda'
                        : 'Activa productos en el catálogo SaaS (visibles en web)'}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {step === 'cart' && (
            <div className="mx-auto max-w-3xl px-4 pb-32 pt-4">
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
            <div className="mx-auto max-w-3xl px-4 pb-32 pt-4">
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
            <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-stone-200 bg-white/95 p-3 backdrop-blur">
              <div className="mx-auto max-w-3xl">
                {step === 'menu' && (
                  <button
                    type="button"
                    onClick={() => setStep('cart')}
                    className="flex min-h-12 w-full items-center justify-between rounded-xl px-5 text-sm font-bold text-white"
                    style={{ backgroundColor: primary }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <ShoppingCart className="h-5 w-5" />
                      Ver pedido ({cartCount})
                    </span>
                    <span className="tabular-nums">{finalTotal.toFixed(2).replace('.', ',')} €</span>
                  </button>
                )}
                {step === 'cart' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep('menu')}
                      className="min-h-12 rounded-xl border border-stone-200 px-4 text-sm font-bold text-stone-700"
                    >
                      Añadir más
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep('checkout')}
                      disabled={config.minimumOrder > 0 && cartTotal < config.minimumOrder}
                      className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                      style={{ backgroundColor: primary }}
                    >
                      Continuar <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {step === 'checkout' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep('cart')}
                      className="min-h-12 rounded-xl border border-stone-200 px-4 text-sm font-bold text-stone-700"
                    >
                      Atrás
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSubmit()}
                      disabled={submitting || !customerName || !customerPhone || (orderType === 'delivery' && !customerAddress) || (orderType === 'delivery' && isZoneMode && (!selectedShippingId || shippingOptions.length === 0))}
                      className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                      style={{ backgroundColor: primary }}
                    >
                      {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Confirmar pedido'}
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
