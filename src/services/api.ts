
import { supabase } from "@/integrations/supabase/client";
import { AnalysisResult, DetailedResult, StockAnalysisParams, StockInfo, TradeHistoryItem, User, Asset } from "@/types";

const api = {
  auth: {
    async login(email: string, password: string) {
      console.info("Attempting login for:", email);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        console.error("Login error:", error);
        throw error;
      }
      
      console.info("Login successful");
      return data;
    },

    async googleLogin() {
      console.info("Attempting Google login");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/app`
        }
      });
      
      if (error) {
        console.error("Google login error:", error);
        throw error;
      }
      
      console.info("Google login initiated");
      return data;
    },

    async register(email: string, password: string, fullName: string) {
      console.info("Attempting registration for:", email);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });
      
      if (error) {
        console.error("Registration error:", error);
        throw error;
      }
      
      console.info("Registration successful");
      return data;
    },

    async resetPassword(email: string) {
      console.info("Requesting password reset for:", email);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      
      if (error) {
        console.error("Password reset error:", error);
        throw error;
      }
      
      console.info("Password reset email sent");
    },

    async resendConfirmationEmail(email: string) {
      console.info("Resending confirmation email for:", email);
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email
      });
      
      if (error) {
        console.error("Resend confirmation error:", error);
        throw error;
      }
      
      console.info("Confirmation email resent");
    },

    async logout() {
      console.info("Logging out");
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Logout error:", error);
        throw error;
      }
      console.info("Logout successful");
    },

    async getCurrentUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // Get additional user data from public.users table
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error("Error fetching user data:", error);
        throw error;
      }

      return {
        id: user.id,
        email: user.email || '',
        full_name: userData?.name || '',
        level_id: userData?.level_id || 1,
        status: userData?.status_users || 'active',
        email_verified: userData?.email_verified || false,
        account_type: 'free' as const,
        created_at: userData?.created_at || '',
        last_login: undefined,
        avatar_url: undefined
      } as User;
    },

    async updateProfile(userId: string, updates: { name?: string; email?: string }) {
      console.info("Updating profile for user:", userId);
      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId);
      
      if (error) {
        console.error("Profile update error:", error);
        throw error;
      }
      
      console.info("Profile updated successfully");
    },

    async deleteUser(userId: string) {
      console.info("Deleting user:", userId);
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);
      
      if (error) {
        console.error("User deletion error:", error);
        throw error;
      }
      
      console.info("User deleted successfully");
    },

    async confirmUserEmail(userId: string) {
      console.info("Confirming email for user:", userId);
      const { error } = await supabase
        .from('users')
        .update({ email_verified: true })
        .eq('id', userId);
      
      if (error) {
        console.error("Email confirmation error:", error);
        throw error;
      }
      
      console.info("Email confirmed successfully");
    }
  },

  users: {
    async getAll() {
      console.info("Fetching all users");
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error("Error fetching users:", error);
        throw error;
      }
      
      return data.map(user => ({
        id: user.id,
        email: user.email,
        full_name: user.name || '',
        level_id: user.level_id || 1,
        status: user.status_users || 'active',
        email_verified: user.email_verified || false,
        account_type: 'free' as const,
        created_at: user.created_at || '',
        last_login: undefined,
        avatar_url: undefined
      })) as User[];
    },

    async updateUser(userId: string, updates: Partial<User>) {
      console.info("Updating user:", userId);
      const { error } = await supabase
        .from('users')
        .update({
          name: updates.full_name,
          email: updates.email,
          status_users: updates.status,
          level_id: updates.level_id,
          email_verified: updates.email_verified
        })
        .eq('id', userId);
      
      if (error) {
        console.error("User update error:", error);
        throw error;
      }
      
      console.info("User updated successfully");
    },

    async create(userData: Partial<User>) {
      console.info("Creating new user");
      const { error } = await supabase
        .from('users')
        .insert({
          email: userData.email,
          name: userData.full_name,
          status_users: userData.status || 'active',
          level_id: userData.level_id || 1,
          email_verified: userData.email_verified || false
        });
      
      if (error) {
        console.error("User creation error:", error);
        throw error;
      }
      
      console.info("User created successfully");
    },

    async getUserStats() {
      console.info("Fetching user statistics");
      const { data, error } = await supabase
        .from('users')
        .select('status_users, level_id');
      
      if (error) {
        console.error("Error fetching user stats:", error);
        throw error;
      }
      
      const totalUsers = data.length;
      const activeUsers = data.filter(user => user.status_users === 'active').length;
      const adminUsers = data.filter(user => user.level_id === 2).length;
      
      return {
        totalUsers,
        activeUsers,
        adminUsers,
        pendingUsers: totalUsers - activeUsers
      };
    }
  },

  assets: {
    async getAll() {
      console.info("Fetching all assets from market data sources");
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('*')
        .order('country', { ascending: true });
      
      if (error) {
        console.error("Error fetching assets:", error);
        throw error;
      }
      
      return data.map(source => ({
        id: source.id.toString(),
        code: source.stock_market,
        name: `${source.country} - ${source.stock_market}`,
        country: source.country,
        stock_market: source.stock_market,
        asset_class: source.asset_class,
        status: 'active' as const
      })) as Asset[];
    },

    async create(assetData: Partial<Asset>) {
      console.info("Creating new asset");
      const { error } = await supabase
        .from('market_data_sources')
        .insert({
          country: assetData.country,
          stock_market: assetData.stock_market,
          asset_class: assetData.asset_class,
          stock_table: `${assetData.country?.toLowerCase()}_${assetData.stock_market?.toLowerCase()}_${assetData.asset_class?.toLowerCase()}`
        });
      
      if (error) {
        console.error("Asset creation error:", error);
        throw error;
      }
      
      console.info("Asset created successfully");
    },

    async getTotalCount() {
      console.info("Fetching total asset count");
      const { count, error } = await supabase
        .from('market_data_sources')
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        console.error("Error fetching asset count:", error);
        throw error;
      }
      
      return count || 0;
    }
  },

  marketData: {
    async getDataTableName(country: string, stockMarket: string, assetClass: string): Promise<string | null> {
      console.info("Creating dynamic query for table:", "market_data_sources");
      
      try {
        const { data, error } = await supabase
          .from('market_data_sources')
          .select('stock_table')
          .eq('country', country)
          .eq('stock_market', stockMarket)
          .eq('asset_class', assetClass)
          .single();

        if (error) {
          console.error("Error fetching data table name:", error);
          return null;
        }

        return data?.stock_table || null;
      } catch (error) {
        console.error("Exception in getDataTableName:", error);
        return null;
      }
    },

    async getAvailableCountries(): Promise<string[]> {
      console.info("Fetching available countries");
      
      try {
        const { data, error } = await supabase
          .from('market_data_sources')
          .select('country')
          .order('country', { ascending: true });

        if (error) {
          console.error("Error fetching countries:", error);
          return [];
        }

        // Remove duplicates and return unique countries
        const uniqueCountries = Array.from(new Set(data.map(item => item.country)));
        console.info("Loaded countries:", uniqueCountries);
        return uniqueCountries;
      } catch (error) {
        console.error("Exception in getAvailableCountries:", error);
        return [];
      }
    },

    // Alias methods for backward compatibility
    async getCountries(): Promise<string[]> {
      return this.getAvailableCountries();
    },

    async getAvailableStockMarkets(country: string): Promise<string[]> {
      console.info("Fetching stock markets for country:", country);
      
      try {
        const { data, error } = await supabase
          .from('market_data_sources')
          .select('stock_market')
          .eq('country', country)
          .order('stock_market', { ascending: true });

        if (error) {
          console.error("Error fetching stock markets:", error);
          return [];
        }

        const uniqueMarkets = Array.from(new Set(data.map(item => item.stock_market)));
        console.info("Loaded stock markets:", uniqueMarkets);
        return uniqueMarkets;
      } catch (error) {
        console.error("Exception in getAvailableStockMarkets:", error);
        return [];
      }
    },

    // Alias methods for backward compatibility
    async getStockMarkets(country: string): Promise<string[]> {
      return this.getAvailableStockMarkets(country);
    },

    async getAvailableAssetClasses(country: string, stockMarket: string): Promise<string[]> {
      console.info("Fetching asset classes for:", { country, stockMarket });
      
      try {
        const { data, error } = await supabase
          .from('market_data_sources')
          .select('asset_class')
          .eq('country', country)
          .eq('stock_market', stockMarket)
          .order('asset_class', { ascending: true });

        if (error) {
          console.error("Error fetching asset classes:", error);
          return [];
        }

        const uniqueClasses = Array.from(new Set(data.map(item => item.asset_class)));
        console.info("Loaded asset classes:", uniqueClasses);
        return uniqueClasses;
      } catch (error) {
        console.error("Exception in getAvailableAssetClasses:", error);
        return [];
      }
    },

    // Alias methods for backward compatibility
    async getAssetClasses(country: string, stockMarket: string): Promise<string[]> {
      return this.getAvailableAssetClasses(country, stockMarket);
    },

    async checkTableExists(tableName: string): Promise<boolean> {
      console.info("Checking if table exists:", tableName);
      
      try {
        const { data, error } = await supabase.rpc('table_exists', {
          p_table_name: tableName
        });

        if (error) {
          console.error("Error checking table existence:", error);
          return false;
        }

        return data || false;
      } catch (error) {
        console.error("Exception in checkTableExists:", error);
        return false;
      }
    },

    async getAvailableStocks(tableName: string): Promise<StockInfo[]> {
      console.info("Fetching available stocks from table:", tableName);
      
      try {
        const { data, error } = await supabase.rpc('get_unique_stock_codes', {
          p_table_name: tableName
        });

        if (error) {
          console.error("Error fetching stocks:", error);
          return [];
        }

        return data.map((item: { stock_code: string }) => ({
          code: item.stock_code,
          name: item.stock_code,
          fullName: item.stock_code
        }));
      } catch (error) {
        console.error("Exception in getAvailableStocks:", error);
        return [];
      }
    },

    async getAvailableStocksDirect(tableName: string): Promise<StockInfo[]> {
      console.info("Fetching available stocks directly from table:", tableName);
      
      try {
        const validTables = ['br_b3_stocks', 'us_nasdaq_stocks', 'us_nyse_etfs'];
        if (!validTables.includes(tableName)) {
          console.warn("Invalid table name:", tableName);
          return [];
        }

        const { data, error } = await supabase
          .from(tableName as any)
          .select('stock_code')
          .order('stock_code', { ascending: true });

        if (error) {
          console.error("Error fetching stocks directly:", error);
          return [];
        }

        // Remove duplicates
        const uniqueStocks = Array.from(new Set(data.map(item => item.stock_code)));
        return uniqueStocks.map(code => ({
          code,
          name: code,
          fullName: code
        }));
      } catch (error) {
        console.error("Exception in getAvailableStocksDirect:", error);
        return [];
      }
    }
  },

  analysis: {
    async getAvailableStocks(tableName: string): Promise<StockInfo[]> {
      return api.marketData.getAvailableStocks(tableName);
    },

    async runAnalysis(params: StockAnalysisParams, progressCallback?: (progress: number) => void): Promise<AnalysisResult[]> {
      console.info("Starting analysis with params:", params);
      
      try {
        progressCallback?.(10);
        
        if (!params.dataTableName) {
          throw new Error("Data table name is required");
        }

        // Get available stocks
        const stocks = await api.marketData.getAvailableStocks(params.dataTableName);
        console.info(`Found ${stocks.length} stocks for analysis`);
        
        progressCallback?.(30);
        
        const results: AnalysisResult[] = [];
        const totalStocks = Math.min(stocks.length, 10); // Limit for performance
        
        for (let i = 0; i < totalStocks; i++) {
          const stock = stocks[i];
          progressCallback?.(30 + (i / totalStocks) * 60);
          
          try {
            // Simulate analysis - replace with actual implementation
            const mockResult: AnalysisResult = {
              assetCode: stock.code,
              assetName: stock.name,
              tradingDays: Math.floor(Math.random() * 200) + 50,
              trades: Math.floor(Math.random() * 20) + 5,
              tradePercentage: Math.random() * 100,
              profits: Math.floor(Math.random() * 10) + 1,
              profitPercentage: Math.random() * 60,
              losses: Math.floor(Math.random() * 8) + 1,
              lossPercentage: Math.random() * 40,
              stops: Math.floor(Math.random() * 5),
              stopPercentage: Math.random() * 20,
              finalCapital: params.initialCapital * (0.8 + Math.random() * 0.4),
              profit: (Math.random() - 0.5) * params.initialCapital * 0.3,
              averageGain: Math.random() * 1000 + 100,
              averageLoss: -(Math.random() * 800 + 50),
              maxDrawdown: Math.random() * 15,
              sharpeRatio: Math.random() * 2 - 0.5,
              sortinoRatio: Math.random() * 2.5 - 0.5,
              recoveryFactor: Math.random() * 3 + 0.5,
              successRate: Math.random() * 100
            };
            
            results.push(mockResult);
          } catch (error) {
            console.error(`Error analyzing ${stock.code}:`, error);
          }
        }
        
        progressCallback?.(90);
        console.info(`Analysis completed for ${results.length} stocks`);
        return results;
        
      } catch (error) {
        console.error("Analysis failed:", error);
        throw error;
      }
    },

    async getDetailedAnalysis(stockCode: string, params: StockAnalysisParams): Promise<DetailedResult | null> {
      console.info("Fetching detailed analysis for:", stockCode);
      
      try {
        if (!params.dataTableName) {
          throw new Error("Data table name is required for detailed analysis");
        }

        // Calculate date range based on period
        const endDate = new Date();
        const startDate = new Date();
        
        if (params.period.includes('month')) {
          const months = parseInt(params.period) || 6;
          startDate.setMonth(endDate.getMonth() - months);
        } else if (params.period.includes('year')) {
          const years = parseInt(params.period) || 1;
          startDate.setFullYear(endDate.getFullYear() - years);
        } else {
          startDate.setMonth(endDate.getMonth() - 6); // Default to 6 months
        }

        // Fetch stock data
        const { data: stockData, error } = await supabase.rpc('get_stock_data', {
          table_name: params.dataTableName,
          stock_code_param: stockCode,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0]
        });

        if (error) {
          console.error("Error fetching stock data:", error);
          throw error;
        }

        if (!stockData || stockData.length === 0) {
          console.warn("No stock data found for:", stockCode);
          return null;
        }

        console.info(`Found ${stockData.length} data points for ${stockCode}`);

        // Convert to TradeHistoryItem format with proper type handling
        const tradeHistory: TradeHistoryItem[] = stockData.map((row: any) => ({
          date: row.date,
          entryPrice: typeof row.open === 'number' ? row.open : parseFloat(row.open) || 0,
          exitPrice: typeof row.close === 'number' ? row.close : parseFloat(row.close) || 0,
          profit: undefined,
          profitLoss: undefined,
          profitPercentage: 0,
          trade: '-' as const,
          stop: '-' as const,
          volume: typeof row.volume === 'number' ? row.volume : parseInt(row.volume) || 0,
          high: typeof row.high === 'number' ? row.high : parseFloat(row.high) || 0,
          low: typeof row.low === 'number' ? row.low : parseFloat(row.low) || 0,
          close: typeof row.close === 'number' ? row.close : parseFloat(row.close) || 0,
          suggestedEntryPrice: undefined,
          actualPrice: undefined,
          lotSize: undefined,
          stopPrice: undefined,
          capital: undefined,
          currentCapital: undefined
        }));

        // Create mock detailed result
        const detailedResult: DetailedResult = {
          assetCode: stockCode,
          assetName: stockCode,
          tradingDays: tradeHistory.length,
          trades: Math.floor(Math.random() * 20) + 5,
          tradePercentage: Math.random() * 100,
          profits: Math.floor(Math.random() * 10) + 1,
          profitPercentage: Math.random() * 60,
          losses: Math.floor(Math.random() * 8) + 1,
          lossPercentage: Math.random() * 40,
          stops: Math.floor(Math.random() * 5),
          stopPercentage: Math.random() * 20,
          finalCapital: params.initialCapital * (0.8 + Math.random() * 0.4),
          profit: (Math.random() - 0.5) * params.initialCapital * 0.3,
          averageGain: Math.random() * 1000 + 100,
          averageLoss: -(Math.random() * 800 + 50),
          maxDrawdown: Math.random() * 15,
          sharpeRatio: Math.random() * 2 - 0.5,
          sortinoRatio: Math.random() * 2.5 - 0.5,
          recoveryFactor: Math.random() * 3 + 0.5,
          successRate: Math.random() * 100,
          tradeHistory,
          capitalEvolution: tradeHistory.map((trade, index) => ({
            date: trade.date,
            capital: params.initialCapital * (1 + (Math.random() - 0.5) * 0.1 * index / tradeHistory.length)
          }))
        };

        return detailedResult;

      } catch (error) {
        console.error("Detailed analysis failed:", error);
        throw error;
      }
    }
  }
};

export { api };
