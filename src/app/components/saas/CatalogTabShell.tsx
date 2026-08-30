import { useState, type ReactNode } from 'react';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { InventoryStoreHistoryStrip } from './InventoryStoreHistoryStrip';
import {
  SaasTabToolbarRow,
  SaasTabWorkspace,
  type SaasTabStat,
} from './SaasTabWorkspace';

/** Subtítulo fijo del shell de catálogo (todas las pestañas). */
export const CATALOG_TAB_STORE_SUBTITLE = 'Mismo catálogo · stock por tienda';

type CatalogTabShellProps = {
  /** Nombre de la tienda activa; si no se pasa, sale del scope. */
  storeLabel?: string;
  /** Oculta el título de tienda (toolbar más compacta). */
  hideStoreLabel?: boolean;
  /** Oculta la franja de chips Tiendas + historial (si la pestaña trae su propio selector). */
  hideStoreStrip?: boolean;
  dataUserId?: string;
  /** Almacén de la tienda (historial); vacío = solo chips de tienda. */
  storeWarehouseId?: string;
  /** Buscadores / filtros que ya tenía la pestaña (a la derecha del título). */
  toolbarLeftExtra?: ReactNode;
  /** Acciones que ya tenía la pestaña (derecha). No inventar botones nuevos aquí. */
  toolbarRight?: ReactNode;
  toolbarBelow?: ReactNode;
  historyOpen?: boolean;
  onHistoryOpenChange?: (open: boolean) => void;
  historyRefreshToken?: number;
  onHistoryStaleChange?: (stale: boolean) => void;
  /** Inventario: al abrir historial oculta toolbar + listado. */
  hideChromeWhenHistoryOpen?: boolean;
  stats?: SaasTabStat[];
  statsTrailing?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
};

/**
 * Misma piel para Carta / Inventario / Ingredientes / Escandallo / Proveedores / …
 * Toolbar (tienda) → buscar/filtros debajo → franja Tiendas → contenido.
 */
export function CatalogTabShell({
  storeLabel: storeLabelProp,
  hideStoreLabel = false,
  hideStoreStrip = false,
  dataUserId: dataUserIdProp,
  storeWarehouseId = '',
  toolbarLeftExtra,
  toolbarRight,
  toolbarBelow,
  historyOpen: historyOpenControlled,
  onHistoryOpenChange,
  historyRefreshToken,
  onHistoryStaleChange,
  hideChromeWhenHistoryOpen = false,
  stats,
  statsTrailing,
  banner,
  children,
}: CatalogTabShellProps) {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const activeStore = useActiveStoreScope();
  const [historyOpenLocal, setHistoryOpenLocal] = useState(false);

  const dataUserId =
    String(dataUserIdProp || resolveBusinessDataUserId(user, currentBusiness) || '').trim();
  const storeLabel =
    String(storeLabelProp || activeStore.displayLabelForActive || '').trim() || 'Tienda activa';

  const historyOpen = historyOpenControlled ?? historyOpenLocal;
  const setHistoryOpen = onHistoryOpenChange ?? setHistoryOpenLocal;
  const hideChrome = hideChromeWhenHistoryOpen && historyOpen;

  return (
    <SaasTabWorkspace
      stats={hideChrome ? undefined : stats}
      statsTrailing={hideChrome ? undefined : statsTrailing}
      banner={hideChrome ? undefined : banner}
      toolbar={
        hideChrome ? undefined : (
          <div className="space-y-2">
            <SaasTabToolbarRow
              left={
                <>
                  {!hideStoreLabel ? (
                    <div className="min-w-0 max-w-[12rem] sm:max-w-[16rem]">
                      <p
                        className="truncate text-sm font-semibold text-stone-900 dark:text-white"
                        title={storeLabel}
                      >
                        {storeLabel}
                      </p>
                    </div>
                  ) : null}
                  {toolbarLeftExtra}
                </>
              }
              right={toolbarRight}
            />
            {toolbarBelow}
          </div>
        )
      }
      belowToolbar={
        hideStoreStrip || hideChrome ? undefined : (
          <InventoryStoreHistoryStrip
            dataUserId={dataUserId}
            storeWarehouseId={storeWarehouseId}
            refreshToken={historyRefreshToken}
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            onStaleChange={onHistoryStaleChange}
          />
        )
      }
    >
      {hideChrome ? null : children}
    </SaasTabWorkspace>
  );
}
