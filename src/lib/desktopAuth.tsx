import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type DesktopProfile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  plan: "free" | "pro" | "team" | "enterprise";
};

export type DesktopSubscription = {
  plan: string;
  status: string;
  monthly_price_cents: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export type UsageEvent = {
  event_type: string;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  lines: number | null;
  cost_cents: number | null;
  created_at: string;
};

export type AuthState = {
  ready: boolean;
  loggedIn: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  user: DesktopProfile | null;
  roles: string[];
};

type AccountData = {
  profile: DesktopProfile | null;
  subscription: DesktopSubscription | null;
  usage: UsageEvent[];
};

type AuthCtx = {
  auth: AuthState;
  accountData: AccountData | null;
  accountLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  authSkipped: boolean;
  setAuthSkipped: (val: boolean) => void;
};

const Ctx = createContext<AuthCtx>({} as AuthCtx);

const WEBSITE = import.meta.env.VITE_WEBSITE_URL ?? "https://codegreyapp.vercel.app";

const MOCK_PROFILE: DesktopProfile = {
  id: "mock-user-id",
  email: "developer@codegrey.dev",
  full_name: "Codegrey Developer",
  avatar_url: null,
  plan: "pro",
};

const MOCK_SUBSCRIPTION: DesktopSubscription = {
  plan: "pro",
  status: "active",
  monthly_price_cents: 1500,
  current_period_end: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  cancel_at_period_end: false,
};

const MOCK_USAGE: UsageEvent[] = [
  { event_type: "request", model: "gemini-1.5-pro", tokens_in: 5320, tokens_out: 1240, lines: 45, cost_cents: 2, created_at: new Date().toISOString() },
  { event_type: "request", model: "gemini-1.5-pro", tokens_in: 8740, tokens_out: 2310, lines: 112, cost_cents: 4, created_at: new Date(Date.now() - 3600 * 1000).toISOString() },
  { event_type: "request", model: "claude-3-5-sonnet", tokens_in: 12100, tokens_out: 4890, lines: 250, cost_cents: 8, created_at: new Date(Date.now() - 7200 * 1000).toISOString() },
];

export function DesktopAuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({
    ready: false,
    loggedIn: false,
    accessToken: null,
    refreshToken: null,
    user: null,
    roles: [],
  });
  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [authSkipped, setAuthSkipped] = useState(false);

  // On mount: load persisted tokens
  useEffect(() => {
    void (async () => {
      if (!window.codegrey) {
        // Browser/Mock Mode
        const stored = localStorage.getItem("codegrey_mock_auth");
        if (stored) {
          try {
            const session = JSON.parse(stored);
            setAuth({
              ready: true,
              loggedIn: true,
              accessToken: session.accessToken,
              refreshToken: session.refreshToken,
              user: session.user,
              roles: ["user"],
            });
            setAccountData({
              profile: session.user,
              subscription: MOCK_SUBSCRIPTION,
              usage: MOCK_USAGE,
            });
          } catch {
            setAuth({ ready: true, loggedIn: false, accessToken: null, refreshToken: null, user: null, roles: [] });
          }
        } else {
          setAuth({ ready: true, loggedIn: false, accessToken: null, refreshToken: null, user: null, roles: [] });
        }
        return;
      }

      // Electron Native Mode
      const tokens = await window.codegrey?.auth?.loadTokens?.();
      if (tokens?.access_token) {
        setAuth({
          ready: true,
          loggedIn: true,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          user: tokens.user ?? null,
          roles: tokens.roles ?? [],
        });
      } else {
        setAuth((a) => ({ ...a, ready: true }));
      }
    })();
  }, []);

  const refreshAccount = useCallback(async () => {
    if (!window.codegrey) {
      // Mock refresh
      setAccountLoading(true);
      await new Promise(resolve => setTimeout(resolve, 300));
      setAccountData({
        profile: auth.user ?? MOCK_PROFILE,
        subscription: MOCK_SUBSCRIPTION,
        usage: MOCK_USAGE,
      });
      setAccountLoading(false);
      return;
    }

    // Electron Native Mode
    if (!auth.accessToken) return;
    setAccountLoading(true);
    try {
      const data = await window.codegrey?.auth?.fetchAccount?.(auth.accessToken);
      if (data) setAccountData(data);
    } finally {
      setAccountLoading(false);
    }
  }, [auth.accessToken, auth.user]);

  // Fetch account data whenever we become logged in
  useEffect(() => {
    if (auth.loggedIn) {
      if (!window.codegrey || auth.accessToken) {
        void refreshAccount();
      }
    }
  }, [auth.loggedIn, auth.accessToken, refreshAccount]);

  const signIn = async () => {
    if (!window.codegrey) {
      // Browser/Mock Mode
      setAccountLoading(true);
      await new Promise(resolve => setTimeout(resolve, 800));
      const mockSession = {
        accessToken: "mock_access_token",
        refreshToken: "mock_refresh_token",
        user: MOCK_PROFILE,
      };
      localStorage.setItem("codegrey_mock_auth", JSON.stringify(mockSession));
      setAuth({
        ready: true,
        loggedIn: true,
        accessToken: mockSession.accessToken,
        refreshToken: mockSession.refreshToken,
        user: mockSession.user,
        roles: ["user"],
      });
      setAccountData({
        profile: mockSession.user,
        subscription: MOCK_SUBSCRIPTION,
        usage: MOCK_USAGE,
      });
      setAccountLoading(false);
      return;
    }

    // Electron Native Mode
    const data = await window.codegrey?.auth?.startLogin?.();
    if (data?.access_token) {
      setAuth({
        ready: true,
        loggedIn: true,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        user: data.user ?? null,
        roles: data.roles ?? [],
      });
    }
  };

  const signOut = async () => {
    if (!window.codegrey) {
      // Browser/Mock Mode
      localStorage.removeItem("codegrey_mock_auth");
      setAuth({ ready: true, loggedIn: false, accessToken: null, refreshToken: null, user: null, roles: [] });
      setAccountData(null);
      return;
    }

    // Electron Native Mode
    await window.codegrey?.auth?.signOut?.();
    setAuth({ ready: true, loggedIn: false, accessToken: null, refreshToken: null, user: null, roles: [] });
    setAccountData(null);
  };

  return (
    <Ctx.Provider value={{ auth, accountData, accountLoading, signIn, signOut, refreshAccount, authSkipped, setAuthSkipped }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDesktopAuth() {
  return useContext(Ctx);
}

export const BILLING_URL = `${WEBSITE}/billing`;
