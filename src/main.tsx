import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
import "./app/lib/i18n";
import { prepareNativeWebView, registerPwaServiceWorker } from "./app/lib/nativeWebViewBootstrap";

registerPwaServiceWorker();

// Arranque inmediato: en iPhone la limpieza de SW/cache puede colgar y dejaba pantalla en blanco.
void prepareNativeWebView();

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
