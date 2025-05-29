
import { supabase } from "@/integrations/supabase/client";
import { StockInfo, StockAnalysisParams, AnalysisResult, DetailedResult } from "@/types";

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
      const { data, error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      return data;
    },

    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },

    async googleLogin() {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      
      if (error) throw error;
      return data;
    },

    async resendConfirmationEmail(email: string) {
      const { data, error } = await supabase.auth.resend({
        type: 'signup',
        email: email
      });
      
      if (error) throw error;
      return data;
    },

    async confirmUserEmail(userId: string) {
      const { data, error } = await supabase.rpc('confirm_user_email', {
        user_email: userId
      });
      
      if (error) throw error;
      return data;
    },

    async checkUserByEmail(email: string) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      return data;
    }
  },

  marketData: {
    async getMarketDataSources() {
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('*');
      
      if (error) throw error;
      return data;
    },

    async getCountries() {
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('country')
        .order('country');
      
      if (error) throw error;
      
      const uniqueCountries = [...new Set(data.map(item => item.country))];
      return uniqueCountries;
    },

    async getStockMarkets(country?: string) {
      let query = supabase
        .from('market_data_sources')
        .select('stock_market')
        .order('stock_market');
      
      if (country) {
        query = query.eq('country', country);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      const uniqueMarkets = [...new Set(data.map(item => item.stock_market))];
      return uniqueMarkets;
    },

    async getAssetClasses(country?: string, stockMarket?: string) {
      let query = supabase
        .from('market_data_sources')
        .select('asset_class')
        .order('asset_class');
      
      if (country) {
        query = query.eq('country', country);
      }
      if (stockMarket) {
        query = query.eq('stock_market', stockMarket);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      const uniqueAssetClasses = [...new Set(data.map(item => item.asset_class))];
      return uniqueAssetClasses;
    },

    async getDataTableName(country: string, stockMarket: string, assetClass: string) {
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('stock_table')
        .eq('country', country)
        .eq('stock_market', stockMarket)
        .eq('asset_class', assetClass)
        .single();
      
      if (error) throw error;
      return data?.stock_table || null;
    },

    async checkTableExists(tableName: string) {
      try {
        const { error } = await supabase
          .from(tableName as any)
          .select('*')
          .limit(1);
        
        return !error;
      } catch {
        return false;
      }
    }
  },

  analysis: {
    async getAvailableStocks(tableName: string): Promise<StockInfo[]> {
      const { data, error } = await supabase.rpc('get_unique_stock_codes', {
        p_table_name: tableName
      });
      
      if (error) throw error;
      
      return data.map((code: string) => ({
        code,
        name: code,
        fullName: code
      }));
    },

    async getAvailableStocksDirect(tableName: string): Promise<StockInfo[]> {
      const { data, error } = await supabase
        .from(tableName as any)
        .select('stock_code')
        .limit(1000);
      
      if (error) throw error;
      
      // Safely handle the data array
      const stockCodes = Array.isArray(data) ? data.map(item => item?.stock_code).filter(Boolean) : [];
      const uniqueCodes = [...new Set(stockCodes)];
      return uniqueCodes.map(code => ({
        code,
        name: code,
        fullName: code
      }));
    },

    async getStockData(tableName: string, stockCode: string, period?: string, limit?: number) {
      const { data, error } = await supabase.rpc('get_stock_data', {
        p_table_name: tableName,
        p_stock_code_param: stockCode,
        p_limit_rows: limit || 1000
      });
      
      if (error) throw error;
      return data;
    },

    async getStockDataDirect(tableName: string, stockCode: string, limit?: number) {
      const { data, error } = await supabase
        .from(tableName as any)
        .select('*')
        .eq('stock_code', stockCode)
        .order('date', { ascending: false })
        .limit(limit || 1000);
      
      if (error) throw error;
      return data;
    },

    async runAnalysis(params: StockAnalysisParams): Promise<AnalysisResult[]> {
      console.log('Mock runAnalysis called with params:', params);
      return [];
    },

    async getDetailedAnalysis(params: StockAnalysisParams): Promise<DetailedResult> {
      console.log('Mock getDetailedAnalysis called with params:', params);
      return {
        assetCode: '',
        assetName: '',
        tradingDays: 0,
        trades: 0,
        tradePercentage: 0,
        profits: 0,
        profitPercentage: 0,
        losses: 0,
        lossPercentage: 0,
        stops: 0,
        stopPercentage: 0,
        finalCapital: 0,
        profit: 0,
        averageGain: 0,
        averageLoss: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        recoveryFactor: 0,
        successRate: 0,
        tradeHistory: [],
        capitalEvolution: []
      };
    }
  },

  users: {
    async getAll() {
      const { data, error } = await supabase
        .from('users')
        .select('*');
      
      if (error) throw error;
      return data;
    },

    async updateStatus(userId: string, status: string) {
      const { data, error } = await supabase
        .from('users')
        .update({ status_users: status })
        .eq('id', userId);
      
      if (error) throw error;
      return data;
    },

    async getUserStats() {
      console.log('Mock getUserStats called');
      return {
        total: 0,
        active: 0,
        pending: 0,
        inactive: 0,
        premium: 0,
        new: 0
      };
    },

    async create(userData: any) {
      console.log('Mock create user called with:', userData);
      return {
        id: 'mock-id',
        email: userData.email,
        full_name: userData.full_name,
        level_id: userData.level_id,
        status: userData.status,
        email_verified: userData.email_verified,
        account_type: userData.account_type,
        created_at: new Date().toISOString(),
        last_login: new Date().toISOString()
      };
    }
  },

  assets: {
    async getAll() {
      console.log('Mock getAll assets called');
      return [];
    },

    async updateStatus(assetId: string, status: string) {
      console.log('Mock updateStatus called for asset:', assetId, 'status:', status);
      return {};
    },

    async getTotalCount() {
      console.log('Mock getTotalCount assets called');
      return 0;
    },

    async create(assetData: any) {
      console.log('Mock create asset called with:', assetData);
      return {
        id: 'mock-asset-id',
        code: assetData.code,
        name: assetData.name,
        country: assetData.country,
        stock_market: assetData.stock_market,
        asset_class: assetData.asset_class,
        status: assetData.status
      };
    }
  }
};
