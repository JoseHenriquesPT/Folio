const EDITABLE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/**
 * Folio draws its own menus: the browser's long-press and right-click box
 * looks like the OS and cannot be styled. Everything the user might want to
 * type into, copy from, or save keeps the native menu, as does Shift+click.
 */
export function shouldSuppressContextMenu(
  target: EventTarget | null,
  shiftKey = false
): boolean {
  if (shiftKey) return false;
  if (!(target instanceof Element)) return false;
  if (target.closest("img")) return false;
  if (target.closest(EDITABLE)) return false;
  if (target.closest(".ProseMirror")) return false;
  return true;
}
