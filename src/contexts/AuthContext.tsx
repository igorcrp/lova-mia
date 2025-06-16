import { api } from "@/services/api";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@/types";
import React, { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";

// Define the shape of the authentication context
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  googleLogin: () => Promise<void>;
  logout: () => Promise<void>;
  // Use the specific return type from api.auth.register
  register: (email: string, password: string, fullName: string) => Promise<{ user: User | null; session: any; success: boolean }>;
  resetPassword: (email: string) => Promise<void>;
  resendConfirmationEmail: (email: string) => Promise<void>;
}

// Define the return type for checkUserStatusAndRedirect
interface UserStatusInfo {
  isActive: boolean;
  level: number | null; // level_id from users table
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check if user is already logged in from local storage
    const storedUser = localStorage.getItem("alphaquant-user");
    const storedToken = localStorage.getItem("alphaquant-token"); // Token might be used for session validation later
    
    if (storedUser && storedToken) {
      try {
        const parsedUser: User = JSON.parse(storedUser);
        setUser(parsedUser);
      } catch (error) {
        console.error("Failed to parse stored user. Clearing storage.", error);
        localStorage.removeItem("alphaquant-user");
        localStorage.removeItem("alphaquant-token");
      }
    }
    
    // Check for URL parameters that indicate email confirmation or password reset
    const params = new URLSearchParams(location.search);
    const confirmation = params.get('confirmation');
    const reset = params.get('reset');
    
    if (confirmation === 'true') {
      toast.success("Email confirmed successfully! You can now log in.");
    }
    
    if (reset === 'true') {
      toast.info("You can set a new password now.");
    }
    
