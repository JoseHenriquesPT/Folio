import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ConfigError from "./components/ConfigError";
import ErrorBoundary from "./components/ErrorBoundary";
import { createSupabaseClient } from "./db/supabaseClient";
import { readEnv } from "./lib/env";
import { applyInitialTheme } from "./lib/theme";
import "./styles/tokens.css";
import "./styles/app.css";

applyInitialTheme();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

const root = createRoot(rootElement);
const env = readEnv(import.meta.env);

root.render(
  <StrictMode>
    <ErrorBoundary>
      {env.ok ? (
        <App client={createSupabaseClient(env.env)} env={env.env} />
      ) : (
        <ConfigError problems={env.problems} />
      )}
    </ErrorBoundary>
  </StrictMode>
);
