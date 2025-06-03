import { api } from "@/services/api";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@/types";
import React, { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  googleLogin: () => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendConfirmationEmail: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // Initialize auth state
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedUser = localStorage.getItem("alphaquant-user");
        const storedToken = localStorage.getItem("alphaquant-token");

        if (storedUser && storedToken) {
          const parsedUser = JSON.parse(storedUser);
          
          // Verify token validity
          const isValid = await api.auth.verifyToken(storedToken);
          if (isValid) {
            setUser(parsedUser);
          } else {
            localStorage.removeItem("alphaquant-user");
            localStorage.removeItem("alphaquant-token");
          }
        }
      } catch (error) {
        console.error("Failed to initialize auth", error);
        localStorage.removeItem("alphaquant-user");
        localStorage.removeItem("alphaquant-token");
      } finally {
        // Handle URL query params for feedback messages
        const params = new URLSearchParams(location.search);
        if (params.get('confirmation') === 'true') {
          toast.success("Email confirmado com sucesso!");
        }
        if (params.get('reset') === 'true') {
          toast.info("Você pode definir uma nova senha agora.");
        }

        setIsLoading(false);
      }
    };

    initializeAuth();
  }, [location]);

  const checkUserStatus = async (email: string) => {
    try {
      const { data: userData, error } = await supabase
        .from('users')
        .select('status_users, level_id')
        .eq('email', email)
        .single();

      if (error) throw error;
      return userData;
    } catch (error) {
      console.error("Error checking user status:", error);
      toast.error("Erro ao verificar status do usuário.");
      throw error;
    }
  };

  const handleSuccessfulAuth = async (userData: Partial<User>, token: string, email: string) => {
    const userStatus = await checkUserStatus(email);
    if (!userStatus) throw new Error("Failed to verify user status");

    if (userStatus.status_users !== 'active') {
      await api.auth.resendConfirmationEmail(email);
      throw new Error("User not active - confirmation email resent");
    }

    const fullUser: User = {
      id: userData.id || '',
      email: email,
      full_name: userData.full_name || '',
      level_id: userStatus.level_id || 1,
      status: 'active',
      email_verified: true,
      account_type: (userData.account_type as 'free' | 'premium') || 'free',
      created_at: userData.created_at || new Date().toISOString(),
      last_login: new Date().toISOString(),
      avatar_url: userData.avatar_url
    };

    localStorage.setItem("alphaquant-user", JSON.stringify(fullUser));
    localStorage.setItem("alphaquant-token", token);
    setUser(fullUser);

    // Redirect based on user level
    navigate(userStatus.level_id === 2 ? "/admin" : "/app");
    toast.success("Autenticação realizada com sucesso!");
  };

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const response = await api.auth.login(email, password);
      
      if (!response?.session) {
        throw new Error("Invalid login response");
      }

      const token = typeof response.session === 'string' 
        ? response.session 
        : response.session?.access_token || '';

      await handleSuccessfulAuth(response.user || {}, token, email);
    } catch (error) {
      console.error("Login failed", error);
      toast.error(error instanceof Error ? error.message : "Falha no login");
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const googleLogin = async () => {
    try {
      setIsLoading(true);
      const response = await api.auth.googleLogin();
      
      if (!response?.user?.email) {
        throw new Error('Failed to get user email from Google login');
      }

      const token = typeof response.session === 'string' 
        ? response.session 
        : response.session?.access_token || '';

      await handleSuccessfulAuth(response.user, token, response.user.email);
    } catch (error) {
      console.error("Google login failed", error);
      toast.error(error instanceof Error ? error.message : "Falha no login com Google");
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, fullName: string) => {
    try {
      setIsLoading(true);
      const result = await api.auth.register(email, password, fullName);

      if (result?.error) {
        throw new Error(result.error.message || "Erro no registro");
      }

      navigate("/login");
      toast.success("Cadastro realizado com sucesso!");
      toast.info("Enviamos um link de confirmação para seu email. Por favor, verifique sua caixa de entrada.");
    } catch (error) {
      console.error("Registration failed", error);
      toast.error(error instanceof Error ? error.message : "Falha no registro");
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    try {
      setIsLoading(true);
      await api.auth.resetPassword(email);
      
      toast.success("Email de redefinição enviado!");
      toast.info("Verifique sua caixa de entrada para as instruções.");
    } catch (error) {
      console.error("Password reset failed", error);
      toast.error("Falha ao enviar email de redefinição");
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const resendConfirmationEmail = async (email: string) => {
    try {
      setIsLoading(true);
      await api.auth.resendConfirmationEmail(email);
      
      toast.success("Email de confirmação reenviado!");
      toast.info("Verifique sua caixa de entrada para confirmar seu cadastro.");
    } catch (error) {
      console.error("Resend confirmation failed", error);
      toast.error("Falha ao reenviar email de confirmação");
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      await api.auth.logout();
      
      localStorage.removeItem("alphaquant-user");
      localStorage.removeItem("alphaquant-token");
      setUser(null);
      navigate("/login");
      toast.success("Logout realizado com sucesso!");
    } catch (error) {
      console.error("Logout failed", error);
      toast.error("Falha ao realizar logout");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        googleLogin,
        logout,
        register,
        resetPassword,
        resendConfirmationEmail,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
