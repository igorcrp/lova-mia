import { api } from "@/services/api";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@/types";
import React, { createContext, useContext, useEffect, useState } from "react";
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

interface AuthResponse {
  data?: {
    user?: Partial<User>;
    session?: {
      access_token?: string;
      token?: string;
    } | string;
  };
  error?: any;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Utility function to clean up auth state completely
const cleanupAuthState = () => {
  localStorage.removeItem("alphaquant-user");
  localStorage.removeItem("alphaquant-token");
  // Clean up all Supabase auth keys
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
      localStorage.removeItem(key);
    }
  });
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Set up auth state listener first
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            console.log('Auth state changed:', event, session?.user?.email);
            
            if (event === 'SIGNED_OUT' || !session) {
              cleanupAuthState();
              setUser(null);
              if (location.pathname !== '/login') {
                navigate('/login');
              }
              return;
            }

            if (event === 'SIGNED_IN' && session?.user) {
              // Only handle user setup, avoid navigation during tab switches
              setTimeout(async () => {
                await handleSignedInUser(session.user.email!, session.user, true); // Always skip redirect for state changes
              }, 0);
            }
          }
        );

        // Check for existing session - only redirect on initial load
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setTimeout(async () => {
            await handleSignedInUser(session.user.email!, session.user, false); // Allow redirect only on initial load
            setIsInitialized(true);
          }, 0);
        } else {
          // Check localStorage as fallback
          const storedUser = localStorage.getItem("alphaquant-user");
          const storedToken = localStorage.getItem("alphaquant-token");
          
          if (storedUser && storedToken) {
            try {
              setUser(JSON.parse(storedUser));
              setIsInitialized(true);
            } catch (error) {
              console.error("Failed to parse stored user", error);
              cleanupAuthState();
            }
          } else {
            setIsInitialized(true);
          }
        }

        return () => subscription.unsubscribe();
      } catch (error) {
        console.error("Auth initialization error:", error);
        setIsInitialized(true);
      } finally {
        setIsLoading(false);
      }
    };

    const handleSignedInUser = async (userEmail: string, authUser?: any, skipRedirect: boolean = false) => {
      try {
        console.log("Handling signed in user:", userEmail, "skipRedirect:", skipRedirect);
        
        // First check if user exists in public.users
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('status_users, level_id, name, plan_type, id')
          .eq('email', userEmail)
          .maybeSingle();

        if (userError) {
          console.error("Error checking user status:", userError);
          return;
        }

        // If user doesn't exist in public.users but exists in auth.users, create them
        if (!userData && authUser) {
          console.log("User not found in public.users, creating...");
          
          const fullName = authUser.user_metadata?.full_name || 
                          authUser.user_metadata?.name || 
                          authUser.email?.split('@')[0] || 
                          'User';

          const { error: insertError } = await supabase
            .from('users')
            .insert([
              {
                id: authUser.id,
                email: userEmail,
                name: fullName,
                level_id: 1,
                status_users: 'active',
                plan_type: 'free',
                created_at: new Date().toISOString(),
              }
            ]);

          if (insertError) {
            console.error("Error creating user in public.users:", insertError);
            return;
          }

          // Fetch the newly created user
          const { data: newUserData } = await supabase
            .from('users')
            .select('status_users, level_id, name, plan_type, id')
            .eq('email', userEmail)
            .single();

          if (newUserData) {
            const fullUser: User = {
              id: newUserData.id || '',
              email: userEmail,
              full_name: newUserData.name || '',
              level_id: newUserData.level_id || 1,
              status: 'active',
              email_verified: true,
              account_type: (newUserData.plan_type as 'free' | 'premium') || 'free'
            };

            localStorage.setItem("alphaquant-user", JSON.stringify(fullUser));
            setUser(fullUser);

            // Only redirect on initial load and if we're on login/root page
            if (!skipRedirect && (location.pathname === '/login' || location.pathname === '/')) {
              const targetPath = newUserData.level_id === 2 ? "/admin" : "/app";
              navigate(targetPath);
            }
          }
        } else if (userData && userData.status_users === 'active') {
          const fullUser: User = {
            id: userData.id || '',
            email: userEmail,
            full_name: userData.name || '',
            level_id: userData.level_id || 1,
            status: 'active',
            email_verified: true,
            account_type: (userData.plan_type as 'free' | 'premium') || 'free'
          };

          localStorage.setItem("alphaquant-user", JSON.stringify(fullUser));
          setUser(fullUser);

          // Only redirect on initial load and if we're on login/root page
          if (!skipRedirect && (location.pathname === '/login' || location.pathname === '/')) {
            const targetPath = userData.level_id === 2 ? "/admin" : "/app";
            navigate(targetPath);
          }
        } else if (userData && userData.status_users === 'pending') {
          console.log("User account is pending confirmation");
          // Set user with pending status instead of navigating away
          const pendingUser: User = {
            id: userData.id || '',
            email: userEmail,
            full_name: userData.name || '',
            level_id: userData.level_id || 1,
            status: 'pending',
            email_verified: false,
            account_type: (userData.plan_type as 'free' | 'premium') || 'free'
          };
          
          localStorage.setItem("alphaquant-user", JSON.stringify(pendingUser));
          setUser(pendingUser);
          navigate("/login");
        } else {
          console.log("User not found in database");
          navigate("/login");
        }
      } catch (error) {
        console.error("Error handling signed in user:", error);
      }
    };

    initializeAuth();
  }, [location, navigate]);
  
  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      
      // Clean up any existing auth state first
      cleanupAuthState();
      await supabase.auth.signOut({ scope: 'global' }).catch(() => {});
      
      console.log("Attempting login for:", email);
      const response = await api.auth.login(email, password) as AuthResponse;
      
      if (!response || !response.data || !response.data.user || !response.data.session) {
        throw new Error("Invalid login response from API");
      }

      // The onAuthStateChange will handle the rest
      
    } catch (error: any) {
      console.error("Login failed", error);
      
      // Check if user exists but is pending
      try {
        const { data } = await supabase.rpc('check_user_by_email', {
          p_email: email
        });
        
        if (data && data.length > 0 && data[0].status_users === 'pending') {
          await api.auth.resendConfirmationEmail(email);
          throw new Error("PENDING_CONFIRMATION");
        }
      } catch (checkError) {
        console.error("Error checking user status:", checkError);
      }
      
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  
  const googleLogin = async () => {
    try {
      setIsLoading(true);
      
      // Clean up any existing auth state first
      cleanupAuthState();
      await supabase.auth.signOut({ scope: 'global' }).catch(() => {});
      
      console.log("Attempting Google login");
      
      // Use Supabase directly for Google OAuth
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/login?provider=google`
        }
      });
      
      if (error) {
        console.error("Google login error:", error);
        throw error;
      }
      
      console.log("Google login initiated successfully:", data);
      
      // The redirect and onAuthStateChange will handle the rest
      
    } catch (error) {
      console.error("Google login failed", error);
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
        return { success: true };
      } else {
        console.error("Registration API call failed:", result);
        throw new Error(result?.error?.message || "Registration failed");
      }
    } catch (error: any) {
      console.error("Registration failed in AuthContext:", error);
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
    } catch (error) {
      console.error("Password reset failed", error);
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
    } catch (error) {
      console.error("Resend confirmation email failed", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  
  const logout = async () => {
    try {
      setIsLoading(true);
      
      // Clean up state first
      cleanupAuthState();
      setUser(null);
      
      // Attempt to logout from API
      try {
        await api.auth.logout();
      } catch (error) {
        console.error("API logout failed:", error);
      }
      
      // Attempt Supabase logout
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (error) {
        console.error("Supabase logout failed:", error);
      }
      
      // Force navigation and page refresh for clean state
      window.location.href = '/login';
      
    } catch (error) {
      console.error("Logout failed", error);
      // Force redirect even if logout fails
      window.location.href = '/login';
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
