import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { auditLogMiddleware } from "./middleware/auditLog";
import { requireAuth } from "./middleware/requireAuth";

const app: Express = express();

// Trust the upstream reverse proxy (Replit's shared proxy in dev/preview, or any
// TLS-terminating proxy when self-hosted) so req.secure / req.protocol reflect the
// original X-Forwarded-Proto. The session cookie's Secure/SameSite flags are
// derived from req.secure (see cookieOptions in routes/auth.ts).
app.set("trust proxy", true);

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

app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
// Parse signed cookies (local session). SESSION_SECRET signs the session cookie.
app.use(cookieParser(process.env.SESSION_SECRET));

// requireAuth enforces a valid local session and exposes the resolved user on
// req.currentUser*. It runs before the audit log so audit entries carry the
// authenticated user id.
app.use("/api", requireAuth);
app.use("/api", auditLogMiddleware);
app.use("/api", router);

export default app;
