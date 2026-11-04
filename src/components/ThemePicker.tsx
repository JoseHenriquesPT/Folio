import { PALETTES, type PaletteId } from "../lib/palette";
import type { ThemeMode } from "../lib/theme";

const MODE_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export interface ThemePickerProps {
  mode: ThemeMode;
  palette: PaletteId;
  onModeChange: (mode: ThemeMode) => void;
  onPaletteChange: (palette: PaletteId) => void;
}

/**
 * The shared appearance picker: light/dark/system mode plus a color palette.
 * Presentational; the caller owns the state (Settings and the sidebar popover).
 */
export default function ThemePicker({
  mode,
  palette,
  onModeChange,
  onPaletteChange,
}: ThemePickerProps) {
  return (
    <div className="theme-picker">
      <div className="segmented" role="group" aria-label="Mode">
        {MODE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={mode === option.value}
            className={mode === option.value ? "active" : ""}
            onClick={() => onModeChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="theme-swatches" role="group" aria-label="Color theme">
        {PALETTES.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`theme-swatch-button${palette === option.id ? " active" : ""}`}
            aria-pressed={palette === option.id}
            onClick={() => onPaletteChange(option.id)}
          >
            <span
              className="theme-swatch"
              data-palette={option.id}
              aria-hidden="true"
            />
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
