
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { cn } from "@/lib/utils";
import { Home, LogOut, User, Sun, Moon, Crown, Menu } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useState, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
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
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const TooltipContent = memo(({ text, position, visible }: { text: string; position: { x: number; y: number }; visible: boolean }) => {
  if (!visible) return null;
  
  return (
    <div 
      className="fixed bg-black text-white px-3 py-2 rounded text-xs z-50"
      style={{ 
        left: `${position.x + 10}px`, 
        top: `${position.y - 30}px`,
        pointerEvents: 'none'
      }}
    >
      {text}
    </div>
  );
});

TooltipContent.displayName = 'TooltipContent';

export function AppSidebar() {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isSubscribed } = useSubscription();
  const { state, setOpenMobile } = useSidebar();
  const isMobile = useIsMobile();
  
  const [tooltipState, setTooltipState] = useState({
    text: "",
    visible: false,
    position: { x: 0, y: 0 }
  });

  const handleMouseEnter = useCallback((text: string, e: React.MouseEvent) => {
    setTooltipState({
      text,
      visible: true,
      position: { x: e.clientX, y: e.clientY }
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltipState(prev => ({ ...prev, visible: false }));
  }, []);

  const handleLogout = useCallback(() => {
    logout();
  }, [logout]);

  const handleMobileMenuClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);

  const isCollapsed = state === "collapsed";

  return (
    <Sidebar className="glass-card bg-sidebar border-r border-border/30" collapsible="icon">
      <SidebarHeader className="p-6 border-b border-white/10">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-display text-sidebar-foreground">Alpha Quant</h1>
              <div className="px-2 py-1 bg-gradient-accent rounded-full animate-scale-in">
                <span className="text-xs font-semibold text-accent-foreground">PRO</span>
              </div>
            </div>
          )}
          <SidebarTrigger className="text-sidebar-foreground hover:bg-white/10 hover-lift hidden md:flex">
            <Menu size={18} />
          </SidebarTrigger>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="py-6">
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={window.location.pathname === "/app"}>
                <NavLink 
                  to="/app" 
                  end
                  onClick={handleMobileMenuClick}
                  className="flex items-center gap-3 text-sidebar-foreground hover:bg-white/10 transition-all duration-300 hover-lift rounded-lg group"
                >
                  <Home size={18} className="group-hover:text-accent transition-colors" />
                  {!isCollapsed && (
                    <span className="flex items-center gap-3">
                      <span className="font-medium">Home</span>
                      {isSubscribed && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gradient-accent text-accent-foreground rounded-full font-semibold premium-glow">
                          <Crown size={12} />
                          Premium
                        </span>
                      )}
                    </span>
                  )}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="px-6 py-2 mt-4 text-xs uppercase text-sidebar-foreground/70 font-medium">
            {!isCollapsed ? "INTERVALS" : ""}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={window.location.pathname === "/app/daytrade"}>
                  <NavLink 
                    to="/app/daytrade" 
                    onClick={handleMobileMenuClick}
                    className="flex items-center gap-3 px-2 text-sidebar-foreground hover:bg-white/10 transition-all duration-300 hover-lift rounded-lg group"
                  >
                    <span className="w-4 h-4 flex items-center justify-center text-xs bg-primary/20 text-primary rounded group-hover:bg-primary group-hover:text-white transition-all">D</span>
                    {!isCollapsed && <span className="font-medium">Daytrade</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              
              <SidebarMenuItem>
                <div 
                  className="flex items-center gap-3 px-2 py-2 text-sidebar-foreground/50 cursor-not-allowed opacity-70 hover:bg-white/5 transition-all rounded-lg group"
                  onMouseEnter={(e) => handleMouseEnter("Coming soon!", e)}
                  onMouseLeave={handleMouseLeave}
                >
                  <span className="w-4 h-4 flex items-center justify-center text-xs bg-muted/20 text-muted-foreground rounded group-hover:bg-muted/30 transition-all">W</span>
                  {!isCollapsed && <span className="font-medium">Weekly Portfolio</span>}
                </div>
              </SidebarMenuItem>
              
              <SidebarMenuItem>
                <div 
                  className="flex items-center gap-3 px-2 py-2 text-sidebar-foreground/50 cursor-not-allowed opacity-70 hover:bg-white/5 transition-all rounded-lg group"
                  onMouseEnter={(e) => handleMouseEnter("Coming soon!", e)}
                  onMouseLeave={handleMouseLeave}
                >
                  <span className="w-4 h-4 flex items-center justify-center text-xs bg-muted/20 text-muted-foreground rounded group-hover:bg-muted/30 transition-all">M</span>
                  {!isCollapsed && <span className="font-medium">Monthly Portfolio</span>}
                </div>
              </SidebarMenuItem>
              
              <SidebarMenuItem>
                <div 
                  className="flex items-center gap-3 px-2 py-2 text-sidebar-foreground/50 cursor-not-allowed opacity-70 hover:bg-white/5 transition-all rounded-lg group"
                  onMouseEnter={(e) => handleMouseEnter("Coming soon!", e)}
                  onMouseLeave={handleMouseLeave}
                >
                  <span className="w-4 h-4 flex items-center justify-center text-xs bg-muted/20 text-muted-foreground rounded group-hover:bg-muted/30 transition-all">A</span>
                  {!isCollapsed && <span className="font-medium">Annual Portfolio</span>}
                </div>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      
      <SidebarFooter className="border-t border-white/10 p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <button 
                onClick={toggleTheme} 
                className="flex items-center gap-3 w-full text-sidebar-foreground hover:bg-white/10 transition-all hover-lift rounded-lg group"
              >
                {theme === 'dark' ? <Sun size={18} className="group-hover:text-accent transition-colors" /> : <Moon size={18} className="group-hover:text-accent transition-colors" />}
                {!isCollapsed && <span className="font-medium">Theme</span>}
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
          
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={window.location.pathname === "/app/profile"}>
              <NavLink 
                to="/app/profile" 
                onClick={handleMobileMenuClick}
                className="flex items-center gap-3 text-sidebar-foreground hover:bg-white/10 transition-all hover-lift rounded-lg group"
              >
                <User size={18} className="group-hover:text-accent transition-colors" />
                {!isCollapsed && <span className="font-medium">My Profile</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <button 
                onClick={handleLogout}
                className="flex items-center gap-3 w-full text-sidebar-foreground hover:bg-white/10 transition-all hover-lift rounded-lg group"
              >
                <LogOut size={18} className="group-hover:text-destructive transition-colors" />
                {!isCollapsed && <span className="font-medium">Logout</span>}
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <TooltipContent 
        text={tooltipState.text}
        position={tooltipState.position}
        visible={tooltipState.visible}
      />
    </Sidebar>
  );
}
