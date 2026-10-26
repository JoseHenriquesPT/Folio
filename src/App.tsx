import { BrowserRouter, Route, Routes } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import AuthGate from "./auth/AuthGate";
import AppShell from "./components/AppShell";
import PlaceholderPage from "./components/PlaceholderPage";
import { SupabaseProvider } from "./db/SupabaseProvider";
import type { AppEnv } from "./lib/env";
import NotFoundPage from "./pages/NotFoundPage";
import SettingsPage from "./pages/SettingsPage";

export default function App({
  client,
  env,
}: {
  client: SupabaseClient;
  env: AppEnv;
}) {
  return (
    <SupabaseProvider client={client} env={env}>
      <BrowserRouter>
        <AuthGate>
          <Routes>
            <Route element={<AppShell />}>
              <Route
                index
                element={
                  <PlaceholderPage
                    eyebrow="Library"
                    title="All notes"
                    heading="A quiet place for everything"
                    description="Your notes, notebooks, tags, and search will live here. Capture is the next milestone."
                  />
                }
              />
              <Route
                path="note/:id"
                element={
                  <PlaceholderPage
                    eyebrow="Editor"
                    title="Note"
                    heading="The editor is next"
                    description="This route will open the rich-text editor for a single note."
                  />
                }
              />
              <Route
                path="shared"
                element={
                  <PlaceholderPage
                    eyebrow="Collaboration"
                    title="Shared with me"
                    heading="Nothing shared yet"
                    description="Notes your partner shares will appear here, with a clear read or edit badge."
                  />
                }
              />
              <Route
                path="archived"
                element={
                  <PlaceholderPage
                    eyebrow="Archive"
                    title="Archived"
                    heading="No archived notes"
                    description="Notes you archive will wait here, out of the main list."
                  />
                }
              />
              <Route
                path="trash"
                element={
                  <PlaceholderPage
                    eyebrow="Cleanup"
                    title="Trash"
                    heading="Trash is empty"
                    description="Deleted notes will wait here until you restore or remove them."
                  />
                }
              />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </AuthGate>
      </BrowserRouter>
    </SupabaseProvider>
  );
}
