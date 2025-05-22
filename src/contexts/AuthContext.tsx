
import { api } from "@/services/api";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@/types";
import React, { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  googleLogin: () => Promise<void>;
  logout: () => Promise<void>;
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
    
    setIsLoading(false);
  }, []);

  // Function to check user status in Supabase and handle redirection
  const checkUserStatusAndRedirect = async (userEmail: string) => {
    try {
      console.log("Checking status for user:", userEmail);
      
      // Query the public.users table for user data
      const { data: userData, error } = await supabase
        .from('users')
        .select('email, status_users, level_id')
        .eq('email', userEmail)
        .maybeSingle();

      if (error) {
        console.error("Error checking user status:", error);
        toast.error("Erro ao verificar status do usuário.");
        throw error;
      }

      console.log("User data from Supabase:", userData);

      // Handle different user cases based on requirements
      if (userData) {
        // User exists in the database
        if (userData.status_users === 'active') {
          // User is active, check level and redirect accordingly
          if (userData.level_id === 2) {
            navigate("/admin");
            return { isActive: true, level: 2 };
          } else {
            navigate("/app");
            return { isActive: true, level: 1 };
          }
        } else {
          // User exists but is not active
          toast.warning("Por favor, confirme seu cadastro clicando no link enviado para seu email.");
          navigate("/login");
          return { isActive: false, level: userData.level_id };
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
      toast.error("Falha no login. Verifique suas credenciais.");
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
    <AuthContext.Provider value={{ user, isLoading, login, googleLogin, logout }}>
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
