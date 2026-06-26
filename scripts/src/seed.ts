import { db } from "@workspace/db";
import {
  usersTable,
  classificationsTable,
  dossiersTable,
  protocolsTable,
  documentsTable,
  tasksTable,
  activityLogTable,
} from "@workspace/db";

async function seed() {
  console.log("Seeding users...");
  await db.insert(usersTable).values([
    { email: "admin@pd.it", name: "Maria Rossi", role: "admin", area: "Direzione", section: "Segreteria", isActive: true },
    { email: "manager@pd.it", name: "Luca Bianchi", role: "manager", area: "Amministrazione", section: "Protocollo", isActive: true },
    { email: "collaborator@pd.it", name: "Anna Verdi", role: "collaborator", area: "Segreteria", section: "Front Office", isActive: true },
    { email: "giuseppe.ferrari@pd.it", name: "Giuseppe Ferrari", role: "collaborator", area: "Contabilita", section: "Fondi", isActive: true },
    { email: "sara.conti@pd.it", name: "Sara Conti", role: "manager", area: "Legale", section: "Contratti", isActive: true },
  ]).onConflictDoNothing();

  console.log("Seeding classifications...");
  await db.insert(classificationsTable).values([
    { code: "01", title: "Amministrazione Generale", level: 1, isActive: true },
    { code: "02", title: "Organi di Governo", level: 1, isActive: true },
    { code: "03", title: "Risorse Umane", level: 1, isActive: true },
    { code: "04", title: "Patrimonio e Contabilita", level: 1, isActive: true },
    { code: "05", title: "Progetti e Iniziative", level: 1, isActive: true },
  ]).onConflictDoNothing();

  console.log("Seeding dossiers...");
  await db.insert(dossiersTable).values([
    { code: "FASC-2026-0001", title: "Bilancio Preventivo 2026", status: "open", year: 2026, area: "Contabilita", confidentiality: "normal", responsibleId: 2 },
    { code: "FASC-2026-0002", title: "Convenzione Comune di Roma", status: "open", year: 2026, area: "Legale", confidentiality: "reserved", responsibleId: 5 },
    { code: "FASC-2026-0003", title: "Assunzione Personale 2026", status: "open", year: 2026, area: "Risorse Umane", confidentiality: "normal", responsibleId: 2 },
    { code: "FASC-2025-0001", title: "Rendiconto 2025", status: "closed", year: 2025, area: "Contabilita", confidentiality: "normal", responsibleId: 4 },
  ]).onConflictDoNothing();

  console.log("Seeding protocols...");
  await db.insert(protocolsTable).values([
    { number: "AIM-2026-E-000001", year: 2026, type: "incoming", status: "registered", subject: "Richiesta contributo formazione", sender: "Comune di Roma", recipients: ["Direzione"], ccRecipients: [], confidentiality: "normal", priority: "normal", dossierId: 1, assignedToId: 2, registeredById: 1 },
    { number: "AIM-2026-E-000002", year: 2026, type: "incoming", status: "assigned", subject: "Documentazione gara appalto 2026", sender: "Regione Lazio", recipients: ["Ufficio Appalti"], ccRecipients: [], confidentiality: "reserved", priority: "high", dossierId: 2, assignedToId: 5, registeredById: 1 },
    { number: "AIM-2026-U-000001", year: 2026, type: "outgoing", status: "completed", subject: "Invio relazione annuale attivita", sender: "ProtocolloDigitale", recipients: ["Ministero Lavoro"], ccRecipients: [], confidentiality: "normal", priority: "normal", assignedToId: 1, registeredById: 1 },
    { number: "AIM-2026-I-000001", year: 2026, type: "internal", status: "in_progress", subject: "Circolare aggiornamento procedure", sender: "Direzione", recipients: ["Tutto il personale"], ccRecipients: [], confidentiality: "normal", priority: "normal", assignedToId: 3, registeredById: 1 },
    { number: "AIM-2026-E-000003", year: 2026, type: "incoming", status: "registered", subject: "Istanza accesso agli atti", sender: "Mario Bianchi", recipients: ["Ufficio Legale"], ccRecipients: [], confidentiality: "normal", priority: "urgent", assignedToId: 5, registeredById: 1 },
    { number: "AIM-2026-I-000002", year: 2026, type: "internal", status: "registered", subject: "Nota servizio chiusura estiva", sender: "Segreteria", recipients: ["Tutto il personale"], ccRecipients: [], confidentiality: "normal", priority: "low", registeredById: 2 },
  ]).onConflictDoNothing();

  console.log("Seeding documents...");
  await db.insert(documentsTable).values([
    { title: "Delibera CdA n.1/2026 - Bilancio", type: "delibera", status: "completed", subject: "Approvazione Bilancio 2026", confidentiality: "normal", priority: "normal", version: 2, dossierId: 1, createdById: 1, tags: ["bilancio", "cda", "2026"] },
    { title: "Contratto Convenzione Comune Roma", type: "contratto", status: "in_signature", subject: "Convenzione servizi 2026-2028", confidentiality: "reserved", priority: "high", version: 1, dossierId: 2, createdById: 5, tags: ["contratto", "comune"] },
    { title: "Verbale Riunione Staff Marzo 2026", type: "verbale", status: "completed", subject: "Verbale riunione staff", confidentiality: "normal", priority: "normal", version: 1, createdById: 1, tags: ["verbale", "staff"] },
    { title: "Relazione Attivita 2025", type: "relazione", status: "in_approval", subject: "Relazione consuntiva 2025", confidentiality: "normal", priority: "normal", version: 3, createdById: 2, tags: ["relazione", "2025"] },
    { title: "Circolare Privacy GDPR", type: "circolare", status: "draft", subject: "Aggiornamento procedure privacy", confidentiality: "normal", priority: "normal", version: 1, createdById: 3, tags: ["privacy", "gdpr"] },
  ]).onConflictDoNothing();

  console.log("Seeding tasks...");
  await db.insert(tasksTable).values([
    { title: "Revisione delibera bilancio", description: "Verificare revisione delibera bilancio", status: "in_progress", priority: "high", progress: 60, assignedToId: 2, createdById: 1, dueDate: "2026-07-15" },
    { title: "Predisporre documentazione gara", description: "Preparare documentazione tecnica gara", status: "new", priority: "urgent", progress: 0, assignedToId: 5, createdById: 1, dueDate: "2026-07-10" },
    { title: "Risposta istanza accesso atti", description: "Risposta formale richiesta accesso atti", status: "in_progress", priority: "urgent", progress: 30, assignedToId: 5, createdById: 1, dueDate: "2026-07-08" },
    { title: "Aggiornamento registro presenze", description: "Aggiornare registro presenze trimestre", status: "completed", priority: "normal", progress: 100, assignedToId: 3, createdById: 2, dueDate: "2026-06-30" },
    { title: "Rendiconto trimestrale Q1 2026", description: "Elaborare rendiconto primo trimestre 2026", status: "new", priority: "normal", progress: 0, assignedToId: 4, createdById: 2, dueDate: "2026-07-20" },
  ]).onConflictDoNothing();

  console.log("Seeding activity log...");
  await db.insert(activityLogTable).values([
    { type: "protocol_registered", description: "Protocollo AIM-2026-E-000001 registrato in entrata", userId: 1, protocolId: 1 },
    { type: "document_created", description: "Documento Delibera CdA n.1/2026 creato", userId: 1, documentId: 1 },
    { type: "protocol_assigned", description: "Protocollo AIM-2026-E-000002 assegnato a Luca Bianchi", userId: 2, protocolId: 2 },
    { type: "document_status_changed", description: "Contratto Convenzione inviato in firma", userId: 5, documentId: 2 },
    { type: "task_completed", description: "Attivita registro presenze completata", userId: 3 },
    { type: "protocol_registered", description: "Protocollo AIM-2026-E-000003 registrato - Urgente", userId: 1, protocolId: 5 },
  ]);

  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((e) => {
  console.error("Seed failed:", e.message);
  process.exit(1);
});
