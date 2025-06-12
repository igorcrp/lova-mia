
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
  register: (email: string, password: string, fullName: string) => Promise<any>;
  resetPassword: (email: string) => Promise<void>;
  resendConfirmationEmail: (email: string) => Promise<void>;
}

// Define types for API responses to fix TypeScript errors
interface AuthResponse {
  user?: Partial<User>;
  session?: {
    access_token?: string;
    token?: string;
  } | string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check if user is already logged in
    const storedUser = localStorage.getItem("alphaquant-user");
    const storedToken = localStorage.getItem("alphaquant-token");
    
    if (storedUser && storedToken) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        // Check subscription status after setting user
        checkSubscriptionStatus(parsedUser);
      } catch (error) {
        console.error("Failed to parse stored user", error);
        localStorage.removeItem("alphaquant-user");
        localStorage.removeItem("alphaquant-token");
      }
    }
    
    // Check for URL parameters that indicate email confirmation or password reset
    const params = new URLSearchParams(location.search);
    const confirmation = params.get('confirmation');
    const reset = params.get('reset');
    const subscription = params.get('subscription');
    
    if (confirmation === 'true') {
      toast.success("Email confirmado com sucesso! Você já pode fazer login.");
    }
    
    if (reset === 'true') {
      toast.info("Você pode definir uma nova senha agora.");
    }

    if (subscription === 'success') {
      toast.success("Subscription activated successfully!");
      // Remove the parameter from URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('subscription');
      window.history.replaceState({}, '', newUrl.toString());
    }

    if (subscription === 'cancelled') {
      toast.info("Subscription cancelled.");
      // Remove the parameter from URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('subscription');
      window.history.replaceState({}, '', newUrl.toString());
    }
    
    setIsLoading(false);
  }, [location]);

  // Function to check subscription status
  const checkSubscriptionStatus = async (currentUser: User) => {
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (error) {
        console.error('Error checking subscription:', error);
        return;
      }
      
      // Update user with subscription info if needed
      if (data && data.subscription_tier) {
        const updatedUser = { ...currentUser, plan_type: data.subscription_tier };
        setUser(updatedUser);
        localStorage.setItem("alphaquant-user", JSON.stringify(updatedUser));
      }
    } catch (error) {
      console.error('Failed to check subscription status:', error);
    }
  };

  // Function to check user status in Supabase and handle redirection
  const checkUserStatusAndRedirect = async (userEmail: string) => {
    try {
      console.log("Checking status for user:", userEmail);
      
      const { data: userData, error } = await supabase
        .from('users')
        .select('status_users, level_id, plan_type')
        .eq('email', userEmail)
        .maybeSingle();

      if (error) {
        console.error("Error checking user status:", error);
        toast.error("Erro ao verificar status do usuário.");
        throw error;
      }

      console.log("User data from Supabase:", userData);

      if (userData) {
        const userInfo = userData;
        if (userInfo.status_users === 'active') {
          if (userInfo.level_id === 2) {
            navigate("/admin");
            return { isActive: true, level: 2, plan_type: userInfo.plan_type || 'free' };
          } else {
            navigate("/app");
            return { isActive: true, level: 1, plan_type: userInfo.plan_type || 'free' };
          }
        } else {
          toast.warning("Por favor, confirme seu cadastro clicando no link enviado para seu email.");
          await api.auth.resendConfirmationEmail(userEmail);
          toast.info("Um novo email de confirmação foi enviado para você.");
          navigate("/login");
          return { isActive: false, level: userInfo.level_id, plan_type: userInfo.plan_type || 'free' };
        }
      } else {
        toast.info("Cadastro não encontrado. Por favor, registre-se primeiro.");
        navigate("/login");
        return { isActive: false, level: null, plan_type: 'free' };
      }
    } catch (error) {
      console.error("Error checking user status:", error);
      toast.error("Erro ao verificar status do usuário.");
      return { isActive: false, level: null, plan_type: 'free' };
    }
  };
  
  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      console.log("Attempting login for:", email);
      const response = await api.auth.login(email, password) as AuthResponse;
      console.log("Login response:", response);
      
      if (!response || !response.session) {
        throw new Error("Invalid login response from API");
      }
      
      const userStatus = await checkUserStatusAndRedirect(email);
      console.log("User status after check:", userStatus);
      
      if (userStatus.isActive) {
        const userResponse = response.user || {};
        
        const fullUser: User = {
          id: userResponse.id || '',
          email: userResponse.email || email,
          full_name: userResponse.full_name || '',
          level_id: userStatus.level,
          status: 'active',
          email_verified: true,
          account_type: (userResponse.account_type as 'free' | 'premium') || 'free',
          created_at: userResponse.created_at || new Date().toISOString(),
          last_login: userResponse.last_login || new Date().toISOString(),
          avatar_url: userResponse.avatar_url,
          plan_type: userStatus.plan_type || 'free'
        };
        
        let sessionToken = '';
        const session = response.session || {};
        
        if (typeof session === 'string') {
          sessionToken = session;
        } else if (session && typeof session === 'object') {
          sessionToken = session.access_token || session.token || '';
        }
        
        localStorage.setItem("alphaquant-user", JSON.stringify(fullUser));
        localStorage.setItem("alphaquant-token", sessionToken);
        
        setUser(fullUser);
        
        // Check subscription status after login
        checkSubscriptionStatus(fullUser);
        
        toast.success("Login realizado com sucesso!");
      }
    } catch (error) {
      console.error("Login failed", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  
  const googleLogin = async () => {
    try {
      setIsLoading(true);
      console.log("Attempting Google login");
      const response = await api.auth.googleLogin() as AuthResponse;
      console.log("Google login response:", response);
      
      if (!response.user?.email) {
        throw new Error('Failed to get user email from Google login');
      }
      
      const userEmail = response.user.email;
      const userStatus = await checkUserStatusAndRedirect(userEmail);
      console.log("User status after check:", userStatus);
      
      if (userStatus.isActive) {
        const fullUser: User = {
          id: response.user.id || '',
          email: userEmail,
          full_name: response.user.full_name || '',
          level_id: userStatus.level,
          status: 'active',
          email_verified: true,
          account_type: (response.user.account_type as 'free' | 'premium') || 'free',
          created_at: response.user.created_at || new Date().toISOString(),
          last_login: response.user.last_login || new Date().toISOString(),
          avatar_url: response.user.avatar_url,
          plan_type: userStatus.plan_type || 'free'
        };
        
        let sessionToken = '';
        const session = response.session || {};
        
        if (typeof session === 'string') {
          sessionToken = session;
        } else if (session && typeof session === 'object') {
          sessionToken = session.access_token || session.token || '';
        }
        
        localStorage.setItem("alphaquant-user", JSON.stringify(fullUser));
        localStorage.setItem("alphaquant-token", sessionToken);
        
        setUser(fullUser);
        
        // Check subscription status after login
        checkSubscriptionStatus(fullUser);
        
        toast.success("Login realizado com sucesso!");
      }
    } catch (error) {
      console.error("Google login failed", error);
      toast.error("Falha no login com Google.");
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  
  const register = async (email: string, password: string, fullName: string) => {
    try {
      setIsLoading(true);
      console.log("Attempting to register user:", email);
      
      const result = await api.auth.register(email, password, fullName);

      if (result && !result.error) {
        console.log("Registration successful, navigating to login...");
        navigate("/login");
        toast.success("Cadastro realizado com sucesso!");
        toast.info("Enviamos um link de confirmação para o seu email. Por favor, verifique sua caixa de entrada e confirme seu cadastro antes de fazer login.");
      } else {
        console.error("Registration API call failed or returned error:", result);
        toast.error("Ocorreu um erro durante o registro. Tente novamente.");
        throw new Error(result?.error?.message || "Erro desconhecido no registro");
      }

      return result;

    } catch (error: any) {
      console.error("Registration failed in AuthContext:", error);
      toast.error(error.message || "Falha no registro. Verifique os dados e tente novamente.");
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  
  const resetPassword = async (email: string) => {
    try {
      setIsLoading(true);
      console.log("Attempting to reset password for:", email);
      
      await api.auth.resetPassword(email);
      
      toast.success("Email de redefinição de senha enviado com sucesso!");
      toast.info("Por favor, verifique sua caixa de entrada e siga as instruções para redefinir sua senha.");
    } catch (error) {
      console.error("Password reset failed", error);
      toast.error("Falha ao enviar email de redefinição de senha. Tente novamente mais tarde.");
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  
  const resendConfirmationEmail = async (email: string) => {
    try {
      setIsLoading(true);
      console.log("Attempting to resend confirmation email for:", email);
      
      await api.auth.resendConfirmationEmail(email);
      
      toast.success("Email de confirmação reenviado com sucesso!");
      toast.info("Por favor, verifique sua caixa de entrada e confirme seu cadastro.");
    } catch (error) {
      console.error("Resend confirmation email failed", error);
      toast.error("Falha ao reenviar email de confirmação. Tente novamente mais tarde.");
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
      toast.error("Falha ao realizar logout.");
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <AuthContext.Provider value={{ 
      user, 
      isLoading, 
      login, 
      googleLogin, 
      logout, 
      register, 
      resetPassword, 
      resendConfirmationEmail 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
