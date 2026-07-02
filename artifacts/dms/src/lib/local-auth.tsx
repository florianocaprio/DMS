import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const API = "/api";
const SESSION_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
const ACTIVITY_REFRESH_THROTTLE_MS = 60 * 1000;

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

export interface RegisterAdminInput {
  name: string;
  username: string;
  password: string;
  email?: string;
}

interface LocalAuthValue {
  user: LocalUser | null;
  loading: boolean;
  /** True on a fresh install while no administrator with a password exists yet. */
  setupMode: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** First-run only: register the first administrator; logs them in on success. */
  registerAdmin: (input: RegisterAdminInput) => Promise<void>;
  sessionExpiredMessage: string | null;
}

const LocalAuthContext = createContext<LocalAuthValue | null>(null);

export function LocalAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupMode, setSetupMode] = useState(false);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);
  const lastActivityRefreshAtRef = useRef(0);

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
        if (sessionRes.ok) {
          setUser((await sessionRes.json()) as LocalUser);
        } else {
          const err = (await sessionRes.json().catch(() => ({}))) as { reason?: string };
          if (err.reason === "SESSION_IDLE_TIMEOUT") {
            setSessionExpiredMessage("Sessione scaduta per inattività. Effettua nuovamente l'accesso.");
          }
        }
        if (bootstrapRes.ok) {
          const b = (await bootstrapRes.json()) as { setupMode?: boolean };
          setSetupMode(Boolean(b.setupMode));
        }
      } catch {
        // Network/setup probe failed — fall back to the login screen.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const registerAdmin = useCallback(async (input: RegisterAdminInput) => {
    const r = await fetch(`${API}/auth/bootstrap`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!r.ok) {
      const err = (await r.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? "Impossibile completare la registrazione");
    }
    // The endpoint also sets the session cookie, so we are logged in now.
    setSessionExpiredMessage(null);
    setUser((await r.json()) as LocalUser);
    setSetupMode(false);
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
    setSessionExpiredMessage(null);
    setUser((await r.json()) as LocalUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
    } finally {
      setSessionExpiredMessage(null);
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
    setSessionExpiredMessage(null);
    setUser((await r.json()) as LocalUser);
  }, []);

  useEffect(() => {
    if (!user) return;

    let stopped = false;
    let timeoutId: number | null = null;

    const expireSession = async () => {
      if (stopped) return;
      stopped = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
      try {
        await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
      } finally {
        setUser(null);
        setSessionExpiredMessage("Sessione scaduta per inattività. Effettua nuovamente l'accesso.");
      }
    };

    const scheduleTimeout = () => {
      if (timeoutId != null) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        void expireSession();
      }, SESSION_INACTIVITY_TIMEOUT_MS);
    };

    const reportActivity = async () => {
      if (stopped) return;
      scheduleTimeout();
      const now = Date.now();
      if (now - lastActivityRefreshAtRef.current < ACTIVITY_REFRESH_THROTTLE_MS) return;
      lastActivityRefreshAtRef.current = now;
      try {
        const res = await fetch(`${API}/auth/activity`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) await expireSession();
      } catch {
        // A transient network error should not immediately log the user out;
        // the local timer and backend cookie still enforce the deadline.
      }
    };

    const onUserActivity = () => {
      void reportActivity();
    };

    scheduleTimeout();
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart", "scroll", "focus"];
    for (const event of events) window.addEventListener(event, onUserActivity, { passive: true, capture: true });

    return () => {
      stopped = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
      for (const event of events) window.removeEventListener(event, onUserActivity, { capture: true });
    };
  }, [user]);

  return (
    <LocalAuthContext.Provider value={{ user, loading, setupMode, login, logout, changePassword, registerAdmin, sessionExpiredMessage }}>
      {children}
    </LocalAuthContext.Provider>
  );
}

export function useLocalAuth(): LocalAuthValue {
  const ctx = useContext(LocalAuthContext);
  if (!ctx) throw new Error("useLocalAuth must be used within LocalAuthProvider");
  return ctx;
}
