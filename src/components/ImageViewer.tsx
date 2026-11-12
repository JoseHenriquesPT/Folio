import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import type { ImageAnnotation } from "../lib/imageAnnotate";
import { toMessage } from "../lib/errors";
import type { ViewerImage } from "../lib/imageView";
import ImageDraw from "./ImageDraw";

interface ImageViewerProps {
  image: ViewerImage;
  /** Present only when the current user may edit this note. */
  annotation?: ImageAnnotation | null;
  onClose: () => void;
}

// One click handler on the dialog: taps on the image or the close button
// bubble up, so every gesture closes exactly once. The drawing surface and its
// toolbar stop their own clicks.
export default function ImageViewer({
  image,
  annotation = null,
  onClose,
}: ImageViewerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [drawing, setDrawing] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const drawingActive = Boolean(drawing && annotation);

  const stopDrawing = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setDrawing(null);
  }, []);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    []
  );

  useEffect(() => {
    panelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (drawingActive) stopDrawing();
      else onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawingActive, onClose, stopDrawing]);

  async function startDrawing() {
    if (!annotation || preparing) return;

    setPreparing(true);
    setError(null);
    try {
      const blob = await annotation.loadSource();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setDrawing(url);
    } catch (nextError) {
      setError(toMessage(nextError));
    } finally {
      setPreparing(false);
    }
  }

  function handleTap(event: MouseEvent<HTMLDivElement>) {
    if (drawingActive) return;
    event.preventDefault();
    onClose();
  }

  async function saveDrawing(file: File): Promise<boolean> {
    if (!annotation) return false;
    const saved = await annotation.save(file);
    if (saved) onClose();
    return saved;
  }

  return (
    <div
      ref={panelRef}
      className={`image-viewer${drawingActive ? " drawing" : ""}`}
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
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        ×
      </button>

      {drawing && annotation ? (
        <ImageDraw
          src={drawing}
          alt={image.alt || "Image to annotate"}
          fileName={annotation.fileName}
          mimeType={annotation.mimeType}
          onCancel={stopDrawing}
          onSave={saveDrawing}
        />
      ) : (
        <>
          <img className="image-viewer-img" src={image.src} alt={image.alt} />
          {annotation ? (
            <div
              className="image-viewer-menu"
              onClick={(event) => event.stopPropagation()}
            >
              {error ? (
                <p className="image-viewer-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                className="image-viewer-action"
                onClick={() => void startDrawing()}
                disabled={preparing}
              >
                {preparing ? "Preparing…" : "Draw"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
