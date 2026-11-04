export type PaletteId = "sage" | "sepia" | "ocean" | "rose" | "slate";

export interface PaletteOption {
  id: PaletteId;
  label: string;
}

export const PALETTES: PaletteOption[] = [
  { id: "sage", label: "Sage" },
  { id: "sepia", label: "Sepia" },
  { id: "ocean", label: "Ocean" },
  { id: "rose", label: "Rose" },
  { id: "slate", label: "Slate" },
];

export const DEFAULT_PALETTE: PaletteId = "sage";

export const PALETTE_STORAGE_KEY = "folio.palette";

export function isPaletteId(value: unknown): value is PaletteId {
  return (
    typeof value === "string" &&
    PALETTES.some((palette) => palette.id === value)
  );
}

export function readPalette(
  storage: Pick<Storage, "getItem"> = localStorage
): PaletteId {
  try {
    const value = storage.getItem(PALETTE_STORAGE_KEY);
    if (isPaletteId(value)) return value;
  } catch {
    return DEFAULT_PALETTE;
  }
  return DEFAULT_PALETTE;
}

export function persistPalette(
  id: PaletteId,
  storage: Pick<Storage, "setItem"> = localStorage
): void {
  try {
    storage.setItem(PALETTE_STORAGE_KEY, id);
  } catch {
    return;
  }
}

export function applyPalette(
  id: PaletteId,
  root: HTMLElement = document.documentElement
): void {
  root.dataset.palette = id;
}
