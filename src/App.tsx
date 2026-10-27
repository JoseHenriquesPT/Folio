import { BrowserRouter, Route, Routes } from "react-router-dom";
import AuthGate from "./auth/AuthGate";
import AppShell from "./components/AppShell";
import { CommandPaletteProvider } from "./components/CommandPaletteProvider";
import NotesWorkspace from "./components/NotesWorkspace";
import { ToastProvider } from "./components/ToastProvider";
import { WorkspaceProvider } from "./components/WorkspaceProvider";
import type { DbClient } from "./db/supabase";
import { SupabaseProvider } from "./db/SupabaseProvider";
import type { AppEnv } from "./lib/env";
import NotFoundPage from "./pages/NotFoundPage";
import SettingsPage from "./pages/SettingsPage";

export default function App({
  client,
  env,
}: {
  client: DbClient;
  env: AppEnv;
}) {
  return (
    <SupabaseProvider client={client} env={env}>
      <BrowserRouter>
        <AuthGate>
          <ToastProvider>
            <WorkspaceProvider>
              <CommandPaletteProvider>
                <Routes>
                  <Route element={<AppShell />}>
                    <Route index element={<NotesWorkspace />} />
                    <Route
                      path="note/:id"
                      element={<NotesWorkspace />}
                    />
                    <Route
                      path="shared"
                      element={<NotesWorkspace defaultView="shared" />}
                    />
                    <Route
                      path="archived"
                      element={<NotesWorkspace defaultView="archived" />}
                    />
                    <Route
                      path="trash"
                      element={<NotesWorkspace defaultView="trash" />}
                    />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Routes>
              </CommandPaletteProvider>
            </WorkspaceProvider>
          </ToastProvider>
        </AuthGate>
      </BrowserRouter>
    </SupabaseProvider>
  );
}
