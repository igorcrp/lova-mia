
import { supabase } from "@/integrations/supabase/client";
import { StockAnalysisParams, AnalysisResult, DetailedResult, TradeHistoryItem } from "@/types";

export interface ApiResponse<T> {
  data: T | null;
  error: any;
}

export interface MarketDataSource {
  id: number;
  country: string;
  stock_market: string;
  asset_class: string;
  stock_table: string;
  created_at?: string;
  updated_at?: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  level_id: number;
  status_users: string;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  name: string;
  symbol: string;
  market: string;
  created_at: string;
  updated_at: string;
}

// Helper function to handle API responses
const handleApiResponse = async <T>(promise: Promise<any>): Promise<ApiResponse<T>> => {
  try {
    const { data, error } = await promise;
    if (error) {
      console.error("API Error:", error);
      return { data: null, error };
    }
    return { data, error: null };
  } catch (error: any) {
    console.error("API Exception:", error);
    return { data: null, error };
  }
};

export const api = {
  auth: {
    async login(email: string, password: string) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      return data;
    },

    async register(email: string, password: string, fullName: string) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });
      if (error) throw error;
      return data;
    },

    async resetPassword(email: string) {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
    },

    async logout() {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },

    async getCurrentUser() {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      return user;
    },

    async updateUserProfile(userId: string, updates: any) {
      const { data, error } = await supabase.auth.updateUser(updates);
      if (error) throw error;
      return data;
    },

    async confirmUserEmail(userId: string) {
      // This would typically be handled by Supabase's built-in email confirmation
      // For admin purposes, we might need a custom implementation
      const { data, error } = await supabase
        .from('users')
        .update({ email_verified: true })
        .eq('id', userId);
      if (error) throw error;
      return data;
    },

    async resendConfirmationEmail(email: string) {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email
      });
      if (error) throw error;
    },

    async googleLogin() {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google'
      });
      if (error) throw error;
      return data;
    }
  },

  users: {
    async getUsers() {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data.map(user => ({
        ...user,
        full_name: user.name || '' // Map name to full_name
      })) as User[];
    },

    async getAll() {
      return this.getUsers();
    },

    async getUserStats() {
      const { data, error } = await supabase
        .from('users')
        .select('status_users, level_id')
        .order('created_at', { ascending: false });
      if (error) throw error;
      
      const stats = {
        total: data.length,
        active: data.filter(u => u.status_users === 'active').length,
        pending: data.filter(u => u.status_users === 'pending').length,
        admin: data.filter(u => u.level_id === 2).length,
        investor: data.filter(u => u.level_id === 1).length
      };
      return stats;
    },

    async create(userData: Partial<User>) {
      const { data, error } = await supabase
        .from('users')
        .insert({
          email: userData.email,
          name: userData.full_name,
          level_id: userData.level_id || 1,
          status_users: userData.status_users || 'active',
          email_verified: userData.email_verified || false
        });
      if (error) throw error;
      return data;
    },

    async updateUser(userId: string, updates: Partial<User>) {
      const { data, error } = await supabase
        .from('users')
        .update({
          email: updates.email,
          name: updates.full_name,
          level_id: updates.level_id,
          status_users: updates.status_users,
          email_verified: updates.email_verified
        })
        .eq('id', userId);
      if (error) throw error;
      return data;
    },

    async deleteUser(userId: string) {
      const { data, error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);
      if (error) throw error;
      return data;
    }
  },

  assets: {
    async getAssets() {
      // Since we don't have an assets table, we'll return market data sources
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data.map(item => ({
        id: item.id.toString(),
        name: `${item.country} - ${item.stock_market}`,
        symbol: item.stock_table,
        market: item.asset_class,
        created_at: item.created_at || '',
        updated_at: item.updated_at || ''
      })) as Asset[];
    },

    async getAll() {
      return this.getAssets();
    },

    async getTotalCount() {
      const { count, error } = await supabase
        .from('market_data_sources')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    },

    async create(asset: Omit<Asset, 'id' | 'created_at' | 'updated_at'>) {
      // For now, we'll add to market_data_sources
      const { data, error } = await supabase
        .from('market_data_sources')
        .insert({
          country: asset.name.split(' - ')[0] || 'Unknown',
          stock_market: asset.name.split(' - ')[1] || 'Unknown',
          stock_table: asset.symbol,
          asset_class: asset.market
        });
      if (error) throw error;
      return data;
    },

    async createAsset(asset: Omit<Asset, 'id' | 'created_at' | 'updated_at'>) {
      return this.create(asset);
    },

    async updateAsset(assetId: string, updates: Partial<Asset>) {
      const { data, error } = await supabase
        .from('market_data_sources')
        .update({
          country: updates.name?.split(' - ')[0],
          stock_market: updates.name?.split(' - ')[1],
          stock_table: updates.symbol,
          asset_class: updates.market
        })
        .eq('id', parseInt(assetId));
      if (error) throw error;
      return data;
    },

    async deleteAsset(assetId: string) {
      const { data, error } = await supabase
        .from('market_data_sources')
        .delete()
        .eq('id', parseInt(assetId));
      if (error) throw error;
      return data;
    }
  },

  marketData: {
    async getCountries() {
      console.info("Creating dynamic query for table: market_data_sources");
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

    async getStockMarkets(country?: string) {
      console.info("Creating dynamic query for table: market_data_sources");
      let query = supabase
        .from('market_data_sources')
        .select('stock_market');
      
      if (country) {
        query = query.eq('country', country);
      }
      
      const { data, error } = await query.order('stock_market');
      
      if (error) {
        console.error("Error fetching stock markets:", error);
        throw error;
      }
      
      const uniqueMarkets = [...new Set(data.map(item => item.stock_market))];
      console.info("Loaded stock markets:", uniqueMarkets);
      return uniqueMarkets;
    },

    async getAssetClasses(country?: string, stockMarket?: string) {
      console.info("Creating dynamic query for table: market_data_sources");
      let query = supabase
        .from('market_data_sources')
        .select('asset_class');
      
      if (country) {
        query = query.eq('country', country);
      }
      if (stockMarket) {
        query = query.eq('stock_market', stockMarket);
      }
      
      const { data, error } = await query.order('asset_class');
      
      if (error) {
        console.error("Error fetching asset classes:", error);
        throw error;
      }
      
      const uniqueClasses = [...new Set(data.map(item => item.asset_class))];
      console.info("Loaded asset classes:", uniqueClasses);
      return uniqueClasses;
    },

    async getDataTableName(country: string, stockMarket: string, assetClass: string): Promise<string | null> {
      console.info("Creating dynamic query for table: market_data_sources");
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
      
      console.info("Found data table:", data.stock_table);
      return data.stock_table;
    },

    async checkTableExists(tableName: string): Promise<boolean> {
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
        console.error("Error checking table existence:", error);
        return false;
      }
    },

    async getAvailableStocks(dataTableName: string) {
      const { data, error } = await supabase.rpc('get_unique_stock_codes', {
        p_table_name: dataTableName
      });
      
      if (error) {
        console.error("Error fetching available stocks:", error);
        throw error;
      }
      
      console.info(`Found ${data.length} unique stock codes`);
      return data.map(item => ({
        code: item.stock_code,
        name: item.stock_code,
        fullName: item.stock_code
      }));
    },

    async getStockData(dataTableName: string, stockCode: string, startDate?: string, endDate?: string) {
      const { data, error } = await supabase.rpc('get_stock_data', {
        table_name: dataTableName,
        stock_code_param: stockCode,
        start_date: startDate || null,
        end_date: endDate || null
      });
      
      if (error) {
        console.error("Error fetching stock data:", error);
        throw error;
      }
      
      return data;
    }
  },

  analysis: {
    async getAvailableStocks(dataTableName: string) {
      return api.marketData.getAvailableStocks(dataTableName);
    },

    async runAnalysis(params: StockAnalysisParams, onProgress?: (progress: number) => void): Promise<AnalysisResult[]> {
      try {
        console.info('Starting analysis with params:', params);
        
        const availableStocks = await this.getAvailableStocks(params.dataTableName!);
        const totalStocks = availableStocks.length;
        const results: AnalysisResult[] = [];
        
        for (let i = 0; i < Math.min(totalStocks, 50); i++) {
          const stockInfo = availableStocks[i];
          const stockCode = stockInfo.code;
          
          try {
            const stockData = await api.marketData.getStockData(
              params.dataTableName!,
              stockCode
            );
            
            if (stockData && stockData.length > 0) {
              const tradeHistory = generateTradeHistory(stockData, params);
              const analysisResult = calculateAnalysisMetrics(tradeHistory, params, stockCode);
              results.push(analysisResult);
            }
            
            if (onProgress) {
              onProgress((i + 1) / Math.min(totalStocks, 50) * 100);
            }
          } catch (error) {
            console.error(`Error analyzing ${stockCode}:`, error);
          }
        }
        
        return results.sort((a, b) => (b.profit || 0) - (a.profit || 0));
      } catch (error) {
        console.error('Analysis failed:', error);
        throw error;
      }
    },

    async getDetailedAnalysis(assetCode: string, params: StockAnalysisParams): Promise<DetailedResult | null> {
      try {
        const stockData = await api.marketData.getStockData(
          params.dataTableName!,
          assetCode
        );
        
        if (!stockData || stockData.length === 0) {
          return null;
        }
        
        const tradeHistory = generateTradeHistory(stockData, params);
        const analysisMetrics = calculateAnalysisMetrics(tradeHistory, params, assetCode);
        
        return {
          assetCode,
          tradeHistory,
          tradingDays: tradeHistory.length,
          capitalEvolution: calculateCapitalEvolution(tradeHistory, params.initialCapital),
          ...analysisMetrics
        } as DetailedResult;
      } catch (error) {
        console.error('Failed to get detailed analysis:', error);
        return null;
      }
    }
  }
};

