---
name: Document MOVE with effective membership
description: Why a document MOVE must delete junction rows, not just repoint documents.dossierId
---

Document membership in a dossier is read as the **effective union** of the home
(`documents.dossierId`) and the `document_dossiers` junction (used for COPY). This
union is read in the documents list, the dossier documents tab, and dossier doc
counts.

**Rule:** a MOVE must, in one transaction: set `documents.dossierId = target`,
delete the source junction row `(documentId, sourceDossierId)`, and delete a
now-redundant target junction row `(documentId, targetDossierId)`.

**Why:** if MOVE only repoints `dossierId`, a leftover source junction row (e.g.
from a prior COPY into the source) keeps the document visible in the source
fascicolo — so it is not a true move. The same union logic applies to protocols
via `protocol_dossiers`, where the one-primary invariant already forces this.

**How to apply:** any new read path for documents/protocols must read the union,
and any relocation must reconcile both the home pointer and junction rows together.
