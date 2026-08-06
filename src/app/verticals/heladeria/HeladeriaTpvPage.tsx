import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { IceCream, Loader2, MapPin, Minus, Plus, Trash2, User, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { getClientDetailRequest } from '../../lib/crmApi';
import { pointOfSaleDisplayLabel } from '../../lib/deliveryApi';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { fetchTpvCatalog } from '../../lib/tpvCatalogCache';
import {
  VERTIAL_BTN_DANGER,
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
  VERTIAL_SURFACE,
} from '../../lib/vertialUiTokens';
import { HeladeriaMvpShell } from './HeladeriaMvpShell';
import {
  mapCatalogToHeladeriaProducts,
  readHeladeriaSessionTickets,
  uniqueHeladeriaCategories,
  writeHeladeriaSessionTickets,
  type HeladeriaCartLine,
  type HeladeriaSaleTicket,
  type HeladeriaTpvProduct,
} from './heladeriaTpvCatalog';

function formatEur(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

/** TPV Heladería — catálogo real + PDV activo (sin pantallas Delivery). */
export function HeladeriaTpvPage() {
  const { user } = useAuth();
  const { currentBusiness, businesses } = useBusiness();
  const activeStore = useActiveStoreScope();
  const [searchParams, setSearchParams] = useSearchParams();

  const clientIdParam = String(searchParams.get('clientId') || '').trim();
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const businessId = resolveBusinessScopeId(currentBusiness);
  const pdvId = String(activeStore.activeSalesPointId || '').trim();
  const activePdv = useMemo(
    () => activeStore.pointsOfSale.find((p) => p._id === pdvId) || null,
    [activeStore.pointsOfSale, pdvId],
  );
  const pdvLabel = activePdv
    ? pointOfSaleDisplayLabel(activePdv)
    : activeStore.displayLabelForActive || 'Sin PDV';

  const [products, setProducts] = useState<HeladeriaTpvProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [cart, setCart] = useState<HeladeriaCartLine[]>([]);
  const [tickets, setTickets] = useState<HeladeriaSaleTicket[]>([]);
  const [clientName, setClientName] = useState<string | null>(null);
  const [clientLoading, setClientLoading] = useState(false);

  useEffect(() => {
    if (!businessId) {
      setTickets([]);
      return;
    }
    setTickets(readHeladeriaSessionTickets(businessId, pdvId || 'none'));
  }, [businessId, pdvId]);

  useEffect(() => {
    if (!businessId) return;
    writeHeladeriaSessionTickets(businessId, pdvId || 'none', tickets);
  }, [businessId, pdvId, tickets]);

  const loadCatalog = useCallback(async () => {
    if (!dataUserId || !businessId) {
      setProducts([]);
      setCatalogLoading(false);
      setCatalogError('Sin empresa activa');
      return;
    }
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const snapshot = await fetchTpvCatalog(dataUserId, {
        scopeBusinessId: businessId,
        businesses: (businesses || []).map((b) => ({
          id: String(b.id || b._id || '').replace(/^business:/, '').trim(),
          business_id: String(b.id || b._id || '').replace(/^business:/, '').trim(),
          businessType: b.businessType,
        })),
        accountBusinessCount: (businesses || []).length,
      });
      setProducts(mapCatalogToHeladeriaProducts(snapshot.items));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo cargar el catálogo';
      setCatalogError(msg);
      setProducts([]);
    } finally {
      setCatalogLoading(false);
    }
  }, [dataUserId, businessId, businesses]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!clientIdParam || !dataUserId) {
      setClientName(null);
      return;
    }
    let cancelled = false;
    setClientLoading(true);
    void getClientDetailRequest(dataUserId, clientIdParam, { lite: true })
      .then((client) => {
        if (cancelled) return;
        if (!client) {
          setClientName(null);
          toast.error('Cliente no encontrado');
          return;
        }
        const name = String(client.name || '').trim() || 'Cliente';
        setClientName(name);
      })
      .catch(() => {
        if (!cancelled) setClientName(null);
      })
      .finally(() => {
        if (!cancelled) setClientLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientIdParam, dataUserId]);

  const categories = useMemo(() => uniqueHeladeriaCategories(products), [products]);

  const visibleProducts = useMemo(() => {
    if (categoryFilter === 'all') return products;
    return products.filter((p) => p.category === categoryFilter);
  }, [products, categoryFilter]);

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.price * line.qty, 0),
    [cart],
  );

  function addProduct(product: HeladeriaTpvProduct) {
    setCart((prev) => {
      const existing = prev.find((l) => l.id === product.id);
      if (existing) {
        return prev.map((l) => (l.id === product.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, { ...product, qty: 1 }];
    });
  }

  function changeQty(id: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.id === id ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0),
    );
  }

  function clearCart() {
    setCart([]);
  }

  function clearClient() {
    setClientName(null);
    const next = new URLSearchParams(searchParams);
    next.delete('clientId');
    setSearchParams(next, { replace: true });
  }

  function charge() {
    if (!cart.length) {
      toast.error('Añade al menos un producto');
      return;
    }
    if (!pdvId) {
      toast.error('Selecciona un PDV en el sidebar antes de cobrar');
      return;
    }
    const now = new Date();
    const ticket: HeladeriaSaleTicket = {
      id: `H-${now.getTime().toString(36).toUpperCase()}`,
      at: now.toLocaleString('es-ES'),
      atIso: now.toISOString(),
      total,
      pdvId,
      pdvLabel,
      clientId: clientIdParam || undefined,
      clientName: clientName || undefined,
      lines: cart.map((l) => ({
        catalogId: l.catalogId,
        name: l.name,
        qty: l.qty,
        price: l.price,
      })),
    };
    setTickets((prev) => [ticket, ...prev].slice(0, 40));
    setCart([]);
    toast.success(`Ticket ${ticket.id} · ${formatEur(ticket.total)}`);
  }

  return (
    <HeladeriaMvpShell
      title="TPV Heladería"
      subtitle={`${pdvLabel} · catálogo de la empresa`}
      area="tpv"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
            <MapPin className="h-3.5 w-3.5 text-stone-400" />
            {activeStore.loading ? 'Cargando PDV…' : pdvLabel}
          </span>
          {clientIdParam ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
              <User className="h-3.5 w-3.5" />
              {clientLoading ? 'Cliente…' : clientName || 'Cliente'}
              <button
                type="button"
                className="ml-0.5 rounded p-0.5 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                onClick={clearClient}
                aria-label="Quitar cliente"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : null}
          <button
            type="button"
            className={VERTIAL_BTN_SECONDARY}
            onClick={() => void loadCatalog()}
            disabled={catalogLoading}
          >
            Actualizar carta
          </button>
          <button type="button" className={VERTIAL_BTN_SECONDARY} onClick={clearCart} disabled={!cart.length}>
            <Trash2 className="h-4 w-4" />
            Vaciar
          </button>
        </div>
      }
    >
      {!pdvId && !activeStore.loading ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          No hay PDV activo. Crea o selecciona una tienda en el sidebar / Ajustes → Tienda.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className={`${VERTIAL_SURFACE} p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Carta</h2>
            {categories.length > 1 ? (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCategoryFilter('all')}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                    categoryFilter === 'all'
                      ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                      : 'border border-stone-200 text-stone-600 dark:border-stone-700 dark:text-stone-300'
                  }`}
                >
                  Todas
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                      categoryFilter === cat
                        ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                        : 'border border-stone-200 text-stone-600 dark:border-stone-700 dark:text-stone-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {catalogLoading ? (
            <div className="mt-8 flex flex-col items-center gap-2 text-sm text-stone-500">
              <Loader2 className="h-6 w-6 animate-spin" />
              Cargando catálogo…
            </div>
          ) : catalogError ? (
            <div className="mt-4 space-y-2 text-sm">
              <p className="text-rose-600 dark:text-rose-300">{catalogError}</p>
              <button type="button" className={VERTIAL_BTN_SECONDARY} onClick={() => void loadCatalog()}>
                Reintentar
              </button>
            </div>
          ) : !products.length ? (
            <div className="mt-4 space-y-3 rounded-xl border border-dashed border-stone-200 px-4 py-8 text-center dark:border-stone-700">
              <IceCream className="mx-auto h-8 w-8 text-stone-300" />
              <p className="text-sm text-stone-600 dark:text-stone-300">
                No hay productos con precio en el catálogo.
              </p>
              <Link to="/saas/catalog" className={`${VERTIAL_BTN_PRIMARY} inline-flex`}>
                Ir al catálogo
              </Link>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {visibleProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addProduct(p)}
                  className="rounded-xl border border-stone-200 bg-white p-3 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/50 dark:border-stone-800 dark:bg-stone-950 dark:hover:bg-blue-950/30"
                >
                  <div className="flex items-center gap-2">
                    <IceCream className="h-4 w-4 shrink-0 text-[var(--v-blue,#2563eb)]" />
                    <span className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                      {p.name}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-stone-400">{p.category}</p>
                  <p className="mt-0.5 text-xs text-stone-500">{formatEur(p.price)}</p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className={`${VERTIAL_SURFACE} flex flex-col p-4`}>
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Ticket actual</h2>
          <ul className="mt-3 flex-1 space-y-2">
            {!cart.length ? (
              <li className="rounded-xl border border-dashed border-stone-200 px-3 py-6 text-center text-sm text-stone-400 dark:border-stone-700">
                Sin líneas
              </li>
            ) : (
              cart.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-800 dark:bg-stone-900/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">{l.name}</p>
                    <p className="text-xs text-stone-500">{formatEur(l.price)} · {l.unit}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                      onClick={() => changeQty(l.id, -1)}
                      aria-label="Quitar"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold">{l.qty}</span>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                      onClick={() => changeQty(l.id, 1)}
                      aria-label="Añadir"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>

          <div className="mt-4 border-t border-stone-200 pt-3 dark:border-stone-800">
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-500">Total</span>
              <span className="text-xl font-semibold text-stone-900 dark:text-stone-100">
                {formatEur(total)}
              </span>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" className={`${VERTIAL_BTN_DANGER} flex-1`} onClick={clearCart} disabled={!cart.length}>
                Anular
              </button>
              <button
                type="button"
                className={`${VERTIAL_BTN_PRIMARY} flex-1`}
                onClick={charge}
                disabled={!cart.length || !pdvId}
              >
                Cobrar
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className={`${VERTIAL_SURFACE} p-4`}>
        <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
          Tickets cobrados (sesión · {pdvLabel})
        </h2>
        {!tickets.length ? (
          <p className="mt-2 text-sm text-stone-500">Aún no hay tickets en esta sesión.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {tickets.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 px-3 py-2 dark:border-stone-800"
              >
                <div>
                  <p className="font-mono text-xs text-stone-400">{t.id}</p>
                  <p className="text-sm text-stone-700 dark:text-stone-200">
                    {t.lines.map((l) => `${l.qty}× ${l.name}`).join(' · ')}
                  </p>
                  <p className="text-xs text-stone-500">
                    {t.at}
                    {t.clientName ? ` · ${t.clientName}` : ''}
                  </p>
                </div>
                <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                  {formatEur(t.total)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </HeladeriaMvpShell>
  );
}
