
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Outlet } from "react-router-dom";
import { toast } from "sonner";
import { useEffect } from "react";

interface ProtectedRouteProps {
  requireLevel?: number;
}

export function ProtectedRoute({ requireLevel }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  
  useEffect(() => {
    if (user && user.status !== 'active') {
      toast.warning("Por favor, confirme seu email para ativar sua conta.");
    }
    
    // Log user permissions for debugging
    if (user) {
      console.log("Current user permissions:", {
        email: user.email,
        status: user.status,
        level_id: user.level_id
      });
    }
  }, [user]);
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading-circle" />
        <span className="ml-3">Carregando...</span>
      </div>
    );
  }
  
  // Not authenticated
  if (!user) {
    console.log("User not authenticated, redirecting to login");
    return <Navigate to="/login" replace />;
  }
  
  // User is not active
  if (user.status !== 'active') {
    console.log("User not active, redirecting to login");
    toast.warning("Sua conta não está ativa. Entre em contato com o suporte.");
    return <Navigate to="/login" replace />;
  }
  
  // Check required level
  if (requireLevel !== undefined && user.level_id < requireLevel) {
    console.log(`User level ${user.level_id} is insufficient, required: ${requireLevel}`);
    toast.error("Você não tem permissão para acessar esta área.");
    // Redirect to appropriate dashboard based on user level
    return <Navigate to={user.level_id === 1 ? "/app" : "/admin"} replace />;
  }
  
  return <Outlet />;
}
