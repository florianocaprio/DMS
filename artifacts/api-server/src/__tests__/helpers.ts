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
  dossierWorkflowRulesTable,
  dossierWorkflowInstancesTable,
  signatureRequestsTable,
  tasksTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { sign } from "cookie-signature";
import app from "../app";

/** Email domain used for test fixtures (no longer an auth gate, just an address). */
export const ALLOWED_DOMAIN = "angeliinmoto.it";
/** Local user id of the default acting user (seeded by ensureCurrentUser). */
export const DEFAULT_TEST_USER_ID = 1;

const LOCAL_SESSION_COOKIE = "pd_session";
const LOCAL_SESSION_ACTIVITY_COOKIE = "pd_last_activity";

/**
 * Builds the signed-cookie value the server expects for a local session,
 * mirroring how Express signs cookies with SESSION_SECRET. Tests use this to
 * authenticate as a specific local user without a full login round-trip.
 */
export function sessionCookies(userId: number, activityAt = Date.now()): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required to run the auth tests");
  return [
    `${LOCAL_SESSION_COOKIE}=${encodeURIComponent("s:" + sign(String(userId), secret))}`,
    `${LOCAL_SESSION_ACTIVITY_COOKIE}=${encodeURIComponent("s:" + sign(String(activityAt), secret))}`,
  ].join("; ");
}

type Method = "get" | "post" | "patch" | "put" | "delete";

/**
 * Builds a supertest agent that authenticates every request as the given local
 * user by attaching a signed session cookie. Pass no argument to get an
 * unauthenticated agent (exercises the 401 path).
 */
export function agentFor(userId?: number) {
  const agent = request(app);
  const wrap =
    (method: Method) =>
    (url: string) => {
      const t = agent[method](url);
      return userId !== undefined ? t.set("Cookie", sessionCookies(userId)) : t;
    };
  return {
    get: wrap("get"),
    post: wrap("post"),
    patch: wrap("patch"),
    put: wrap("put"),
    delete: wrap("delete"),
  };
}

/** Default agent: acts as the seeded current user (local id=1). */
export const api = agentFor(DEFAULT_TEST_USER_ID);
/** Agent with no session, for asserting 401s. */
export const anonApi = agentFor();

