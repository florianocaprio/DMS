import { db, appSettingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export const DOSSIER_LEVEL_COLORS_SETTING_KEY = "dossier_level_colors";

export const DOSSIER_LEVEL_KEYS = ["1", "2", "3", "4"] as const;

export type DossierLevelKey = (typeof DOSSIER_LEVEL_KEYS)[number];

export type DossierLevelColor = {
  background: string;
  foreground: string;
};

export type DossierLevelColors = Record<DossierLevelKey, DossierLevelColor>;

export const DEFAULT_DOSSIER_LEVEL_COLORS: DossierLevelColors = {
  "1": { background: "#E3F2FD", foreground: "#0D47A1" },
  "2": { background: "#E8F5E9", foreground: "#1B5E20" },
  "3": { background: "#FFF8E1", foreground: "#7A4F00" },
  "4": { background: "#FCE4EC", foreground: "#880E4F" },
};

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export class DossierLevelColorsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DossierLevelColorsError";
  }
}

function normalizeHexColor(value: unknown, label: string): string {
  if (typeof value !== "string" || !HEX_COLOR_RE.test(value.trim())) {
    throw new DossierLevelColorsError(`${label} deve essere un colore esadecimale #RGB o #RRGGBB.`);
  }

  const color = value.trim();
  if (color.length === 4) {
    const [, r, g, b] = color;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return color.toUpperCase();
}

export function normalizeDossierLevelColors(input: unknown): DossierLevelColors {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DossierLevelColorsError("Configurazione colori livelli fascicolo non valida.");
  }

  const source = input as Record<string, unknown>;
  const normalized = {} as DossierLevelColors;

  for (const level of DOSSIER_LEVEL_KEYS) {
    const value = source[level];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new DossierLevelColorsError(`Configurazione livello ${level} mancante o non valida.`);
    }

    const color = value as Record<string, unknown>;
    normalized[level] = {
      background: normalizeHexColor(color.background, `Sfondo livello ${level}`),
      foreground: normalizeHexColor(color.foreground, `Testo livello ${level}`),
    };
  }

  return normalized;
}

export function normalizeDossierLevelColorsSettingValue(value: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new DossierLevelColorsError("Configurazione colori livelli fascicolo non è JSON valido.");
  }
  return JSON.stringify(normalizeDossierLevelColors(parsed));
}

export function parseStoredDossierLevelColors(value: string | null | undefined): DossierLevelColors {
  if (!value) return DEFAULT_DOSSIER_LEVEL_COLORS;
  try {
    return normalizeDossierLevelColors(JSON.parse(value));
  } catch {
    return DEFAULT_DOSSIER_LEVEL_COLORS;
  }
}

export async function loadDossierLevelColors(): Promise<DossierLevelColors> {
  const [row] = await db
    .select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, DOSSIER_LEVEL_COLORS_SETTING_KEY))
    .limit(1);

  return parseStoredDossierLevelColors(row?.value);
}

export async function saveDossierLevelColors(input: unknown): Promise<DossierLevelColors> {
  const config = normalizeDossierLevelColors(input);
  const value = JSON.stringify(config);

  await db.execute(
    sql`INSERT INTO app_settings (key, value, updated_at)
        VALUES (${DOSSIER_LEVEL_COLORS_SETTING_KEY}, ${value}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()`,
  );

  return config;
}

export async function resetDossierLevelColors(): Promise<void> {
  await db
    .delete(appSettingsTable)
    .where(eq(appSettingsTable.key, DOSSIER_LEVEL_COLORS_SETTING_KEY));
}
