import { useEffect, useState } from "react";

export const DOSSIER_LEVEL_COLORS_SETTING_KEY = "dossier_level_colors";

export const DOSSIER_VISIBLE_LEVELS = [1, 2, 3, 4] as const;

export type DossierVisibleLevel = (typeof DOSSIER_VISIBLE_LEVELS)[number];

export type DossierLevelColor = {
  background: string;
  foreground: string;
};

export type DossierLevelColors = Record<DossierVisibleLevel, DossierLevelColor>;

export const DEFAULT_DOSSIER_LEVEL_COLORS: DossierLevelColors = {
  1: { background: "#E3F2FD", foreground: "#0D47A1" },
  2: { background: "#E8F5E9", foreground: "#1B5E20" },
  3: { background: "#FFF8E1", foreground: "#7A4F00" },
  4: { background: "#FCE4EC", foreground: "#880E4F" },
};

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function cloneDefaultDossierLevelColors(): DossierLevelColors {
  return {
    1: { ...DEFAULT_DOSSIER_LEVEL_COLORS[1] },
    2: { ...DEFAULT_DOSSIER_LEVEL_COLORS[2] },
    3: { ...DEFAULT_DOSSIER_LEVEL_COLORS[3] },
    4: { ...DEFAULT_DOSSIER_LEVEL_COLORS[4] },
  };
}

export function normalizeHexColor(value: string): string | null {
  const color = value.trim();
  if (!HEX_COLOR_RE.test(color)) return null;
  if (color.length === 4) {
    const [, r, g, b] = color;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return color.toUpperCase();
}

function parseLevelColor(value: unknown, fallback: DossierLevelColor): DossierLevelColor {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const source = value as Record<string, unknown>;
  const background = typeof source.background === "string" ? normalizeHexColor(source.background) : null;
  const foreground = typeof source.foreground === "string" ? normalizeHexColor(source.foreground) : null;
  return {
    background: background ?? fallback.background,
    foreground: foreground ?? fallback.foreground,
  };
}

export function parseDossierLevelColors(input: unknown): DossierLevelColors {
  if (!input) return cloneDefaultDossierLevelColors();

  let source: unknown = input;
  if (typeof input === "string") {
    try {
      source = JSON.parse(input) as unknown;
    } catch {
      return cloneDefaultDossierLevelColors();
    }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return cloneDefaultDossierLevelColors();
  }

  const record = source as Record<string, unknown>;
  return {
    1: parseLevelColor(record["1"], DEFAULT_DOSSIER_LEVEL_COLORS[1]),
    2: parseLevelColor(record["2"], DEFAULT_DOSSIER_LEVEL_COLORS[2]),
    3: parseLevelColor(record["3"], DEFAULT_DOSSIER_LEVEL_COLORS[3]),
    4: parseLevelColor(record["4"], DEFAULT_DOSSIER_LEVEL_COLORS[4]),
  };
}

export function validateDossierLevelColors(config: DossierLevelColors): string[] {
  const errors: string[] = [];
  for (const level of DOSSIER_VISIBLE_LEVELS) {
    if (!normalizeHexColor(config[level].background)) {
      errors.push(`Sfondo livello ${level}: usa un colore #RGB o #RRGGBB.`);
    }
    if (!normalizeHexColor(config[level].foreground)) {
      errors.push(`Testo livello ${level}: usa un colore #RGB o #RRGGBB.`);
    }
  }
  return errors;
}

export function normalizeDossierLevelColors(config: DossierLevelColors): DossierLevelColors {
  return {
    1: {
      background: normalizeHexColor(config[1].background) ?? DEFAULT_DOSSIER_LEVEL_COLORS[1].background,
      foreground: normalizeHexColor(config[1].foreground) ?? DEFAULT_DOSSIER_LEVEL_COLORS[1].foreground,
    },
    2: {
      background: normalizeHexColor(config[2].background) ?? DEFAULT_DOSSIER_LEVEL_COLORS[2].background,
      foreground: normalizeHexColor(config[2].foreground) ?? DEFAULT_DOSSIER_LEVEL_COLORS[2].foreground,
    },
    3: {
      background: normalizeHexColor(config[3].background) ?? DEFAULT_DOSSIER_LEVEL_COLORS[3].background,
      foreground: normalizeHexColor(config[3].foreground) ?? DEFAULT_DOSSIER_LEVEL_COLORS[3].foreground,
    },
    4: {
      background: normalizeHexColor(config[4].background) ?? DEFAULT_DOSSIER_LEVEL_COLORS[4].background,
      foreground: normalizeHexColor(config[4].foreground) ?? DEFAULT_DOSSIER_LEVEL_COLORS[4].foreground,
    },
  };
}

export function getDossierVisibleLevel(depth: number | null | undefined): DossierVisibleLevel {
  const numericDepth = Number.isFinite(depth) ? Number(depth) : 0;
  const level = Math.max(1, Math.floor(numericDepth) + 1);
  return Math.min(level, 4) as DossierVisibleLevel;
}

export function getDossierLevelColor(
  colors: DossierLevelColors,
  depth: number | null | undefined,
): DossierLevelColor {
  return colors[getDossierVisibleLevel(depth)];
}

function hexToRgb(color: string): [number, number, number] | null {
  const normalized = normalizeHexColor(color);
  if (!normalized) return null;
  const raw = normalized.slice(1);
  return [
    Number.parseInt(raw.slice(0, 2), 16),
    Number.parseInt(raw.slice(2, 4), 16),
    Number.parseInt(raw.slice(4, 6), 16),
  ];
}

function channelLuminance(value: number) {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(background: string, foreground: string): number | null {
  const bg = hexToRgb(background);
  const fg = hexToRgb(foreground);
  if (!bg || !fg) return null;

  const bgLum = 0.2126 * channelLuminance(bg[0]) + 0.7152 * channelLuminance(bg[1]) + 0.0722 * channelLuminance(bg[2]);
  const fgLum = 0.2126 * channelLuminance(fg[0]) + 0.7152 * channelLuminance(fg[1]) + 0.0722 * channelLuminance(fg[2]);
  const lighter = Math.max(bgLum, fgLum);
  const darker = Math.min(bgLum, fgLum);
  return (lighter + 0.05) / (darker + 0.05);
}

export function useDossierLevelColors(): DossierLevelColors {
  const [colors, setColors] = useState<DossierLevelColors>(() => cloneDefaultDossierLevelColors());

  useEffect(() => {
    let cancelled = false;

    fetch("/api/settings/dossier-level-colors")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load dossier level colors");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setColors(parseDossierLevelColors(data));
      })
      .catch(() => {
        if (!cancelled) setColors(cloneDefaultDossierLevelColors());
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return colors;
}
