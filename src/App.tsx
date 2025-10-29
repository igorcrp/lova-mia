
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { AppLayout } from "@/components/layout/AppLayout";

// Admin Navigation Component
const AdminNavigator = () => {
  const savedRoute = localStorage.getItem('admin_last_route') || '/admin/dashboard';
  return <Navigate to={savedRoute} replace />;
};

// Admin Pages
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import AdminUsersPage from "@/pages/admin/AdminUsersPage";
import AdminAssetsPage from "@/pages/admin/AdminAssetsPage";

// App Pages
import AppHomePage from "@/pages/app/AppHomePage";
import DaytradePage from "@/pages/app/DaytradePage";
import ProfilePage from "@/pages/app/ProfilePage";

// Public Pages
import LoginPage from "@/pages/LoginPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <SubscriptionProvider>
          <ThemeProvider>
            <TooltipProvider>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/reset-password" element={<LoginPage />} />
                
                {/* Redirect from root to login */}
                <Route path="/" element={<Navigate to="/login" replace />} />
                
                {/* Protected admin routes */}
                <Route element={<ProtectedRoute requireLevel={2} />}>
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<AdminNavigator />} />
                    <Route path="dashboard" element={<AdminDashboardPage />} />
                    <Route path="users" element={<AdminUsersPage />} />
                    <Route path="assets" element={<AdminAssetsPage />} />
                  </Route>
                </Route>
                
                {/* Protected app routes */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/app" element={<AppLayout />}>
                    <Route index element={<AppHomePage />} />
                    <Route path="daytrade" element={<DaytradePage />} />
                    <Route path="profile" element={<ProfilePage />} />
                  </Route>
                </Route>
                
                {/* 404 route */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </TooltipProvider>
          </ThemeProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
