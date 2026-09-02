import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { LanguageProvider } from "./i18n/index.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <LanguageProvider>
    <App />
  </LanguageProvider>
);

// Register service worker for PWA offline support
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW registration is a progressive enhancement — ignore failures silently
    });
  });
}
