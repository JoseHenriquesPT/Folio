export interface ViewerImage {
  src: string;
  alt: string;
}

// Resolves a click target to the note image it should open in the viewer.
// Only images inside the note body qualify; attachment thumbnails and
// anything outside the editor are ignored.
export function imageFromClick(
  target: EventTarget | null
): ViewerImage | null {
  if (!(target instanceof HTMLImageElement)) return null;
  if (!target.closest(".tiptap")) return null;

  const src = target.getAttribute("src");
  if (!src) return null;

  return { src, alt: target.getAttribute("alt") ?? "" };
}
