// Gmail integration (Replit google-mail connection).
// Sends mail via connectors.proxy("google-mail", ...) — the SDK injects and
// refreshes the OAuth2 token automatically. See the Gmail blueprint snippet.
import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "./logger";

const connectors = new ReplitConnectors();

export interface SendMailInput {
  to: string[];
  subject: string;
  text: string;
  cc?: string[];
}

function encodeHeader(value: string): string {
  // RFC 2047 encoded-word for non-ASCII subject/header values.
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

function buildRawMessage(input: SendMailInput): string {
  const headers = [
    `To: ${input.to.join(", ")}`,
    ...(input.cc && input.cc.length > 0 ? [`Cc: ${input.cc.join(", ")}`] : []),
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  const body = Buffer.from(input.text, "utf-8").toString("base64");
  const message = `${headers.join("\r\n")}\r\n\r\n${body}`;
  // Gmail expects base64url (web-safe, no padding) of the full RFC822 message.
  return Buffer.from(message, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Sends a plain-text email through the Gmail connector.
 * Returns true on success, false on failure (never throws), so callers in the
 * workflow engine can fire-and-forget notifications without breaking the
 * triggering action.
 */
export async function sendMail(input: SendMailInput): Promise<boolean> {
  const recipients = input.to.filter((r) => r && r.includes("@"));
  if (recipients.length === 0) {
    logger.warn({ subject: input.subject }, "sendMail: no valid recipients, skipping");
    return false;
  }
  try {
    const raw = buildRawMessage({ ...input, to: recipients });
    const res = await connectors.proxy("google-mail", "/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      const errText = await res.text();
      logger.error({ status: res.status, errText, subject: input.subject }, "sendMail: Gmail API error");
      return false;
    }
    logger.info({ to: recipients, subject: input.subject }, "sendMail: email sent");
    return true;
  } catch (err) {
    logger.error({ err, subject: input.subject }, "sendMail: failed to send email");
    return false;
  }
}
