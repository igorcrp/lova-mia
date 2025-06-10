import React from "react";
import { AdminSidebar } from "./AdminSidebar";
import { Outlet } from "react-router-dom";

export function AdminLayout() {
  return (
    <div className="min-h-screen bg-background">
      <AdminSidebar />
      <div className="ml-[230px] p-8">
        <Outlet />
      </div>
    </div>
  );
}
