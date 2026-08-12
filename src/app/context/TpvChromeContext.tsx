import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type TpvChromeContextValue = {
  setSuppressBottomBar: (suppress: boolean) => void;
  /** Varios motivos a la vez (apertura + pedido): no pelearse al desmontar un hijo. */
  setSuppressBottomBarReason: (reason: string, suppress: boolean) => void;
  orderFlowActive: boolean;
  setOrderFlowActive: (active: boolean) => void;
  /** Contador: varios hijos (tablero + OrderFlow) pueden pedir el lock a la vez. */
  acquireOrderFlowLock: () => void;
  releaseOrderFlowLock: () => void;
};

const TpvChromeContext = createContext<TpvChromeContextValue | null>(null);

/** Envuelve el TPV tablet/CEO y controla si se muestra la barra inferior global. */
export function TpvChromeScope({
  children,
  bottomBar,
  /** Si true, la barra inferior va dentro del viewport (100svh) y no empuja el scroll de la página. */
  insetBottomBar = false,
  /**
   * Si hay barra y aún no hay caja abierta, ocultarla por defecto (evita Stock/Salir
   * parpadeando encima de «Abrir caja» al entrar con código).
   */
  hideBottomBarUntilShown = Boolean(bottomBar),
}: {
  children: ReactNode;
  bottomBar?: ReactNode | null;
  insetBottomBar?: boolean;
  hideBottomBarUntilShown?: boolean;
}) {
  const [suppressBottomBar, setSuppressBottomBarState] = useState(hideBottomBarUntilShown);
  const [orderFlowActive, setOrderFlowActiveState] = useState(false);
  const orderFlowLockCountRef = useRef(0);
  const suppressReasonsRef = useRef<Set<string>>(
    new Set(hideBottomBarUntilShown ? ['scope-default'] : []),
  );
  const syncSuppressBottomBar = useCallback(() => {
    const locked = orderFlowLockCountRef.current > 0;
    setSuppressBottomBarState(locked || suppressReasonsRef.current.size > 0);
  }, []);
  const setSuppressBottomBarReason = useCallback((reason: string, suppress: boolean) => {
    const key = String(reason || '').trim() || 'default';
    if (suppress) suppressReasonsRef.current.add(key);
    else suppressReasonsRef.current.delete(key);
    // Al mostrar barra por primera vez, soltar el default del scope.
    if (!suppress) suppressReasonsRef.current.delete('scope-default');
    syncSuppressBottomBar();
  }, [syncSuppressBottomBar]);
  const setSuppressBottomBar = useCallback((suppress: boolean) => {
    setSuppressBottomBarReason('legacy', suppress);
  }, [setSuppressBottomBarReason]);
  const setOrderFlowActive = useCallback((active: boolean) => {
    setOrderFlowActiveState(active);
  }, []);
  const syncOrderFlowLock = useCallback(() => {
    const active = orderFlowLockCountRef.current > 0;
    setOrderFlowActiveState(active);
    syncSuppressBottomBar();
    try {
      if (active) sessionStorage.setItem('vertial.tpv.orderFlowLock', '1');
      else sessionStorage.removeItem('vertial.tpv.orderFlowLock');
    } catch { /* ignore */ }
  }, [syncSuppressBottomBar]);
  const acquireOrderFlowLock = useCallback(() => {
    orderFlowLockCountRef.current += 1;
    syncOrderFlowLock();
  }, [syncOrderFlowLock]);
  const releaseOrderFlowLock = useCallback(() => {
    orderFlowLockCountRef.current = Math.max(0, orderFlowLockCountRef.current - 1);
    syncOrderFlowLock();
  }, [syncOrderFlowLock]);
  const value = useMemo(
    () => ({
      setSuppressBottomBar,
      setSuppressBottomBarReason,
      orderFlowActive,
      setOrderFlowActive,
      acquireOrderFlowLock,
      releaseOrderFlowLock,
    }),
    [setSuppressBottomBar, setSuppressBottomBarReason, orderFlowActive, setOrderFlowActive, acquireOrderFlowLock, releaseOrderFlowLock],
  );

  return (
    <TpvChromeContext.Provider value={value}>
      {insetBottomBar ? (
        <div className="flex flex-col h-[100svh] min-h-[100svh] max-h-[100svh] overflow-hidden w-full">
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</div>
          {!suppressBottomBar && bottomBar}
        </div>
      ) : (
        <>
          {children}
          {!suppressBottomBar && bottomBar}
        </>
      )}
    </TpvChromeContext.Provider>
  );
}

/** Oculta la barra inferior del shell mientras una subvista a pantalla completa está activa. */
export function useTpvSuppressBottomBar(active: boolean, reason = 'view') {
  const ctx = useContext(TpvChromeContext);
  const reasonId = reason;
  // useLayoutEffect: no pintar Stock/Salir un frame encima de Abrir caja.
  useLayoutEffect(() => {
    if (!ctx) return;
    ctx.setSuppressBottomBarReason(reasonId, active);
    return () => ctx.setSuppressBottomBarReason(reasonId, false);
  }, [active, ctx, reasonId]);
}

/** Modo pedido activo: barra de caja mínima, más espacio al catálogo y sin barra inferior duplicada. */
export function useTpvOrderFlowChrome(active: boolean) {
  const ctx = useContext(TpvChromeContext);
  const heldRef = useRef(false);
  // useLayoutEffect: el gate debe ver orderFlowActive antes del paint (evita OpeningScreen a mitad de pedido).
  useLayoutEffect(() => {
    if (!ctx) return;
    if (active && !heldRef.current) {
      ctx.acquireOrderFlowLock();
      heldRef.current = true;
    } else if (!active && heldRef.current) {
      ctx.releaseOrderFlowLock();
      heldRef.current = false;
    }
    return () => {
      if (heldRef.current) {
        ctx.releaseOrderFlowLock();
        heldRef.current = false;
      }
    };
  }, [active, ctx]);
}

export function useTpvOrderFlowActive(): boolean {
  return useContext(TpvChromeContext)?.orderFlowActive ?? false;
}

/** Adquirir/liberar el lock a mano (p. ej. al pulsar «+» / Nuevo antes del setState). */
export function useTpvOrderFlowLockControls(): {
  acquire: () => void;
  release: () => void;
} {
  const ctx = useContext(TpvChromeContext);
  return useMemo(
    () => ({
      acquire: () => {
        ctx?.acquireOrderFlowLock();
      },
      release: () => {
        ctx?.releaseOrderFlowLock();
      },
    }),
    [ctx],
  );
}
