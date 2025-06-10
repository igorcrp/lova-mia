import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useEffect } from "react";

/**
 * Props for the ProtectedRoute component.
 */
interface ProtectedRouteProps {
  /**
   * The minimum access level required to access this route.
   * If undefined, only authentication is checked.
   * Level 1: Investor, Level 2: Admin.
   */
  requireLevel?: number;
}

/**
 * A component that protects routes based on user authentication status and access level.
 * If the user is not authenticated, they are redirected to the login page.
 * If a `requireLevel` is specified and the user's level is insufficient,
 * they are redirected to their default dashboard page ('/app' for level 1, '/admin' for level 2).
 * While checking authentication status, a loading indicator is displayed.
 *
 * @param {ProtectedRouteProps} props The props for the component.
 * @returns {JSX.Element} The child routes via `<Outlet />` if authorized,
 *                        or a `<Navigate />` component to redirect, or a loading indicator.
 */
export function ProtectedRoute({ requireLevel }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation(); // Get current location

  /**
   * Effect to show a toast message if the user's status is not active.
   * This is a secondary check; the main redirection logic handles non-active users.
   * This toast might appear briefly if a user somehow lands on a protected route
   * before the main redirect logic kicks in, or if their status changes.
   */
  useEffect(() => {
    if (!isLoading && user && user.status !== "active") {
      toast.warning(
        "Sua conta precisa ser ativada. Por favor, verifique seu email ou contate o suporte.",
        { id: "user-not-active-toast" }
      );
    }
  }, [user, isLoading]);

  if (isLoading) {
    // Display a loading indicator while authentication status is being determined.
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        {/* Using a simple text loading for now, can be replaced with a spinner component */}
        <span className="text-lg text-gray-700 dark:text-gray-300">Carregando sua sessão...</span>
      </div>
    );
  }

  // If user is not authenticated, redirect to login page.
  // Store the current location to redirect back after successful login.
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If user's account is not active (e.g., pending email confirmation),
  // redirect to login. A toast should have been shown by AuthContext or the effect above.
  if (user.status !== "active") {
    // Additional toast here can be redundant if AuthContext's checkUserStatusAndRedirect handles it.
    // However, this provides a safeguard.
    toast.info("Sua conta não está ativa. Redirecionando para login.", {
      id: "redirect-inactive-user-toast",
    });
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If a specific access level is required and the user's level is insufficient.
  if (requireLevel !== undefined && user.level_id < requireLevel) {
    toast.error("Você não tem permissão para acessar esta página.", {
      id: "insufficient-permission-toast",
    });
    // Redirect to a default page based on their actual level.
    // For example, a regular user (level 1) trying to access an admin page (level 2)
    // will be redirected to their own dashboard ('/app').
    // An admin (level 2) trying to access a hypothetical super-admin page (level 3)
    // would be redirected to their admin dashboard ('/admin').
    return <Navigate to={user.level_id === 1 ? "/app" : "/admin"} replace />;
  }

  // If all checks pass, render the child routes.
  return <Outlet />;
}
