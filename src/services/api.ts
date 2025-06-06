import { supabase } from "@/integrations/supabase/client";
import { 
  User, 
  Asset, 
  AnalysisResult, 
  DetailedResult, 
  StockAnalysisParams, 
  StockInfo, 
  TradeHistoryItem,
  CapitalPoint
} from "@/types";
import { getDateRangeForPeriod } from "@/utils/dateUtils";

// Function names available in Supabase
type FunctionName = "check_user_by_email" | "get_stock_data" | "get_unique_stock_codes" | "table_exists";

// Helper function to call Supabase stored procedures
async function rpc(functionName: FunctionName, params: any = {}) {
  console.info(`Calling function: ${functionName} with params:`, params);
  return await supabase.rpc(functionName, params);
}

export const api = {
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

      console.info("Login successful for:", email);
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

      console.info("Registration successful for:", email);
      return data;
    },

    async resetPassword(email: string) {
      console.info("Attempting password reset for:", email);
      const { data, error } = await supabase.auth.resetPasswordForEmail(email);

      if (error) {
        console.error("Password reset error:", error);
        throw error;
      }

      console.info("Password reset successful for:", email);
      return data;
    },

    async logout() {
      console.info("Attempting logout");
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("Logout error:", error);
        throw error;
      }

      console.info("Logout successful");
    },

    async getCurrentUser(): Promise<User | null> {
      try {
        console.info("Getting current user");
        
        // Get current auth user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError) {
          console.error("Auth error:", authError);
          throw authError;
        }

        if (!user) {
          console.info("No authenticated user found");
          return null;
        }

        console.info("Current user permissions:", {
          email: user.email,
          status: "active",
          level_id: 1
        });

        // Get user details from users table
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();

        if (userError) {
          console.error("User data error:", userError);
          // Return basic user info if database user doesn't exist
          return {
            id: user.id,
            email: user.email!,
            full_name: user.user_metadata?.full_name || user.email!,
            level_id: 1,
            status: 'active',
            email_verified: !!user.email_confirmed_at,
            account_type: 'free',
            created_at: user.created_at,
            last_login: user.last_sign_in_at
          };
        }

        // Map database user to User type
        return {
          id: userData.id,
          email: userData.email,
          full_name: userData.name || userData.email,
          level_id: userData.level_id || 1,
          status: userData.status_users === 'active' ? 'active' : 
                  userData.status_users === 'inactive' ? 'inactive' : 
                  userData.status_users === 'pending' ? 'pending' : 
                  'pending' as any,
          email_verified: userData.email_verified || false,
          account_type: 'free',
          created_at: userData.created_at,
          last_login: userData.updated_at
        };

      } catch (error) {
        console.error("Error getting current user:", error);
        throw error;
      }
    },

    async updateUserLevel(userId: string, levelId: number) {
      console.info(`Updating user level for ${userId} to ${levelId}`);
      
      const { data, error } = await supabase
        .from('users')
        .update({ level_id: levelId })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        console.error("Error updating user level:", error);
        throw error;
      }

      console.info("User level updated successfully");
      return data;
    },

    async updateUserStatus(userId: string, status: string) {
      console.info(`Updating user status for ${userId} to ${status}`);
      
      const { data, error } = await supabase
        .from('users')
        .update({ 
          status_users: status === 'active' ? 'active' : 
                       status === 'inactive' ? 'inactive' : 
                       status === 'pending' ? 'pending' : status 
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        console.error("Error updating user status:", error);
        throw error;
      }

      console.info("User status updated successfully");
      return data;
    },

    async confirmUserEmail(userId: string) {
      console.info(`Confirming email for user ${userId}`);
      
      const { data, error } = await supabase
        .from('users')
        .update({ email_verified: true })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        console.error("Error confirming user email:", error);
        throw error;
      }

      console.info("User email confirmed successfully");
      return data;
    },

    async resendConfirmationEmail(email: string) {
      console.info("Resending confirmation email for:", email);
      const { data, error } = await supabase.auth.resend({
        type: 'signup',
        email: email
      });

      if (error) {
        console.error("Error resending confirmation email:", error);
        throw error;
      }

      console.info("Confirmation email resent successfully");
      return data;
    },

    async googleLogin() {
      console.info("Attempting Google login");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google'
      });

      if (error) {
        console.error("Google login error:", error);
        throw error;
      }

      console.info("Google login initiated successfully");
      return data;
    }
  },

  users: {
    async getAllUsers(): Promise<User[]> {
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
        full_name: user.name || user.email,
        level_id: user.level_id || 1,
        status: user.status_users === 'active' ? 'active' : 
                user.status_users === 'inactive' ? 'inactive' : 
                user.status_users === 'pending' ? 'pending' : 
                'pending' as any,
        email_verified: user.email_verified || false,
        account_type: 'free',
        created_at: user.created_at,
        last_login: user.updated_at
      }));
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

      const total = data.length;
      const active = data.filter(u => u.status_users === 'active').length;
      const pending = data.filter(u => u.status_users === 'pending').length;
      const admins = data.filter(u => u.level_id === 2).length;

      return { total, active, pending, admins };
    },

    async create(userData: Partial<User>) {
      console.info("Creating new user:", userData.email);
      
      const { data, error } = await supabase
        .from('users')
        .insert([{
          email: userData.email!,
          name: userData.full_name,
          level_id: userData.level_id || 1,
          status_users: userData.status || 'pending',
          email_verified: userData.email_verified || false
        }])
        .select()
        .single();

      if (error) {
        console.error("Error creating user:", error);
        throw error;
      }

      console.info("User created successfully");
      return data;
    }
  },

  assets: {
    async getAllAssets(): Promise<Asset[]> {
      console.info("Fetching all assets");
      
      // For now, return mock data since we don't have an assets table
      return [
        {
          id: "1",
          code: "AAPL",
          name: "Apple Inc.",
          country: "USA",
          stock_market: "NASDAQ",
          asset_class: "Stock",
          status: "active"
        },
        {
          id: "2", 
          code: "MSFT",
          name: "Microsoft Corporation",
          country: "USA",
          stock_market: "NASDAQ",
          asset_class: "Stock",
          status: "active"
        }
      ];
    },

    async getTotalCount(): Promise<number> {
      const assets = await this.getAllAssets();
      return assets.length;
    },

    async create(assetData: Partial<Asset>) {
      console.info("Creating new asset:", assetData.code);
      // Mock implementation - in real app would create in database
      return {
        id: Date.now().toString(),
        code: assetData.code!,
        name: assetData.name!,
        country: assetData.country!,
        stock_market: assetData.stock_market!,
        asset_class: assetData.asset_class!,
        status: assetData.status || 'active'
      };
    },

    async getAll(): Promise<Asset[]> {
      return this.getAllAssets();
    }
  },

  marketData: {
    async getAvailableCountries(): Promise<string[]> {
      console.info("Fetching available countries");
      
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('country')
        .order('country');

      if (error) {
        console.error("Error fetching countries:", error);
        throw error;
      }

      const uniqueCountries = [...new Set(data.map(item => item.country))];
      console.info("Loaded countries:", uniqueCountries);
      return uniqueCountries;
    },

    async getAvailableStockMarkets(country: string): Promise<string[]> {
      console.info(`Fetching stock markets for country: ${country}`);
      
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('stock_market')
        .eq('country', country)
        .order('stock_market');

      if (error) {
        console.error("Error fetching stock markets:", error);
        throw error;
      }

      const uniqueMarkets = [...new Set(data.map(item => item.stock_market))];
      console.info("Loaded stock markets:", uniqueMarkets);
      return uniqueMarkets;
    },

    async getAvailableAssetClasses(country: string, stockMarket: string): Promise<string[]> {
      console.info(`Fetching asset classes for ${country} - ${stockMarket}`);
      
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('asset_class')
        .eq('country', country)
        .eq('stock_market', stockMarket)
        .order('asset_class');

      if (error) {
        console.error("Error fetching asset classes:", error);
        throw error;
      }

      const uniqueClasses = [...new Set(data.map(item => item.asset_class))];
      console.info("Loaded asset classes:", uniqueClasses);
      return uniqueClasses;
    },

    async getDataTableName(country: string, stockMarket: string, assetClass: string): Promise<string | null> {
      console.info(`Getting data table name for ${country} - ${stockMarket} - ${assetClass}`);
      
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('stock_table')
        .eq('country', country)
        .eq('stock_market', stockMarket)
        .eq('asset_class', assetClass)
        .single();

      if (error) {
        console.error("Error getting data table name:", error);
        return null;
      }

      console.info("Data table name:", data.stock_table);
      return data.stock_table;
    },

    async checkTableExists(tableName: string): Promise<boolean> {
      console.info(`Checking if table exists: ${tableName}`);
      
      try {
        const { data, error } = await rpc('table_exists', {
          p_table_name: tableName
        });

        if (error) {
          console.error("Error checking table existence:", error);
          return false;
        }

        console.info(`Table ${tableName} exists:`, !!data);
        return !!data;

      } catch (error) {
        console.error("Error in checkTableExists:", error);
        return false;
      }
    },

    async getAvailableStocks(tableName: string): Promise<StockInfo[]> {
      console.info(`Fetching available stocks for table: ${tableName}`);
      
      try {
        const { data, error } = await rpc('get_unique_stock_codes', { 
          p_table_name: tableName 
        });

        if (error) {
          console.error("Error fetching stock codes:", error);
          throw error;
        }

        const stockCodes = Array.isArray(data) ? data : [];
        console.info(`Found ${stockCodes.length} stock codes`);

        // Convert to StockInfo format
        return stockCodes.map((item: any) => ({
          code: item.stock_code,
          name: item.stock_code, // Using code as name for now
          fullName: item.stock_code
        }));

      } catch (error) {
        console.error("Error in getAvailableStocks:", error);
        throw error;
      }
    },

    async getAvailableStocksDirect(tableName: string): Promise<StockInfo[]> {
      console.info(`Fetching available stocks directly for table: ${tableName}`);
      
      try {
        // First check if table exists
        const tableExists = await this.checkTableExists(tableName);

        if (!tableExists) {
          console.error(`Table ${tableName} does not exist or is not accessible`);
          return [];
        }

        // Use RPC function instead of direct table access
        return this.getAvailableStocks(tableName);

      } catch (error) {
        console.error("Error in getAvailableStocksDirect:", error);
        throw error;
      }
    }
  },

  analysis: {
    async runAnalysis(
      params: StockAnalysisParams, 
      onProgress?: (progress: number) => void
    ): Promise<AnalysisResult[]> {
      console.info("Running analysis with params:", params);
      
      try {
        onProgress?.(10);
        
        if (!params.dataTableName) {
          throw new Error("Data table name is required");
        }

        // Get date range for the specified period
        const { startDate, endDate } = getDateRangeForPeriod(params.period);
        console.info(`Analysis period: ${startDate} to ${endDate}`);

        onProgress?.(30);

        // Get available stocks for this data source
        const availableStocks = await this.getAvailableStocks(params.dataTableName);
        
        if (availableStocks.length === 0) {
          console.warn("No stocks found for analysis");
          return [];
        }

        onProgress?.(50);

        // For demo purposes, analyze a subset of stocks
        const stocksToAnalyze = availableStocks.slice(0, 10);
        const results: AnalysisResult[] = [];

        for (let i = 0; i < stocksToAnalyze.length; i++) {
          const stock = stocksToAnalyze[i];
          
          try {
            const stockData = await this.getStockData(
              params.dataTableName, 
              stock.code, 
              startDate, 
              endDate
            );

            if (stockData.length > 0) {
              const analysisResult = await this.calculateStockAnalysis(stockData, params);
              results.push({
                assetCode: stock.code,
                assetName: stock.name,
                ...analysisResult
              });
            }

            onProgress?.(50 + (i + 1) / stocksToAnalyze.length * 40);
          } catch (stockError) {
            console.error(`Error analyzing ${stock.code}:`, stockError);
            // Continue with next stock
          }
        }

        onProgress?.(100);
        
        console.info(`Analysis completed for ${results.length} stocks`);
        return results;

      } catch (error) {
        console.error("Analysis failed:", error);
        throw error;
      }
    },

    async getAvailableStocks(tableName: string): Promise<StockInfo[]> {
      return api.marketData.getAvailableStocks(tableName);
    },

    async getAvailableStocksDirect(tableName: string): Promise<StockInfo[]> {
      return api.marketData.getAvailableStocksDirect(tableName);
    },

    async getStockData(
      tableName: string, 
      stockCode: string, 
      startDate?: string, 
      endDate?: string
    ): Promise<any[]> {
      console.info(`Fetching stock data for ${stockCode} from ${tableName}`);
      
      try {
        const { data, error } = await rpc('get_stock_data', {
          table_name: tableName,
          stock_code_param: stockCode,
          start_date: startDate,
          end_date: endDate
        });

        if (error) {
          console.error("Error fetching stock data:", error);
          throw error;
        }

        const stockData = Array.isArray(data) ? data : [];
        console.info(`Retrieved ${stockData.length} records for ${stockCode}`);
        return stockData;

      } catch (error) {
        console.error("Error in getStockData:", error);
        throw error;
      }
    },

    async calculateStockAnalysis(stockData: any[], params: StockAnalysisParams): Promise<Omit<AnalysisResult, 'assetCode' | 'assetName'>> {
      console.info(`Calculating analysis for ${stockData.length} data points`);
      
      if (!stockData || stockData.length === 0) {
        throw new Error("No stock data provided for analysis");
      }

      let currentCapital = params.initialCapital;
      let trades = 0;
      let profits = 0;
      let losses = 0;
      let stops = 0;
      const tradeHistory: TradeHistoryItem[] = [];
      const capitalEvolution: CapitalPoint[] = [];

      let totalProfits = 0;
      let totalLosses = 0;
      let maxCapital = currentCapital;
      let maxDrawdown = 0;

      // Sort data by date to ensure correct order
      const sortedData = [...stockData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      for (let i = 0; i < sortedData.length; i++) {
        const dayData = sortedData[i];
        const prevDayData = i > 0 ? sortedData[i - 1] : null;
        
        const open = Number(dayData.open);
        const high = Number(dayData.high);
        const low = Number(dayData.low);
        const close = Number(dayData.close);
        const volume = Number(dayData.volume);
        
        if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
          continue;
        }

        // Get previous day's reference price (use close as default)
        let prevReferencePrice = close; // fallback if no previous day
        if (prevDayData) {
          switch (params.referencePrice) {
            case 'open': prevReferencePrice = Number(prevDayData.open); break;
            case 'high': prevReferencePrice = Number(prevDayData.high); break;
            case 'low': prevReferencePrice = Number(prevDayData.low); break;
            case 'close': prevReferencePrice = Number(prevDayData.close); break;
          }
        }

        // Formula 5.7: Suggested Entry Price
        let suggestedEntryPrice: number;
        if (params.operation === 'buy') {
          // Buy: Previous day's reference price - (Previous day's reference price * % Entry Price)
          suggestedEntryPrice = prevReferencePrice - (prevReferencePrice * params.entryPercentage / 100);
        } else {
          // Sell: Previous day's reference price + (Previous day's reference price * % Entry Price)
          suggestedEntryPrice = prevReferencePrice + (prevReferencePrice * params.entryPercentage / 100);
        }

        // Formula 5.8: Actual Price - If Open <= Suggested Entry, use the smaller value (open)
        let actualPrice = open;
        if (open <= suggestedEntryPrice) {
          actualPrice = open;
        } else {
          actualPrice = suggestedEntryPrice;
        }

        // Formula 5.9: Trade execution logic
        let entryExecuted = false;
        if (params.operation === 'buy') {
          // Buy: If Actual Price <= Suggested Entry OR Low <= Suggested Entry, then "Executed"
          entryExecuted = (actualPrice <= suggestedEntryPrice) || (low <= suggestedEntryPrice);
        } else {
          // Sell: If Actual Price >= Suggested Entry OR High >= Suggested Entry, then "Executed"
          entryExecuted = (actualPrice >= suggestedEntryPrice) || (high >= suggestedEntryPrice);
        }

        let trade: TradeHistoryItem['trade'] = entryExecuted ? 'Executed' : '-';
        
        // Formula 5.10: Lot Size = Previous day's Current Capital / Actual Price (rounded down to tens)
        let lotSize = 0;
        if (entryExecuted) {
          lotSize = Math.floor(currentCapital / actualPrice);
          // Round down to tens
          lotSize = Math.floor(lotSize / 10) * 10;
        }

        // Formula 5.11: Stop Price
        let stopPrice = 0;
        if (entryExecuted) {
          if (params.operation === 'buy') {
            // Buy: Actual Price - (Actual Price * % Stop)
            stopPrice = actualPrice - (actualPrice * params.stopPercentage / 100);
          } else {
            // Sell: Actual Price + (Actual Price * % Stop)
            stopPrice = actualPrice + (actualPrice * params.stopPercentage / 100);
          }
        }

        // Formula 5.12: Stop Trigger
        let stopTriggered: '-' | 'Executed' = '-';
        if (entryExecuted) {
          if (params.operation === 'buy') {
            // Buy: If Low < Stop Price, then "Executed"
            stopTriggered = low < stopPrice ? 'Executed' : '-';
          } else {
            // Sell: If High > Stop Price, then "Executed"
            stopTriggered = high > stopPrice ? 'Executed' : '-';
          }
        }

        // Formula 5.13: Profit/Loss
        let profitLoss = 0;
        if (entryExecuted) {
          trades++;
          
          if (stopTriggered === 'Executed') {
            // If Stop Trigger = "Executed", then [(Stop Price - Actual Price) * Lot Size]
            if (params.operation === 'buy') {
              profitLoss = (stopPrice - actualPrice) * lotSize;
            } else {
              profitLoss = (actualPrice - stopPrice) * lotSize;
            }
            stops++;
          } else {
            // If Stop Trigger = "-", then [(Close - Actual Price) * Lot Size]
            if (params.operation === 'buy') {
              profitLoss = (close - actualPrice) * lotSize;
            } else {
              profitLoss = (actualPrice - close) * lotSize;
            }
          }
          
          // Count profits and losses
          if (profitLoss > 0) {
            profits++;
            totalProfits += profitLoss;
          } else {
            losses++;
            totalLosses += Math.abs(profitLoss);
          }
        }

        // Formula 5.14: Current Capital
        if (entryExecuted) {
          currentCapital += profitLoss;
        }
        
        // Track max drawdown
        maxCapital = Math.max(maxCapital, currentCapital);
        const currentDrawdown = (maxCapital - currentCapital) / maxCapital * 100;
        maxDrawdown = Math.max(maxDrawdown, currentDrawdown);

        tradeHistory.push({
          date: dayData.date,
          entryPrice: open,
          high,
          low,
          exitPrice: close,
          volume,
          suggestedEntryPrice,
          actualPrice: entryExecuted ? actualPrice : 0,
          trade,
          lotSize,
          stopPrice: entryExecuted ? stopPrice : 0,
          stop: stopTriggered,
          profitLoss,
          profitPercentage: entryExecuted && actualPrice > 0 ? 
            (profitLoss / (actualPrice * lotSize)) * 100 : 0,
          currentCapital
        });

        capitalEvolution.push({
          date: dayData.date,
          capital: currentCapital
        });
      }

      // Calculate metrics according to formulas 4.2.1 to 4.2.12
      const totalTrades = trades;
      const profit = currentCapital - params.initialCapital;
      const tradePercentage = totalTrades > 0 ? (trades / stockData.length) * 100 : 0;  // 4.2.4
      const profitPercentage = totalTrades > 0 ? (profits / totalTrades) * 100 : 0;     // 4.2.6
      const lossPercentage = totalTrades > 0 ? (losses / totalTrades) * 100 : 0;        // 4.2.8
      const stopPercentage = totalTrades > 0 ? (stops / totalTrades) * 100 : 0;         // 4.2.10
      const successRate = totalTrades > 0 ? (profits / totalTrades) * 100 : 0;
      
      const averageGain = profits > 0 ? totalProfits / profits : 0;
      const averageLoss = losses > 0 ? totalLosses / losses : 0;
      
      // Calculate Sharpe ratio (simplified)
      const returns = capitalEvolution.map((point, index) => {
        if (index === 0) return 0;
        const prevCapital = capitalEvolution[index - 1].capital;
        return (point.capital - prevCapital) / prevCapital;
      }).filter(r => !isNaN(r));
      
      const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
      const returnStdDev = returns.length > 1 ? 
        Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1)) : 0;
      const sharpeRatio = returnStdDev > 0 ? (avgReturn / returnStdDev) * Math.sqrt(252) : 0;
      
      // Simplified Sortino ratio
      const negativeReturns = returns.filter(r => r < 0);
      const downstdDev = negativeReturns.length > 1 ?
        Math.sqrt(negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length) : 0;
      const sortinoRatio = downstdDev > 0 ? (avgReturn / downstdDev) * Math.sqrt(252) : 0;
      
      const recoveryFactor = maxDrawdown > 0 ? (profit / params.initialCapital * 100) / maxDrawdown : 0;

      return {
        tradingDays: stockData.length,   // 4.2.2
        trades: totalTrades,             // 4.2.3
        tradePercentage,                 // 4.2.4
        profits,                         // 4.2.5
        profitPercentage,                // 4.2.6
        losses,                          // 4.2.7
        lossPercentage,                  // 4.2.8
        stops,                           // 4.2.9
        stopPercentage,                  // 4.2.10
        finalCapital: currentCapital,    // 4.2.11
        profit,
        averageGain,
        averageLoss,
        maxDrawdown,
        sharpeRatio,
        sortinoRatio,
        recoveryFactor,
        successRate
      };
    },

    async getDetailedAnalysis(stockCode: string, params: StockAnalysisParams): Promise<DetailedResult> {
      console.info(`Getting detailed analysis for ${stockCode}`);
      
      try {
        if (!params.dataTableName) {
          throw new Error("Data table name is required");
        }

        // Get date range for the specified period
        const { startDate, endDate } = getDateRangeForPeriod(params.period);
        
        // Get stock data
        const stockData = await this.getStockData(
          params.dataTableName,
          stockCode,
          startDate,
          endDate
        );

        if (stockData.length === 0) {
          throw new Error(`No data found for ${stockCode}`);
        }

        // Calculate analysis
        const analysisResult = await this.calculateStockAnalysis(stockData, params);
        
        // Get trade history and capital evolution
        const { tradeHistory, capitalEvolution } = await this.calculateDetailedTradeHistory(stockData, params);

        return {
          assetCode: stockCode,
          assetName: stockCode,
          ...analysisResult,
          tradeHistory,
          capitalEvolution
        };

      } catch (error) {
        console.error(`Error getting detailed analysis for ${stockCode}:`, error);
        throw error;
      }
    },

    async calculateDetailedTradeHistory(stockData: any[], params: StockAnalysisParams): Promise<{
      tradeHistory: TradeHistoryItem[];
      capitalEvolution: CapitalPoint[];
    }> {
      let currentCapital = params.initialCapital;
      const tradeHistory: TradeHistoryItem[] = [];
      const capitalEvolution: CapitalPoint[] = [];

      // Sort data by date to ensure correct order
      const sortedData = [...stockData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      for (let i = 0; i < sortedData.length; i++) {
        const dayData = sortedData[i];
        const prevDayData = i > 0 ? sortedData[i - 1] : null;
        
        const open = Number(dayData.open);
        const high = Number(dayData.high);
        const low = Number(dayData.low);
        const close = Number(dayData.close);
        const volume = Number(dayData.volume);
        
        if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
          continue;
        }

        // Get previous day's reference price
        let prevReferencePrice = close; // fallback if no previous day
        if (prevDayData) {
          switch (params.referencePrice) {
            case 'open': prevReferencePrice = Number(prevDayData.open); break;
            case 'high': prevReferencePrice = Number(prevDayData.high); break;
            case 'low': prevReferencePrice = Number(prevDayData.low); break;
            case 'close': prevReferencePrice = Number(prevDayData.close); break;
          }
        }

        // Formula 5.7: Calculate suggested entry price based on previous day's reference price
        let suggestedEntryPrice: number;
        if (params.operation === 'buy') {
          // Buy: Previous day's reference price - (Previous day's reference price * % Entry Price)
          suggestedEntryPrice = prevReferencePrice - (prevReferencePrice * params.entryPercentage / 100);
        } else {
          // Sell: Previous day's reference price + (Previous day's reference price * % Entry Price)
          suggestedEntryPrice = prevReferencePrice + (prevReferencePrice * params.entryPercentage / 100);
        }

        // Formula 5.8: Actual Price - If Open <= Suggested Entry, use the smaller value (open)
        let actualPrice = suggestedEntryPrice;
        if (params.operation === 'buy' && open <= suggestedEntryPrice) {
          actualPrice = open;
        } else if (params.operation === 'sell' && open >= suggestedEntryPrice) {
          actualPrice = open;
        }

        // Formula 5.9: Trade execution logic
        let entryExecuted = false;
        if (params.operation === 'buy') {
          // Buy: If low <= Suggested Entry, then "Executed"
          entryExecuted = low <= suggestedEntryPrice;
        } else {
          // Sell: If high >= Suggested Entry, then "Executed"
          entryExecuted = high >= suggestedEntryPrice;
        }

        let trade: TradeHistoryItem['trade'] = entryExecuted ? 'Executed' : '-';
        
        // Formula 5.10: Lot Size = Previous day's Current Capital / Actual Price (rounded down)
        let lotSize = 0;
        if (entryExecuted) {
          // Get previous day's current capital (or initial capital if first day)
          const prevCapital = i > 0 && tradeHistory[i-1] ? 
            tradeHistory[i-1].currentCapital || params.initialCapital : 
            params.initialCapital;
          
          lotSize = Math.floor(prevCapital / actualPrice);
          // Round down to tens
          lotSize = Math.floor(lotSize / 10) * 10;
          if (lotSize <= 0) lotSize = 0;
        }

        // Formula 5.11: Stop Price
        let stopPrice = 0;
        if (entryExecuted) {
          if (params.operation === 'buy') {
            // Buy: Actual Price - (Actual Price * % Stop)
            stopPrice = actualPrice - (actualPrice * params.stopPercentage / 100);
          } else {
            // Sell: Actual Price + (Actual Price * % Stop)
            stopPrice = actualPrice + (actualPrice * params.stopPercentage / 100);
          }
        }

        // Formula 5.12: Stop Trigger
        let stopTriggered: '-' | 'Executed' = '-';
        if (entryExecuted) {
          if (params.operation === 'buy') {
            // Buy: If Low < Stop Price, then "Executed"
            stopTriggered = low < stopPrice ? 'Executed' : '-';
          } else {
            // Sell: If High > Stop Price, then "Executed"
            stopTriggered = high > stopPrice ? 'Executed' : '-';
          }
        }

        // Formula 5.13: Profit/Loss
        let profitLoss = 0;
        if (entryExecuted && lotSize > 0) {
          if (stopTriggered === 'Executed') {
            // If Stop Trigger = "Executed", then [(Stop Price - Actual Price) * Lot Size]
            if (params.operation === 'buy') {
              profitLoss = (stopPrice - actualPrice) * lotSize;
            } else {
              profitLoss = (actualPrice - stopPrice) * lotSize;
            }
          } else {
            // If Stop Trigger = "-", then [(Close - Actual Price) * Lot Size]
            if (params.operation === 'buy') {
              profitLoss = (close - actualPrice) * lotSize;
            } else {
              profitLoss = (actualPrice - close) * lotSize;
            }
          }
        }

        // Formula 5.14: Current Capital (Adds profit/loss to previous day's capital)
        if (entryExecuted && lotSize > 0) {
          currentCapital += profitLoss;
        }

        tradeHistory.push({
          date: dayData.date,
          entryPrice: open,
          high,
          low,
          exitPrice: close,
          volume,
          suggestedEntryPrice,
          actualPrice: entryExecuted ? actualPrice : 0,
          trade,
          lotSize,
          stopPrice: entryExecuted ? stopPrice : 0,
          stop: stopTriggered,
          profitLoss,
          profitPercentage: entryExecuted && actualPrice > 0 && lotSize > 0 ? 
            (profitLoss / (actualPrice * lotSize)) * 100 : 0,
          currentCapital
        });

        capitalEvolution.push({
          date: dayData.date,
          capital: currentCapital
        });
      }

      return { tradeHistory, capitalEvolution };
    }
  }
};
