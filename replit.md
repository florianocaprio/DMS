# ProtocolloDigitale

Sistema di gestione documentale (DMS) per enti non profit e PMI italiane. Registra protocolli in entrata/uscita/interni, gestisce fascicoli, documenti, attività, workflow di approvazione e firme digitali.

## Run & Operate

- `PORT=8080 pnpm --filter @workspace/api-server run dev` — avvia il server API (porta 8080)
- `PORT=19176 BASE_PATH=/ pnpm --filter @workspace/dms run dev` — avvia il frontend (porta 19176)
- `pnpm run typecheck` — typecheck completo di tutti i pacchetti
- `pnpm run build` — typecheck + build di tutti i pacchetti
- `pnpm --filter @workspace/api-spec run codegen` — rigenera hook e schema Zod dall'OpenAPI spec
- `pnpm --filter @workspace/db run push` — applica le modifiche allo schema DB (solo dev)
- `pnpm --filter @workspace/scripts run seed` — inserisce i dati demo nel database
- Env obbligatorie: `DATABASE_URL`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (porta 8080, path `/api`)
- Frontend: React + Vite (porta 19176, path `/`)
- DB: PostgreSQL + Drizzle ORM
- Validazione: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (da OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/` — sorgente di verità per lo schema DB (users, classifications, dossiers, documents, protocols, tasks, workflows, signatures, assignments/activity_log)
- `lib/api-spec/openapi.yaml` — contratto OpenAPI, sorgente di verità per l'API
- `lib/api-client-react/src/generated/api.ts` — hook React Query generati da Orval
- `artifacts/api-server/src/routes/` — route Express per ogni risorsa
- `artifacts/dms/src/pages/` — pagine React del frontend
- `artifacts/dms/src/components/shared/status-badges.tsx` — badge colorati per stato/tipo/priorità

## Architecture decisions

- **OpenAPI-first**: tutte le route sono definite in `openapi.yaml` prima di essere implementate; i client usano hook generati da Orval.
- **Autenticazione locale**: unico metodo di accesso è login locale username/password con cookie di sessione firmato (`pd_session`). Nessun provider esterno (Google/Clerk rimossi). Gli utenti vengono creati dall'admin all'interno dell'app.
- **Primo avvio (setup / registrazione primo admin)**: l'app è in modalità setup finché nel database non esiste **alcun amministratore con password** (`role = admin` AND `passwordHash IS NOT NULL`), calcolata da `isSetupMode()`. In modalità setup il frontend mostra — senza login — la schermata di **registrazione del primo amministratore** tramite gli endpoint pubblici `GET/POST /api/auth/bootstrap` (GET → `{setupMode}`; POST registra l'admin con `name`, `username`, `password` ≥8 caratteri ed `email` facoltativa — default `${username}@local`, fa **auto-login** con cookie di sessione e blocca l'endpoint). L'operazione è atomica via `pg_advisory_xact_lock` con ricontrollo dentro la transazione; username/email duplicati → 409. Creato il primo admin, l'accesso richiede le credenziali e tutto il resto si configura nell'app.
- **Formato numero protocollo**: `AIM-{anno}-{E|U|I|RIS}-{000001}` (E=entrata, U=uscita, I=interno, RIS=riservato).
- **Formato codice fascicolo**: `FASC-{anno}-{####}`.
- **Status badge bidirezionale**: i badge gestiscono sia i valori in italiano che in inglese (es. "completed" e "completato"), perché l'API restituisce valori in inglese.
- **Workflow command con PORT**: sia `api-server` che `dms` richiedono `PORT` nell'env; i workflow Replit includono `PORT=...` nel comando.

## Product

- **Protocolli**: registro in entrata/uscita/interno/riservato con numero progressivo automatico
- **Documenti**: archivio con versioning, stati e fascicoli associati
- **Fascicoli**: raccoglitori tematici per organizzare documenti e protocolli
- **Attività**: task assegnabili con priorità, scadenze e avanzamento
- **Workflow**: processi di approvazione configurabili per tipo documento
- **Firme**: gestione richieste di firma digitale su documenti
- **Ricerca**: full-text search su tutte le entità
- **Admin**: gestione utenti e titolario di classificazione

## User preferences

_Nessuna preferenza esplicita registrata._

## Gotchas

- **PORT obbligatoria**: entrambi i servizi lanciano errore se `PORT` non è impostata nell'env. I workflow devono includere `PORT=...` nel comando.
- **Seed tramite scripts**: eseguire `pnpm --filter @workspace/scripts run seed` (non `node -e` dalla root, perché `pg` non è disponibile a livello root).
- **Query hook queryKey**: quando si passa un secondo argomento ai hook Orval con `{ query: {} }`, TypeScript richiede `queryKey` esplicito. Usare sempre `{ query: { queryKey: getXxxQueryKey(...) } }`.
- **Status badge**: i valori dell'API sono in inglese (`incoming`, `in_progress`, `completed`), ma i badge li traducono automaticamente in italiano.

## Pointers

- Vedi la skill `pnpm-workspace` per struttura workspace, TypeScript e dettagli pacchetti
