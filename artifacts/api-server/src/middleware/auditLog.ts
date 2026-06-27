import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { auditLogTable } from "@workspace/db";

// ── Entity extraction ──────────────────────────────────────────────────────

const SKIP_PATHS = ["/healthz", "/audit-log", "/storage"];

// Map first path segment (after /api/) to entity label
const ENTITY_MAP: Record<string, string> = {
  protocols:       "protocollo",
  documents:       "documento",
  dossiers:        "fascicolo",
  users:           "utente",
  classifications: "classificazione",
  tasks:           "attività",
  workflows:       "workflow",
  signatures:      "firma",
  attachments:     "allegato",
  settings:        "impostazioni",
  search:          "ricerca",
  dashboard:       "dashboard",
  drive:           "drive",
};

const ENTITY_TYPE_MAP: Record<string, string> = {
  protocols:       "protocol",
  documents:       "document",
  dossiers:        "dossier",
  users:           "user",
  classifications: "classification",
  tasks:           "task",
  workflows:       "workflow",
  signatures:      "signature",
  attachments:     "attachment",
  settings:        "settings",
  search:          "search",
  dashboard:       "dashboard",
  drive:           "drive",
};

function extractEntity(rawPath: string): { entityType: string | null; entityId: number | null } {
  // rawPath is relative to /api, e.g. "/protocols/5" or "/admin/drive/recover"
  const parts = rawPath.replace(/^\//, "").split("/").filter(Boolean);
  // skip /api prefix if present
  const start = parts[0] === "api" ? 1 : 0;
  const seg = parts[start] === "admin" ? parts[start + 1] : parts[start];
  if (!seg) return { entityType: null, entityId: null };

  const entityType = ENTITY_TYPE_MAP[seg] ?? seg;

  // The segment after the resource name may be an id
  const idSeg = parts[start] === "admin" ? parts[start + 2] : parts[start + 1];
  const entityId = idSeg && /^\d+$/.test(idSeg) ? parseInt(idSeg, 10) : null;

  return { entityType, entityId };
}

function methodToAction(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":    return "READ";
    case "POST":   return "CREATE";
    case "PUT":
    case "PATCH":  return "UPDATE";
    case "DELETE": return "DELETE";
    default:       return method.toUpperCase();
  }
}

function buildDescription(method: string, entityType: string | null, entityId: number | null, path: string): string {
  const label = entityType ? ENTITY_MAP[entityType] ?? entityType : "risorsa";
  const ref = entityId ? `${label} #${entityId}` : `lista ${label}`;
  switch (method.toUpperCase()) {
    case "GET":    return entityId ? `Consultazione ${label} #${entityId}` : `Consultazione ${ref}`;
    case "POST":   return `Creazione ${label}`;
    case "PUT":
    case "PATCH":  return entityId ? `Aggiornamento ${label} #${entityId}` : `Aggiornamento ${label}`;
    case "DELETE": return entityId ? `Eliminazione ${label} #${entityId}` : `Eliminazione ${label}`;
    default:       return `${method} ${path}`;
  }
}

const SENSITIVE_KEYS = new Set(["password", "token", "secret", "key", "sessionSecret"]);

function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k)) {
      cleaned[k] = "[redacted]";
    } else if (typeof v === "string" && v.length > 500) {
      cleaned[k] = v.slice(0, 200) + "…[truncated]";
    } else {
      cleaned[k] = v;
    }
  }
  return cleaned;
}

// ── Middleware ─────────────────────────────────────────────────────────────

export function auditLogMiddleware(req: Request, res: Response, next: NextFunction) {
  // Capture body before it's consumed (already parsed by express.json)
  const capturedBody = req.method !== "GET" ? req.body : undefined;
  const startAt = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startAt;

    // Skip noise paths
    const rawPath = req.path; // relative to /api mount point
    if (SKIP_PATHS.some(p => rawPath.includes(p))) return;
    if (rawPath === "/" || rawPath === "") return;

    const { entityType, entityId } = extractEntity(rawPath);
    const action = methodToAction(req.method);
    const description = buildDescription(req.method, entityType, entityId, rawPath);

    const ipAddress =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      ?? req.socket?.remoteAddress
      ?? null;

    const userAgent = (req.headers["user-agent"] as string | undefined) ?? null;

    // Async insert — never blocks the request
    db.insert(auditLogTable).values({
      action,
      entityType: entityType ?? undefined,
      entityId: entityId ?? undefined,
      userId: req.currentUserId ?? null,
      method: req.method,
      path: rawPath,
      statusCode: res.statusCode,
      durationMs,
      ipAddress,
      userAgent: userAgent ? userAgent.slice(0, 250) : null,
      requestBody: capturedBody ? sanitizeBody(capturedBody) : null,
      description,
    }).catch(() => {
      // Swallow audit errors — never break the main request
    });
  });

  next();
}
