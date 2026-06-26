import { Router } from "express";
import { db } from "@workspace/db";
import { documentsTable, protocolsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router = Router();

router.get("/search", async (req, res): Promise<void> => {
  const { q, type, status, dateFrom, dateTo, protocolType, page = "1", limit = "20" } = req.query;
  const query = (q as string || "").toLowerCase();
  const pg = Number(page);
  const lm = Number(limit);
  const offset = (pg - 1) * lm;

  const [documents, protocols] = await Promise.all([
    db.select().from(documentsTable).orderBy(desc(documentsTable.createdAt)),
    db.select().from(protocolsTable).orderBy(desc(protocolsTable.registeredAt)),
  ]);

  const results: Array<{
    id: number;
    resultType: string;
    title: string;
    subject: string | null;
    excerpt: string | null;
    status: string;
    protocolNumber: string | null;
    dossierTitle: string | null;
    assignedToName: string | null;
    documentType: string | null;
    createdAt: string;
  }> = [];

  for (const doc of documents) {
    const matches = !query ||
      doc.title.toLowerCase().includes(query) ||
      (doc.subject?.toLowerCase().includes(query)) ||
      (doc.description?.toLowerCase().includes(query)) ||
      (doc.ocrText?.toLowerCase().includes(query)) ||
      (doc.aiSummary?.toLowerCase().includes(query)) ||
      doc.tags.some((t: string) => t.toLowerCase().includes(query));

    if (!matches) continue;
    if (type && doc.type !== type) continue;
    if (status && doc.status !== status) continue;
    if (dateFrom && doc.createdAt.toISOString() < (dateFrom as string)) continue;
    if (dateTo && doc.createdAt.toISOString() > (dateTo as string)) continue;

    results.push({
      id: doc.id,
      resultType: "document",
      title: doc.title,
      subject: doc.subject,
      excerpt: doc.description?.slice(0, 200) ?? doc.aiSummary?.slice(0, 200) ?? null,
      status: doc.status,
      protocolNumber: null,
      dossierTitle: null,
      assignedToName: null,
      documentType: doc.type,
      createdAt: doc.createdAt.toISOString(),
    });
  }

  for (const prot of protocols) {
    if (protocolType && prot.type !== protocolType) continue;
    const matches = !query ||
      prot.subject.toLowerCase().includes(query) ||
      prot.number.toLowerCase().includes(query) ||
      (prot.sender?.toLowerCase().includes(query)) ||
      (prot.description?.toLowerCase().includes(query));
    if (!matches) continue;
    if (status && prot.status !== status) continue;

    results.push({
      id: prot.id,
      resultType: "protocol",
      title: prot.subject,
      subject: prot.sender,
      excerpt: prot.description?.slice(0, 200) ?? null,
      status: prot.status,
      protocolNumber: prot.number,
      dossierTitle: null,
      assignedToName: null,
      documentType: prot.type,
      createdAt: prot.registeredAt.toISOString(),
    });
  }

  const total = results.length;
  const page_items = results.slice(offset, offset + lm);

  res.json({ query: q as string || "", items: page_items, total, page: pg, limit: lm });
});

export default router;
