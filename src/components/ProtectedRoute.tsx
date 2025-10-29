
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
      toast.warning("Please confirm your registered email account");
    }
  }, [user]);
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <span className="ml-3">Loading...</span>
      </div>
    );
  }
  
  // Not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  // User is not active
  if (user.status !== 'active') {
    return <Navigate to="/login" replace />;
  }
  
  // Check required level
  if (requireLevel !== undefined && user.level_id < requireLevel) {
    // Redirect to appropriate dashboard based on user level
    return <Navigate to={user.level_id === 1 ? "/app" : "/admin"} replace />;
  }
  
  return <Outlet />;
}
