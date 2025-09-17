
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { LayoutDashboard, LogOut, Users, FileText, Menu } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupContent,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

export function AdminSidebar() {
  const { logout } = useAuth();
  const { state, setOpenMobile } = useSidebar();
  const isMobile = useIsMobile();

  const handleMobileMenuClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);

  const handleLogout = useCallback(() => {
    logout();
  }, [logout]);

  const isCollapsed = state === "collapsed";

  return (
    <Sidebar className="bg-sidebar" collapsible="icon">
      <SidebarHeader className="p-6 border-b border-white/10">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div>
              <h1 className="text-xl font-bold text-sidebar-foreground">Alpha Quant</h1>
              <p className="text-sm text-sidebar-foreground/70">Admin Dashboard</p>
            </div>
          )}
          <SidebarTrigger className="text-sidebar-foreground hover:bg-sidebar/20">
            <Menu size={18} />
          </SidebarTrigger>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="py-6">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={window.location.pathname === "/admin/dashboard"}>
                  <NavLink 
                    to="/admin/dashboard" 
                    end
                    onClick={handleMobileMenuClick}
                    className="flex items-center gap-3 text-sidebar-foreground hover:bg-sidebar/20 transition-colors"
                  >
                    <LayoutDashboard size={18} />
                    {!isCollapsed && <span>Overview</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={window.location.pathname === "/admin/users"}>
                  <NavLink 
                    to="/admin/users" 
                    onClick={handleMobileMenuClick}
                    className="flex items-center gap-3 text-sidebar-foreground hover:bg-sidebar/20 transition-colors"
                  >
                    <Users size={18} />
                    {!isCollapsed && <span>User Management</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={window.location.pathname === "/admin/assets"}>
                  <NavLink 
                    to="/admin/assets" 
                    onClick={handleMobileMenuClick}
                    className="flex items-center gap-3 text-sidebar-foreground hover:bg-sidebar/20 transition-colors"
                  >
                    <FileText size={18} />
                    {!isCollapsed && <span>Asset Registration</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <button 
                onClick={handleLogout}
                className="flex items-center gap-3 w-full text-sidebar-foreground hover:bg-sidebar/20 transition-colors"
              >
                <LogOut size={18} />
                {!isCollapsed && <span>Logout</span>}
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
