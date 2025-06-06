
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

// Helper function to create dynamic queries when RLS allows
function fromDynamic(tableName: string) {
  console.info(`Creating dynamic query for table: ${tableName}`);
  return supabase.from(tableName);
}

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
    }
  },

  marketData: {
    async getAvailableCountries(): Promise<string[]> {
      console.info("Fetching available countries");
      
      const { data, error } = await fromDynamic('market_data_sources')
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
      
      const { data, error } = await fromDynamic('market_data_sources')
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
      
      const { data, error } = await fromDynamic('market_data_sources')
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
      
      const { data, error } = await fromDynamic('market_data_sources')
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

        const stockCodes = data || [];
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
        const { data: tableExists, error: checkError } = await rpc('table_exists', {
          p_table_name: tableName
        });

        if (checkError || !tableExists) {
          console.error(`Table ${tableName} does not exist or is not accessible`);
          return [];
        }

        const { data, error } = await supabase
          .from(tableName)
          .select('stock_code')
          .limit(1000);

        if (error) {
          console.error("Error fetching stock codes directly:", error);
          throw error;
        }

        const uniqueCodes = [...new Set(data.map(item => item.stock_code))];
        console.info(`Found ${uniqueCodes.length} unique stock codes`);

        return uniqueCodes.map(code => ({
          code,
          name: code,
          fullName: code
        }));

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

        console.info(`Retrieved ${data?.length || 0} records for ${stockCode}`);
        return data || [];

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

      for (const dayData of stockData) {
        const open = Number(dayData.open);
        const high = Number(dayData.high);
        const low = Number(dayData.low);
        const close = Number(dayData.close);
        const volume = Number(dayData.volume);
        
        if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
          continue;
        }

        // Get reference price
        let referencePrice = close;
        switch (params.referencePrice) {
          case 'open': referencePrice = open; break;
          case 'high': referencePrice = high; break;
          case 'low': referencePrice = low; break;
          case 'close': referencePrice = close; break;
        }

        // Calculate entry and stop prices
        const entryPriceMultiplier = params.operation === 'buy' 
          ? (1 + params.entryPercentage / 100)
          : (1 - params.entryPercentage / 100);
        
        const suggestedEntryPrice = referencePrice * entryPriceMultiplier;
        
        const stopPriceMultiplier = params.operation === 'buy'
          ? (1 - params.stopPercentage / 100)
          : (1 + params.stopPercentage / 100);
        
        const stopPrice = suggestedEntryPrice * stopPriceMultiplier;

        // Determine if entry condition is met
        let entryExecuted = false;
        let actualEntryPrice = suggestedEntryPrice;
        
        if (params.operation === 'buy') {
          entryExecuted = low <= suggestedEntryPrice;
          if (entryExecuted) {
            actualEntryPrice = Math.min(suggestedEntryPrice, open);
          }
        } else {
          entryExecuted = high >= suggestedEntryPrice;
          if (entryExecuted) {
            actualEntryPrice = Math.max(suggestedEntryPrice, open);
          }
        }

        let trade: TradeHistoryItem['trade'] = entryExecuted ? 
          (params.operation === 'buy' ? 'Buy' : 'Sell') : '-';
        
        let profitLoss = 0;
        let lotSize = 0;
        
        if (entryExecuted) {
          trades++;
          
          // Calculate lot size based on current capital
          lotSize = Math.floor(currentCapital / actualEntryPrice);
          
          // Check if stop was triggered
          let stopTriggered = false;
          if (params.operation === 'buy') {
            stopTriggered = low < stopPrice;
          } else {
            stopTriggered = high > stopPrice;
          }
          
          let exitPrice: number;
          if (stopTriggered) {
            stops++;
            exitPrice = stopPrice;
            trade = 'Close';
          } else {
            // Exit at close
            exitPrice = close;
          }
          
          // Calculate profit/loss
          if (params.operation === 'buy') {
            profitLoss = (exitPrice - actualEntryPrice) * lotSize;
          } else {
            profitLoss = (actualEntryPrice - exitPrice) * lotSize;
          }
          
          currentCapital += profitLoss;
          
          if (profitLoss > 0) {
            profits++;
            totalProfits += profitLoss;
          } else {
            losses++;
            totalLosses += Math.abs(profitLoss);
          }
          
          // Track max drawdown
          maxCapital = Math.max(maxCapital, currentCapital);
          const currentDrawdown = (maxCapital - currentCapital) / maxCapital * 100;
          maxDrawdown = Math.max(maxDrawdown, currentDrawdown);
        }

        tradeHistory.push({
          date: dayData.date,
          entryPrice: open,
          high,
          low,
          exitPrice: close,
          volume,
          suggestedEntryPrice,
          actualPrice: entryExecuted ? actualEntryPrice : 0,
          trade,
          lotSize,
          stopPrice,
          profitLoss,
          profitPercentage: entryExecuted && actualEntryPrice > 0 ? 
            (profitLoss / (actualEntryPrice * lotSize)) * 100 : 0,
          currentCapital
        });

        capitalEvolution.push({
          date: dayData.date,
          capital: currentCapital
        });
      }

      // Calculate metrics
      const totalTrades = trades;
      const profit = currentCapital - params.initialCapital;
      const tradePercentage = totalTrades > 0 ? (trades / totalTrades) * 100 : 0;
      const profitPercentage = profits > 0 ? (profits / totalTrades) * 100 : 0;
      const lossPercentage = losses > 0 ? (losses / totalTrades) * 100 : 0;
      const stopPercentage = stops > 0 ? (stops / totalTrades) * 100 : 0;
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
        tradingDays: stockData.length,
        trades: totalTrades,
        tradePercentage,
        profits,
        profitPercentage,
        losses,
        lossPercentage,
        stops,
        stopPercentage,
        finalCapital: currentCapital,
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

      for (const dayData of stockData) {
        const open = Number(dayData.open);
        const high = Number(dayData.high);
        const low = Number(dayData.low);
        const close = Number(dayData.close);
        const volume = Number(dayData.volume);
        
        if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
          continue;
        }

        // Get reference price
        let referencePrice = close;
        switch (params.referencePrice) {
          case 'open': referencePrice = open; break;
          case 'high': referencePrice = high; break;
          case 'low': referencePrice = low; break;
          case 'close': referencePrice = close; break;
        }

        // Calculate entry and stop prices
        const entryPriceMultiplier = params.operation === 'buy' 
          ? (1 + params.entryPercentage / 100)
          : (1 - params.entryPercentage / 100);
        
        const suggestedEntryPrice = referencePrice * entryPriceMultiplier;
        
        const stopPriceMultiplier = params.operation === 'buy'
          ? (1 - params.stopPercentage / 100)
          : (1 + params.stopPercentage / 100);
        
        const stopPrice = suggestedEntryPrice * stopPriceMultiplier;

        // Determine if entry condition is met
        let entryExecuted = false;
        let actualEntryPrice = suggestedEntryPrice;
        
        if (params.operation === 'buy') {
          entryExecuted = low <= suggestedEntryPrice;
          if (entryExecuted) {
            actualEntryPrice = Math.min(suggestedEntryPrice, open);
          }
        } else {
          entryExecuted = high >= suggestedEntryPrice;
          if (entryExecuted) {
            actualEntryPrice = Math.max(suggestedEntryPrice, open);
          }
        }

        let trade: TradeHistoryItem['trade'] = entryExecuted ? 
          (params.operation === 'buy' ? 'Buy' : 'Sell') : '-';
        
        let profitLoss = 0;
        let lotSize = 0;
        
        if (entryExecuted) {
          // Calculate lot size based on current capital
          lotSize = Math.floor(currentCapital / actualEntryPrice);
          
          // Check if stop was triggered
          let stopTriggered = false;
          if (params.operation === 'buy') {
            stopTriggered = low < stopPrice;
          } else {
            stopTriggered = high > stopPrice;
          }
          
          let exitPrice: number;
          if (stopTriggered) {
            exitPrice = stopPrice;
            trade = 'Close';
          } else {
            // Exit at close
            exitPrice = close;
          }
          
          // Calculate profit/loss
          if (params.operation === 'buy') {
            profitLoss = (exitPrice - actualEntryPrice) * lotSize;
          } else {
            profitLoss = (actualEntryPrice - exitPrice) * lotSize;
          }
          
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
          actualPrice: entryExecuted ? actualEntryPrice : 0,
          trade,
          lotSize,
          stopPrice,
          profitLoss,
          profitPercentage: entryExecuted && actualEntryPrice > 0 ? 
            (profitLoss / (actualEntryPrice * lotSize)) * 100 : 0,
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
