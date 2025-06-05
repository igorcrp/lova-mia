import React, { createContext, useState, useEffect, useContext } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, fullName: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateUser: (data: any) => Promise<void>;
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
      setUser(session?.user ?? null);
      setIsLoading(false);
    };

    loadSession();

    supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setSession(session ?? null);
      setIsLoading(false);
    });
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await api.auth.login(email, password);
      
      // Handle successful login
      if (response.user && response.session) {
        setUser(response.user);
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
      
      // Handle successful registration
      if (response.user) {
        setUser(response.user);
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

  const value: AuthContextType = {
    user,
    session,
    isLoading,
    login,
    register,
    logout,
    updateUser,
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
