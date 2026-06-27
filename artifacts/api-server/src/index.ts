import app from "./app";
import { logger } from "./lib/logger";
import { initScheduler } from "./lib/scheduler";
import { ensureDefaultAdmin, ensureDefaultDossier } from "./lib/ensureDefaults";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start(): Promise<void> {
  // Seed the default admin BEFORE serving traffic so the very first request to
  // /auth/bootstrap on an empty database reliably reports setup mode (the
  // frontend probes it only once on mount). ensureDefaultAdmin handles its own
  // errors internally, so awaiting it never blocks startup on a transient fault.
  await ensureDefaultAdmin();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    ensureDefaultDossier().catch((e) => logger.error({ err: e }, "ensureDefaultDossier failed"));
    initScheduler().catch((e) => logger.error({ err: e }, "Scheduler init failed"));
  });
}

start().catch((e) => {
  logger.error({ err: e }, "Server startup failed");
  process.exit(1);
});