// Helper functions for analysis
function generateTradeHistory(stockData: any[], params: StockAnalysisParams): TradeHistoryItem[] {
  return stockData.map((item, index) => {
    const tradeItem: TradeHistoryItem = {
      date: item.date,
      entryPrice: Number(item.open) || 0,
      high: Number(item.high) || 0,
      low: Number(item.low) || 0,
      exitPrice: Number(item.close) || 0,
      volume: Number(item.volume) || 0,
      suggestedEntryPrice: undefined,
      actualPrice: undefined,
      trade: '-',
      lotSize: undefined,
      stopPrice: '-',
      stop: '-',
      profitLoss: 0,
      profitPercentage: 0,
      currentCapital: undefined
    };

    // Check for entry conditions
    if (index > 0) {
      const previousItem = stockData[index - 1];
      const referencePrice = Number(previousItem[params.referencePrice as keyof typeof previousItem]) || 0;
      const entryThreshold = referencePrice * (1 + (params.entryPercentage / 100) * (params.operation === 'buy' ? 1 : -1));
      
      const currentPrice = Number(item.open) || 0;
      
      if ((params.operation === 'buy' && currentPrice >= entryThreshold) ||
          (params.operation === 'sell' && currentPrice <= entryThreshold)) {
        
        tradeItem.suggestedEntryPrice = currentPrice;
        tradeItem.trade = params.operation === 'buy' ? 'Buy' : 'Sell';
        tradeItem.lotSize = Math.floor(params.initialCapital / currentPrice);
        
        // Calculate stop price
        const stopPercent = params.stopPercentage || 0;
        const stopPrice = currentPrice * (1 + (params.operation === 'buy' ? -1 : 1) * (stopPercent / 100));
        tradeItem.stopPrice = stopPrice;
        
        // Check if stop is hit
        const low = Number(item.low) || 0;
        const high = Number(item.high) || 0;
        
        if ((params.operation === 'buy' && low <= stopPrice) ||
            (params.operation === 'sell' && high >= stopPrice)) {
          tradeItem.stop = 'Executed';
          const exitPrice = stopPrice;
          tradeItem.profitLoss = (params.operation === 'buy' ? exitPrice - currentPrice : currentPrice - exitPrice) * (tradeItem.lotSize || 0);
          tradeItem.profitPercentage = tradeItem.profitLoss / params.initialCapital * 100;
        }
      }
    }

    return tradeItem;
  });
}

