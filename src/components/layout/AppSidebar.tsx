
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Home, LogOut, User } from "lucide-react";
import { NavLink } from "react-router-dom";

export function AppSidebar() {
  const { logout } = useAuth();

  return (
    <aside className="w-[230px] h-screen bg-sidebar fixed left-0 top-0 flex flex-col">
      <div className="p-6 border-b border-white/10">
        <h1 className="text-xl font-bold text-white">Alpha Quant</h1>
      </div>
      
      <nav className="flex-1 py-6">
        <ul className="space-y-1">
          <li>
            <NavLink 
              to="/app" 
              end
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-6 py-3 text-sm text-sidebar-foreground hover:bg-white/10 transition-colors",
                isActive && "bg-white/10 font-medium"
              )}
            >
              <Home size={18} />
              <span>Home</span>
            </NavLink>
          </li>
          
          <li className="px-6 py-2 mt-4">
            <h3 className="text-xs uppercase text-sidebar-foreground/70 font-medium">INTERVALS</h3>
          </li>
          
          <li>
            <NavLink 
              to="/app/daytrade" 
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-6 py-3 text-sm text-sidebar-foreground hover:bg-white/10 transition-colors",
                isActive && "bg-white/10 font-medium"
              )}
            >
              <span>Daytrade</span>
            </NavLink>
          </li>
        </ul>
      </nav>
      
      <div className="mt-auto border-t border-white/10">
        <NavLink 
          to="/app/profile" 
          className={({ isActive }) => cn(
            "flex items-center gap-3 px-6 py-4 text-sm text-sidebar-foreground hover:bg-white/10 transition-colors",
            isActive && "bg-white/10 font-medium"
          )}
        >
          <User size={18} />
          <span>My Profile</span>
        </NavLink>
        
        <button 
          onClick={() => logout()} 
          className="flex items-center gap-3 w-full px-6 py-4 text-sm text-sidebar-foreground hover:bg-white/10 transition-colors"
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}


