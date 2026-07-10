import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type TpvChromeContextValue = {
  setSuppressBottomBar: (suppress: boolean) => void;
  orderFlowActive: boolean;
  setOrderFlowActive: (active: boolean) => void;
};

const TpvChromeContext = createContext<TpvChromeContextValue | null>(null);

/** Envuelve el TPV tablet/CEO y controla si se muestra la barra inferior global. */
export function TpvChromeScope({
  children,
  bottomBar,
  /** Si true, la barra inferior va dentro del viewport (100svh) y no empuja el scroll de la página. */
  insetBottomBar = false,
}: {
  children: ReactNode;
  bottomBar?: ReactNode | null;
  insetBottomBar?: boolean;
}) {
  const [suppressBottomBar, setSuppressBottomBarState] = useState(false);
  const [orderFlowActive, setOrderFlowActiveState] = useState(false);
  const setSuppressBottomBar = useCallback((suppress: boolean) => {
    setSuppressBottomBarState(suppress);
  }, []);
  const setOrderFlowActive = useCallback((active: boolean) => {
    setOrderFlowActiveState(active);
  }, []);
  const value = useMemo(
    () => ({ setSuppressBottomBar, orderFlowActive, setOrderFlowActive }),
    [setSuppressBottomBar, orderFlowActive, setOrderFlowActive],
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
export function useTpvSuppressBottomBar(active: boolean) {
  const ctx = useContext(TpvChromeContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setSuppressBottomBar(active);
    return () => ctx.setSuppressBottomBar(false);
  }, [active, ctx]);
}

/** Modo pedido activo: barra de caja mínima, más espacio al catálogo y sin barra inferior duplicada. */
export function useTpvOrderFlowChrome(active: boolean) {
  const ctx = useContext(TpvChromeContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setOrderFlowActive(active);
    ctx.setSuppressBottomBar(active);
    return () => {
      ctx.setOrderFlowActive(false);
      ctx.setSuppressBottomBar(false);
    };
  }, [active, ctx]);
}

export function useTpvOrderFlowActive(): boolean {
  return useContext(TpvChromeContext)?.orderFlowActive ?? false;
}
