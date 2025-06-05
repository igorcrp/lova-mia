
import React from "react";
import { AppSidebar } from "./AppSidebar";
import { Outlet } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";

export function AppLayout() {
  const isMobile = useIsMobile();
  
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <div className={isMobile ? "pt-[60px]" : "ml-[230px]"}>
        <div className="p-4 md:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
