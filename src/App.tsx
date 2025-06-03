
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { AppLayout } from "@/components/layout/AppLayout";

// Admin Pages
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import AdminUsersPage from "@/pages/admin/AdminUsersPage";
import AdminAssetsPage from "@/pages/admin/AdminAssetsPage";

// App Pages
import AppHomePage from "@/pages/app/AppHomePage";
import DaytradePage from "@/pages/app/DaytradePage";
import WeeklyPortfolioPage from "@/pages/app/WeeklyPortfolioPage";
import MonthlyPortfolioPage from "@/pages/app/MonthlyPortfolioPage";
import AnnualPortfolioPage from "@/pages/app/AnnualPortfolioPage";
import ProfilePage from "@/pages/app/ProfilePage";

// Public Pages
import LoginPage from "@/pages/LoginPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />
              
              {/* Redirect from root to login */}
              <Route path="/" element={<Navigate to="/login" replace />} />
              
              {/* Protected admin routes */}
              <Route element={<ProtectedRoute requireLevel={2} />}>
                <Route element={<AdminLayout />}>
                  <Route path="/admin" element={<AdminDashboardPage />} />
                  <Route path="/admin/users" element={<AdminUsersPage />} />
                  <Route path="/admin/assets" element={<AdminAssetsPage />} />
                </Route>
              </Route>
              
              {/* Protected app routes */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/app" element={<AppHomePage />} />
                  <Route path="/app/daytrade" element={<DaytradePage />} />
                  <Route path="/app/weekly" element={<WeeklyPortfolioPage />} />
                  <Route path="/app/monthly" element={<MonthlyPortfolioPage />} />
                  <Route path="/app/annual" element={<AnnualPortfolioPage />} />
                  <Route path="/app/profile" element={<ProfilePage />} />
                </Route>
              </Route>
              
              {/* 404 route */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
