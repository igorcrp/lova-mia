
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@/types';
import { api } from '@/services/api';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  googleLogin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        loadUserData(session.user);
      } else {
        setIsLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.info('Auth state changed:', event, session?.user?.email);
      setSession(session);
      
      if (session?.user) {
        await loadUserData(session.user);
      } else {
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserData = async (authUser: SupabaseUser) => {
    try {
      console.info('Loading user data for:', authUser.email);
      
      // Get user data from our API
      const userData = await api.auth.getCurrentUser();
      
      if (userData) {
        setUser(userData);
      } else {
        // Create minimal user object from auth data
        const minimalUser: User = {
          id: authUser.id,
          email: authUser.email!,
          full_name: authUser.user_metadata?.full_name || authUser.email!,
          level_id: 1,
          status: 'active',
          email_verified: !!authUser.email_confirmed_at,
          account_type: 'free',
          created_at: authUser.created_at,
          last_login: authUser.last_sign_in_at
        };
        setUser(minimalUser);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      // Create fallback user object
      const fallbackUser: User = {
        id: authUser.id,
        email: authUser.email!,
        full_name: authUser.user_metadata?.full_name || authUser.email!,
        level_id: 1,
        status: 'active',
        email_verified: !!authUser.email_confirmed_at,
        account_type: 'free',
        created_at: authUser.created_at,
        last_login: authUser.last_sign_in_at,
        avatar_url: authUser.user_metadata?.avatar_url
      };
      setUser(fallbackUser);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const result = await api.auth.login(email, password);
      
      if (result?.user) {
        await loadUserData(result.user);
      }
    } catch (error: any) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, fullName: string) => {
    try {
      setIsLoading(true);
      const result = await api.auth.register(email, password, fullName);
      
      if (result?.user) {
        const newUser: User = {
          id: result.user.id,
          email: result.user.email!,
          full_name: fullName,
          level_id: 1,
          status: 'pending',
          email_verified: !!result.user.email_confirmed_at,
          account_type: 'free',
          created_at: result.user.created_at,
          last_login: result.user.last_sign_in_at
        };
        setUser(newUser);
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      await api.auth.logout();
      setUser(null);
      setSession(null);
    } catch (error: any) {
      console.error('Logout error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await api.auth.resetPassword(email);
    } catch (error: any) {
      console.error('Reset password error:', error);
      throw error;
    }
  };

  const googleLogin = async () => {
    try {
      setIsLoading(true);
      const result = await api.auth.googleLogin();
      
      if (result?.url) {
        window.location.href = result.url;
      }
    } catch (error: any) {
      console.error('Google login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      isLoading,
      login,
      register,
      logout,
      resetPassword,
      googleLogin
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
