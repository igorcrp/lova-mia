
import React from "react";
import { AppSidebar } from "./AppSidebar";
import { Outlet } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";

export function AppLayout() {
  const isMobile = useIsMobile();
  
  return (
    <SidebarProvider defaultOpen={!isMobile}>
      <div className="min-h-screen bg-background flex w-full">
        <AppSidebar />
        <SidebarInset>
          {/* Header com título e trigger do sidebar - visível em todas as páginas */}
          <div className="flex items-center gap-3 p-4 border-b border-border md:hidden">
            <h1 className="text-xl font-bold">Alpha Quant</h1>
            <SidebarTrigger />
          </div>
          <div className="p-4 md:p-8">
            <Outlet />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
