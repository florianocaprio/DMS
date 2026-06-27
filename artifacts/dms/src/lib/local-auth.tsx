import { createContext, useCallback, useContext, useEffect, useState } from "react";

const API = "/api";

export interface LocalUser {
  id: number;
  email: string;
  name: string;
  role: string;
  username: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
}

interface LocalAuthValue {
  user: LocalUser | null;
  loading: boolean;
  /** True on a fresh install while the default admin still needs a password. */
  setupMode: boolean;
  /** Username of the default admin awaiting password setup (first-run only). */
  setupUsername: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** First-run only: set the default admin password; logs the admin in on success. */
  setupAdminPassword: (password: string) => Promise<void>;
}

const LocalAuthContext = createContext<LocalAuthValue | null>(null);

export function LocalAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupMode, setSetupMode] = useState(false);
  const [setupUsername, setSetupUsername] = useState<string | null>(null);

  // Bootstrap: in parallel, detect an existing local session (signed cookie)
  // and whether the app still needs first-run setup (no admin exists yet).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sessionRes, bootstrapRes] = await Promise.all([
          fetch(`${API}/auth/session`, { credentials: "include" }),
          fetch(`${API}/auth/bootstrap`, { credentials: "include" }),
        ]);
        if (cancelled) return;
        if (sessionRes.ok) setUser((await sessionRes.json()) as LocalUser);
        if (bootstrapRes.ok) {
          const b = (await bootstrapRes.json()) as { setupMode?: boolean; username?: string | null };
          setSetupMode(Boolean(b.setupMode));
          setSetupUsername(b.username ?? null);
        }
      } catch {
        // Network/setup probe failed — fall back to the Clerk flow.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setupAdminPassword = useCallback(async (password: string) => {
    const r = await fetch(`${API}/auth/bootstrap`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!r.ok) {
      const err = (await r.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? "Impossibile impostare la password");
    }
    // The endpoint also sets the session cookie, so we are logged in now.
    setUser((await r.json()) as LocalUser);
    setSetupMode(false);
    setSetupUsername(null);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await fetch(`${API}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!r.ok) {
      const err = (await r.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? "Credenziali non valide");
    }
    setUser((await r.json()) as LocalUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
    } finally {
      setUser(null);
    }
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const r = await fetch(`${API}/auth/change-password`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!r.ok) {
      const err = (await r.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? "Impossibile aggiornare la password");
    }
    setUser((await r.json()) as LocalUser);
  }, []);

  return (
    <LocalAuthContext.Provider value={{ user, loading, setupMode, setupUsername, login, logout, changePassword, setupAdminPassword }}>
      {children}
    </LocalAuthContext.Provider>
  );
}

export function useLocalAuth(): LocalAuthValue {
  const ctx = useContext(LocalAuthContext);
  if (!ctx) throw new Error("useLocalAuth must be used within LocalAuthProvider");
  return ctx;
}
