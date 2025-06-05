
import React, { createContext, useState, useEffect, useContext } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { api } from '@/services/api';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, fullName: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateUser: (data: any) => Promise<void>;
  googleLogin: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendConfirmationEmail: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      setSession(session);
      if (session?.user) {
        // Fetch user data from our custom users table
        try {
          const { data } = await supabase.rpc('check_user_by_email', {
            p_email: session.user.email
          });
          
          if (data && data.length > 0) {
            const userData = data[0];
            setUser({
              id: userData.id,
              email: userData.email,
              full_name: userData.name || '',
              level_id: userData.level_id || 1,
              status: userData.status_users || 'pending',
              email_verified: userData.email_verified || false,
              account_type: 'free',
              created_at: new Date().toISOString(),
              last_login: new Date().toISOString()
            });
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
    };

    loadSession();

    supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session ?? null);
      
      if (session?.user) {
        try {
          const { data } = await supabase.rpc('check_user_by_email', {
            p_email: session.user.email
          });
          
          if (data && data.length > 0) {
            const userData = data[0];
            setUser({
              id: userData.id,
              email: userData.email,
              full_name: userData.name || '',
              level_id: userData.level_id || 1,
              status: userData.status_users || 'pending',
              email_verified: userData.email_verified || false,
              account_type: 'free',
              created_at: new Date().toISOString(),
              last_login: new Date().toISOString()
            });
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await api.auth.login(email, password);
      
      if (response.user && response.session) {
        setUser({
          id: response.user.id,
          email: response.user.email || '',
          full_name: response.user.user_metadata?.full_name || '',
          level_id: 1,
          status: 'active',
          email_verified: !!response.user.email_confirmed_at,
          account_type: 'free',
          created_at: response.user.created_at,
          last_login: new Date().toISOString()
        });
        setSession(response.session);
        setIsLoading(false);
        return { success: true };
      } else {
        setIsLoading(false);
        return { success: false, error: 'Login failed' };
      }
    } catch (error: any) {
      setIsLoading(false);
      return { success: false, error: error.message || 'Login failed' };
    }
  };

  const register = async (email: string, password: string, fullName: string) => {
    try {
      const response = await api.auth.register(email, password, fullName);
      
      if (response.user) {
        setUser({
          id: response.user.id,
          email: response.user.email || '',
          full_name: fullName,
          level_id: 1,
          status: 'pending',
          email_verified: false,
          account_type: 'free',
          created_at: response.user.created_at,
          last_login: new Date().toISOString()
        });
        setSession(response.session);
        setIsLoading(false);
        return { success: true };
      } else {
        setIsLoading(false);
        return { success: false, error: 'Registration failed' };
      }
    } catch (error: any) {
      setIsLoading(false);
      return { success: false, error: error.message || 'Registration failed' };
    }
  };

  const logout = async () => {
    try {
      await api.auth.logout();
      setUser(null);
      setSession(null);
    } catch (error: any) {
      console.error('Logout error:', error.message);
    }
  };

  const updateUser = async (data: any) => {
    try {
      if (!user) throw new Error('No user logged in');
      await api.auth.updateUserProfile(user.id, data);
      setUser({ ...user, ...data });
    } catch (error: any) {
      console.error('Update user error:', error.message);
    }
  };

  const googleLogin = async () => {
    try {
      await api.auth.googleLogin();
    } catch (error: any) {
      console.error('Google login error:', error.message);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await api.auth.resetPassword(email);
    } catch (error: any) {
      console.error('Reset password error:', error.message);
      throw error;
    }
  };

  const resendConfirmationEmail = async (email: string) => {
    try {
      await api.auth.resendConfirmationEmail(email);
    } catch (error: any) {
      console.error('Resend confirmation error:', error.message);
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    session,
    isLoading,
    login,
    register,
    logout,
    updateUser,
    googleLogin,
    resetPassword,
    resendConfirmationEmail,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
