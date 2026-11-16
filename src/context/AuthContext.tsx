import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AuthUser, LoginCredentials, UserRole } from '../types/auth';
import { AuthService } from '../services/AuthService';
import { Page } from '../types';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: AuthUser | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials, role?: UserRole) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
  hasAccess: (page: Page) => boolean;
  getRedirectPage: () => Page;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await AuthService.revalidateCurrentUser();
      setUser(currentUser);
      return currentUser;
    } catch (error) {
      setUser(null);
      throw error;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        return;
      }
      if (event !== 'TOKEN_REFRESHED' && event !== 'USER_UPDATED') return;

      queueMicrotask(() => {
        void AuthService.revalidateCurrentUser().then((currentUser) => {
          if (active) setUser(currentUser);
        }).catch((error: unknown) => {
          if (active) setUser(null);
          console.error('[AuthContext] Failed to validate Supabase session:', error);
        });
      });
    });

    void AuthService.restoreCurrentUser().then((currentUser) => {
      if (active) setUser(currentUser);
    }).catch((error: unknown) => {
      if (active) setUser(null);
      console.error('[AuthContext] Failed to restore Supabase session:', error);
    }).finally(() => {
      if (active) setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (credentials: LoginCredentials, selectedRole?: UserRole): Promise<AuthUser> => {
    const authenticatedUser = await AuthService.login(credentials, selectedRole);
    setUser(authenticatedUser);
    return authenticatedUser;
  };

  const logout = async () => {
    await AuthService.logout();
    setUser(null);
  };

  const hasAccess = (page: Page): boolean => AuthService.hasAccess(user, page);
  const getRedirectPage = (): Page => user ? AuthService.getRedirectPage(user.role) : 'login';
  const role = user?.role ?? null;

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refreshUser,
        hasAccess,
        getRedirectPage
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
