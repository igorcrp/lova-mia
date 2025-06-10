import { api } from "@/services/api";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/services/api";
// Assuming AuthResponse, RegisterResponse, GoogleLoginResponse are exported from api.ts
// If not, this import will need adjustment or types will be duplicated/redefined.
import {
  AuthResponse,
  RegisterResponse as ApiRegisterResponse,
  GoogleLoginResponse as ApiGoogleLoginResponse,
} from "@/services/api";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@/types";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";

/**
 * Defines the shape of the authentication context, including user state and auth functions.
 */
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  googleLogin: () => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Registers a new user.
   * @returns A promise that resolves to the API response for registration, which might include user and session data or an error.
   */
  register: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<ApiRegisterResponse | undefined>;
  resetPassword: (email: string) => Promise<void>;
  resendConfirmationEmail: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Provides authentication state and functions to its children.
 * Manages user session, loading states, and interaction with authentication APIs.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Effect to check for stored user session, handle URL params, and set up AuthStateChange listener.
   */
  useEffect(() => {
    setIsLoading(true);
    // 1. Check local storage for existing session
    const storedUserString = localStorage.getItem("alphaquant-user");
    if (storedUserString) {
      try {
        const storedUser = JSON.parse(storedUserString) as User;
        if (storedUser && storedUser.id && storedUser.email) {
          setUser(storedUser);
        } else {
          throw new Error("Stored user object is invalid, clearing session.");
        }
      } catch (error) {
        console.error("Failed to parse/validate stored user:", error);
        localStorage.removeItem("alphaquant-user");
        localStorage.removeItem("alphaquant-token");
      }
    }

    // 2. Handle URL parameters (e.g., email confirmation, password reset)
    const params = new URLSearchParams(location.search);
    if (params.get("confirmation") === "true") {
      toast.success("Email confirmado com sucesso! Você já pode fazer login.");
      navigate(location.pathname, { replace: true }); // Clean URL
    }
    if (params.get("reset") === "true") {
      toast.info("Você pode definir uma nova senha agora.");
      navigate(location.pathname, { replace: true }); // Clean URL
    }

    // 3. Supabase Auth State Change Listener
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth event:", event, "Session:", session);
      setIsLoading(true);
      if (event === "SIGNED_IN" && session && session.user) {
        // This handles OAuth success (e.g., Google) and session refresh.
        const authUser = session.user;
        // Check user status in our DB and potentially create/update them
        const statusResult = await checkUserStatusAndRedirect(authUser.email!);

        if (statusResult.isActive && authUser.email) {
          const fullUser: User = {
            id: authUser.id,
            email: authUser.email,
            full_name: authUser.user_metadata?.full_name || "Usuário",
            avatar_url: authUser.user_metadata?.avatar_url || undefined,
            level_id: typeof statusResult.level === "number" ? statusResult.level : 1,
            status: "active",
            email_verified: authUser.email_confirmed_at ? true : false,
            account_type: "free", // Default
            created_at: authUser.created_at || new Date().toISOString(),
            last_login: new Date().toISOString(),
          };
          localStorage.setItem("alphaquant-user", JSON.stringify(fullUser));
          localStorage.setItem("alphaquant-token", session.access_token);
          setUser(fullUser);
          // Navigation is handled by checkUserStatusAndRedirect
        } else if (statusResult.userNotFoundInDB && authUser.email) {
          // User authenticated via OAuth but doesn't exist in our `users` table.
          // This is the place to create the user in `public.users`.
          console.log(
            `User ${authUser.email} not found in DB after OAuth. Attempting to register details.`
          );
          try {
            const { error: insertError } = await supabase.from("users").insert({
              id: authUser.id,
              email: authUser.email,
              name: authUser.user_metadata?.full_name || "Usuário OAuth",
              status_users: "active", // Or 'pending' if email verification is still desired for OAuth
              level_id: 1, // Default level
              created_at: new Date().toISOString(),
            });
            if (insertError) {
              throw insertError;
            }
            console.log(`User ${authUser.email} successfully inserted into DB after OAuth.`);
            // Re-check status and redirect
            await checkUserStatusAndRedirect(authUser.email!);
          } catch (dbError: any) {
            console.error("Error inserting OAuth user into DB:", dbError.message);
            toast.error("Erro ao finalizar cadastro com Google. Tente novamente.");
            await api.auth.logout(); // Log out from Supabase auth
            localStorage.removeItem("alphaquant-user");
            localStorage.removeItem("alphaquant-token");
            setUser(null);
            navigate("/login", { replace: true });
          }
        } else if (!statusResult.isActive) {
          // User is not active (e.g. pending, suspended) or some other issue.
          // Toasts handled by checkUserStatusAndRedirect.
          // Ensure local session is cleared if Supabase still has one but our app rejects it.
          await api.auth.logout();
          localStorage.removeItem("alphaquant-user");
          localStorage.removeItem("alphaquant-token");
          setUser(null);
          if (!statusResult.isPending) navigate("/login", { replace: true }); // Don't navigate away if pending, user might want to resend email
        }
      } else if (event === "SIGNED_OUT") {
        localStorage.removeItem("alphaquant-user");
        localStorage.removeItem("alphaquant-token");
        setUser(null);
        navigate("/login", { replace: true });
      } else if (event === "TOKEN_REFRESHED" && session) {
        localStorage.setItem("alphaquant-token", session.access_token);
        // Potentially update user details if they changed, though less common on token refresh
        if (session.user) {
          const su = session.user;
          setUser((prevUser) =>
            prevUser
              ? {
                  ...prevUser,
                  // Only update fields that might change and are sourced from Supabase user
                  full_name: su.user_metadata?.full_name || prevUser.full_name,
                  avatar_url: su.user_metadata?.avatar_url || prevUser.avatar_url,
                }
              : null
          );
        }
      }
      setIsLoading(false);
    });

    setIsLoading(false); // Initial loading finished

    return () => {
      // Cleanup listener on component unmount
      authListener?.unsubscribe();
    };
  }, [navigate, location]); // location removed as it's handled by URLSearchParams once

  /**
   * Checks the user's status in the database (e.g., 'active', 'pending') and level,
   * then redirects them accordingly. Also handles resending confirmation emails for pending users.
   * @param userEmail The email of the user whose status is to be checked.
   * @returns A promise resolving to an object indicating if the user is active and their level.
   */
  const checkUserStatusAndRedirect = useCallback(
    async (userEmail: string) => {
      // userEmail must be a non-empty string
      if (!userEmail || typeof userEmail !== "string" || userEmail.trim() === "") {
        console.error("checkUserStatusAndRedirect: userEmail is invalid.");
        toast.error("Email inválido para verificação de status.");
        return { isActive: false, level: null, isError: true };
      }

      try {
        console.log("Checking status for user:", userEmail);

        const { data: dbUserData, error: dbError } = await supabase
          .from("users") // Assuming 'users' is your public table for user details
          .select("status_users, level_id")
          .eq("email", userEmail)
          .maybeSingle();

        if (dbError) {
          console.error("Error checking user status in DB:", dbError.message);
          toast.error("Erro ao verificar status do usuário no banco de dados.");
          // Do not throw here, allow login to proceed if auth was successful but DB check failed for some reason
          // Caller should decide if this is a critical failure.
          return { isActive: false, level: null, isError: true, message: dbError.message };
        }

        console.log("User data from Supabase DB:", dbUserData);

        if (dbUserData) {
          // User found in the database
          if (dbUserData.status_users === "active") {
            const level = typeof dbUserData.level_id === "number" ? dbUserData.level_id : 1; // Default to level 1
            if (level === 2) {
              // Admin
              navigate("/admin", { replace: true });
            } else {
              // Investor or other levels
              navigate("/app", { replace: true });
            }
            return { isActive: true, level: level };
          } else if (dbUserData.status_users === "pending") {
            toast.warning("Sua conta está pendente de confirmação.");
            try {
              await api.auth.resendConfirmationEmail(userEmail);
              toast.info(
                "Um novo email de confirmação foi enviado. Verifique sua caixa de entrada (e spam)."
              );
            } catch (resendError: any) {
              console.error(
                "Failed to resend confirmation email automatically:",
                resendError.message
              );
              toast.error(
                "Não foi possível reenviar o email de confirmação automaticamente. Tente novamente mais tarde ou contate o suporte."
              );
            }
            navigate("/login", { replace: true }); // Keep user on login page
            return { isActive: false, level: dbUserData.level_id, isPending: true };
          } else {
            // Other statuses like 'inactive', 'suspended'
            toast.error("Sua conta não está ativa. Contate o suporte.");
            navigate("/login", { replace: true });
            return { isActive: false, level: dbUserData.level_id };
          }
        } else {
          // User not found in public.users table after successful auth (e.g. social login first time)
          // This case might require creating the user row in public.users here,
          // or be handled by a separate step after social login.
          // For now, assume this is unexpected for email/password login if auth succeeded.
          console.warn(`User ${userEmail} authenticated but not found in public.users table.`);
          toast.error("Usuário autenticado mas detalhes não encontrados. Contate o suporte.");
          navigate("/login", { replace: true }); // Stay on login or redirect to an error page
          return { isActive: false, level: null, userNotFoundInDB: true };
        }
      } catch (error: any) {
        // Catch unexpected errors during the process
        console.error("Unexpected error in checkUserStatusAndRedirect:", error.message);
        toast.error("Ocorreu um erro inesperado ao verificar o status do usuário.");
        return { isActive: false, level: null, isError: true, message: error.message };
      }
    },
    [navigate]
  ); // Added navigate to useCallback dependencies

  /**
   * Logs in a user with email and password.
   * On success, updates user state, stores session in localStorage, and navigates.
   * @param email User's email.
   * @param password User's password.
   * @throws Throws an error if login fails, which can be caught by the calling component.
   */
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // console.log("Attempting login for:", email); // Debug
      const response = await api.auth.login(email, password); // Uses AuthResponse from api.ts
      // console.log("Login API response:", response); // Debug

      if (!response || !response.session || !response.user || !response.user.email) {
        toast.error("Resposta de login inválida da API.");
        throw new Error("Invalid login response from API");
      }

      const userStatusResult = await checkUserStatusAndRedirect(response.user.email);
      // console.log("User status check result:", userStatusResult); // Debug

      if (userStatusResult.isActive && response.user && response.session) {
        const authUser = response.user;
        const fullUser: User = {
          id: authUser.id || "",
          email: authUser.email, // Email must be present as per earlier check
          full_name: authUser.user_metadata?.full_name || "Usuário",
          avatar_url: authUser.user_metadata?.avatar_url || undefined,
          level_id: typeof userStatusResult.level === "number" ? userStatusResult.level : 1,
          status: "active",
          email_verified: authUser.email_confirmed_at ? true : false,
          account_type: "free",
          created_at: authUser.created_at || new Date().toISOString(),
          last_login: new Date().toISOString(),
        };

        localStorage.setItem("alphaquant-user", JSON.stringify(fullUser));
        localStorage.setItem("alphaquant-token", response.session.access_token);
        setUser(fullUser);
        toast.success("Login realizado com sucesso!");
      } else if (userStatusResult.isPending) {
        // Messages handled by checkUserStatusAndRedirect
      } else {
        // Inactive or error during status check
        await api.auth.logout();
        localStorage.removeItem("alphaquant-user");
        localStorage.removeItem("alphaquant-token");
        setUser(null);
        // Additional toast for clarity if not already covered by checkUserStatusAndRedirect
        if (!userStatusResult.isError && !userStatusResult.isPending) {
          toast.error("Falha ao verificar o status do usuário ou usuário inativo.");
        }
      }
    } catch (error: any) {
      console.error("Login failed in AuthContext:", error.message);
      if (error.message === "PENDING_CONFIRMATION") {
        toast.error("Seu email ainda não foi confirmado.");
        toast.info("Um novo link de confirmação pode ter sido enviado. Verifique seu email.");
      } else {
        toast.error(error.message || "Falha no login. Verifique suas credenciais.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Initiates Google OAuth login flow.
   * Supabase handles the redirect and callback. Session is established on callback.
   * This function primarily initiates the OAuth flow. User creation/update in public.users
   * should be handled by a callback listener for onAuthStateChange or when user is redirected back.
   * For now, it calls googleLogin which might need to be a redirect.
   * Actual user session establishment and DB check will occur after redirect.
   */
  const googleLogin = async () => {
    setIsLoading(true);
    try {
      console.log("Attempting Google login initiation");
      // api.auth.googleLogin() from api.ts should handle the OAuth redirect.
      // It might not return a user directly but navigate the browser.
      // The actual login completion and user data fetching happen after Google redirects back.
      await api.auth.googleLogin();
      // If googleLogin directly returns user data (e.g. in a non-redirect flow like mobile),
      // then proceed with checkUserStatusAndRedirect similar to email login.
      // However, for web, Supabase typically handles this via redirect.
      // The useEffect listening to onAuthStateChange (added later) will pick up the session.
      toast.info("Redirecionando para login com Google...");
    } catch (error: any) {
      console.error("Google login initiation failed:", error.message);
      toast.error(error.message || "Falha ao iniciar login com Google.");
    } finally {
      // setIsLoading might be set to false too early if a redirect is happening.
      // Consider managing loading state based on onAuthStateChange for OAuth.
      setIsLoading(false);
    }
  };

  /**
   * Registers a new user.
   * Shows success/error toasts and navigates on successful registration.
   * @param email User's email.
   * @param password User's password.
   * @param fullName User's full name.
   * @returns A promise that resolves to the API registration response or undefined on failure.
   */
  const register = async (
    email: string,
    password: string,
    fullName: string
  ): Promise<ApiRegisterResponse | undefined> => {
    setIsLoading(true);
    try {
      const result = await api.auth.register(email, password, fullName);

      if (result && result.user && !result.error) {
        // Successfully created auth user
        // The api.auth.register might return success:false if DB insert failed.
        if (result.success === false) {
          // Auth user created, but DB insert failed as per api.ts logic
          toast.warning(
            "Cadastro parcialmente concluído. Houve um problema ao salvar detalhes adicionais."
          );
          toast.info("Um email de confirmação foi enviado. Por favor, confirme seu email.");
        } else {
          toast.success("Cadastro realizado com sucesso!");
          toast.info(
            "Enviamos um link de confirmação para o seu email. Por favor, verifique sua caixa de entrada e confirme seu cadastro antes de fazer login."
          );
        }
        navigate("/login", { replace: true });
      } else {
        // Auth registration itself failed
        const errorMessage =
          result?.error?.message || "Ocorreu um erro desconhecido durante o registro.";
        console.error("Registration API call failed:", result?.error);
        toast.error(errorMessage);
        throw new Error(errorMessage); // Re-throw to allow component to handle if needed
      }
      return result;
    } catch (error: any) {
      console.error("Registration failed in AuthContext:", error.message);
      // Ensure a toast is shown even if the error came from api.auth.register directly
      // Use an ID to prevent duplicate toasts if the error is caught and re-thrown by the UI component
      if (!toast.isActive("registration-error")) {
        toast.error(error.message || "Falha no registro. Verifique os dados e tente novamente.", {
          id: "registration-error",
        });
      }
      throw error; // Re-throw so UI can react, e.g., by not redirecting or clearing form fields.
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Sends a password reset email to the user.
   * @param email The email address of the user requesting a password reset.
   */
  const resetPassword = async (email: string) => {
    setIsLoading(true);
    try {
      await api.auth.resetPassword(email);
      toast.success("Email de redefinição de senha enviado com sucesso!");
      toast.info(
        "Por favor, verifique sua caixa de entrada e siga as instruções para redefinir sua senha."
      );
    } catch (error: any) {
      console.error("Password reset failed:", error.message);
      toast.error(error.message || "Falha ao enviar email de redefinição. Tente novamente.");
      // Not re-throwing, as UI typically just needs to inform the user.
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Resends a confirmation email to the user.
   * @param email The email address of the user needing a new confirmation email.
   */
  const resendConfirmationEmail = async (email: string) => {
    setIsLoading(true);
    try {
      await api.auth.resendConfirmationEmail(email);
      toast.success("Email de confirmação reenviado com sucesso!");
      toast.info("Por favor, verifique sua caixa de entrada e confirme seu cadastro.");
    } catch (error: any) {
      console.error("Resend confirmation email failed:", error.message);
      toast.error(error.message || "Falha ao reenviar email de confirmação. Tente novamente.");
      // Not re-throwing.
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Logs out the current user, clears local storage, and navigates to the login page.
   */
  const logout = async () => {
    setIsLoading(true);
    try {
      await api.auth.logout();
      // Ensure client-side session is cleared regardless of API success,
      // as per Supabase recommendations for full logout.
    } catch (error: any) {
      console.error("API logout failed:", error.message);
      // Do not toast an error here if client-side clear is successful.
      // The main goal is to clear the local session.
    } finally {
      localStorage.removeItem("alphaquant-user");
      localStorage.removeItem("alphaquant-token");
      setUser(null);
      navigate("/login", { replace: true });
      toast.success("Logout realizado com sucesso!"); // Inform user of client-side success
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

/**
 * Custom hook to access the AuthContext.
 * @throws Will throw an error if used outside of an AuthProvider.
 * @returns The authentication context.
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
// The duplicated code that was inserted by the previous faulty diff has been removed from the REPLACE block.
// The content above is the correct end of the file.
