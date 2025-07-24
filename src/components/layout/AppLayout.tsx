
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
        <SidebarInset className="flex-1">
          {/* Premium Header com gradient - visível em mobile */}
          <header className="glass-card border-0 border-b border-border/30 md:hidden sticky top-0 z-40">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-display gradient-text">Alpha Quant</h1>
                <div className="px-2 py-1 bg-gradient-accent rounded-full">
                  <span className="text-xs font-semibold text-accent-foreground">PRO</span>
                </div>
              </div>
              <SidebarTrigger className="hover-lift" />
            </div>
          </header>
          
          {/* Main Content Area */}
          <main className="flex-1 p-4 md:p-8 animate-fade-in">
            <div className="max-w-7xl mx-auto">
              <Outlet />
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