function calculateAnalysisMetrics(tradeHistory: TradeHistoryItem[], params: StockAnalysisParams, assetCode: string): AnalysisResult {
  const trades = tradeHistory.filter(item => item.trade !== '-');
  const profits = trades.filter(item => (item.profitLoss || 0) > 0).length;
  const losses = trades.length - profits;
  const stops = trades.filter(item => item.stop === 'Executed').length;
  
  const totalProfit = trades.reduce((sum, item) => sum + (item.profitLoss || 0), 0);
  const finalCapital = params.initialCapital + totalProfit;
  
  return {
    assetCode,
    assetName: assetCode,
    tradingDays: tradeHistory.length,
    trades: trades.length,
    tradePercentage: tradeHistory.length > 0 ? (trades.length / tradeHistory.length) * 100 : 0,
    profits,
    profitPercentage: trades.length > 0 ? (profits / trades.length) * 100 : 0,
    losses,
    lossPercentage: trades.length > 0 ? (losses / trades.length) * 100 : 0,
    stops,
    stopPercentage: trades.length > 0 ? (stops / trades.length) * 100 : 0,
    finalCapital,
    profit: totalProfit,
    successRate: trades.length > 0 ? (profits / trades.length) * 100 : 0,
    averageGain: profits > 0 ? trades.filter(t => (t.profitLoss || 0) > 0).reduce((sum, t) => sum + (t.profitLoss || 0), 0) / profits : 0,
    averageLoss: losses > 0 ? Math.abs(trades.filter(t => (t.profitLoss || 0) < 0).reduce((sum, t) => sum + (t.profitLoss || 0), 0)) / losses : 0,
    maxDrawdown: 0, // Simplified for now
    sharpeRatio: 0, // Simplified for now
    sortinoRatio: 0, // Simplified for now
    recoveryFactor: 0 // Simplified for now
  };
}

function calculateCapitalEvolution(tradeHistory: TradeHistoryItem[], initialCapital: number) {
  let currentCapital = initialCapital;
  const evolution = [{ date: tradeHistory[0]?.date || '', capital: initialCapital }];
  
  tradeHistory.forEach(item => {
    if (item.profitLoss && item.profitLoss !== 0) {
      currentCapital += item.profitLoss;
      evolution.push({ date: item.date, capital: currentCapital });
    }
  });
  
  return evolution;
}
