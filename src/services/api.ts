
import { supabase } from "@/integrations/supabase/client";
import { StockAnalysisParams, AnalysisResult, DetailedResult, TradeHistoryItem, CapitalPoint, StockInfo } from "@/types";

// Helper function to get date range based on period
const getDateRange = (period: string) => {
  const endDate = new Date();
  const startDate = new Date();
  
  switch (period) {
    case '1m':
      startDate.setMonth(endDate.getMonth() - 1);
      break;
    case '3m':
      startDate.setMonth(endDate.getMonth() - 3);
      break;
    case '6m':
      startDate.setMonth(endDate.getMonth() - 6);
      break;
    case '1y':
      startDate.setFullYear(endDate.getFullYear() - 1);
      break;
    case '2y':
      startDate.setFullYear(endDate.getFullYear() - 2);
      break;
    case '5y':
      startDate.setFullYear(endDate.getFullYear() - 5);
      break;
    default:
      startDate.setMonth(endDate.getMonth() - 1);
  }
  
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  };
};

export const api = {
  auth: {
    async signUp(email: string, password: string, userData: any) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData
        }
      });
      if (error) throw error;
      return data;
    },

    async signIn(email: string, password: string) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      return data;
    },

    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },

    async getCurrentUser() {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      return user;
    },

    async resetPassword(email: string) {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
    },

    // Additional auth methods for compatibility
    async login(email: string, password: string) {
      return this.signIn(email, password);
    },

    async logout() {
      return this.signOut();
    },

    async register(email: string, password: string, fullName: string) {
      return this.signUp(email, password, { full_name: fullName });
    },

    async googleLogin() {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google'
      });
      if (error) throw error;
      return data;
    },

    async resendConfirmationEmail(email: string) {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email
      });
      if (error) throw error;
    }
  },

  users: {
    async getUsers() {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },

    async getUserProfile(userId: string) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) throw error;
      return data;
    },

    async updateUserProfile(userId: string, updates: any) {
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    // Additional methods for admin pages
    async getAll() {
      return this.getUsers();
    },

    async create(userData: any) {
      const { data, error } = await supabase
        .from('users')
        .insert(userData)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },

    async getUserStats() {
      const users = await this.getUsers();
      return {
        total: users.length,
        active: users.filter(u => u.status_users === 'active').length,
        pending: users.filter(u => u.status_users === 'pending').length,
        inactive: users.filter(u => u.status_users === 'inactive').length,
        premium: users.filter(u => u.level_id === 2).length,
        new: users.filter(u => {
          const created = new Date(u.created_at);
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          return created > thirtyDaysAgo;
        }).length
      };
    }
  },

  assets: {
    async getAssets() {
      // Mock implementation - replace with actual asset fetching logic
      return [];
    },

    async getAll() {
      return this.getAssets();
    },

    async create(assetData: any) {
      // Mock implementation
      return assetData;
    },

    async getTotalCount() {
      const assets = await this.getAssets();
      return assets.length;
    }
  },

  marketData: {
    async getDataTableName(country: string, stockMarket: string, assetClass: string): Promise<string | null> {
      try {
        console.log('Fetching data table name for:', { country, stockMarket, assetClass });
        
        const { data, error } = await supabase
          .from('market_data_sources')
          .select('stock_table')
          .eq('country', country)
          .eq('stock_market', stockMarket)
          .eq('asset_class', assetClass)
          .maybeSingle();

        if (error) {
          console.error('Error fetching data table name:', error);
          throw error;
        }

        if (!data) {
          console.warn('No data source found for the specified criteria');
          return null;
        }

        console.log('Found data table:', data.stock_table);
        return data.stock_table;
      } catch (error) {
        console.error('Failed to get data table name:', error);
        throw error;
      }
    },

    async getMarketDataSources() {
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('*')
        .order('country', { ascending: true });

      if (error) throw error;
      return data || [];
    },

    async getCountries(): Promise<string[]> {
      try {
        console.log('Fetching countries...');
        
        const { data, error } = await supabase
          .from('market_data_sources')
          .select('country')
          .order('country', { ascending: true });

        if (error) {
          console.error('Error fetching countries:', error);
          throw error;
        }

        const uniqueCountries = [...new Set(data?.map(item => item.country) || [])];
        console.log('Fetched countries:', uniqueCountries);
        return uniqueCountries;
      } catch (error) {
        console.error('Failed to fetch countries:', error);
        throw error;
      }
    },

    async getStockMarkets(country: string): Promise<string[]> {
      try {
        console.log('Fetching stock markets for country:', country);
        
        const { data, error } = await supabase
          .from('market_data_sources')
          .select('stock_market')
          .eq('country', country)
          .order('stock_market', { ascending: true });

        if (error) {
          console.error('Error fetching stock markets:', error);
          throw error;
        }

        const uniqueMarkets = [...new Set(data?.map(item => item.stock_market) || [])];
        console.log('Fetched stock markets:', uniqueMarkets);
        return uniqueMarkets;
      } catch (error) {
        console.error('Failed to fetch stock markets:', error);
        throw error;
      }
    },

    async getAssetClasses(country: string, stockMarket: string): Promise<string[]> {
      try {
        console.log('Fetching asset classes for:', { country, stockMarket });
        
        const { data, error } = await supabase
          .from('market_data_sources')
          .select('asset_class')
          .eq('country', country)
          .eq('stock_market', stockMarket)
          .order('asset_class', { ascending: true });

        if (error) {
          console.error('Error fetching asset classes:', error);
          throw error;
        }

        const uniqueAssetClasses = [...new Set(data?.map(item => item.asset_class) || [])];
        console.log('Fetched asset classes:', uniqueAssetClasses);
        return uniqueAssetClasses;
      } catch (error) {
        console.error('Failed to fetch asset classes:', error);
        throw error;
      }
    },

    async checkTableExists(tableName: string): Promise<boolean> {
      try {
        // Use RPC call to check table existence safely
        const { data, error } = await supabase.rpc('table_exists', {
          p_table_name: tableName
        });

        if (error) {
          console.error('Error checking table existence:', error);
          return false;
        }

        return data === true;
      } catch (error) {
        console.error('Table existence check failed:', error);
        return false;
      }
    },

    async getUniqueStockCodes(tableName: string): Promise<string[]> {
      try {
        console.log('Fetching unique stock codes from table:', tableName);
        
        // Use RPC call for dynamic table queries
        const { data, error } = await supabase.rpc('get_unique_stock_codes', {
          p_table_name: tableName
        });

        if (error) {
          console.error('Error fetching stock codes:', error);
          throw error;
        }

        console.log('Fetched stock codes:', data?.length || 0, 'codes');
        return data || [];
      } catch (error) {
        console.error('Failed to fetch stock codes:', error);
        throw error;
      }
    },

    async getStockData(tableName: string, stockCode: string, params: StockAnalysisParams) {
      try {
        console.log('Fetching stock data for:', { tableName, stockCode });
        
        // Get date range from period
        const { startDate, endDate } = getDateRange(params.period);
        
        // Use RPC call for dynamic table queries with the corrected parameter names
        const { data, error } = await supabase.rpc('get_stock_data', {
          table_name: tableName,
          stock_code_param: stockCode,
          start_date: startDate,
          end_date: endDate
        });

        if (error) {
          console.error('Error fetching stock data:', error);
          throw error;
        }

        return data || [];
      } catch (error) {
        console.error('Failed to fetch stock data:', error);
        throw error;
      }
    }
  },

  analysis: {
    async runAnalysis(params: StockAnalysisParams, onProgress?: (progress: number) => void): Promise<AnalysisResult[]> {
      try {
        console.log('Running analysis with params:', params);
        
        if (!params.dataTableName) {
          throw new Error('Data table name is required for analysis');
        }

        // Mock progress updates
        if (onProgress) {
          onProgress(25);
          await new Promise(resolve => setTimeout(resolve, 500));
          onProgress(50);
          await new Promise(resolve => setTimeout(resolve, 500));
          onProgress(75);
          await new Promise(resolve => setTimeout(resolve, 500));
          onProgress(100);
        }

        // Get unique stock codes from the specified table
        const stockCodes = await this.getAvailableStocks(params.dataTableName);
        
        if (stockCodes.length === 0) {
          console.warn('No stock codes found in the specified table');
          return [];
        }

        console.log(`Processing ${stockCodes.length} stocks...`);
        
        // Generate mock analysis results
        const results: AnalysisResult[] = stockCodes.slice(0, 20).map((stock, index) => ({
          assetCode: stock.code,
          assetName: stock.name || stock.code,
          tradingDays: Math.floor(Math.random() * 200) + 50,
          trades: Math.floor(Math.random() * 100) + 10,
          tradePercentage: Math.random() * 100,
          profits: Math.floor(Math.random() * 50) + 5,
          profitPercentage: Math.random() * 60,
          losses: Math.floor(Math.random() * 30) + 2,
          lossPercentage: Math.random() * 40,
          stops: Math.floor(Math.random() * 20),
          stopPercentage: Math.random() * 30,
          finalCapital: params.initialCapital + (Math.random() - 0.5) * params.initialCapital * 0.5,
          profit: (Math.random() - 0.5) * params.initialCapital * 0.3,
          averageGain: Math.random() * 5 + 1,
          averageLoss: Math.random() * 3 + 0.5,
          maxDrawdown: Math.random() * 20,
          sharpeRatio: Math.random() * 2 - 0.5,
          sortinoRatio: Math.random() * 2.5 - 0.5,
          recoveryFactor: Math.random() * 3,
          successRate: Math.random() * 80 + 20
        }));

        console.log(`Analysis completed: processed ${results.length} stocks`);
        return results.sort((a, b) => b.profit - a.profit);
      } catch (error) {
        console.error('Analysis failed:', error);
        throw error;
      }
    },

    async getDetailedAnalysis(stockCode: string, params: StockAnalysisParams): Promise<DetailedResult> {
      try {
        console.log('Getting detailed analysis for:', stockCode, params);
        
        if (!params.dataTableName) {
          throw new Error('Data table name is required for detailed analysis');
        }

        // Generate mock detailed analysis
        const tradeHistory: TradeHistoryItem[] = [];
        const capitalEvolution: CapitalPoint[] = [];
        
        let currentCapital = params.initialCapital;
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 3);
        
        for (let i = 0; i < 60; i++) {
          const date = new Date(startDate);
          date.setDate(date.getDate() + i);
          
          const entryPrice = 100 + Math.random() * 50;
          const exitPrice = entryPrice + (Math.random() - 0.5) * 10;
          const profitLoss = (exitPrice - entryPrice) * 100;
          
          currentCapital += profitLoss;
          
          tradeHistory.push({
            date: date.toISOString().split('T')[0],
            entryPrice,
            exitPrice,
            profitLoss,
            profitPercentage: ((exitPrice - entryPrice) / entryPrice) * 100,
            trade: Math.random() > 0.5 ? 'Executed' : 'Not Executed',
            stop: Math.random() > 0.8 ? 'Executed' : '-',
            volume: Math.floor(Math.random() * 10000) + 1000,
            high: entryPrice + Math.random() * 5,
            low: entryPrice - Math.random() * 5,
            suggestedEntryPrice: entryPrice * (1 + params.entryPercentage / 100),
            actualPrice: entryPrice,
            lotSize: 100,
            stopPrice: entryPrice * (1 - params.stopPercentage / 100),
            currentCapital
          });
          
          capitalEvolution.push({
            date: date.toISOString().split('T')[0],
            capital: currentCapital
          });
        }

        const result: DetailedResult = {
          assetCode: stockCode,
          assetName: stockCode,
          tradingDays: tradeHistory.length,
          trades: tradeHistory.filter(t => t.trade === 'Executed').length,
          tradePercentage: 75,
          profits: tradeHistory.filter(t => t.profitLoss > 0).length,
          profitPercentage: 60,
          losses: tradeHistory.filter(t => t.profitLoss < 0).length,
          lossPercentage: 40,
          stops: tradeHistory.filter(t => t.stop === 'Executed').length,
          stopPercentage: 15,
          finalCapital: currentCapital,
          profit: currentCapital - params.initialCapital,
          averageGain: 2.5,
          averageLoss: 1.8,
          maxDrawdown: 15,
          sharpeRatio: 1.2,
          sortinoRatio: 1.8,
          recoveryFactor: 2.1,
          successRate: 65,
          tradeHistory,
          capitalEvolution
        };

        console.log('Detailed analysis completed for:', stockCode);
        return result;
      } catch (error) {
        console.error('Failed to get detailed analysis:', error);
        throw error;
      }
    },

    async getAvailableStocks(tableName: string): Promise<StockInfo[]> {
      try {
        console.log('Fetching available stocks from table:', tableName);
        
        const stockCodes = await api.marketData.getUniqueStockCodes(tableName);
        
        const uniqueStocks = stockCodes.map(code => ({
          code,
          name: code,
          fullName: `${code} - Sample Company`
        }));

        console.log('Fetched stocks:', uniqueStocks.length, 'stocks');
        return uniqueStocks;
      } catch (error) {
        console.error('Failed to fetch available stocks:', error);
        throw error;
      }
    },

    async getLiveQuotes(symbols: string[]) {
      // Mock implementation for live quotes
      return symbols.map(symbol => ({
        symbol,
        price: Math.random() * 1000 + 100,
        change: (Math.random() - 0.5) * 10
      }));
    }
  }
};
