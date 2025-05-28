
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
    // Check for existing Supabase session first
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          // Get user data from our users table
          const { data: userData, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', session.user.email)
            .maybeSingle();

          if (userData && !error) {
            const fullUser: User = {
              id: userData.id,
              email: userData.email,
              full_name: userData.name || '',
              level_id: userData.level_id || 1,
              status: userData.status_users as 'active' | 'pending' | 'inactive' || 'active',
              email_verified: userData.email_verified || false,
              account_type: 'free' as 'free' | 'premium',
              created_at: userData.created_at || new Date().toISOString(),
              last_login: new Date().toISOString(),
              avatar_url: undefined
            };

            setUser(fullUser);
            localStorage.setItem("alphaquant-user", JSON.stringify(fullUser));
            localStorage.setItem("alphaquant-token", session.access_token);
          }
        }
      } catch (error) {
        console.error("Error checking session:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("Auth state changed:", event, session?.user?.email);
        
        if (event === 'SIGNED_IN' && session?.user) {
          // User signed in, get their data from users table
          const { data: userData, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', session.user.email)
            .maybeSingle();

          if (userData && !error) {
            const fullUser: User = {
              id: userData.id,
              email: userData.email,
              full_name: userData.name || '',
              level_id: userData.level_id || 1,
              status: userData.status_users as 'active' | 'pending' | 'inactive' || 'active',
              email_verified: userData.email_verified || false,
              account_type: 'free' as 'free' | 'premium',
              created_at: userData.created_at || new Date().toISOString(),
              last_login: new Date().toISOString(),
              avatar_url: undefined
            };

            setUser(fullUser);
            localStorage.setItem("alphaquant-user", JSON.stringify(fullUser));
            localStorage.setItem("alphaquant-token", session.access_token);

            // Redirect based on user level
            if (fullUser.level_id === 2) {
              navigate("/admin");
            } else {
              navigate("/app");
            }
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          localStorage.removeItem("alphaquant-user");
          localStorage.removeItem("alphaquant-token");
          navigate("/login");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

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
      
      // Use Supabase auth directly
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      if (data.user) {
        toast.success("Login realizado com sucesso!");
        // The auth state change listener will handle the rest
      }
    } catch (error: any) {
      console.error("Login failed", error);
      toast.error(error.message || "Falha no login. Verifique suas credenciais.");
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  
  const googleLogin = async () => {
    try {
      setIsLoading(true);
      console.log("Attempting Google login");
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/app`
        }
      });

      if (error) {
        throw error;
      }

      // The redirect will handle the rest
    } catch (error: any) {
      console.error("Google login failed", error);
      toast.error(error.message || "Falha no login com Google.");
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  
  const logout = async () => {
    try {
      setIsLoading(true);
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        throw error;
      }

      // Clear storage
      localStorage.removeItem("alphaquant-user");
      localStorage.removeItem("alphaquant-token");
      
      setUser(null);
      navigate("/login");
      
      toast.success("Logout realizado com sucesso!");
    } catch (error: any) {
      console.error("Logout failed", error);
      toast.error(error.message || "Falha ao realizar logout.");
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
