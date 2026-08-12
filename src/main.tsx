import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
import "./app/lib/i18n";
import { enforceFreshLoginOnAppUpdate } from "./app/lib/appInstallStamp";
import {
  clearStaleWebCachesInDev,
  configureNativeSafeArea,
  prepareNativeWebView,
  registerPwaServiceWorker,
} from "./app/lib/nativeWebViewBootstrap";

function showBootstrapError(error: unknown) {
  const rootEl = document.getElementById("root");
  if (!rootEl) return;
  const detail = error instanceof Error ? error.message : String(error);
  rootEl.innerHTML = `
    <div style="display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;background:#fafafa">
      <div style="max-width:420px;text-align:center">
        <p style="font-size:18px;font-weight:700;color:#111827;margin:0 0 8px">No se pudo iniciar Vertial</p>
        <p style="font-size:14px;color:#6b7280;margin:0 0 16px;line-height:1.5">
          Recarga con Ctrl+Shift+R. Si sigue igual, cierra la pestaña y vuelve a abrir.
        </p>
        <pre style="font-size:11px;text-align:left;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px;color:#b91c1c;white-space:pre-wrap;word-break:break-word">${detail}</pre>
      </div>
    </div>
  `;
}

async function boot() {
  // Antes de AuthProvider: nueva build nativa → login limpio (sin sesión del cliente anterior).
  try {
    await enforceFreshLoginOnAppUpdate();
  } catch {
    /* no bloquear arranque */
  }

  // En DEV: limpiar SW/caché ANTES de montar. Si no, a veces queda HTML en blanco
  // («Cargando…» / root vacío) tras reiniciar Vite.
  try {
    await clearStaleWebCachesInDev();
  } catch {
    /* no bloquear */
  }
  registerPwaServiceWorker();
  void prepareNativeWebView();
  void configureNativeSafeArea();

  const rootEl = document.getElementById("root");
  if (!rootEl) return;
  try {
    // Tras un reload por chunk viejo, limpiar el flag para no bloquear futuros deploys.
    try {
      sessionStorage.removeItem("vertial:chunk-reload");
    } catch {
      /* ignore */
    }
    createRoot(rootEl).render(<App />);
  } catch (error) {
    showBootstrapError(error);
    console.error("[Vertial bootstrap]", error);
  }
}

void boot();
