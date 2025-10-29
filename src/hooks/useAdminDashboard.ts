
import { useState, useEffect } from "react";
import { supabase, fromDynamic } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DashboardStats {
  totalUsers: number;
  totalAssets: number;
  userRegistrations: Array<{
    date: string;
    registrations: number;
  }>;
  dailyLogins: Array<{
    date: string;
    logins: number;
  }>;
}

export function useAdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDashboardStats = async () => {
    try {
      setIsLoading(true);
      
      // Fetch total users
      const { count: userCount, error: userError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });

      if (userError) {
        console.error("Error fetching user count:", userError);
        throw userError;
      }

      // Fetch user registrations by date (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: userRegistrationsData, error: registrationsError } = await supabase
        .from('users')
        .select('created_at')
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (registrationsError) {
        console.error("Error fetching user registrations:", registrationsError);
        throw registrationsError;
      }

      // Process user registrations by date
      const registrationsByDate: { [key: string]: number } = {};
      userRegistrationsData?.forEach(user => {
        if (user.created_at) {
          const date = new Date(user.created_at).toLocaleDateString('en-US', { 
            month: 'numeric', 
            day: 'numeric' 
          });
          registrationsByDate[date] = (registrationsByDate[date] || 0) + 1;
        }
      });

      const userRegistrations = Object.entries(registrationsByDate)
        .map(([date, registrations]) => ({ date, registrations }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Fetch market data sources to get table names
      const { data: marketSources, error: sourcesError } = await supabase
        .from('market_data_sources')
        .select('stock_table');

      if (sourcesError) {
        console.error("Error fetching market sources:", sourcesError);
        throw sourcesError;
      }

      // Count unique assets across all tables
      let totalAssets = 0;
      const uniqueAssets = new Set<string>();

      for (const source of marketSources || []) {
        try {
          const { data: assetsData, error: assetsError } = await fromDynamic(source.stock_table)
            .select('stock_code');

          if (assetsError) {
            console.error(`Error fetching from ${source.stock_table}:`, assetsError);
            continue;
          }

          if (assetsData && Array.isArray(assetsData)) {
            assetsData.forEach((asset: any) => {
              if (asset && asset.stock_code) {
                uniqueAssets.add(asset.stock_code);
              }
            });
          }
        } catch (error) {
          console.error(`Failed to fetch assets from ${source.stock_table}:`, error);
        }
      }

      totalAssets = uniqueAssets.size;

      // Fetch daily logins from user_login_history
      const { data: loginHistoryData, error: loginHistoryError } = await supabase
        .from('user_login_history')
        .select('login_at')
        .gte('login_at', thirtyDaysAgo.toISOString());

      if (loginHistoryError) {
        console.error("Error fetching login history:", loginHistoryError);
      }

      // Process daily logins by date
      const loginsByDate: { [key: string]: number } = {};
      loginHistoryData?.forEach(login => {
        if (login.login_at) {
          const date = new Date(login.login_at).toLocaleDateString('en-US', { 
            month: 'numeric', 
            day: 'numeric' 
          });
          loginsByDate[date] = (loginsByDate[date] || 0) + 1;
        }
      });

      const dailyLogins = Object.entries(loginsByDate)
        .map(([date, logins]) => ({ date, logins }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setStats({
        totalUsers: userCount || 0,
        totalAssets,
        userRegistrations,
        dailyLogins
      });
    } catch (error) {
      console.error("Failed to fetch dashboard stats", error);
      toast.error("Failed to fetch dashboard statistics");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  return {
    stats,
    isLoading,
    refetch: fetchDashboardStats
  };
}
