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

export interface BootstrapUserInput {
  name: string;
  email: string;
  username: string;
  password: string;
  role: string;
}

interface LocalAuthValue {
  user: LocalUser | null;
  loading: boolean;
  /** True on a fresh install while no administrator exists yet (first-run setup). */
  setupMode: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** First-run only: create an account. Returns whether setup is now complete. */
  createBootstrapUser: (data: BootstrapUserInput) => Promise<{ user: LocalUser; setupComplete: boolean }>;
}

const LocalAuthContext = createContext<LocalAuthValue | null>(null);

export function LocalAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupMode, setSetupMode] = useState(false);

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
          const b = (await bootstrapRes.json()) as { setupMode?: boolean };
          setSetupMode(Boolean(b.setupMode));
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

  const createBootstrapUser = useCallback(async (data: BootstrapUserInput) => {
    const r = await fetch(`${API}/auth/bootstrap`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!r.ok) {
      const err = (await r.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? "Impossibile creare l'utenza");
    }
    return (await r.json()) as { user: LocalUser; setupComplete: boolean };
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
    <LocalAuthContext.Provider value={{ user, loading, setupMode, login, logout, changePassword, createBootstrapUser }}>
      {children}
    </LocalAuthContext.Provider>
  );
}

export function useLocalAuth(): LocalAuthValue {
  const ctx = useContext(LocalAuthContext);
  if (!ctx) throw new Error("useLocalAuth must be used within LocalAuthProvider");
  return ctx;
}
