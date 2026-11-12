import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { annotationStrokeWidth } from "../lib/imageAnnotate";
import ImageDraw from "./ImageDraw";

// jsdom has no PointerEvent, so fireEvent would fall back to a plain Event and
// drop clientX/clientY. A MouseEvent-based stand-in keeps the pointer coordinates.
if (typeof window.PointerEvent === "undefined") {
  class TestPointerEvent extends MouseEvent {
    readonly pointerId: number;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }

  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    writable: true,
    value: TestPointerEvent,
  });
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
  const context = {
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
  };

  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => context
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = vi.fn((callback: BlobCallback) => {
    callback(blob);
  }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;

  return context;
}

function renderDraw(overrides: {
  fileName?: string;
  mimeType?: string;
  onSave?: (file: File) => Promise<boolean>;
  onCancel?: () => void;
} = {}) {
  const onSave = overrides.onSave ?? vi.fn(async () => true);
  const onCancel = overrides.onCancel ?? vi.fn();
  const view = render(
    <ImageDraw
      src="blob:image"
      alt="A chart"
      fileName={overrides.fileName ?? "photo.png"}
      mimeType={overrides.mimeType ?? "image/png"}
      onCancel={onCancel}
      onSave={onSave}
    />
  );

  const image = screen.getByAltText("A chart") as HTMLImageElement;
  Object.defineProperty(image, "naturalWidth", {
    configurable: true,
    value: 400,
  });
  Object.defineProperty(image, "naturalHeight", {
    configurable: true,
    value: 300,
  });
  fireEvent.load(image);

  const area = screen.getByRole("group", { name: "Drawing area" });
  area.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 400,
      height: 300,
      right: 400,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;

  return { ...view, image, area, onSave, onCancel };
}

function drawLine(area: Element) {
  fireEvent.pointerDown(area, {
    clientX: 100,
    clientY: 100,
    pointerId: 1,
    buttons: 1,
  });
  fireEvent.pointerMove(area, {
    clientX: 200,
    clientY: 150,
    pointerId: 1,
    buttons: 1,
  });
  fireEvent.pointerUp(area, {
    clientX: 200,
    clientY: 150,
    pointerId: 1,
  });
}

describe("ImageDraw", () => {
  it("draws a stroke where the pointer moves", () => {
    const { area } = renderDraw();

    drawLine(area);

    const line = area.querySelector("polyline");
    expect(line?.getAttribute("points")).toBe("100,100 200,150");
    expect(line?.getAttribute("stroke")).toBe("#e5484d");
  });

  it("stamps a tap as a dot", () => {
    const { area } = renderDraw();

    fireEvent.pointerDown(area, { clientX: 50, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(area, { clientX: 50, clientY: 60, pointerId: 1 });

    const dot = area.querySelector("circle");
    expect(dot?.getAttribute("cx")).toBe("50");
    expect(dot?.getAttribute("cy")).toBe("60");
  });

  it("undoes the last stroke and clears them all", async () => {
    const { area } = renderDraw();

    drawLine(area);
    expect(area.querySelectorAll("polyline")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(area.querySelector("polyline")).toBeNull();

    drawLine(area);
    drawLine(area);
    expect(area.querySelectorAll("polyline")).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(area.querySelector("polyline")).toBeNull();
  });

  it("changes the pen color and thickness", async () => {
    const { area } = renderDraw();

    await userEvent.click(screen.getByRole("button", { name: "Blue pen" }));
    await userEvent.click(screen.getByRole("button", { name: "Thick pen" }));
    drawLine(area);

    const line = area.querySelector("polyline");
    expect(line?.getAttribute("stroke")).toBe("#2f6fed");
    expect(Number(line?.getAttribute("stroke-width"))).toBe(
      annotationStrokeWidth(400, 300, "thick")
    );
  });

  it("cannot save before anything is drawn", () => {
    renderDraw();

    expect(
      screen.getByRole("button", { name: "Save drawing" }).hasAttribute("disabled")
    ).toBe(true);
  });

  it("exports the drawing at full size with the annotated name", async () => {
    const context = stubCanvas(new Blob(["png"], { type: "image/png" }));
    const { area, onSave } = renderDraw();
    drawLine(area);

    await userEvent.click(
      screen.getByRole("button", { name: "Save drawing" })
    );

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const file = (onSave as ReturnType<typeof vi.fn>).mock.calls[0]![0] as File;
    expect(file.name).toBe("photo (annotated).png");
    expect(file.type).toBe("image/png");
    expect(context.drawImage).toHaveBeenCalledWith(
      expect.any(HTMLImageElement),
      0,
      0,
      400,
      300
    );
  });

  it("keeps JPEG photos as JPEG", async () => {
    stubCanvas(new Blob(["jpg"], { type: "image/jpeg" }));
    const { area, onSave } = renderDraw({
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
    });
    drawLine(area);

    await userEvent.click(
      screen.getByRole("button", { name: "Save drawing" })
    );

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const file = (onSave as ReturnType<typeof vi.fn>).mock.calls[0]![0] as File;
    expect(file.name).toBe("photo (annotated).jpg");
    expect(file.type).toBe("image/jpeg");
  });

  it("shows an error when the save action fails", async () => {
    stubCanvas(new Blob(["png"], { type: "image/png" }));
    const onSave = vi.fn(async () => false);
    const { area } = renderDraw({ onSave });
    drawLine(area);

    await userEvent.click(
      screen.getByRole("button", { name: "Save drawing" })
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not save the drawing."
    );
  });

  it("cancels back to the viewer", async () => {
    const { onCancel } = renderDraw();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
