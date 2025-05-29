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
        .maybeSingle();
      
      if (error) {
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
      
      // Safely handle the data array and type check
      const stockCodes = Array.isArray(data) ? 
        data
          .filter(item => item && typeof item === 'object' && 'stock_code' in item && item.stock_code)
          .map(item => item.stock_code)
          .filter(Boolean) : [];
      
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
      
      // Return mock data that matches the expected structure
      return [
        {
          assetCode: 'MOCK001',
          assetName: 'Mock Asset 1',
          tradingDays: 250,
          trades: 50,
          tradePercentage: 20,
          profits: 30,
          profitPercentage: 60,
          losses: 15,
          lossPercentage: 30,
          stops: 5,
          stopPercentage: 10,
          finalCapital: params.initialCapital * 1.15,
          profit: params.initialCapital * 0.15,
          averageGain: 500,
          averageLoss: 300,
          maxDrawdown: 5.2,
          sharpeRatio: 1.8,
          sortinoRatio: 2.1,
          recoveryFactor: 2.9,
          successRate: 60
        }
      ];
    },

    async getDetailedAnalysis(assetCode: string, params: StockAnalysisParams): Promise<DetailedResult> {
      console.log('Mock getDetailedAnalysis called with assetCode:', assetCode, 'params:', params);
      
      // Return mock detailed data
      return {
        assetCode: assetCode,
        assetName: `Mock Asset ${assetCode}`,
        tradingDays: 250,
        trades: 50,
        tradePercentage: 20,
        profits: 30,
        profitPercentage: 60,
        losses: 15,
        lossPercentage: 30,
        stops: 5,
        stopPercentage: 10,
        finalCapital: params.initialCapital * 1.15,
        profit: params.initialCapital * 0.15,
        averageGain: 500,
        averageLoss: 300,
        maxDrawdown: 5.2,
        sharpeRatio: 1.8,
        sortinoRatio: 2.1,
        recoveryFactor: 2.9,
        successRate: 60,
        tradeHistory: [
          {
            date: '2024-01-15',
            entryPrice: 100,
            exitPrice: 105,
            profit: 500,
            profitPercentage: 5,
            trade: 'Buy',
            stop: '-',
            volume: 100
          }
        ],
        capitalEvolution: [
          {
            date: '2024-01-01',
            capital: params.initialCapital
          },
          {
            date: '2024-01-15',
            capital: params.initialCapital * 1.05
          }
        ]
      };
    }
  },

  users: {
    async getAll() {
      const { data, error } = await supabase
        .from('users')
        .select('*');
      
      if (error) throw error;
      
      // Transform the data to match the User interface
      return data.map(user => ({
        ...user,
        full_name: user.name || '',
        status: user.status_users as 'active' | 'inactive' | 'pending' || 'pending',
        account_type: (user.metadata && typeof user.metadata === 'object' && 'account_type' in user.metadata) 
          ? user.metadata.account_type as 'free' | 'premium' 
          : 'free',
        last_login: user.updated_at
      }));
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
        total: 156,
        active: 98,
        pending: 23,
        inactive: 35,
        premium: 45,
        new: 12
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
      return [
        {
          id: '1',
          code: 'MOCK001',
          name: 'Mock Asset 1',
          country: 'Brazil',
          stock_market: 'B3',
          asset_class: 'stocks',
          status: 'active' as const
        }
      ];
    },

    async updateStatus(assetId: string, status: string) {
      console.log('Mock updateStatus called for asset:', assetId, 'status:', status);
      return {
        id: assetId,
        code: 'MOCK001',
        name: 'Mock Asset 1',
        country: 'Brazil',
        stock_market: 'B3',
        asset_class: 'stocks',
        status: status as 'active' | 'inactive'
      };
    },

    async getTotalCount() {
      console.log('Mock getTotalCount assets called');
      return 487;
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
        status: assetData.status as 'active' | 'inactive'
      };
    }
  }
};
