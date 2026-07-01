import { db, appSettingsTable } from "@workspace/db";

export interface ProtocolNumberingConfig {
  protocolNumberTemplate: string;
  protocolNumberRegex: string;
  sequencePadding: number;
  incomingPrefix: string;
  outgoingPrefix: string;
  internalPrefix: string;
  reservedPrefix: string;
}

export const DEFAULT_PROTOCOL_NUMBERING_CONFIG: ProtocolNumberingConfig = {
  protocolNumberTemplate: "AIM-{YYYY}-{TYPE}-{SEQ6}",
  protocolNumberRegex: "^AIM-\\d{4}-(E|U|I|RIS)-\\d{6}$",
  sequencePadding: 6,
  incomingPrefix: "E",
  outgoingPrefix: "U",
  internalPrefix: "I",
  reservedPrefix: "RIS",
};

const CONFIG_KEYS = Object.keys(DEFAULT_PROTOCOL_NUMBERING_CONFIG) as Array<keyof ProtocolNumberingConfig>;

export class ProtocolNumberingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolNumberingError";
  }
}

export async function loadProtocolNumberingConfig(): Promise<ProtocolNumberingConfig> {
  const rows = await db.select().from(appSettingsTable);
  const values = new Map(rows.map((row) => [row.key, row.value]));
  return normalizeProtocolNumberingConfig(Object.fromEntries(values));
}

export function normalizeProtocolNumberingConfig(input: Record<string, unknown>): ProtocolNumberingConfig {
  const cfg: ProtocolNumberingConfig = {
    protocolNumberTemplate: textValue(input.protocolNumberTemplate, DEFAULT_PROTOCOL_NUMBERING_CONFIG.protocolNumberTemplate),
    protocolNumberRegex: textValue(input.protocolNumberRegex, DEFAULT_PROTOCOL_NUMBERING_CONFIG.protocolNumberRegex),
    sequencePadding: numberValue(input.sequencePadding, DEFAULT_PROTOCOL_NUMBERING_CONFIG.sequencePadding),
    incomingPrefix: textValue(input.incomingPrefix, DEFAULT_PROTOCOL_NUMBERING_CONFIG.incomingPrefix),
    outgoingPrefix: textValue(input.outgoingPrefix, DEFAULT_PROTOCOL_NUMBERING_CONFIG.outgoingPrefix),
    internalPrefix: textValue(input.internalPrefix, DEFAULT_PROTOCOL_NUMBERING_CONFIG.internalPrefix),
    reservedPrefix: textValue(input.reservedPrefix, DEFAULT_PROTOCOL_NUMBERING_CONFIG.reservedPrefix),
  };
  validateProtocolNumberingConfig(cfg);
  return cfg;
}

export function validateProtocolNumberingConfig(config: ProtocolNumberingConfig): void {
  if (!config.protocolNumberTemplate.trim()) {
    throw new ProtocolNumberingError("Il formato numero protocollo è obbligatorio");
  }
  if (!config.protocolNumberRegex.trim()) {
    throw new ProtocolNumberingError("L'espressione regolare di validazione è obbligatoria");
  }
  if (!Number.isInteger(config.sequencePadding) || config.sequencePadding < 1 || config.sequencePadding > 12) {
    throw new ProtocolNumberingError("sequencePadding deve essere un intero tra 1 e 12");
  }
  for (const [label, value] of [
    ["entrata", config.incomingPrefix],
    ["uscita", config.outgoingPrefix],
    ["interno", config.internalPrefix],
    ["riservato", config.reservedPrefix],
  ] as const) {
    if (!value.trim()) throw new ProtocolNumberingError(`Il prefisso ${label} è obbligatorio`);
  }
  try {
    new RegExp(config.protocolNumberRegex);
  } catch {
    throw new ProtocolNumberingError("L'espressione regolare di validazione non è valida");
  }
}

export function renderProtocolNumber(
  config: ProtocolNumberingConfig,
  type: string,
  year: number,
  sequence: number,
): string {
  const typeCode = getTypePrefix(config, type);
  const paddedDefault = String(sequence).padStart(config.sequencePadding, "0");
  return config.protocolNumberTemplate
    .replaceAll("{YYYY}", String(year))
    .replaceAll("{YY}", String(year).slice(-2))
    .replaceAll("{TYPE}", typeCode)
    .replace(/\{SEQ(\d*)\}/g, (_match, explicitPadding: string) => {
      const padding = explicitPadding ? Number(explicitPadding) : config.sequencePadding;
      return String(sequence).padStart(Number.isInteger(padding) && padding > 0 ? padding : config.sequencePadding, "0");
    })
    .replaceAll("{SEQ}", paddedDefault);
}

export function validateProtocolNumber(number: string, config: ProtocolNumberingConfig): boolean {
  return new RegExp(config.protocolNumberRegex).test(number);
}

export function previewProtocolNumber(
  config: ProtocolNumberingConfig,
  type = "incoming",
  year = new Date().getFullYear(),
  sequence = 1,
): { number: string; valid: boolean; error: string | null } {
  try {
    validateProtocolNumberingConfig(config);
    const number = renderProtocolNumber(config, type, year, sequence);
    return {
      number,
      valid: validateProtocolNumber(number, config),
      error: validateProtocolNumber(number, config) ? null : "Il numero generato non rispetta la regex configurata",
    };
  } catch (err) {
    return {
      number: "",
      valid: false,
      error: err instanceof Error ? err.message : "Configurazione non valida",
    };
  }
}

export async function saveProtocolNumberingConfig(config: ProtocolNumberingConfig): Promise<void> {
  validateProtocolNumberingConfig(config);
  for (const key of CONFIG_KEYS) {
    const value = String(config[key]);
    await db
      .insert(appSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { value, updatedAt: new Date() },
      });
  }
}

function getTypePrefix(config: ProtocolNumberingConfig, type: string): string {
  if (type === "incoming") return config.incomingPrefix;
  if (type === "outgoing") return config.outgoingPrefix;
  if (type === "reserved") return config.reservedPrefix;
  return config.internalPrefix;
}

function textValue(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).trim();
}

function numberValue(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  return Number(value);
}
