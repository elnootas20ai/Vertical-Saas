import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
import "./app/lib/i18n";
import { prepareNativeWebView, registerPwaServiceWorker } from "./app/lib/nativeWebViewBootstrap";

registerPwaServiceWorker();

void prepareNativeWebView().then(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
