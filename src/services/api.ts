
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
      // This function would need to be created in Supabase
      // For now, we'll query the users table directly
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
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
      
      const uniqueCodes = [...new Set(data.map(item => item.stock_code))];
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

    // Mock functions for missing API endpoints
    async runAnalysis(params: StockAnalysisParams): Promise<AnalysisResult[]> {
      // This would be implemented as an edge function or backend service
      console.log('Mock runAnalysis called with params:', params);
      return [];
    },

    async getDetailedAnalysis(params: StockAnalysisParams): Promise<DetailedResult> {
      // This would be implemented as an edge function or backend service
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

  // Mock functions for admin features
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
    }
  },

  assets: {
    async getAll() {
      // This would query an assets table if it existed
      console.log('Mock getAll assets called');
      return [];
    },

    async updateStatus(assetId: string, status: string) {
      // This would update an asset's status
      console.log('Mock updateStatus called for asset:', assetId, 'status:', status);
      return {};
    }
  }
};
