import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { auditLogTable } from "@workspace/db";
import { desc, and, eq, gte, lte, like, or, sql } from "drizzle-orm";
import { requireAnyRole } from "../middleware/requireRole";

const router: IRouter = Router();

const PAGE_SIZE = 50;

router.use("/admin/audit-log", requireAnyRole(["admin", "auditor"]));

router.get("/admin/audit-log", async (req: Request, res: Response) => {
  try {
    const {
      action, entityType, userId, from, to, status,
      page = "1", q,
    } = req.query as Record<string, string | undefined>;

    const conditions = [];

    if (action)     conditions.push(eq(auditLogTable.action, action));
    if (entityType) conditions.push(eq(auditLogTable.entityType, entityType));
    if (userId)     conditions.push(eq(auditLogTable.userId, Number(userId)));
    if (from)       conditions.push(gte(auditLogTable.timestamp, new Date(from)));
    if (to)         conditions.push(lte(auditLogTable.timestamp, new Date(to)));

    if (status === "success") {
      conditions.push(gte(auditLogTable.statusCode, 200));
      conditions.push(lte(auditLogTable.statusCode, 299));
    } else if (status === "error") {
      conditions.push(gte(auditLogTable.statusCode, 400));
    }

    if (q) {
      conditions.push(
        or(
          like(auditLogTable.description, `%${q}%`),
          like(auditLogTable.path, `%${q}%`),
        )
      );
    }

    const offset = (Math.max(1, Number(page)) - 1) * PAGE_SIZE;
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db.select().from(auditLogTable)
        .where(where)
        .orderBy(desc(auditLogTable.timestamp))
        .limit(PAGE_SIZE)
        .offset(offset),
      db.select({ total: sql<number>`count(*)::int` })
        .from(auditLogTable)
        .where(where),
    ]);

    res.json({
      data: rows,
      pagination: {
        total,
        page: Number(page),
        pageSize: PAGE_SIZE,
        totalPages: Math.ceil(total / PAGE_SIZE),
      },
    });
  } catch (err) {
    req.log.error({ err }, "Error fetching audit log");
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

// Quick stats for the header summary
router.get("/admin/audit-log/stats", async (req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h
    const rows = await db
      .select({
        action: auditLogTable.action,
        count: sql<number>`count(*)::int`,
      })
      .from(auditLogTable)
      .where(gte(auditLogTable.timestamp, since))
      .groupBy(auditLogTable.action);

    const stats: Record<string, number> = { READ: 0, CREATE: 0, UPDATE: 0, DELETE: 0 };
    for (const row of rows) stats[row.action] = row.count;

    res.json({ since: since.toISOString(), stats });
  } catch (err) {
    req.log.error({ err }, "Error fetching audit stats");
    res.status(500).json({ error: "Failed to fetch audit stats" });
  }
});

export default router;
