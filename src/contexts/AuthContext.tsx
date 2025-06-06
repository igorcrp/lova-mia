import { api } from "@/services/api";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@/types";
import React, { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";
import type { AuthResponse } from "@supabase/supabase-js";

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
  user?: any;
  session?: any;
  error?: any;
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
        setUser(JSON.parse(storedUser));
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
    
    if (confirmation === 'true') {
      toast.success("Email confirmado com sucesso! Você já pode fazer login.");
    }
    
    if (reset === 'true') {
      toast.info("Você pode definir uma nova senha agora.");
    }
    
    setIsLoading(false);
  }, [location]);

  // Function to check user status in Supabase and handle redirection
  const checkUserStatusAndRedirect = async (userEmail: string) => {
    try {
      console.log("Checking status for user:", userEmail);
      
      // CORRIGIDO: Consulta direta à tabela public.users
      const { data: userData, error } = await supabase
        .from('users')
        .select('status_users, level_id')
        .eq('email', userEmail)
        .maybeSingle(); // Use maybeSingle() para obter um único objeto ou null

      if (error) {
        console.error("Error checking user status:", error);
        toast.error("Erro ao verificar status do usuário.");
        throw error;
      }

      console.log("User data from Supabase:", userData);

      // CORRIGIDO: Verifica se userData não é null (resultado de maybeSingle())
      if (userData) {
        const userInfo = userData; // userData já é o objeto do usuário
        // User exists in the database
        if (userInfo.status_users === 'active') {
          // User is active, check level and redirect accordingly
          if (userInfo.level_id === 2) {
            navigate("/admin");
            return { isActive: true, level: 2 };
          } else {
            navigate("/app");
            return { isActive: true, level: 1 };
          }
        } else {
          // User exists but is not active
          toast.warning("Por favor, confirme seu cadastro clicando no link enviado para seu email.");
          // Automatically resend confirmation email
          await api.auth.resendConfirmationEmail(userEmail);
          toast.info("Um novo email de confirmação foi enviado para você.");
          navigate("/login");
          return { isActive: false, level: userInfo.level_id };
        }
      } else {
        // User doesn't exist in the database
        toast.info("Cadastro não encontrado. Por favor, registre-se primeiro.");
        navigate("/login");
        return { isActive: false, level: null };
      }
    } catch (error) {
      console.error("Error checking user status:", error);
      toast.error("Erro ao verificar status do usuário.");
      return { isActive: false, level: null };
    }
  };
  
  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      console.log("Attempting login for:", email);
      const response = await api.auth.login(email, password);
      console.log("Login response:", response);
      
      if (!response || !response.session) {
        throw new Error("Invalid login response from API");
      }
      
      // Check user status in Supabase and handle redirection
      const userStatus = await checkUserStatusAndRedirect(email);
      console.log("User status after check:", userStatus);
      
      // Only create user object if user is active
      if (userStatus.isActive) {
        // Safely extract user data with proper typing
        const userResponse = response.user || null;
        
        // Create a user object with all required properties from the User type
        const fullUser: User = {
          id: userResponse?.id || '',
          email: userResponse?.email || email,
          full_name: userResponse?.user_metadata?.full_name || '',
          level_id: userStatus.level,
          status: 'active',
          email_verified: true,
          account_type: (userResponse?.user_metadata?.account_type as 'free' | 'premium') || 'free',
          created_at: userResponse?.created_at || new Date().toISOString(),
          last_login: userResponse?.last_sign_in_at || new Date().toISOString(),
          avatar_url: userResponse?.user_metadata?.avatar_url
        };
        
        // Extract token safely
        let sessionToken = '';
        const session = response.session;
        
        if (session && typeof session === 'object' && 'access_token' in session) {
          sessionToken = session.access_token;
        }
        
        // Store user and token
        localStorage.setItem("alphaquant-user", JSON.stringify(fullUser));
        localStorage.setItem("alphaquant-token", sessionToken);
        
        setUser(fullUser);
        toast.success("Login realizado com sucesso!");
      }
    } catch (error) {
      console.error("Login failed", error);
      throw error; // Let the component handle the error
    } finally {
      setIsLoading(false);
    }
  };
  
  const googleLogin = async () => {
    try {
      setIsLoading(true);
      console.log("Attempting Google login");
      
      // Use Supabase auth directly for Google OAuth
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/app`
        }
      });
      
      if (error) {
        console.error("Google login error:", error);
        toast.error("Falha no login com Google.");
        throw error;
      }
      
      console.log("Google login response:", data);
      
      // For OAuth, the response contains a URL for redirection
      if (data.url) {
        window.location.href = data.url;
        return;
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
      
      // Call the API function
      const result = await api.auth.register(email, password, fullName);

      // Check if the API call was successful
      if (result && !result.error) {
        console.log("Registration successful, navigating to login...");
        // Try navigating FIRST
        navigate("/login");
        // Then show messages
        toast.success("Cadastro realizado com sucesso!");
        toast.info("Enviamos um link de confirmação para o seu email. Por favor, verifique sua caixa de entrada e confirme seu cadastro antes de fazer login.");
      } else {
        // Handle API error case
        console.error("Registration API call failed or returned error:", result);
        toast.error("Ocorreu um erro durante o registro. Tente novamente.");
        throw new Error(result?.error?.message || "Erro desconhecido no registro");
      }

      return result; // Return result for potential further use

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
      
      const result = await api.auth.resetPassword(email);
      
      // Check if there was an error in the result
      if (result && result.error) {
        throw new Error(result.error.message || "Failed to send reset email");
      }
      
      toast.success("Email de redefinição de senha enviado com sucesso!");
      toast.info("Por favor, verifique sua caixa de entrada e siga as instruções para redefinir sua senha.");
    } catch (error: any) {
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
      
      // Clear storage
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
