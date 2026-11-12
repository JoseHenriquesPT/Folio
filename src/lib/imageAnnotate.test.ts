import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANNOTATION_COLORS,
  ANNOTATION_PEN_SIZES,
  annotationOutput,
  annotationStrokeWidth,
  createAnnotationFile,
  drawStrokes,
  imagePointFromPointer,
  type AnnotationStroke,
  type StrokeContext,
} from "./imageAnnotate";

function stroke(overrides: Partial<AnnotationStroke> = {}): AnnotationStroke {
  return {
    color: "#e5484d",
    width: 8,
    points: [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 10 },
    ],
    ...overrides,
  };
}

function fakeContext() {
  return {
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    lineCap: "butt" as CanvasLineCap,
    lineJoin: "miter" as CanvasLineJoin,
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    drawImage: vi.fn(),
  } satisfies StrokeContext;
}

const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalToBlob = HTMLCanvasElement.prototype.toBlob;

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  if (originalToBlob) {
    HTMLCanvasElement.prototype.toBlob = originalToBlob;
  } else {
    delete (HTMLCanvasElement.prototype as { toBlob?: unknown }).toBlob;
  }
});

function stubCanvas(blob: Blob | null) {
  const context = fakeContext();
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => context
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = vi.fn((callback: BlobCallback) => {
    callback(blob);
  }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;
  return context;
}

describe("annotationOutput", () => {
  it("keeps JPEGs as JPEG", () => {
    expect(annotationOutput("photo.jpg", "image/jpeg")).toEqual({
      fileName: "photo (annotated).jpg",
      mimeType: "image/jpeg",
    });
  });

  it("turns every other image into a PNG", () => {
    expect(annotationOutput("chart.png", "image/png")).toEqual({
      fileName: "chart (annotated).png",
      mimeType: "image/png",
    });
    expect(annotationOutput("loops.gif", "image/gif").mimeType).toBe("image/png");
    expect(annotationOutput("shot.webp", "image/webp").fileName).toBe(
      "shot (annotated).png"
    );
  });

  it("handles a missing extension and a path in the name", () => {
    expect(annotationOutput("diagram", "image/png").fileName).toBe(
      "diagram (annotated).png"
    );
    expect(annotationOutput("folder/photo.jpeg", "image/jpeg").fileName).toBe(
      "folder/photo (annotated).jpg"
    );
  });
});

describe("annotationStrokeWidth", () => {
  it("scales the pen with the image so the same size reads everywhere", () => {
    const small = annotationStrokeWidth(300, 200, "medium");
    const large = annotationStrokeWidth(3_000, 2_000, "medium");

    expect(large).toBeGreaterThan(small);
  });

  it("orders thin below medium below thick", () => {
    const thin = annotationStrokeWidth(1_000, 800, "thin");
    const medium = annotationStrokeWidth(1_000, 800, "medium");
    const thick = annotationStrokeWidth(1_000, 800, "thick");

    expect(thin).toBeLessThan(medium);
    expect(medium).toBeLessThan(thick);
  });

  it("keeps pens visible on tiny images and bounded on huge ones", () => {
    expect(annotationStrokeWidth(10, 10, "thin")).toBeGreaterThanOrEqual(2);
    expect(annotationStrokeWidth(20_000, 10_000, "thick")).toBeLessThanOrEqual(
      40
    );
  });

  it("offers the palette and the three pen sizes the toolbar uses", () => {
    expect(ANNOTATION_COLORS).toHaveLength(5);
    expect(ANNOTATION_PEN_SIZES.map((size) => size.value)).toEqual([
      "thin",
      "medium",
      "thick",
    ]);
  });
});

describe("imagePointFromPointer", () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 };

  it("maps a point from the screen onto the full-size image", () => {
    expect(imagePointFromPointer(300, 150, rect, 2_000, 1_000)).toEqual({
      x: 1_000,
      y: 500,
    });
  });

  it("clamps a dragged pointer to the image edges", () => {
    expect(imagePointFromPointer(10, 10, rect, 2_000, 1_000)).toEqual({
      x: 0,
      y: 0,
    });
    expect(imagePointFromPointer(900, 900, rect, 2_000, 1_000)).toEqual({
      x: 2_000,
      y: 1_000,
    });
  });

  it("ignores a stage that has not been laid out yet", () => {
    expect(
      imagePointFromPointer(10, 10, { ...rect, width: 0 }, 2_000, 1_000)
    ).toBeNull();
    expect(imagePointFromPointer(10, 10, rect, 0, 1_000)).toBeNull();
  });
});

