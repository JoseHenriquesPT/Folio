import { useEffect, useRef, useState } from "react";
import ThemePicker, { type ThemePickerProps } from "./ThemePicker";

/**
 * Quick appearance switcher: an "Appearance" button whose popover holds the
 * shared ThemePicker. It stays open while choosing so the theme previews live,
 * and closes on Escape (returning focus), an outside press, or a Tab-out.
 */
export default function ThemeMenu({
  mode,
  palette,
  onModeChange,
  onPaletteChange,
}: ThemePickerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const node = wrapRef.current;
    node?.querySelector<HTMLButtonElement>(".theme-menu button")?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }

    function handleMouseDown(event: MouseEvent) {
      if (node && !node.contains(event.target as Node)) setOpen(false);
    }

    function handleFocusOut(event: FocusEvent) {
      const next = event.relatedTarget;
      if (node && next instanceof Node && node.contains(next)) return;
      setOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);
    node?.addEventListener("focusout", handleFocusOut);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
      node?.removeEventListener("focusout", handleFocusOut);
    };
  }, [open]);

  return (
    <div className="theme-menu-wrap" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="button ghost small"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Appearance
      </button>
      {open ? (
        <div className="theme-menu" role="dialog" aria-label="Appearance">
          <ThemePicker
            mode={mode}
            palette={palette}
            onModeChange={onModeChange}
            onPaletteChange={onPaletteChange}
          />
        </div>
      ) : null}
    </div>
  );
}
