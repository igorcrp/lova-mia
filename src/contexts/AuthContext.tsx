import { api } from "@/services/api";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@/types";
import { logger } from "@/utils/logger";
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
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        // Set up auth state listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            if (!mounted) return;
            
            logger.log('Auth state changed:', event, session?.user?.email || 'no user');
            
            if (event === 'SIGNED_OUT' || !session?.user) {
              cleanupAuthState();
              setUser(null);
              if (location.pathname !== '/login') {
                navigate('/login');
              }
              return;
            }

            if (session?.user) {
              // Defer user processing to avoid conflicts
              setTimeout(() => {
                if (mounted) {
                  handleSignedInUser(session.user.email!, session.user);
                }
              }, 100);
            }
          }
        );

        // Check for existing session
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && mounted) {
          await handleSignedInUser(session.user.email!, session.user);
        }

        // Clean up on unmount
        return () => {
          mounted = false;
          subscription.unsubscribe();
        };
      } catch (error) {
        logger.error("Auth initialization error:", error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    const handleSignedInUser = async (userEmail: string, authUser: any) => {
      if (!mounted) return;
      
      try {
        logger.log("Processing user:", userEmail);
        
        // Check if user exists in public.users
        const { data: initialUserData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('email', userEmail)
          .maybeSingle();

        if (userError) {
          logger.error("Error checking user:", userError);
          return;
        }

        let userData = initialUserData;

        if (!userData) {
          // Create user if doesn't exist
          logger.log("Creating new user record");
          const fullName = authUser.user_metadata?.full_name || 
                          authUser.user_metadata?.name || 
                          authUser.email?.split('@')[0] || 
                          'User';

          const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert([{
              id: authUser.id,
              email: userEmail,
              name: fullName,
              level_id: 1,
              status_users: 'active',
              plan_type: 'free'
            }])
            .select()
            .single();

          if (insertError) {
            logger.error("Error creating user:", insertError);
            return;
          }

          userData = newUser;
        }

        // Set user state
        if (userData && mounted) {
          const fullUser: User = {
            id: userData.id,
            email: userData.email,
            full_name: userData.name || '',
            level_id: userData.level_id || 1,
            status: userData.status_users || 'active',
            email_verified: userData.status_users === 'active',
            account_type: userData.plan_type || 'free'
          };

          localStorage.setItem("alphaquant-user", JSON.stringify(fullUser));
          setUser(fullUser);

          // Navigate based on user level and current location
          if (location.pathname === '/login' || location.pathname === '/') {
            const targetPath = userData.level_id >= 2 ? "/admin" : "/app";
            navigate(targetPath);
          }
        }
      } catch (error) {
        logger.error("Error handling signed in user:", error);
      }
    };

    initializeAuth();
  }, [location.pathname, navigate]);
  
  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      
      // Clean up any existing auth state first
      cleanupAuthState();
      await supabase.auth.signOut({ scope: 'global' }).catch(() => {});
      
      logger.log("Attempting login for:", email);
      const response = await api.auth.login(email, password) as AuthResponse;
      
      if (!response || !response.data || !response.data.user || !response.data.session) {
        throw new Error("Invalid login response from API");
      }

      // The onAuthStateChange will handle the rest
      
    } catch (error: any) {
      logger.error("Login failed", error);
      
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
        logger.error("Error checking user status:", checkError);
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
      
      logger.log("Attempting Google login");
      
      // Use Supabase directly for Google OAuth
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/login?provider=google`
        }
      });
      
      if (error) {
        logger.error("Google login error:", error);
        throw error;
      }
      
      logger.log("Google login initiated successfully:", data);
      
      // The redirect and onAuthStateChange will handle the rest
      
    } catch (error) {
      logger.error("Google login failed", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  
  const register = async (email: string, password: string, fullName: string) => {
    try {
      setIsLoading(true);
      logger.log("Attempting to register user:", email);
      
      const result = await api.auth.register(email, password, fullName);

      if (result && !result.error) {
        logger.log("Registration successful, navigating to login...");
        navigate("/login");
        return { success: true };
      } else {
        logger.error("Registration API call failed:", result);
        throw new Error(result?.error?.message || "Registration failed");
      }
    } catch (error: any) {
      logger.error("Registration failed in AuthContext:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  
  const resetPassword = async (email: string) => {
    try {
      setIsLoading(true);
      logger.log("Attempting to reset password for:", email);
      await api.auth.resetPassword(email);
    } catch (error) {
      logger.error("Password reset failed", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  
  const resendConfirmationEmail = async (email: string) => {
    try {
      setIsLoading(true);
      logger.log("Attempting to resend confirmation email for:", email);
      await api.auth.resendConfirmationEmail(email);
    } catch (error) {
      logger.error("Resend confirmation email failed", error);
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
        logger.error("API logout failed:", error);
      }
      
      // Attempt Supabase logout
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (error) {
        logger.error("Supabase logout failed:", error);
      }
      
      // Navigate to login instead of forcing page refresh
      navigate('/login', { replace: true });
      
    } catch (error) {
      logger.error("Logout failed", error);
      // Navigate to login even if logout fails
      navigate('/login', { replace: true });
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
