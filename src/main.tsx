import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
import "./app/lib/i18n";
import { prepareNativeWebView } from "./app/lib/nativeWebViewBootstrap";

void prepareNativeWebView().then(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
