import { createContext, useContext } from "react";

export interface SidebarDrawerValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/**
 * Lets content under the shell open the sidebar drawer — dragging a note to a
 * notebook needs somewhere to drop it on a phone, where the drawer is closed
 * by default.
 */
export const SidebarDrawerContext = createContext<SidebarDrawerValue | null>(
  null
);

export function useSidebarDrawer(): SidebarDrawerValue {
  const value = useContext(SidebarDrawerContext);
  if (!value) {
    throw new Error("useSidebarDrawer must be used inside SidebarDrawerContext");
  }
  return value;
}
