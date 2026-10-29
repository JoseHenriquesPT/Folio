import { useEffect } from "react";
import { shouldSuppressContextMenu } from "../lib/contextMenu";

/** Cancels the browser's context menu app-wide, keeping the escape hatches. */
export function useContextMenuSuppress() {
  useEffect(() => {
    function handleContextMenu(event: MouseEvent) {
      if (shouldSuppressContextMenu(event.target, event.shiftKey)) {
        event.preventDefault();
      }
    }

    window.addEventListener("contextmenu", handleContextMenu);
    return () => window.removeEventListener("contextmenu", handleContextMenu);
  }, []);
}
