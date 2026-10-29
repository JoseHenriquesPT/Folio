import { useEffect, useRef, type MouseEvent } from "react";
import type { ViewerImage } from "../lib/imageView";

// One click handler on the dialog: taps on the image or the close button
// bubble up, so every gesture closes exactly once.
export default function ImageViewer({
  image,
  onClose,
}: {
  image: ViewerImage;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleTap(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    onClose();
  }

  return (
    <div
      ref={panelRef}
      className="image-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      tabIndex={-1}
      onClick={handleTap}
    >
      <button
        type="button"
        className="icon-button image-viewer-close"
        aria-label="Close"
      >
        ×
      </button>
      <img className="image-viewer-img" src={image.src} alt={image.alt} />
    </div>
  );
}
