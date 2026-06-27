import request from "supertest";
import {
  db,
  pool,
  usersTable,
  dossiersTable,
  protocolsTable,
  protocolDossiersTable,
  fileAttachmentsTable,
  activityLogTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import app from "../app";

export const api = request(app);

let counter = 0;
/** Collision-proof suffix for unique columns (protocol.number, dossier.code). */
export function uniqueSuffix(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${process.pid}-${counter}-${Math.floor(Math.random() * 1e6)}`;
}

/**
 * The API hardcodes the current user to id=1. The seed creates it, but tests
 * must be self-sufficient, so ensure a user with id=1 exists and return its
 * name (used to assert addedByName / uploadedByName / removedByName).
 */
export async function ensureCurrentUser(): Promise<{ id: number; name: string }> {
  await db
    .insert(usersTable)
    .values({ id: 1, email: `current-user-${uniqueSuffix()}@test.local`, name: "Utente Corrente" })
    .onConflictDoNothing();
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, 1)).limit(1);
  return { id: u.id, name: u.name };
}

/** Closes the shared pg pool so the vitest worker can exit cleanly. */
export async function closeDb(): Promise<void> {
  await pool.end();
}

/**
 * Tracks every row a test creates so it can be removed afterwards, keeping the
 * shared dev database clean. Fixtures are created via direct DB inserts (with
 * unique number/code values) so the behaviour-under-test is exercised purely
 * through the HTTP API.
 */
export class Fixtures {
  dossierIds: number[] = [];
  protocolIds: number[] = [];
  attachmentIds: number[] = [];

  trackDossier(id: number): number {
    this.dossierIds.push(id);
    return id;
  }
  trackAttachment(id: number): number {
    this.attachmentIds.push(id);
    return id;
  }

  async createDossier(
    overrides: Partial<typeof dossiersTable.$inferInsert> = {},
  ): Promise<typeof dossiersTable.$inferSelect> {
    const [d] = await db
      .insert(dossiersTable)
      .values({
        code: `FASC-TEST-${uniqueSuffix()}`,
        title: "Fascicolo di test",
        year: new Date().getFullYear(),
        ...overrides,
      })
      .returning();
    this.dossierIds.push(d.id);
    return d;
  }

  async createProtocol(
    overrides: Partial<typeof protocolsTable.$inferInsert> = {},
  ): Promise<typeof protocolsTable.$inferSelect> {
    const [p] = await db
      .insert(protocolsTable)
      .values({
        number: `TEST-${uniqueSuffix()}`,
        year: new Date().getFullYear(),
        type: "incoming",
        subject: "Protocollo di test",
        registeredById: 1,
        ...overrides,
      })
      .returning();
    this.protocolIds.push(p.id);
    return p;
  }

  /** Reads protocols.dossierId straight from the DB (the legacy primary mirror). */
  async getProtocolDossierId(protocolId: number): Promise<number | null> {
    const [p] = await db
      .select({ dossierId: protocolsTable.dossierId })
      .from(protocolsTable)
      .where(eq(protocolsTable.id, protocolId))
      .limit(1);
    return p?.dossierId ?? null;
  }

  async protocolExists(protocolId: number): Promise<boolean> {
    const [p] = await db
      .select({ id: protocolsTable.id })
      .from(protocolsTable)
      .where(eq(protocolsTable.id, protocolId))
      .limit(1);
    return !!p;
  }

  async cleanup(): Promise<void> {
    if (this.protocolIds.length) {
      await db.delete(activityLogTable).where(inArray(activityLogTable.protocolId, this.protocolIds));
      await db.delete(protocolDossiersTable).where(inArray(protocolDossiersTable.protocolId, this.protocolIds));
      await db.delete(fileAttachmentsTable).where(inArray(fileAttachmentsTable.protocolId, this.protocolIds));
      await db.delete(protocolsTable).where(inArray(protocolsTable.id, this.protocolIds));
    }
    if (this.attachmentIds.length) {
      await db.delete(fileAttachmentsTable).where(inArray(fileAttachmentsTable.id, this.attachmentIds));
    }
    if (this.dossierIds.length) {
      await db.delete(dossiersTable).where(inArray(dossiersTable.id, this.dossierIds));
    }
    this.protocolIds = [];
    this.attachmentIds = [];
    this.dossierIds = [];
  }
}
