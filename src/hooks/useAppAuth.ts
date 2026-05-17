import { useDesktopAuth } from "../lib/desktopAuth";

export function useAppAuth() {
  const { auth, accountData, authSkipped, setAuthSkipped, signOut, refreshAccount } = useDesktopAuth();

  return {
    auth,
    setAuth: () => {},
    accountData,
    setAccountData: () => {},
    authSkipped,
    setAuthSkipped,
    logout: signOut,
    fetchProfile: refreshAccount
  };
}
