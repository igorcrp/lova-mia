import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Outlet } from "react-router-dom";
import { toast } from "sonner";
import { useEffect } from "react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

interface ProtectedRouteProps {
  requireLevel?: number;
}

export function ProtectedRoute({ requireLevel }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  
  useEffect(() => {
    if (!isLoading && user && user.status !== 'active') {
      toast.warning("Por favor, confirme seu email para ativar sua conta.");
    }
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
        <span className="ml-3">Carregando...</span>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  if (user.status !== 'active') {
    return <Navigate to="/login" replace />;
  }
  
  if (requireLevel !== undefined && user.level_id < requireLevel) {
    const redirectPath = user.level_id === 1 ? "/app" : "/admin";
    return <Navigate to={redirectPath} replace />;
  }
  
  return <Outlet />;
}