let counter = 0;
/** Collision-proof suffix for unique columns (protocol.number, dossier.code). */
export function uniqueSuffix(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${process.pid}-${counter}-${Math.floor(Math.random() * 1e6)}`;
}

/**
 * Ensures a local user with id=1 exists and is active so the default `api` agent
 * (which signs a session cookie for id=1) authenticates as it. Returns its name
 * (used to assert addedByName / uploadedByName / removedByName).
 */
export async function ensureCurrentUser(): Promise<{ id: number; name: string }> {
  await db
    .insert(usersTable)
    .values({
      id: 1,
      email: `utente.corrente@${ALLOWED_DOMAIN}`,
      name: "Utente Corrente",
    })
    .onConflictDoNothing();
  // The row may have pre-existed (seed) as inactive or with a different email;
  // normalise it so the default agent reliably resolves to an active user.
  await db
    .update(usersTable)
    .set({ email: `utente.corrente@${ALLOWED_DOMAIN}`, isActive: true, mustChangePassword: false })
    .where(eq(usersTable.id, 1));
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
  userIds: number[] = [];
  workflowRuleIds: number[] = [];
  workflowInstanceIds: number[] = [];
  signatureRequestIds: number[] = [];
  taskIds: number[] = [];

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

  /**
   * Creates a distinct authenticated user and returns the local row. Pass its
   * `id` to agentFor to act as this user.
   */
  async createUser(
    overrides: Partial<typeof usersTable.$inferInsert> = {},
  ): Promise<typeof usersTable.$inferSelect> {
    const suffix = uniqueSuffix();
    const [u] = await db
      .insert(usersTable)
      .values({
        email: `user-${suffix}@${ALLOWED_DOMAIN}`,
        name: `Utente ${suffix}`,
        ...overrides,
      })
      .returning();
    this.userIds.push(u.id);
    return u;
  }

  async createWorkflowRule(
    overrides: Partial<typeof dossierWorkflowRulesTable.$inferInsert> = {},
  ): Promise<typeof dossierWorkflowRulesTable.$inferSelect> {
    const dossierId = overrides.dossierId ?? (await this.createDossier()).id;
    const [r] = await db
      .insert(dossierWorkflowRulesTable)
      .values({
        dossierId,
        type: "approval",
        name: "Regola di test",
        appliesTo: "both",
        config: {},
        ...overrides,
      })
      .returning();
    this.workflowRuleIds.push(r.id);
    return r;
  }

  async createWorkflowInstance(
    overrides: Partial<typeof dossierWorkflowInstancesTable.$inferInsert> = {},
  ): Promise<typeof dossierWorkflowInstancesTable.$inferSelect> {
    const ruleId = overrides.ruleId ?? (await this.createWorkflowRule()).id;
    const dossierId = overrides.dossierId ?? (await this.createDossier()).id;
    const [inst] = await db
      .insert(dossierWorkflowInstancesTable)
      .values({
        ruleId,
        dossierId,
        type: "approval",
        targetType: "protocol",
        targetId: 0,
        status: "pending",
        participants: [],
        ...overrides,
      })
      .returning();
    this.workflowInstanceIds.push(inst.id);
    return inst;
  }

  async createSignatureRequest(
    overrides: Partial<typeof signatureRequestsTable.$inferInsert> = {},
  ): Promise<typeof signatureRequestsTable.$inferSelect> {
    const [sr] = await db
      .insert(signatureRequestsTable)
      .values({
        documentId: 0,
        type: "internal",
        status: "pending",
        signatories: [],
        requestedById: 1,
        ...overrides,
      })
      .returning();
    this.signatureRequestIds.push(sr.id);
    return sr;
  }

  async createTask(
    overrides: Partial<typeof tasksTable.$inferInsert> = {},
  ): Promise<typeof tasksTable.$inferSelect> {
    const [t] = await db
      .insert(tasksTable)
      .values({
        title: `Attività ${uniqueSuffix()}`,
        createdById: 1,
        ...overrides,
      })
      .returning();
    this.taskIds.push(t.id);
    return t;
  }

  /** Reads the participants array straight from the DB. */
  async getInstanceParticipants(
    instanceId: number,
  ): Promise<Array<{ userId: number; status: string }>> {
    const [inst] = await db
      .select({ participants: dossierWorkflowInstancesTable.participants })
      .from(dossierWorkflowInstancesTable)
      .where(eq(dossierWorkflowInstancesTable.id, instanceId))
      .limit(1);
    return (inst?.participants as Array<{ userId: number; status: string }>) ?? [];
  }

  /** Reads the signatories array straight from the DB. */
  async getSignatories(
    signatureRequestId: number,
  ): Promise<Array<{ userId: number; status: string }>> {
    const [sr] = await db
      .select({ signatories: signatureRequestsTable.signatories })
      .from(signatureRequestsTable)
      .where(eq(signatureRequestsTable.id, signatureRequestId))
      .limit(1);
    return (sr?.signatories as Array<{ userId: number; status: string }>) ?? [];
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
    if (this.taskIds.length) {
      await db.delete(tasksTable).where(inArray(tasksTable.id, this.taskIds));
    }
    if (this.workflowInstanceIds.length) {
      await db.delete(dossierWorkflowInstancesTable).where(inArray(dossierWorkflowInstancesTable.id, this.workflowInstanceIds));
    }
    if (this.signatureRequestIds.length) {
      await db.delete(signatureRequestsTable).where(inArray(signatureRequestsTable.id, this.signatureRequestIds));
    }
    if (this.workflowRuleIds.length) {
      await db.delete(dossierWorkflowRulesTable).where(inArray(dossierWorkflowRulesTable.id, this.workflowRuleIds));
    }
    if (this.dossierIds.length) {
      await db.delete(dossiersTable).where(inArray(dossiersTable.id, this.dossierIds));
    }
    if (this.userIds.length) {
      await db.delete(usersTable).where(inArray(usersTable.id, this.userIds));
    }
    this.protocolIds = [];
    this.attachmentIds = [];
    this.dossierIds = [];
    this.userIds = [];
    this.workflowRuleIds = [];
    this.workflowInstanceIds = [];
    this.signatureRequestIds = [];
    this.taskIds = [];
  }
}
