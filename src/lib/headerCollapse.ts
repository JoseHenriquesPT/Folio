// Decides whether the title/status/tags header stays visible while the note
// body scrolls. The header collapses only when the user actively scrolls down
// past the fold; any upward scroll or a position near the top brings it back.
// While the header holds focus (the title or tag picker), it never hides, so
// a focused control is never yanked away mid-interaction.

export const HEADER_COLLAPSE_AFTER_PX = 80;

export function decideHeaderCollapse(
  scrollTop: number,
  wasCollapsed: boolean,
  delta: number,
  headerHasFocus: boolean
): boolean {
  if (headerHasFocus) return false;
  if (scrollTop <= HEADER_COLLAPSE_AFTER_PX) return false;
  if (delta > 0) return true;
  if (delta < 0) return false;
  return wasCollapsed;
}
