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
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          await syncUserData(session.user);
        }
      } catch (error) {
        console.error("Error checking session:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("Auth state changed:", event, session?.user?.email);
        
        if (event === 'SIGNED_IN' && session?.user) {
          await syncUserData(session.user);
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

    const syncUserData = async (authUser: any) => {
      try {
        // Verificar se o email foi confirmado no auth.users
        const isEmailVerified = authUser.email_confirmed_at ? true : false;
        
        let { data: userData, error } = await supabase
          .from('users')
          .select('*')
          .eq('email', authUser.email)
          .maybeSingle();
    
        if (!userData && !error) {
          console.log("Creating user profile for new login:", authUser.email);
          const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert({
              email: authUser.email,
              name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || '',
              auth_user_id: authUser.id,
              auth_id: authUser.id,
              level_id: 1, // Default para usuário regular
              status_users: 'active',
              email_verified: isEmailVerified
            })
            .select()
            .single();
    
          if (insertError) {
            console.error("Error creating user profile:", insertError);
            throw insertError;
          } else {
            userData = newUser;
          }
        } else if (userData && !error) {
          // Atualizar o status de verificação de email se necessário
          if (isEmailVerified !== userData.email_verified) {
            const { error: updateError } = await supabase
              .from('users')
              .update({ email_verified: isEmailVerified })
              .eq('email', authUser.email);
              
            if (updateError) {
              console.error("Error updating email verification status:", updateError);
            } else {
              userData.email_verified = isEmailVerified;
            }
          }
        }
    
        if (userData && !error) {
          // Verificar se o email foi confirmado antes de prosseguir
          if (!isEmailVerified) {
            toast.error("Por favor, confirme seu email antes de fazer login.");
            await supabase.auth.signOut();
            navigate("/login");
            return;
          }
          
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
          
          // Get the session to access the token
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            localStorage.setItem("alphaquant-token", session.access_token);
          }
    
          // Redirect based on user level
          if (userData.level_id === 2) {
            navigate("/admin");
          } else {
            navigate("/app");
          }
        }
      } catch (error) {
        console.error("Error syncing user data:", error);
        toast.error("Erro ao sincronizar dados do usuário. Por favor, tente novamente.");
        await supabase.auth.signOut();
        navigate("/login");
      }
    };


const login = async (email: string, password: string) => {
  try {
    setIsLoading(true);
    console.log("Attempting login for:", email);
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    if (data.user) {
      // Get the session after successful login
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await syncUserData(data.user);
        toast.success("Login realizado com sucesso!");
      } else {
        throw new Error("Failed to get session after login");
      }
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