    setIsLoading(false);
  }, [location]); // Only re-run if location changes (e.g. URL params)

  // Function to check user status in Supabase and handle redirection
  const checkUserStatusAndRedirect = async (userEmail: string): Promise<UserStatusInfo> => {
    try {
      console.log("Checking status for user:", userEmail);
      
      // Query the public.users table directly
      const { data: userData, error: queryError } = await supabase
        .from('users')
        .select('status_users, level_id') // Select status and level
        .eq('email', userEmail)
        .maybeSingle(); // Expect one row or null if user not found

      if (queryError) {
        console.error("Error checking user status:", queryError);
        toast.error("Error checking user status.");
        throw queryError; // Re-throw Supabase error
      }

      console.log("User data from Supabase public.users:", userData);

      if (userData) {
        // User exists in the public.users table
        const { status_users, level_id } = userData as { status_users: string; level_id: number };

        if (status_users === 'active') {
          // User is active, check level and redirect accordingly
          if (level_id === 2) { // Assuming 2 is admin level
            navigate("/admin");
          } else { // Default to app for other active users
            navigate("/app");
          }
          return { isActive: true, level: level_id };
        } else {
          // User exists but is not active (e.g., 'pending')
          toast.warning("Please confirm your registration by clicking the link sent to your email.");
          // Optionally, automatically resend confirmation email
          try {
            await api.auth.resendConfirmationEmail(userEmail);
            toast.info("A new confirmation email has been sent to you.");
          } catch (resendError) {
            console.error("Failed to resend confirmation email automatically:", resendError);
            toast.error("Could not automatically resend confirmation email. Please try again manually later.");
          }
          navigate("/login"); // Keep user on login page
          return { isActive: false, level: level_id };
        }
      } else {
        // User does not exist in the public.users table (or email not found)
        toast.info("Registration not found. Please register first.");
        navigate("/login"); // Keep user on login page, or redirect to register
        return { isActive: false, level: null };
      }
    } catch (error) { // Catch errors from the try block or re-thrown Supabase errors
      console.error("General error in checkUserStatusAndRedirect:", error);
      toast.error("An error occurred while checking user status.");
      // Return a default state indicating failure
      return { isActive: false, level: null };
    }
  };
  
  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      console.log("Attempting login for:", email);
      // api.auth.login now returns { user: User; session: any }
      const { user: authUser, session: authSession } = await api.auth.login(email, password);
      
      if (!authSession) { // Check if session is null or undefined
        console.error("Login API response missing session.");
        throw new Error("Login failed: No session data returned.");
      }
      
      // Check user status in Supabase and handle redirection
      const userStatus = await checkUserStatusAndRedirect(email);
      console.log("User status after check:", userStatus);
      
      // Only complete login if user is active in our public.users table
      if (userStatus.isActive && authUser) {
        // Construct the full User object for the context and local storage
        const fullUser: User = {
          id: authUser.id,
          email: authUser.email || email, // Fallback to input email if not in authUser
          full_name: authUser.full_name || '', // Ensure full_name is present
          level_id: userStatus.level!, // level must not be null if isActive is true
          status: 'active', // Set status based on our check
          email_verified: authUser.email_confirmed_at ? true : false, // Supabase user has email_confirmed_at
          account_type: (authUser.user_metadata?.account_type as 'free' | 'premium') || 'free', // Get from metadata
          created_at: authUser.created_at || new Date().toISOString(),
          last_login: new Date().toISOString(), // Set last_login to now
          avatar_url: authUser.user_metadata?.avatar_url, // Get from metadata
        };
        
        // Extract token (assuming Supabase session object structure)
        const sessionToken = authSession.access_token;
        if (!sessionToken) {
          console.error("Login successful but no access token in session.");
          throw new Error("Login failed: Missing access token.");
        }
        
        localStorage.setItem("alphaquant-user", JSON.stringify(fullUser));
        localStorage.setItem("alphaquant-token", sessionToken);
        
        setUser(fullUser);
        toast.success("Login successful!");
      } else if (!userStatus.isActive) {
        // If user is not active (e.g. pending confirmation), checkUserStatusAndRedirect already showed a toast.
        // No need to throw an error here as it's a handled state.
        console.log(`Login attempt for non-active user: ${email}`);
      }
    } catch (error: any) { // Catch errors from api.auth.login or checkUserStatusAndRedirect
      console.error("Login failed in AuthContext:", error);
      // Display a specific error message if available, otherwise a generic one
      const errorMessage = error.message || "Login failed. Please check your credentials and try again.";
      if (errorMessage !== "PENDING_CONFIRMATION") { // PENDING_CONFIRMATION is handled by checkUserStatus
         toast.error(errorMessage);
      }
      throw error; // Re-throw for the calling component to handle (e.g., form state)
    } finally {
      setIsLoading(false);
    }
  };
  
  const googleLogin = async () => {
    try {
      setIsLoading(true);
      console.log("Attempting Google login");
      // api.auth.googleLogin initiates OAuth, it doesn't return user/session directly here.
      // The user session is handled via Supabase's onAuthStateChange or by redirect.
      // This function's primary role here is to initiate the OAuth flow.
      // The actual user session establishment and status check might need to occur
      // after the redirect from Google, often in a useEffect hook listening to auth state changes.
      // For now, let's assume the redirect implicitly handles session creation and
      // the checkUserStatusAndRedirect might be called from an onAuthStateChange listener.
      
      // The signInWithOAuth returns { provider, url, .. }
      // We don't get user/session directly from this call in the same tick for OAuth.
      await api.auth.googleLogin();
      // After this, Supabase handles the redirect to Google and then back to your app.
      // The user session is typically picked up by onAuthStateChange listener.
      // We might not need to call checkUserStatusAndRedirect here immediately.
      // It's better to handle it in onAuthStateChange or when user is redirected back.

      // Temporarily, we will assume that after redirect, an effect will pick up the user.
      // The toast here might be premature as user isn't fully logged in and checked yet.
      // toast.info("Redirecting to Google for login...");
      // For the purpose of this refactor, we keep it simple. A full OAuth flow
      // would involve onAuthStateChange listeners to set the user.
      
    } catch (error: any) {
      console.error("Google login initiation failed:", error);
      toast.error(error.message || "Google login failed. Please try again.");
      throw error;
    } finally {
      setIsLoading(false); // Might be set too early for OAuth if page redirects.
    }
  };
  
  // Updated register function to use specific types and better error handling
  const register = async (email: string, password: string, fullName: string) => {
    try {
      setIsLoading(true);
      console.log("Attempting to register user:", email);
      
      // api.auth.register now returns { user: User | null; session: any; success: boolean }
      const result = await api.auth.register(email, password, fullName);

      if (result.success && result.user) {
        console.log("Registration successful via API, user pending confirmation.");
        navigate("/login"); // Navigate to login page after successful registration
        toast.success("Registration successful!");
        toast.info("A confirmation link has been sent to your email. Please verify your email before logging in.");
      } else {
        // This case implies registration failed at the API level (e.g., user already exists but not handled by Supabase error code)
        // or if api.auth.register itself throws an error that isn't a Supabase error.
        console.error("Registration API call indicated failure or missing user/session:", result);
        // The error from api.auth.register should have been thrown and caught below.
        // If it reaches here, it means an unexpected successful response structure without actual success.
        throw new Error("Registration failed due to an unexpected API response.");
      }
      return result;
    } catch (error: any) {
      console.error("Registration failed in AuthContext:", error);
      const errorMessage = error.message || "Registration failed. Please check your details and try again.";
      toast.error(errorMessage);
      throw error; // Re-throw for the form to handle
    } finally {
      setIsLoading(false);
    }
  };
  
  const resetPassword = async (email: string) => {
    try {
      setIsLoading(true);
      console.log("Attempting to reset password for:", email);
      await api.auth.resetPassword(email);
      toast.success("Password reset email sent successfully!");
      toast.info("Please check your inbox and follow the instructions to reset your password.");
    } catch (error: any) {
      console.error("Password reset failed:", error);
      toast.error(error.message || "Failed to send password reset email. Please try again later.");
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
      toast.success("Confirmation email resent successfully!");
      toast.info("Please check your inbox and confirm your registration.");
    } catch (error: any) {
      console.error("Resend confirmation email failed:", error);
      toast.error(error.message || "Failed to resend confirmation email. Please try again later.");
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
      navigate("/login"); // Redirect to login page after logout
      toast.success("Logout successful!");
    } catch (error: any) {
      console.error("Logout failed:", error);
      toast.error(error.message || "Logout failed. Please try again.");
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  
  // Supabase onAuthStateChange listener
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log("Auth state changed:", _event, session);
      setIsLoading(true);
      if (_event === 'SIGNED_IN' && session?.user) {
        // User signed in (could be after registration, login, or OAuth redirect)
        const authUser = session.user as unknown as User; // Cast Supabase user to our User type

        // Check status in our public.users table
        const userStatus = await checkUserStatusAndRedirect(authUser.email!);

        if (userStatus.isActive) {
          const fullUser: User = {
            id: authUser.id,
            email: authUser.email!,
            full_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || 'No Name Provided',
            level_id: userStatus.level!,
            status: 'active',
            email_verified: authUser.email_confirmed_at ? true : false,
            account_type: (authUser.user_metadata?.account_type as 'free' | 'premium') || 'free',
            created_at: authUser.created_at || new Date().toISOString(),
            last_login: new Date().toISOString(),
            avatar_url: authUser.user_metadata?.avatar_url,
          };
          localStorage.setItem("alphaquant-user", JSON.stringify(fullUser));
          localStorage.setItem("alphaquant-token", session.access_token);
          setUser(fullUser);
          // Redirection is handled by checkUserStatusAndRedirect
        } else {
          // User is not active (e.g. pending confirmation, or doesn't exist in users table)
          // checkUserStatusAndRedirect would have shown appropriate toasts and navigated to /login
          // Sign out the user from Supabase auth to prevent inconsistent state
          await supabase.auth.signOut();
          localStorage.removeItem("alphaquant-user");
          localStorage.removeItem("alphaquant-token");
          setUser(null);
        }
      } else if (_event === 'SIGNED_OUT') {
        localStorage.removeItem("alphaquant-user");
        localStorage.removeItem("alphaquant-token");
        setUser(null);
        if (location.pathname !== "/login") { // Avoid navigation loop if already on login
          navigate("/login");
        }
      }
      setIsLoading(false);
    });

    return () => {
      authListener?.unsubscribe();
    };
  }, [navigate, location.pathname]); // Added location.pathname to dependencies

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
