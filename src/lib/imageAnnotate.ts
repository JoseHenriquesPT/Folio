import { MAX_ATTACHMENT_BYTES, formatBytes } from "./attachments";

export interface ImagePoint {
  x: number;
  y: number;
}

export interface AnnotationStroke {
  color: string;
  width: number;
  points: ImagePoint[];
}

export type AnnotationPenSize = "thin" | "medium" | "thick";

export interface AnnotationColor {
  name: string;
  value: string;
}

export const ANNOTATION_COLORS: readonly AnnotationColor[] = [
  { name: "Red", value: "#e5484d" },
  { name: "Amber", value: "#f5b301" },
  { name: "Blue", value: "#2f6fed" },
  { name: "White", value: "#ffffff" },
  { name: "Black", value: "#1a1a1a" },
];

export const ANNOTATION_PEN_SIZES: readonly {
  name: string;
  value: AnnotationPenSize;
}[] = [
  { name: "Thin pen", value: "thin" },
  { name: "Medium pen", value: "medium" },
  { name: "Thick pen", value: "thick" },
];

const PEN_FACTORS: Record<AnnotationPenSize, number> = {
  thin: 0.0035,
  medium: 0.0075,
  thick: 0.015,
};

export interface AnnotationOutput {
  fileName: string;
  mimeType: "image/png" | "image/jpeg";
}

export interface ImageAnnotation {
  fileName: string;
  mimeType: string;
  loadSource: () => Promise<Blob>;
  /** Resolves true when the note now points at the annotated copy. */
  save: (file: File) => Promise<boolean>;
}

const JPEG_TYPES = new Set(["image/jpeg", "image/jpg"]);

/**
 * An annotated image becomes a new attachment so the clean original stays in
 * the note's file list. Photos keep their JPEG encoding; everything else
 * becomes a PNG.
 */
export function annotationOutput(
  fileName: string,
  mimeType: string
): AnnotationOutput {
  const jpeg = JPEG_TYPES.has(mimeType.toLowerCase());
  const dot = fileName.lastIndexOf(".");
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName).trim() || "image";

  return jpeg
    ? {
        fileName: `${base} (annotated).jpg`,
        mimeType: "image/jpeg",
      }
    : {
        fileName: `${base} (annotated).png`,
        mimeType: "image/png",
      };
}

/**
 * A pen width in the image's own pixels. A fixed screen width would draw a
 * hairline on a camera photo and a slab on a small screenshot, so the pen
 * follows the long edge of the source image.
 */
export function annotationStrokeWidth(
  imageWidth: number,
  imageHeight: number,
  size: AnnotationPenSize
): number {
  const longEdge = Math.max(imageWidth, imageHeight);
  return Math.max(2, Math.min(40, Math.round(longEdge * PEN_FACTORS[size])));
}

/**
 * Maps a pointer on the scaled-down viewer onto the full-size image. Values
 * outside the stage are clamped to its edge, because a drag can leave it while
 * the pointer is captured.
 */
export function imagePointFromPointer(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number
): ImagePoint | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  if (imageWidth <= 0 || imageHeight <= 0) return null;

  const x = ((clientX - rect.left) / rect.width) * imageWidth;
  const y = ((clientY - rect.top) / rect.height) * imageHeight;

  return {
    x: Math.max(0, Math.min(imageWidth, x)),
    y: Math.max(0, Math.min(imageHeight, y)),
  };
}

export interface StrokeContext {
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  beginPath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  stroke: () => void;
  arc: (
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number
  ) => void;
  fill: () => void;
  drawImage: (
    image: CanvasImageSource,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ) => void;
}

/** Draws the same strokes the SVG overlay shows, but at full image size. */
export function drawStrokes(
  context: StrokeContext,
  strokes: readonly AnnotationStroke[]
): void {
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;

    if (stroke.points.length === 1) {
      const point = stroke.points[0]!;
      context.fillStyle = stroke.color;
      context.beginPath();
      context.arc(point.x, point.y, stroke.width / 2, 0, Math.PI * 2);
      context.fill();
      continue;
    }

    const first = stroke.points[0]!;
    context.strokeStyle = stroke.color;
    context.lineWidth = stroke.width;
    context.beginPath();
    context.moveTo(first.x, first.y);

    for (let index = 1; index < stroke.points.length; index += 1) {
      const point = stroke.points[index]!;
      context.lineTo(point.x, point.y);
    }

    context.stroke();
  }
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  mimeType: AnnotationOutput["mimeType"]
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The drawing could not be exported."));
      },
      mimeType,
      mimeType === "image/jpeg" ? 0.92 : undefined
    );
  });
}

/**
 * Composites the original bitmap and the strokes at full resolution and wraps
 * the bytes in a File ready for the existing attachment upload flow.
 */
export async function createAnnotationFile(
  image: CanvasImageSource,
  width: number,
  height: number,
  strokes: readonly AnnotationStroke[],
  fileName: string,
  mimeType: string
): Promise<File> {
  if (width <= 0 || height <= 0) {
    throw new Error("The image has no size to draw on.");
  }

  const output = annotationOutput(fileName, mimeType);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser cannot prepare a drawing canvas.");
  }

  context.drawImage(image, 0, 0, width, height);
  drawStrokes(context, strokes);

  const blob = await canvasBlob(canvas, output.mimeType);
  if (blob.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `The annotated image is larger than the ${formatBytes(
        MAX_ATTACHMENT_BYTES
      )} limit.`
    );
  }

  return new File([blob], output.fileName, { type: output.mimeType });
}
