
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { cn } from "@/lib/utils";
import { Home, LogOut, User, Sun, Moon, Crown } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function AppSidebar() {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isSubscribed } = useSubscription();
  const [tooltipText, setTooltipText] = useState("");
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  const handleMouseEnter = (text: string, e: React.MouseEvent) => {
    setTooltipText(text);
    setTooltipVisible(true);
    setTooltipPosition({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    setTooltipVisible(false);
  };

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
                "flex items-center gap-3 px-6 py-3 pr-3 text-sm text-sidebar-foreground hover:bg-white/10 transition-colors",
                isActive && "bg-white/10 font-medium"
              )}
            >
              <Home size={18} />
              <span className="flex items-center gap-2">
                Home
                {isSubscribed && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gradient-to-r from-yellow-400 to-yellow-600 text-black rounded-full font-medium">
                    <Crown size={12} />
                    Premium Plan
                  </span>
                )}
              </span>
            </NavLink>
          </li>
          
          <li className="px-6 py-2 mt-4">
            <h3 className="text-xs uppercase text-sidebar-foreground/70 font-medium">INTERVALS</h3>
          </li>
          
          <li>
            <NavLink 
              to="/app/daytrade" 
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-8 py-1.5 pr-3 text-sm text-sidebar-foreground hover:bg-white/10 transition-colors",
                isActive && "bg-white/10 font-medium"
              )}
            >
              <span>Daytrade</span>
            </NavLink>
          </li>
          <li>
            <div 
              className="flex items-center gap-3 px-8 py-1.5 pr-3 text-sm text-sidebar-foreground/50 cursor-not-allowed opacity-70"
              onMouseEnter={(e) => handleMouseEnter("Coming soon!", e)}
              onMouseLeave={handleMouseLeave}
            >
              <span>Weekly Portfolio</span>
            </div>
          </li>
          <li>
            <div 
              className="flex items-center gap-3 px-8 py-1.5 pr-3 text-sm text-sidebar-foreground/50 cursor-not-allowed opacity-70"
              onMouseEnter={(e) => handleMouseEnter("Coming soon!", e)}
              onMouseLeave={handleMouseLeave}
            >
              <span>Monthly Portfolio</span>
            </div>
          </li>
          <li>
            <div 
              className="flex items-center gap-3 px-8 py-1.5 pr-3 text-sm text-sidebar-foreground/50 cursor-not-allowed opacity-70"
              onMouseEnter={(e) => handleMouseEnter("Coming soon!", e)}
              onMouseLeave={handleMouseLeave}
            >
              <span>Annual Portfolio</span>
            </div>
          </li>
        </ul>
      </nav>
      
      <div className="mt-auto">
        <button 
          onClick={toggleTheme} 
          className="flex items-center gap-3 w-full px-6 py-3 pr-3 text-sm text-sidebar-foreground hover:bg-white/10 transition-colors"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          <span>Theme</span>
        </button>
        
        <NavLink 
          to="/app/profile" 
          className={({ isActive }) => cn(
            "flex items-center gap-3 px-6 py-3 pr-3 text-sm text-sidebar-foreground hover:bg-white/10 transition-colors",
            isActive && "bg-white/10 font-medium"
          )}
        >
          <User size={18} />
          <span>My Profile</span>
        </NavLink>
        
        <button 
          onClick={() => logout()} 
          className="flex items-center gap-3 w-full px-6 py-3 pr-3 text-sm text-sidebar-foreground hover:bg-white/10 transition-colors"
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </div>

      {tooltipVisible && (
        <div 
          className="fixed bg-black text-white px-3 py-2 rounded text-xs z-50"
          style={{ 
            left: `${tooltipPosition.x + 10}px`, 
            top: `${tooltipPosition.y - 30}px`,
            pointerEvents: 'none'
          }}
        >
          {tooltipText}
        </div>
      )}
    </aside>
  );
}
