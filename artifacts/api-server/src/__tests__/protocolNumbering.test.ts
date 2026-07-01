import { afterAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import {
  normalizeProtocolNumberingConfig,
  previewProtocolNumber,
  validateProtocolNumber,
} from "../lib/protocolNumbering";

afterAll(async () => {
  await pool.end();
});

describe("protocol numbering config", () => {
  it("generates protocol numbers from the template and validates them with the regex", () => {
    const config = normalizeProtocolNumberingConfig({});
    const preview = previewProtocolNumber(config, "reserved", 2026, 7);

    expect(preview).toEqual({
      number: "AIM-2026-RIS-000007",
      valid: true,
      error: null,
    });
  });

  it("keeps generation and validation separate when template and regex diverge", () => {
    const config = normalizeProtocolNumberingConfig({
      protocolNumberTemplate: "AIM-{YYYY}-{TYPE}-{SEQ4}",
      protocolNumberRegex: "^AIM-\\d{4}-(E|U|I|RIS)-\\d{6}$",
    });

    const preview = previewProtocolNumber(config, "incoming", 2026, 1);

    expect(preview.number).toBe("AIM-2026-E-0001");
    expect(preview.valid).toBe(false);
    expect(preview.error).toMatch(/regex configurata/i);
  });

  it("validates an existing number without generating a new sequence", () => {
    const config = normalizeProtocolNumberingConfig({});

    expect(validateProtocolNumber("AIM-2026-U-000123", config)).toBe(true);
    expect(validateProtocolNumber("AIM-2026-U-123", config)).toBe(false);
  });
});
