---
name: Import Regystrum CSV
description: Details of the Regystrum → ProtocolloDigitale CSV import feature
---

## CSV Format (Regystrum export)

Columns: Numero, Suffisso, Data, Titolo, Descrizione, Stato, Creato da, Assegnato per conoscenza a, Assegnato per competenza, Ufficio, Tipologia, Operatore, Ufficio, Circolazione, Sezione, Nome file, Note, Impronta

- Row with `Suffisso = "-"` → main protocol record
- Rows with `Suffisso = "1","2",...` → attachments for that protocol (only Nome file + Impronta matter)

## Field mapping

- `Circolazione` → type: contains "Entrata"→incoming, "Uscita"→outgoing, else→internal
- `Status` → always "imported" regardless of original value (PENDING, -, etc.)
- `Creato da` → sender
- `Assegnato per competenza` → recipients (split by whitespace)
- `Assegnato per conoscenza a` → ccRecipients (split by whitespace)
- `Data` → registeredAt (parsed via `new Date("Wed Jun 24 11:24:57 UTC 2026")`)
- Notes field stores: original number, original status, tipologia, ufficio, sezione, operatore, circolazione, attachment filenames

## Options

- `keepOriginalNumbers` (default true): keep "AIM-2026-00108" as-is; false → generate "AIM-2026-I-000001" style and store original in notes
- `skipDuplicates` (default true): skip protocols whose number already exists in DB

## Files

- Backend route: `artifacts/api-server/src/routes/import.ts` — `POST /api/admin/import/preview` and `POST /api/admin/import/execute`
- Frontend page: `artifacts/dms/src/pages/admin/import.tsx`
- Body limit raised to 20MB in `artifacts/api-server/src/app.ts` to handle large CSV payloads

## Status badge

Added "imported"/"importato" case to `artifacts/dms/src/components/shared/status-badges.tsx` → teal color.
