import React, { createContext, useContext, useEffect, useState } from 'react';
import type { UserPublic, AuthResponse, RefreshResponse } from '@docpilot/shared';
import { api, tokenStore } from '../lib/api';

interface AuthState {
  user: UserPublic | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, workspaceName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, isLoading: true });

  // On mount, try to restore the session using the refresh cookie.
  useEffect(() => {
    api.post<RefreshResponse>('/api/auth/refresh')
      .then(({ accessToken }) => {
        tokenStore.set(accessToken);
        return api.get<{ user: UserPublic }>('/api/auth/me');
      })
      .then(({ user }) => setState({ user, isLoading: false }))
      .catch(() => setState({ user: null, isLoading: false }));
  }, []);

  async function login(email: string, password: string) {
    const { user, accessToken } = await api.post<AuthResponse>('/api/auth/login', { email, password });
    tokenStore.set(accessToken);
    setState({ user, isLoading: false });
  }

  async function signup(email: string, password: string, workspaceName: string) {
    const { user, accessToken } = await api.post<AuthResponse>('/api/auth/signup', {
      email,
      password,
      workspaceName,
    });
    tokenStore.set(accessToken);
    setState({ user, isLoading: false });
  }

  async function logout() {
    await api.post('/api/auth/logout').catch(() => {});
    tokenStore.set(null);
    setState({ user: null, isLoading: false });
  }

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
