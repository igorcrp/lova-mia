import { supabase } from "@/integrations/supabase/client";
import { StockAnalysisParams, AnalysisResult, DetailedResult, StockInfo } from "@/types";

export const api = {
  auth: {
    async signIn(email: string, password: string) {
      return supabase.auth.signInWithPassword({ email, password });
    },
    async signUp(email: string, password: string, metadata?: any) {
      return supabase.auth.signUp({ 
        email, 
        password,
        options: {
          data: metadata
        }
      });
    },
    async signOut() {
      return supabase.auth.signOut();
    },
    async resetPassword(email: string) {
      return supabase.auth.resetPasswordForEmail(email);
    },
    async updatePassword(password: string) {
      return supabase.auth.updateUser({ password });
    },
    async getUser() {
      return supabase.auth.getUser();
    },
    async getSession() {
      return supabase.auth.getSession();
    },
    // Add missing methods that AuthContext expects
    async login(email: string, password: string) {
      return supabase.auth.signInWithPassword({ email, password });
    },
    async logout() {
      return supabase.auth.signOut();
    },
    async register(email: string, password: string, fullName: string) {
      const redirectUrl = `${window.location.origin}/`;
      
      return supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName
          }
        }
      });
    },
    async googleLogin() {
      const redirectUrl = `${window.location.origin}/`;
      
      return supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl
        }
      });
    },
    async resendConfirmationEmail(email: string) {
      return supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: `${window.location.origin}/`
        }
      });
    }
  },

  marketData: {
    async getDataTableName(country: string, stockMarket: string, assetClass: string): Promise<string> {
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('stock_table')
        .eq('country', country)
        .eq('stock_market', stockMarket)
        .eq('asset_class', assetClass)
        .single();

      if (error) {
        console.error('Error fetching data table name:', error);
        throw new Error('Failed to get data table name');
      }

      return data?.stock_table || '';
    },

    async getCountries(): Promise<string[]> {
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('country');

      if (error) {
        console.error('Error fetching countries:', error);
        throw new Error('Failed to get countries');
      }

      const uniqueCountries = [...new Set(data?.map(item => item.country) || [])];
      return uniqueCountries;
    },

    async getStockMarkets(country: string): Promise<string[]> {
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('stock_market')
        .eq('country', country);

      if (error) {
        console.error('Error fetching stock markets:', error);
        throw new Error('Failed to get stock markets');
      }

      const uniqueMarkets = [...new Set(data?.map(item => item.stock_market) || [])];
      return uniqueMarkets;
    },

    async getAssetClasses(country: string, stockMarket: string): Promise<string[]> {
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('asset_class')
        .eq('country', country)
        .eq('stock_market', stockMarket);

      if (error) {
        console.error('Error fetching asset classes:', error);
        throw new Error('Failed to get asset classes');
      }

      const uniqueAssetClasses = [...new Set(data?.map(item => item.asset_class) || [])];
      return uniqueAssetClasses;
    },

    async checkTableExists(tableName: string): Promise<boolean> {
      try {
        // Use RPC to safely check table existence
        const { data, error } = await supabase.rpc('table_exists', { 
          p_table_name: tableName 
        });
        
        if (error) {
          console.error('Error checking table existence:', error);
          return false;
        }
        
        return data === true;
      } catch (error) {
        console.error('Error in checkTableExists:', error);
        return false;
      }
    }
  },

  analysis: {
    async runAnalysis(params: StockAnalysisParams, onProgress?: (progress: number) => void): Promise<AnalysisResult[]> {
      // Simulated analysis - replace with actual implementation
      if (onProgress) onProgress(100);
      return [];
    },

    async getDetailedAnalysis(assetCode: string, params: StockAnalysisParams): Promise<DetailedResult> {
      // Simulated detailed analysis - replace with actual implementation
      return {
        assetCode,
        initialBalance: params.initialCapital,
        finalBalance: params.initialCapital,
        finalCapital: params.initialCapital,
        profit: 0,
        successRate: 0,
        totalTrades: 0,
        trades: 0,
        tradePercentage: 0,
        profitableTrades: 0,
        profits: 0,
        profitPercentage: 0,
        losses: 0,
        lossPercentage: 0,
        stops: 0,
        stopPercentage: 0,
        winRate: 0,
        maxDrawdown: 0,
        recoveryFactor: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        averageReturn: 0,
        averageGain: 0,
        averageLoss: 0,
        tradingDays: 0,
        tradeHistory: []
      };
    },

    async getAvailableStocks(tableName: string): Promise<StockInfo[]> {
      try {
        // Use RPC function to safely get stock codes
        const { data, error } = await supabase.rpc('get_unique_stock_codes', { 
          p_table_name: tableName 
        });

        if (error) {
          console.error('Error fetching stocks:', error);
          throw new Error('Failed to get available stocks');
        }

        return (data || []).map((code: string) => ({ code }));
      } catch (error) {
        console.error('Error in getAvailableStocks:', error);
        return [];
      }
    }
  }
};
