import { supabase, fromDynamic } from '@/integrations/supabase/client';
import { AnalysisResult, Asset, DetailedResult, StockAnalysisParams, StockInfo, User, TradeHistoryItem } from '@/types';
import { getDateRangeForPeriod } from '@/utils/dateUtils';

// Serviço de autenticação
export const auth = {
  async login(email: string, password: string): Promise<any> {
    try {
      console.log(`Attempting to login with email: ${email}`);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("Login error:", error);
        if (error.message.includes("Email not confirmed")) {
          throw new Error("PENDING_CONFIRMATION");
        }
        throw error;
      }

      console.log("Supabase Auth Login successful:", data);
      return {
        user: data.user,
        session: data.session,
      };
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  },

  async register(email: string, password: string, fullName: string): Promise<any> {
    try {
      console.log(`Attempting to register user with email: ${email}`);
      
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login?confirmation=true`,
          data: {
            full_name: fullName,
          }
        }
      });

      if (authError) {
        console.error("Registration auth error:", authError);
        throw authError;
      }

      if (authData.user) {
        const { error: userError } = await supabase
          .from('users')
          .insert([{
            id: authData.user.id,
            email: email,
            name: fullName,
            level_id: 1,
            status_users: 'pending',
            created_at: new Date().toISOString(),
          }]);

        if (userError) {
          console.warn("User created in auth but not in public.users table");
        }
      }

      return {
        user: authData.user,
        session: authData.session,
        success: true
      };
    } catch (error) {
      console.error("Registration failed:", error);
      throw error;
    }
  },

  async resetPassword(email: string): Promise<void> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login?reset=true`,
      });
      if (error) throw error;
    } catch (error) {
      console.error("Password reset failed:", error);
      throw error;
    }
  },

  async updatePassword(newPassword: string): Promise<void> {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    } catch (error) {
      console.error("Password update failed:", error);
      throw error;
    }
  },

  async resendConfirmationEmail(email: string): Promise<void> {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: `${window.location.origin}/login?confirmation=true`,
        }
      });
      if (error) throw error;
    } catch (error) {
      console.error("Resend confirmation email failed:", error);
      throw error;
    }
  },

  async googleLogin(): Promise<any> {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/login?provider=google`
        }
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Google login failed:", error);
      throw error;
    }
  },

  async logout(): Promise<void> {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error("Logout failed:", error);
      throw error;
    }
  },

  async getUserData(userId: string): Promise<User | null> {
    try {
      const { data, error } = await supabase.rpc('get_current_user');
      if (error) throw error;
      return data as User;
    } catch (error) {
      console.error("Get user data failed:", error);
      return null;
    }
  },

  async confirmUserEmail(userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('users')
        .update({ status_users: 'active' })
        .eq('id', userId);
      if (error) throw error;
    } catch (error) {
      console.error("Email confirmation failed:", error);
      throw error;
    }
  }
};

// Serviço de dados de mercado
const marketData = {
  async getCountries(): Promise<string[]> {
    try {
      const { data, error } = await fromDynamic('market_data_sources')
        .select('country')
        .order('country');
      if (error) throw error;
      return [...new Set(data?.map(item => (item as any).country).filter(Boolean) || [])];
    } catch (error) {
      console.error('Failed to fetch countries:', error);
      return [];
    }
  },

  async getStockMarkets(country: string): Promise<string[]> {
    try {
      const { data, error } = await fromDynamic('market_data_sources')
        .select('stock_market')
        .eq('country', country)
        .order('stock_market');
      if (error) throw error;
      return [...new Set(data?.map(item => (item as any).stock_market).filter(Boolean) || [])];
    } catch (error) {
      console.error('Failed to fetch stock markets:', error);
      return [];
    }
  },

  async getAssetClasses(country: string, stockMarket: string): Promise<string[]> {
    try {
      const { data, error } = await fromDynamic('market_data_sources')
        .select('asset_class')
        .eq('country', country)
        .eq('stock_market', stockMarket)
        .order('asset_class');
      if (error) throw error;
      return [...new Set(data?.map(item => (item as any).asset_class).filter(Boolean) || [])];
    } catch (error) {
      console.error('Failed to fetch asset classes:', error);
      return [];
    }
  },

  async getDataTableName(country: string, stockMarket: string, assetClass: string): Promise<string | null> {
    try {
      const { data, error } = await fromDynamic('market_data_sources')
        .select('stock_table')
        .eq('country', country)
        .eq('stock_market', stockMarket)
        .eq('asset_class', assetClass)
        .maybeSingle();
      if (error) throw error;
      return data ? (data as any).stock_table : null;
    } catch (error) {
      console.error('Failed to fetch data table name:', error);
      return null;
    }
  },

  async checkTableExists(tableName: string): Promise<boolean> {
    try {
      if (!tableName) return false;
      const { error } = await fromDynamic(tableName).select('*').limit(1);
      return !error;
    } catch (error) {
      console.error('Error checking table existence:', error);
      return false;
    }
  }
};

// Serviço de análise - Apenas funções de busca de dados
const analysis = {
  async getStockData(tableName: string, stockCode: string, period: string | undefined = undefined): Promise<any[]> {
    try {
      if (!tableName || !stockCode) throw new Error('Table name and stock code are required');
      
      if (period) {
        const dateRange = getDateRangeForPeriod(period);
        const { data, error } = await fromDynamic(tableName)
          .select('*')
          .eq('stock_code', stockCode)
          .gte('date', dateRange.startDate)
          .lte('date', dateRange.endDate)
          .order('date', { ascending: true });
        
        if (error) throw error;
        return data || [];
      } else {
        const { data, error } = await fromDynamic(tableName)
          .select('*')
          .eq('stock_code', stockCode)
          .order('date', { ascending: true })
          .limit(300);
        
        if (error) throw error;
        return data || [];
      }
    } catch (error) {
      console.error('Failed to get stock data:', error);
      return [];
    }
  },

  async getAvailableStocks(tableName: string): Promise<StockInfo[]> {
    try {
      const { data, error } = await fromDynamic(tableName)
        .select('stock_code')
        .groupBy('stock_code')
        .order('stock_code');
      
      if (error) throw error;
      
      return (data || []).map(item => ({
        code: String(item.stock_code),
        name: String(item.stock_code)
      }));
    } catch (error) {
      console.error('Failed to get available stocks:', error);
      return [];
    }
  },

  async getDetailedAnalysis(stockCode: string, params: StockAnalysisParams): Promise<DetailedResult> {
    try {
      const stockData = await this.getStockData(params.dataTableName!, stockCode, params.period);
      
      return {
        assetCode: stockCode,
        assetName: stockCode,
        tradeHistory: stockData,
        capitalEvolution: [],
        tradingDays: stockData.length,
        trades: 0,
        profits: 0,
        losses: 0,
        stops: 0,
        finalCapital: params.initialCapital,
        profit: 0,
        successRate: 0,
        averageGain: 0,
        averageLoss: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        recoveryFactor: 0
      };
    } catch (error) {
      console.error('Failed to get detailed analysis:', error);
      throw error;
    }
  }
};

export const api = {
  auth,
  marketData,
  analysis
};
