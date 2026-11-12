import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ANNOTATION_COLORS,
  ANNOTATION_PEN_SIZES,
  annotationStrokeWidth,
  createAnnotationFile,
  imagePointFromPointer,
  type AnnotationPenSize,
  type AnnotationStroke,
  type ImagePoint,
} from "../lib/imageAnnotate";
import { toMessage } from "../lib/errors";

interface ImageDrawProps {
  src: string;
  alt: string;
  fileName: string;
  mimeType: string;
  onCancel: () => void;
  /** Resolves true when the annotated copy has been stored. */
  onSave: (file: File) => Promise<boolean>;
}

interface NaturalSize {
  width: number;
  height: number;
}

function StrokeShape({ stroke }: { stroke: AnnotationStroke }) {
  if (stroke.points.length === 0) return null;

  if (stroke.points.length === 1) {
    const point = stroke.points[0]!;
    return (
      <circle
        cx={point.x}
        cy={point.y}
        r={stroke.width / 2}
        fill={stroke.color}
      />
    );
  }

  return (
    <polyline
      points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")}
      fill="none"
      stroke={stroke.color}
      strokeWidth={stroke.width}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/**
 * Full-size drawing surface for the image viewer. Strokes are kept in the
 * image's own pixel coordinates and shown through an SVG overlay, so the live
 * drawing and the exported bitmap always agree.
 */
export default function ImageDraw({
  src,
  alt,
  fileName,
  mimeType,
  onCancel,
  onSave,
}: ImageDrawProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const currentRef = useRef<AnnotationStroke | null>(null);
  const [natural, setNatural] = useState<NaturalSize | null>(null);
  const [strokes, setStrokes] = useState<AnnotationStroke[]>([]);
  const [current, setCurrent] = useState<AnnotationStroke | null>(null);
  const [color, setColor] = useState(ANNOTATION_COLORS[0]!.value);
  const [penSize, setPenSize] = useState<AnnotationPenSize>("medium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleImageLoad() {
    const image = imageRef.current;
    if (!image || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
    setNatural({ width: image.naturalWidth, height: image.naturalHeight });
  }

  function pointFrom(
    event: ReactPointerEvent<SVGSVGElement>
  ): ImagePoint | null {
    if (!natural) return null;
    return imagePointFromPointer(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      natural.width,
      natural.height
    );
  }

  function startStroke(event: ReactPointerEvent<SVGSVGElement>) {
    // Some environments report no button for a primary press; only a
    // secondary or auxiliary button should be ignored.
    if (!natural || saving || event.button > 0) return;
    const point = pointFrom(event);
    if (!point) return;

    event.preventDefault();
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    const next: AnnotationStroke = {
      color,
      width: annotationStrokeWidth(natural.width, natural.height, penSize),
      points: [point],
    };
    currentRef.current = next;
    setCurrent(next);
  }

  function extendStroke(event: ReactPointerEvent<SVGSVGElement>) {
    if (!currentRef.current) return;
    const point = pointFrom(event);
    if (!point) return;

    event.preventDefault();
    const next: AnnotationStroke = {
      ...currentRef.current,
      points: [...currentRef.current.points, point],
    };
    currentRef.current = next;
    setCurrent(next);
  }

  function finishStroke(event: ReactPointerEvent<SVGSVGElement>) {
    const finished = currentRef.current;
    if (!finished) return;

    if (
      typeof event.currentTarget.releasePointerCapture === "function" &&
      event.currentTarget.hasPointerCapture?.(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    currentRef.current = null;
    setCurrent(null);
    setStrokes((all) => [...all, finished]);
  }

  function undo() {
    setStrokes((all) => all.slice(0, -1));
  }

  function clear() {
    setStrokes([]);
  }

  async function save() {
    const image = imageRef.current;
    if (!image || !natural || strokes.length === 0 || saving) return;

    setSaving(true);
    setError(null);
    try {
      const file = await createAnnotationFile(
        image,
        natural.width,
        natural.height,
        strokes,
        fileName,
        mimeType
      );
      const saved = await onSave(file);
      if (!saved) setError("Could not save the drawing.");
    } catch (nextError) {
      setError(toMessage(nextError));
    } finally {
      setSaving(false);
    }
  }

  const visible = current ? [...strokes, current] : strokes;

  return (
    <div className="image-draw" onClick={(event) => event.stopPropagation()}>
      <div className="image-draw-stage">
        <img
          ref={imageRef}
          className="image-viewer-img"
          src={src}
          alt={alt}
          draggable={false}
          onLoad={handleImageLoad}
        />
        <svg
          className="image-draw-layer"
          viewBox={natural ? `0 0 ${natural.width} ${natural.height}` : "0 0 1 1"}
          preserveAspectRatio="none"
          role="group"
          aria-label="Drawing area"
          aria-describedby="image-draw-hint"
          onPointerDown={startStroke}
          onPointerMove={extendStroke}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        >
          {visible.map((stroke, index) => (
            <StrokeShape key={index} stroke={stroke} />
          ))}
        </svg>
        <p className="sr-only" id="image-draw-hint">
          Draw on the image with a finger or mouse. Use the toolbar to change the
          pen, undo, clear, cancel, or save.
        </p>
      </div>

      {error ? (
        <p className="image-draw-error" role="alert">
          {error}
        </p>
      ) : null}

      <div
        className="image-draw-toolbar"
        role="toolbar"
        aria-label="Drawing tools"
      >
        <div className="image-draw-group" role="group" aria-label="Pen color">
          {ANNOTATION_COLORS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`image-draw-swatch${
                color === option.value ? " active" : ""
              }`}
              style={{ backgroundColor: option.value }}
              aria-label={`${option.name} pen`}
              aria-pressed={color === option.value}
              onClick={() => setColor(option.value)}
            />
          ))}
        </div>

        <div className="image-draw-group" role="group" aria-label="Pen size">
          {ANNOTATION_PEN_SIZES.map((option, index) => (
            <button
              key={option.value}
              type="button"
              className={`image-draw-size${
                penSize === option.value ? " active" : ""
              }`}
              aria-label={option.name}
              aria-pressed={penSize === option.value}
              onClick={() => setPenSize(option.value)}
            >
              <span
                style={{
                  width: `${4 + index * 4}px`,
                  height: `${4 + index * 4}px`,
                }}
              />
            </button>
          ))}
        </div>

        <span className="image-draw-divider" aria-hidden="true" />

        <button
          type="button"
          className="image-draw-action"
          onClick={undo}
          disabled={strokes.length === 0 || saving}
        >
          Undo
        </button>
        <button
          type="button"
          className="image-draw-action"
          onClick={clear}
          disabled={strokes.length === 0 || saving}
        >
          Clear
        </button>
        <button
          type="button"
          className="image-draw-action"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          className="image-draw-action primary"
          onClick={() => void save()}
          disabled={strokes.length === 0 || saving || !natural}
        >
          {saving ? "Saving…" : "Save drawing"}
        </button>
      </div>
    </div>
  );
}
