import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiGet } from '../lib/api';

type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  teamId?: string | null;
  role: string;
  isAdmin: boolean;
  photoURL?: string | null;
};

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  setSession: (token: string, user: AuthUser) => void;
  clearSession: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'kronosphere_token';
const USER_KEY = 'kronosphere_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    apiGet<{ user: Omit<AuthUser, 'isAdmin' | 'photoURL'> | null; isAdmin: boolean }>('/auth/me')
      .then((resp) => {
        const meUser = resp?.user;
        if (!meUser) {
          setUser(null);
          localStorage.removeItem(USER_KEY);
          return;
        }

        setUser((prev) => {
          const merged: AuthUser = {
            id: meUser.id,
            email: meUser.email,
            name: meUser.name,
            teamId: meUser.teamId,
            role: meUser.role,
            isAdmin: resp.isAdmin,
            photoURL: prev?.photoURL || null
          };
          localStorage.setItem(USER_KEY, JSON.stringify(merged));
          return merged;
        });
      })
      .catch(() => {
        setToken(null);
        setUser(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      loading,
      setSession: (nextToken, nextUser) => {
        setToken(nextToken);
        setUser(nextUser);
        localStorage.setItem(TOKEN_KEY, nextToken);
        localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      },
      clearSession: () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }),
    [token, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}