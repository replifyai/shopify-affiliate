/**
 * Canonical schema + defaults for the storefront popup configuration.
 *
 * Stored as an app-owned shop metafield (namespace `$app`, key `popup_config`,
 * type `json`) and read by the theme app embed via
 * `shop.metafields["$app"].popup_config.value`.
 *
 * The theme embed asset (extensions/affiliate-tracking-embed/assets/app-embed.js)
 * carries its own copy of these defaults because extension assets cannot import
 * app modules — keep both in sync.
 */

export type PopupFontFamily = "inherit" | "system" | "serif" | "mono";

export interface PopupConfig {
  version: 1;
  popupEnabled: boolean;
  returnBannerEnabled: boolean;
  showDiscountCode: boolean;
  ctaLabel: string;
  typography: {
    fontFamily: PopupFontFamily;
    headlineSize: number;
    bodySize: number;
  };
  colors: {
    background: string;
    /** Empty string = inherit the theme's text color. */
    text: string;
    button: string;
    buttonText: string;
  };
  borderRadius: number;
}

export const DEFAULT_POPUP_CONFIG: PopupConfig = {
  version: 1,
  popupEnabled: true,
  returnBannerEnabled: true,
  showDiscountCode: true,
  ctaLabel: "Shop Now",
  typography: {
    fontFamily: "inherit",
    headlineSize: 15,
    bodySize: 13,
  },
  colors: {
    background: "#ffffff",
    text: "",
    button: "#111111",
    buttonText: "#ffffff",
  },
  borderRadius: 16,
};

export const POPUP_CONFIG_LIMITS = {
  headlineSize: { min: 12, max: 28 },
  bodySize: { min: 10, max: 20 },
  borderRadius: { min: 0, max: 32 },
  ctaLabelMaxLength: 40,
} as const;

export const FONT_FAMILY_CSS: Record<PopupFontFamily, string> = {
  inherit: "inherit",
  system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

export const FONT_FAMILY_OPTIONS: Array<{ value: PopupFontFamily; label: string }> = [
  { value: "inherit", label: "Theme font (inherit)" },
  { value: "system", label: "System sans-serif" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Monospace" },
];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function clampNumber(raw: unknown, min: number, max: number, fallback: number): number {
  const value = typeof raw === "string" ? Number(raw) : raw;
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function hexColor(raw: unknown, fallback: string): string {
  return typeof raw === "string" && HEX_COLOR.test(raw) ? raw.toLowerCase() : fallback;
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

/**
 * Deep-merge an untrusted value onto the defaults, clamping numbers,
 * validating colors, and dropping unknown keys. Used on both read (tolerate
 * old/corrupt metafield values) and write (never persist garbage).
 */
export function normalizePopupConfig(raw: unknown): PopupConfig {
  const root = asRecord(raw);
  const typography = asRecord(root.typography);
  const colors = asRecord(root.colors);
  const defaults = DEFAULT_POPUP_CONFIG;
  const limits = POPUP_CONFIG_LIMITS;

  const fontFamily = FONT_FAMILY_OPTIONS.some((o) => o.value === typography.fontFamily)
    ? (typography.fontFamily as PopupFontFamily)
    : defaults.typography.fontFamily;

  const ctaLabel =
    typeof root.ctaLabel === "string" && root.ctaLabel.trim()
      ? root.ctaLabel.trim().slice(0, limits.ctaLabelMaxLength)
      : defaults.ctaLabel;

  return {
    version: 1,
    popupEnabled:
      typeof root.popupEnabled === "boolean" ? root.popupEnabled : defaults.popupEnabled,
    returnBannerEnabled:
      typeof root.returnBannerEnabled === "boolean"
        ? root.returnBannerEnabled
        : defaults.returnBannerEnabled,
    showDiscountCode:
      typeof root.showDiscountCode === "boolean"
        ? root.showDiscountCode
        : defaults.showDiscountCode,
    ctaLabel,
    typography: {
      fontFamily,
      headlineSize: clampNumber(
        typography.headlineSize,
        limits.headlineSize.min,
        limits.headlineSize.max,
        defaults.typography.headlineSize,
      ),
      bodySize: clampNumber(
        typography.bodySize,
        limits.bodySize.min,
        limits.bodySize.max,
        defaults.typography.bodySize,
      ),
    },
    colors: {
      background: hexColor(colors.background, defaults.colors.background),
      text: hexColor(colors.text, ""),
      button: hexColor(colors.button, defaults.colors.button),
      buttonText: hexColor(colors.buttonText, defaults.colors.buttonText),
    },
    borderRadius: clampNumber(
      root.borderRadius,
      limits.borderRadius.min,
      limits.borderRadius.max,
      defaults.borderRadius,
    ),
  };
}

/** Build a PopupConfig from the settings form submission. */
export function popupConfigFromFormData(form: FormData): PopupConfig {
  return normalizePopupConfig({
    version: 1,
    popupEnabled: form.get("popupEnabled") === "on",
    returnBannerEnabled: form.get("returnBannerEnabled") === "on",
    showDiscountCode: form.get("showDiscountCode") === "on",
    ctaLabel: form.get("ctaLabel"),
    typography: {
      fontFamily: form.get("fontFamily"),
      headlineSize: form.get("headlineSize"),
      bodySize: form.get("bodySize"),
    },
    colors: {
      background: form.get("backgroundColor"),
      text: form.get("textColorMode") === "custom" ? form.get("textColor") : "",
      button: form.get("buttonColor"),
      buttonText: form.get("buttonTextColor"),
    },
    borderRadius: form.get("borderRadius"),
  });
}
