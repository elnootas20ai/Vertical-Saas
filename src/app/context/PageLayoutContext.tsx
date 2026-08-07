import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface PageLayoutConfig {
  title: string;
  subtitle?: string;
  noPadding?: boolean;
  titleClassName?: string;
  subtitleClassName?: string;
  /**
   * Atrás en Topbar:
   * - undefined → auto (si no es pestaña raíz)
   * - string → ruta fija
   * - false → ocultar
   */
  backTo?: string | false;
}

const DEFAULT_PAGE_LAYOUT: PageLayoutConfig = {
  title: 'Vertial',
};

function pageLayoutEqual(a: PageLayoutConfig, b: PageLayoutConfig): boolean {
  return (
    a.title === b.title &&
    a.subtitle === b.subtitle &&
    a.noPadding === b.noPadding &&
    a.titleClassName === b.titleClassName &&
    a.subtitleClassName === b.subtitleClassName &&
    a.backTo === b.backTo
  );
}

type PageLayoutContextValue = {
  config: PageLayoutConfig;
  setConfig: (config: PageLayoutConfig) => void;
};

const PageLayoutContext = createContext<PageLayoutContextValue | null>(null);

export function PageLayoutProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<PageLayoutConfig>(DEFAULT_PAGE_LAYOUT);
  const setConfig = useCallback((next: PageLayoutConfig) => {
    setConfigState((prev) => (pageLayoutEqual(prev, next) ? prev : next));
  }, []);
  const value = useMemo(() => ({ config, setConfig }), [config, setConfig]);
  return (
    <PageLayoutContext.Provider value={value}>
      {children}
    </PageLayoutContext.Provider>
  );
}

export function usePageLayoutConfig(): PageLayoutConfig {
  const ctx = useContext(PageLayoutContext);
  return ctx?.config ?? DEFAULT_PAGE_LAYOUT;
}

export function useRegisterPageLayout(config: PageLayoutConfig) {
  const setConfig = useContext(PageLayoutContext)?.setConfig;
  useLayoutEffect(() => {
    if (!setConfig) return;
    setConfig(config);
  }, [
    setConfig,
    config.title,
    config.subtitle,
    config.noPadding,
    config.titleClassName,
    config.subtitleClassName,
    config.backTo,
  ]);
}
