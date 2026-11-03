import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  placeLinkPopover,
  type AnchorRect,
  type LinkTarget,
} from "../lib/linkPopover";

/**
 * The edit-mode step between tapping a link and leaving Folio: the link's own
 * handler is off, so a small card offers "Open link" next to where the reader
 * tapped. View mode skips this and opens the link directly.
 */
export default function LinkPopover({
  target,
  anchor,
  onClose,
}: {
  target: LinkTarget;
  anchor: AnchorRect;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const measure = () => {
      const placed = placeLinkPopover(
        anchor,
        { width: panel.offsetWidth, height: panel.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight }
      );
      setPosition({ left: placed.left, top: placed.top });
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [anchor]);

  useEffect(() => {
    panelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const handleOutside = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handleOutside, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handleOutside, true);
    };
  }, [onClose]);

  function openLink() {
    window.open(target.href, "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <div
      ref={panelRef}
      className="link-popover"
      role="dialog"
      aria-label="Open link"
      tabIndex={-1}
      style={position ?? { visibility: "hidden" }}
    >
      <span className="link-popover-url" title={target.href}>
        {target.href}
      </span>
      <div className="link-popover-actions">
        <button
          type="button"
          className="button small primary"
          onClick={openLink}
        >
          Open link
        </button>
        <button
          type="button"
          className="button small ghost"
          aria-label="Dismiss link"
          onClick={onClose}
        >
          ×
        </button>
      </div>
    </div>
  );
}
