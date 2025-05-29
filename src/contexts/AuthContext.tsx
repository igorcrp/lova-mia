
import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@/types';
import { toast } from 'sonner';
import { api } from '@/services/api';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  googleLogin: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendConfirmationEmail: (email: string) => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for confirmation token on page load
    const handleConfirmation = async () => {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const tokenType = hashParams.get('token_type');
      const type = hashParams.get('type');
      
      if (accessToken && tokenType && type === 'signup') {
        try {
          // Set the session with the tokens from the URL
          const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: hashParams.get('refresh_token') || ''
          });

          if (sessionError) {
            console.error('Session error:', sessionError);
            throw sessionError;
          }

          if (sessionData.user) {
            // Update user status to active in the database
            const { error: updateError } = await supabase
              .from('users')
              .update({ status_users: 'active' })
              .eq('auth_user_id', sessionData.user.id);

            if (updateError) {
              console.error('Error updating user status:', updateError);
            }

            // Clear the URL hash
            window.history.replaceState(null, '', window.location.pathname);
            
            // Show success message and redirect to login
            toast.success('Email confirmado com sucesso!');
            window.location.href = '/login?confirmation=true';
            return;
          }
        } catch (error) {
          console.error('Confirmation error:', error);
          toast.error('Erro ao confirmar email. Tente novamente.');
          // Clear the URL hash
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    };

    handleConfirmation();

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchUserProfile(session.user);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email);
        
        if (session?.user) {
          await fetchUserProfile(session.user);
        } else {
          setUser(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (authUser: SupabaseUser) => {
    try {
      const { data: userProfile, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .single();

      if (error) {
        console.error('Error fetching user profile:', error);
        setUser(null);
      } else if (userProfile) {
        const user: User = {
          id: userProfile.id,
          email: userProfile.email,
          full_name: userProfile.name || '',
          level_id: userProfile.level_id || 1,
          status: userProfile.status_users || 'pending',
          email_verified: userProfile.email_verified || false,
          account_type: 'free',
          created_at: userProfile.created_at,
          last_login: new Date().toISOString()
        };
        setUser(user);
      }
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      // Check if user exists in database first
      const existingUser = await api.auth.checkUserByEmail(email);
      
      if (!existingUser) {
        throw new Error('USER_NOT_FOUND');
      }

      // Check if user is still pending
      if (existingUser.status_users === 'pending') {
        throw new Error('PENDING_CONFIRMATION');
      }

      const result = await api.auth.login(email, password);
      
      if (result.user) {
        await fetchUserProfile(result.user);
        
        // Redirect based on user level
        if (user?.level_id === 2) {
          window.location.href = '/admin';
        } else {
          window.location.href = '/app';
        }
      }
    } catch (error: any) {
      console.error('Login error:', error);
      
      if (error.message === 'USER_NOT_FOUND') {
        toast.error('Email não encontrado. Por favor, registre-se primeiro.');
        throw error;
      } else if (error.message === 'PENDING_CONFIRMATION') {
        throw error;
      } else {
        toast.error('Erro no login. Verifique suas credenciais.');
        throw error;
      }
    }
  };

  const register = async (email: string, password: string, fullName: string) => {
    try {
      // Check if email already exists
      const existingUser = await api.auth.checkUserByEmail(email);
      
      if (existingUser) {
        toast.error('O email informado já foi cadastrado. Escolha outro email.');
        return { success: false, message: 'Email já cadastrado' };
      }

      const result = await api.auth.register(email, password, fullName);
      
      if (result.user) {
        // The trigger should handle creating the user profile
        return { success: true };
      }
      
      return { success: false };
    } catch (error: any) {
      console.error('Registration error:', error);
      
      if (error.message?.includes('already registered')) {
        toast.error('O email informado já foi cadastrado. Escolha outro email.');
        return { success: false, message: 'Email já cadastrado' };
      }
      
      throw error;
    }
  };

  const googleLogin = async () => {
    try {
      const result = await api.auth.googleLogin();
      console.log('Google login result:', result);
    } catch (error: any) {
      console.error('Google login error:', error);
      toast.error('Erro no login com Google. Tente novamente.');
      throw error;
    }
  };

  const logout = async () => {
    try {
      await api.auth.signOut();
      setUser(null);
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Erro ao fazer logout.');
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await api.auth.resetPassword(email);
      toast.success('Instruções de recuperação de senha enviadas para seu email.');
    } catch (error: any) {
      console.error('Reset password error:', error);
      toast.error('Erro ao enviar email de recuperação.');
      throw error;
    }
  };

  const resendConfirmationEmail = async (email: string) => {
    try {
      await api.auth.resendConfirmationEmail(email);
      // Success message is handled by the caller
    } catch (error: any) {
      console.error('Resend confirmation error:', error);
      toast.error('Erro ao enviar email de confirmação.');
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      login,
      register,
      logout,
      googleLogin,
      resetPassword,
      resendConfirmationEmail,
      loading
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