describe("drawStrokes", () => {
  it("draws each stroke as a round-capped line in its own color", () => {
    const context = fakeContext();
    const first = stroke();
    const second = stroke({ color: "#2f6fed", width: 12 });

    drawStrokes(context, [first, second]);

    expect(context.beginPath).toHaveBeenCalledTimes(2);
    expect(context.moveTo).toHaveBeenNthCalledWith(1, 10, 20);
    expect(context.lineTo).toHaveBeenNthCalledWith(1, 30, 40);
    expect(context.lineTo).toHaveBeenNthCalledWith(2, 50, 10);
    expect(context.lineWidth).toBe(12);
    expect(context.strokeStyle).toBe("#2f6fed");
    expect(context.lineCap).toBe("round");
    expect(context.lineJoin).toBe("round");
    expect(context.stroke).toHaveBeenCalledTimes(2);
  });

  it("stamps a single tap as a dot", () => {
    const context = fakeContext();

    drawStrokes(context, [stroke({ points: [{ x: 5, y: 6 }], width: 9 })]);

    expect(context.arc).toHaveBeenCalledWith(5, 6, 4.5, 0, Math.PI * 2);
    expect(context.fillStyle).toBe("#e5484d");
    expect(context.fill).toHaveBeenCalledOnce();
    expect(context.stroke).not.toHaveBeenCalled();
  });

  it("does nothing for a stroke without points", () => {
    const context = fakeContext();

    drawStrokes(context, [stroke({ points: [] })]);

    expect(context.beginPath).not.toHaveBeenCalled();
  });
});

describe("createAnnotationFile", () => {
  const image = {} as HTMLImageElement;

  it("draws the image and the strokes at full resolution, then names the file", async () => {
    const context = stubCanvas(new Blob(["png"], { type: "image/png" }));

    const file = await createAnnotationFile(
      image,
      800,
      600,
      [stroke()],
      "photo.png",
      "image/png"
    );

    expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0, 800, 600);
    expect(file.name).toBe("photo (annotated).png");
    expect(file.type).toBe("image/png");
  });

  it("sizes the canvas to the original image", async () => {
    let canvas: HTMLCanvasElement | null = null;
    const originalCreateElement = document.createElement.bind(document);
    const createElement = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag: string) => {
        const element = originalCreateElement(tag);
        if (tag === "canvas") canvas = element as HTMLCanvasElement;
        return element;
      });
    stubCanvas(new Blob(["jpg"], { type: "image/jpeg" }));

    try {
      await createAnnotationFile(
        image,
        1_024,
        768,
        [stroke()],
        "photo.jpg",
        "image/jpeg"
      );
    } finally {
      createElement.mockRestore();
    }

    const drawn = canvas as HTMLCanvasElement | null;
    expect(drawn?.width).toBe(1_024);
    expect(drawn?.height).toBe(768);
  });

  it("rejects a drawing larger than the 20 MB attachment limit", async () => {
    const huge = new Blob(["x"], { type: "image/png" });
    Object.defineProperty(huge, "size", { value: 21 * 1024 * 1024 });
    stubCanvas(huge);

    await expect(
      createAnnotationFile(image, 400, 300, [stroke()], "shot.png", "image/png")
    ).rejects.toThrow("20 MB");
  });

  it("rejects when the browser cannot export the canvas", async () => {
    stubCanvas(null);

    await expect(
      createAnnotationFile(image, 400, 300, [stroke()], "shot.png", "image/png")
    ).rejects.toThrow("could not be exported");
  });
});
