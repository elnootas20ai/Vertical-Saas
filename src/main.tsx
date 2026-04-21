import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";
import "./app/lib/i18n";

createRoot(document.getElementById("root")!).render(<App />);
