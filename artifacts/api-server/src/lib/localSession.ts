import type { Request, Response } from "express";

export const LOCAL_SESSION_COOKIE = "pd_session";
export const LOCAL_SESSION_ACTIVITY_COOKIE = "pd_last_activity";

const SESSION_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_INACTIVITY_TIMEOUT_MS = parsePositiveInt(process.env.SESSION_INACTIVITY_TIMEOUT_MS) ?? 10 * 60 * 1000;

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function baseCookieOptions(req: Request) {
  const isHttps = req.secure;
  return {
    httpOnly: true,
    sameSite: (isHttps ? "none" : "lax") as "none" | "lax",
    secure: isHttps,
    signed: true,
    path: "/",
  };
}

export function sessionCookieOptions(req: Request) {
  return {
    ...baseCookieOptions(req),
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
  };
}

export function activityCookieOptions(req: Request) {
  return {
    ...baseCookieOptions(req),
    maxAge: SESSION_INACTIVITY_TIMEOUT_MS,
  };
}

export function readLocalSessionUserId(req: Request): number | null {
  const raw = req.signedCookies?.[LOCAL_SESSION_COOKIE];
  const id = Number(raw);
  return raw && Number.isInteger(id) ? id : null;
}

export function readLastActivityAt(req: Request): number | null {
  const raw = req.signedCookies?.[LOCAL_SESSION_ACTIVITY_COOKIE];
  const timestamp = Number(raw);
  return raw && Number.isFinite(timestamp) ? timestamp : null;
}

export function isSessionInactive(req: Request, now = Date.now()): boolean {
  const lastActivityAt = readLastActivityAt(req);
  if (lastActivityAt == null) return true;
  return now - lastActivityAt > SESSION_INACTIVITY_TIMEOUT_MS;
}

export function setLocalSessionCookies(req: Request, res: Response, userId: number, now = Date.now()): void {
  res.cookie(LOCAL_SESSION_COOKIE, String(userId), sessionCookieOptions(req));
  refreshLocalSessionActivity(req, res, now);
}

export function refreshLocalSessionActivity(req: Request, res: Response, now = Date.now()): void {
  res.cookie(LOCAL_SESSION_ACTIVITY_COOKIE, String(now), activityCookieOptions(req));
}

export function clearLocalSessionCookies(req: Request, res: Response): void {
  res.clearCookie(LOCAL_SESSION_COOKIE, { ...sessionCookieOptions(req), maxAge: undefined });
  res.clearCookie(LOCAL_SESSION_ACTIVITY_COOKIE, { ...activityCookieOptions(req), maxAge: undefined });
}
