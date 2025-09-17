
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { cn } from "@/lib/utils";
import { Home, LogOut, User, Sun, Moon, Crown, Menu, HelpCircle } from "lucide-react";
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
      className="fixed bg-background border text-foreground px-3 py-2 rounded text-xs z-50"
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
  const { isSubscribed, queriesUsed, dailyLimit } = useSubscription();
  const { state, setOpenMobile } = useSidebar();
  const isMobile = useIsMobile();
  
  const handleTourClick = useCallback(() => {
    const event = new CustomEvent('showTour');
    window.dispatchEvent(event);
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);
  
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

  const handleDaytradeClick = useCallback(() => {
    if (isMobile) {
      // Limpar o localStorage do daytrade no mobile
      localStorage.removeItem('daytrade-page-state');
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);

  const isCollapsed = state === "collapsed";

  return (
    <Sidebar className="bg-sidebar" collapsible="icon">
      <SidebarHeader className="p-6 border-b border-white/10">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <h1 className="text-xl font-bold text-sidebar-foreground">Alpha Quant</h1>
          )}
          <SidebarTrigger className="text-sidebar-foreground hover:bg-sidebar/20">
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
                  className="flex items-center gap-3 text-sidebar-foreground hover:bg-sidebar/20 transition-colors"
                >
                  <Home size={18} />
                  {!isCollapsed && (
                    <span className="flex items-center gap-2">
                      Home
                      {isSubscribed && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gradient-to-r from-yellow-400 to-yellow-600 text-yellow-900 rounded-full font-medium">
                          <Crown size={12} />
                          Premium Plan
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
                    onClick={handleDaytradeClick}
                    className="flex items-center gap-3 px-2 text-sidebar-foreground hover:bg-sidebar/20 transition-colors"
                  >
                    <span className="w-4 h-4 flex items-center justify-center text-xs">D</span>
                    {!isCollapsed && <span>Daytrade</span>}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              
              <SidebarMenuItem>
                <div 
                  className="flex items-center gap-3 px-2 py-2 text-sidebar-foreground/50 cursor-not-allowed opacity-70"
                  onMouseEnter={(e) => handleMouseEnter("Coming soon!", e)}
                  onMouseLeave={handleMouseLeave}
                >
                  <span className="w-4 h-4 flex items-center justify-center text-xs">W</span>
                  {!isCollapsed && <span>Weekly Portfolio</span>}
                </div>
              </SidebarMenuItem>
              
              <SidebarMenuItem>
                <div 
                  className="flex items-center gap-3 px-2 py-2 text-sidebar-foreground/50 cursor-not-allowed opacity-70"
                  onMouseEnter={(e) => handleMouseEnter("Coming soon!", e)}
                  onMouseLeave={handleMouseLeave}
                >
                  <span className="w-4 h-4 flex items-center justify-center text-xs">M</span>
                  {!isCollapsed && <span>Monthly Portfolio</span>}
                </div>
              </SidebarMenuItem>
              
              <SidebarMenuItem>
                <div 
                  className="flex items-center gap-3 px-2 py-2 text-sidebar-foreground/50 cursor-not-allowed opacity-70"
                  onMouseEnter={(e) => handleMouseEnter("Coming soon!", e)}
                  onMouseLeave={handleMouseLeave}
                >
                  <span className="w-4 h-4 flex items-center justify-center text-xs">A</span>
                  {!isCollapsed && <span>Annual Portfolio</span>}
                </div>
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
                onClick={handleTourClick} 
                className="flex items-center gap-3 w-full text-sidebar-foreground hover:bg-sidebar/20 transition-colors"
              >
                <HelpCircle size={18} />
                {!isCollapsed && (
                  <div className="flex items-center justify-between w-full">
                    <span>Tour</span>
                    {!isSubscribed && (
                      <span className="text-xs bg-accent/20 px-2 py-1 rounded-full">
                        Credits: {queriesUsed}/{dailyLimit}
                      </span>
                    )}
                  </div>
                )}
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
          
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <button 
                onClick={toggleTheme} 
                className="flex items-center gap-3 w-full text-sidebar-foreground hover:bg-sidebar/20 transition-colors"
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                {!isCollapsed && <span>Theme</span>}
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
          
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={window.location.pathname === "/app/profile"}>
              <NavLink 
                to="/app/profile" 
                onClick={handleMobileMenuClick}
                className="flex items-center gap-3 text-sidebar-foreground hover:bg-sidebar/20 transition-colors"
              >
                <User size={18} />
                {!isCollapsed && <span>My Profile</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          
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

      <TooltipContent 
        text={tooltipState.text}
        position={tooltipState.position}
        visible={tooltipState.visible}
      />
    </Sidebar>
  );
}
