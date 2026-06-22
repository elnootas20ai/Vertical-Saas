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
};

const TpvChromeContext = createContext<TpvChromeContextValue | null>(null);

/** Envuelve el TPV tablet/CEO y controla si se muestra la barra inferior global. */
export function TpvChromeScope({
  children,
  bottomBar,
}: {
  children: ReactNode;
  bottomBar?: ReactNode | null;
}) {
  const [suppressBottomBar, setSuppressBottomBarState] = useState(false);
  const setSuppressBottomBar = useCallback((suppress: boolean) => {
    setSuppressBottomBarState(suppress);
  }, []);
  const value = useMemo(() => ({ setSuppressBottomBar }), [setSuppressBottomBar]);

  return (
    <TpvChromeContext.Provider value={value}>
      {children}
      {!suppressBottomBar && bottomBar}
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
