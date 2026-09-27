import { createContext, useContext, useMemo, type ReactNode } from "react";
import { getLocalSession, getLocalUser, type LocalSession, type LocalUser } from "@/lib/local/auth";
import { UNKNOWN_ASSURANCE, type Assurance } from "@/lib/accountAssurance";

/**
 * There is no sign-in. The device is the operator: a stable local identity
 * is minted once and every row this app writes belongs to it. The shape is
 * kept so the hundred-odd consumers of `useAuth()` keep working unchanged.
 */
interface AuthContextValue {
  user: LocalUser | null;
  session: LocalSession | null;
  loading: boolean;
  assurance: Assurance;
  mfaRequired: boolean;
  refreshAssurance: () => Promise<Assurance>;
  signOut: () => Promise<void>;
}

const LOCAL_ASSURANCE: Assurance = { ...UNKNOWN_ASSURANCE, challengeRequired: false };

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: false,
  assurance: LOCAL_ASSURANCE,
  mfaRequired: false,
  refreshAssurance: async () => LOCAL_ASSURANCE,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const value = useMemo<AuthContextValue>(() => {
    const user = getLocalUser();
    const session = getLocalSession();
    return {
      user,
      session,
      loading: false,
      assurance: LOCAL_ASSURANCE,
      mfaRequired: false,
      refreshAssurance: async () => LOCAL_ASSURANCE,
      // "Sign out" on a device with no account means: go back to the door.
      signOut: async () => {
        window.location.href = "/";
      },
    };
  }, []);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
