
import React, { useEffect } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { Outlet, useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { useAdminNavigation } from "@/hooks/useAdminNavigation";

export function AdminLayout() {
  const isMobile = useIsMobile();
  const location = useLocation();
  const { saveLastRoute } = useAdminNavigation();

  useEffect(() => {
    // Save current route whenever it changes
    saveLastRoute(location.pathname);
  }, [location.pathname, saveLastRoute]);
  
  return (
    <SidebarProvider defaultOpen={!isMobile}>
      <div className="min-h-screen bg-background flex w-full overflow-x-hidden">
        <AdminSidebar />
        <SidebarInset className="overflow-x-hidden">
          {/* Header com título e trigger do sidebar - visível em mobile */}
          <div className="flex items-center gap-3 p-4 border-b border-border md:hidden">
            <h1 className="text-xl font-bold">Alpha Quant Admin</h1>
            <SidebarTrigger />
          </div>
          <div className="p-4 md:p-8 overflow-x-hidden">
            <Outlet />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
