
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
    
    // Check for hash parameters (Supabase auth tokens)
    const hash = window.location.hash;
    if (hash) {
      const hashParams = new URLSearchParams(hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const tokenType = hashParams.get('type');
      
      if (accessToken && tokenType === 'signup') {
        console.log('Email confirmation detected, processing...');
        handleEmailConfirmation(accessToken);
        return;
      }
    }
    
    if (confirmation === 'true') {
      toast.success("Email confirmado com sucesso! Você já pode fazer login.");
    }
    
    if (reset === 'true') {
      toast.info("Você pode definir uma nova senha agora.");
    }
    
    setIsLoading(false);
  }, [location]);

  // Handle email confirmation when user clicks the link
  const handleEmailConfirmation = async (accessToken: string) => {
    try {
      console.log('Processing email confirmation...');
      
      // Set the session using the access token
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: ''
      });

      if (sessionError) {
        console.error('Error setting session:', sessionError);
        toast.error('Erro ao confirmar email.');
        setIsLoading(false);
        return;
      }

      if (sessionData.user) {
        console.log('User confirmed:', sessionData.user);
        
        // Update user status to active in public.users table
        const { error: updateError } = await supabase
          .from('users')
          .update({ status_users: 'active' })
          .eq('id', sessionData.user.id);

        if (updateError) {
          console.error('Error updating user status:', updateError);
        } else {
          console.log('User status updated to active');
        }

        // Clear the hash from URL
        window.history.replaceState(null, '', window.location.pathname);
        
        toast.success("Email confirmado com sucesso! Você já pode fazer login.");
        navigate("/login?confirmation=true");
      }
    } catch (error) {
      console.error('Error in email confirmation:', error);
      toast.error('Erro ao confirmar email.');
    } finally {
      setIsLoading(false);
    }
  };

  // Function to check user status in Supabase and handle redirection
  const checkUserStatusAndRedirect = async (userEmail: string) => {
    try {
      console.log("Checking status for user:", userEmail);
      
      // Query the public.users table for user data using the RPC function
      const { data: userData, error } = await supabase.rpc('check_user_by_email', {
        p_email: userEmail
      });

      if (error) {
        console.error("Error checking user status:", error);
        toast.error("Erro ao verificar status do usuário.");
        throw error;
      }

      console.log("User data from Supabase:", userData);

      // Handle different user cases based on requirements
      if (userData && userData.length > 0) {
        const userInfo = userData[0];
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
      const response = await api.auth.login(email, password) as AuthResponse;
      console.log("Login response:", response);
      
      if (!response || !response.session) {
        throw new Error("Invalid login response from API");
      }
      
      // Check user status in Supabase and handle redirection
      const userStatus = await checkUserStatusAndRedirect(email);
      console.log("User status after check:", userStatus);
      
      // Only create user object if user is active
      if (userStatus.isActive) {
        // Safely extract user data with default values
        const userResponse = response.user || {};
        
        // Create a user object with all required properties from the User type
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
          avatar_url: userResponse.avatar_url
        };
        
        // Extract token safely
        let sessionToken = '';
        const session = response.session || {};
        
        if (typeof session === 'string') {
          sessionToken = session;
        } else if (session && typeof session === 'object') {
          sessionToken = session.access_token || session.token || '';
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
      const response = await api.auth.googleLogin() as AuthResponse;
      console.log("Google login response:", response);
      
      if (!response.user?.email) {
        throw new Error('Failed to get user email from Google login');
      }
      
      // Check user status in Supabase and handle redirection
      const userEmail = response.user.email;
      const userStatus = await checkUserStatusAndRedirect(userEmail);
      console.log("User status after check:", userStatus);
      
      // Only create user object if user is active
      if (userStatus.isActive) {
        // Create a user object with all required properties from the User type
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
          avatar_url: response.user.avatar_url
        };
        
        // Extract token safely
        let sessionToken = '';
        const session = response.session || {};
        
        if (typeof session === 'string') {
          sessionToken = session;
        } else if (session && typeof session === 'object') {
          sessionToken = session.access_token || session.token || '';
        }
        
        // Store user and token
        localStorage.setItem("alphaquant-user", JSON.stringify(fullUser));
        localStorage.setItem("alphaquant-token", sessionToken);
        
        setUser(fullUser);
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
      
      return result;
    } catch (error) {
      console.error("Registration failed", error);
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
