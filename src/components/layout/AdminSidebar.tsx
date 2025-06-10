import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { LayoutDashboard, LogOut, Users, FileText } from "lucide-react";
import { NavLink } from "react-router-dom";

export function AdminSidebar() {
  const { logout } = useAuth();

  return (
    <aside className="w-[230px] h-screen bg-sidebar fixed left-0 top-0 flex flex-col">
      <div className="p-6 border-b border-white/10">
        <h1 className="text-xl font-bold text-white">Alpha Quant</h1>
        <p className="text-sm text-white/70">Admin Dashboard</p>
      </div>

      <nav className="flex-1 py-6">
        <ul className="space-y-1">
          <li>
            <NavLink
              to="/admin"
              end
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-6 py-3 text-sm text-sidebar-foreground hover:bg-white/10 transition-colors",
                  isActive && "bg-white/10 font-medium"
                )
              }
            >
              <LayoutDashboard size={18} />
              <span>Overview</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/admin/users"
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-6 py-3 text-sm text-sidebar-foreground hover:bg-white/10 transition-colors",
                  isActive && "bg-white/10 font-medium"
                )
              }
            >
              <Users size={18} />
              <span>User Management</span>
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/admin/assets"
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-6 py-3 text-sm text-sidebar-foreground hover:bg-white/10 transition-colors",
                  isActive && "bg-white/10 font-medium"
                )
              }
            >
              <FileText size={18} />
              <span>Asset Registration</span>
            </NavLink>
          </li>
        </ul>
      </nav>

      <div className="p-6 border-t border-white/10 mt-auto">
        <button
          onClick={() => logout()}
          className="flex items-center gap-2 text-sm text-sidebar-foreground hover:text-white transition-colors"
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
