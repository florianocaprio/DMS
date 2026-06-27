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
}

interface LocalAuthValue {
  user: LocalUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const LocalAuthContext = createContext<LocalAuthValue | null>(null);

export function LocalAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Bootstrap: detect an existing local session via the signed cookie.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/auth/session`, { credentials: "include" });
        if (!cancelled && r.ok) {
          setUser((await r.json()) as LocalUser);
        }
      } catch {
        // No local session — fall back to the Clerk flow.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
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

  return (
    <LocalAuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </LocalAuthContext.Provider>
  );
}

export function useLocalAuth(): LocalAuthValue {
  const ctx = useContext(LocalAuthContext);
  if (!ctx) throw new Error("useLocalAuth must be used within LocalAuthProvider");
  return ctx;
}
