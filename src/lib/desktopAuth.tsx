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
};

const Ctx = createContext<AuthCtx>({} as AuthCtx);

const WEBSITE = import.meta.env.VITE_WEBSITE_URL ?? "https://codegreyapp.vercel.app";

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

  // On mount: load persisted tokens
  useEffect(() => {
    void (async () => {
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
    if (!auth.accessToken) return;
    setAccountLoading(true);
    try {
      const data = await window.codegrey?.auth?.fetchAccount?.(auth.accessToken);
      if (data) setAccountData(data);
    } finally {
      setAccountLoading(false);
    }
  }, [auth.accessToken]);

  // Fetch account data whenever we become logged in
  useEffect(() => {
    if (auth.loggedIn && auth.accessToken) void refreshAccount();
  }, [auth.loggedIn, auth.accessToken, refreshAccount]);

  const signIn = async () => {
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
    await window.codegrey?.auth?.signOut?.();
    setAuth({ ready: true, loggedIn: false, accessToken: null, refreshToken: null, user: null, roles: [] });
    setAccountData(null);
  };

  return (
    <Ctx.Provider value={{ auth, accountData, accountLoading, signIn, signOut, refreshAccount }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDesktopAuth() {
  return useContext(Ctx);
}

export const BILLING_URL = `${WEBSITE}/billing`;
