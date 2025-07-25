
import React from "react";
import { AdminSidebar } from "./AdminSidebar";
import { Outlet, useLocation } from "react-router-dom";

export function AdminLayout() {
  const location = useLocation();
  
  // Ensure the layout stays stable across tab switches
  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar />
      <div className="ml-[230px] p-8">
        <div key={location.pathname}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
