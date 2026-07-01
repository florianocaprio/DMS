import type { NextFunction, Request, Response } from "express";

export const APPLICATION_ROLES = [
  "admin",
  "protocol_manager",
  "protocol_operator",
  "procedure_owner",
  "viewer",
  "auditor",
  // Legacy roles kept readable so existing rows do not become invalid overnight.
  "manager",
  "collaborator",
] as const;

export type ApplicationRole = (typeof APPLICATION_ROLES)[number];

const ROLE_SET = new Set<string>(APPLICATION_ROLES);

export function isKnownRole(role: unknown): role is ApplicationRole {
  return typeof role === "string" && ROLE_SET.has(role);
}

export function requireAnyRole(allowedRoles: readonly string[]) {
  const allowed = new Set(allowedRoles);
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.currentUser?.role;
    if (role === "admin" || (role && allowed.has(role))) {
      next();
      return;
    }

    res.status(403).json({ error: "Permessi insufficienti" });
  };
}
