import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { DesktopAuthProvider } from "./lib/desktopAuth";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DesktopAuthProvider>
      <App />
    </DesktopAuthProvider>
  </React.StrictMode>
);
