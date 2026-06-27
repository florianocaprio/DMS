import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import { auditLogMiddleware } from "./middleware/auditLog";
import { requireAuth } from "./middleware/clerkAuth";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middleware/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk Frontend API proxy — must run BEFORE the body parsers because it
// streams raw bytes. No-op in development (see clerkProxyMiddleware).
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Resolve the publishable key from the incoming request host so the same
// server can serve multiple Clerk custom domains. getClerkProxyHost is shared
// with clerkProxyMiddleware so both halves agree on the canonical hostname.
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// requireAuth enforces a valid Clerk session + allowed domain and exposes the
// resolved local user on req.currentUser*. It runs before the audit log so the
// audit entries carry the authenticated user id.
app.use("/api", requireAuth);
app.use("/api", auditLogMiddleware);
app.use("/api", router);

export default app;
