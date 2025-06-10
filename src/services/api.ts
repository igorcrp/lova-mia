import { SupabaseClient } from '@supabase/supabase-js';
import { Asset, MarketDataSource, StockAnalysisParams, DetailedResult, TradeHistoryItem, User } from '@/types';

// Initialize Supabase client
let supabase: SupabaseClient<Database> | null = null;

export const setSupabaseClient = (client: SupabaseClient<Database>) => {
  supabase = client;
};

export const api = {
  auth: {
    getCurrentSession: async () => {
      if (!supabase) throw new Error('Supabase client not initialized');
      return await supabase.auth.getSession();
    },

    signUp: async (email: string, password: string) => {
      if (!supabase) throw new Error('Supabase client not initialized');
      return await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
    },

    signIn: async (email: string, password: string) => {
      if (!supabase) throw new Error('Supabase client not initialized');
      return await supabase.auth.signInWithPassword({
        email: email,
        password: password,
      });
    },

    signOut: async () => {
      if (!supabase) throw new Error('Supabase client not initialized');
      return await supabase.auth.signOut();
    },

    resetPassword: async (email: string) => {
       if (!supabase) throw new Error('Supabase client not initialized');
       return await supabase.auth.resetPasswordForEmail(email, {
         redirectTo: `${window.location.origin}/auth/update-password`,
       });
    },

    updatePassword: async (password: string) => {
      if (!supabase) throw new Error('Supabase client not initialized');
      return await supabase.auth.updateUser({ password: password });
    },

    getUser: async () => {
      if (!supabase) throw new Error('Supabase client not initialized');
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },

    login: async (email: string, password: string) => {
      if (!supabase) throw new Error('Supabase client not initialized');
      return await supabase.auth.signInWithPassword({ email, password });
    },

    register: async (email: string, password: string) => {
      if (!supabase) throw new Error('Supabase client not initialized');
      return await supabase.auth.signUp({ email, password });
    },

    logout: async () => {
      if (!supabase) throw new Error('Supabase client not initialized');
      return await supabase.auth.signOut();
    },

    googleLogin: async () => {
      if (!supabase) throw new Error('Supabase client not initialized');
      return await supabase.auth.signInWithOAuth({ provider: 'google' });
    },

    resendConfirmationEmail: async (email: string) => {
      if (!supabase) throw new Error('Supabase client not initialized');
      return await supabase.auth.resend({
        type: 'signup',
        email: email,
      });
    },
  },

  marketData: {
    getDataSources: async (): Promise<MarketDataSource[]> => {
      if (!supabase) throw new Error('Supabase client not initialized');
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('*');

      if (error) {
        console.error('Error fetching market data sources:', error);
        throw new Error('Failed to fetch market data sources');
      }

      return data || [];
    },

    getDataTableName: async (country: string, stockMarket: string, assetClass: string): Promise<string | null> => {
      if (!supabase) throw new Error('Supabase client not initialized');
      
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('stock_table')
        .eq('country', country)
        .eq('stock_market', stockMarket)
        .eq('asset_class', assetClass)
        .single();
      
      if (error) {
        console.error('Error fetching data table name:', error);
        return null;
      }
      
      return data ? data.stock_table : null;
    },

    getCountries: async (): Promise<string[]> => {
      if (!supabase) throw new Error('Supabase client not initialized');
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('country')
        .order('country');

      if (error) {
        console.error('Error fetching countries:', error);
        throw new Error('Failed to fetch countries');
      }

      // Get unique countries
      const uniqueCountries = [...new Set(data?.map(item => item.country) || [])];
      return uniqueCountries;
    },

    getStockMarkets: async (country: string): Promise<string[]> => {
      if (!supabase) throw new Error('Supabase client not initialized');
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('stock_market')
        .eq('country', country)
        .order('stock_market');

      if (error) {
        console.error('Error fetching stock markets:', error);
        throw new Error('Failed to fetch stock markets');
      }

      // Get unique stock markets
      const uniqueMarkets = [...new Set(data?.map(item => item.stock_market) || [])];
      return uniqueMarkets;
    },

    getAssetClasses: async (country: string, stockMarket: string): Promise<string[]> => {
      if (!supabase) throw new Error('Supabase client not initialized');
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('asset_class')
        .eq('country', country)
        .eq('stock_market', stockMarket)
        .order('asset_class');

      if (error) {
        console.error('Error fetching asset classes:', error);
        throw new Error('Failed to fetch asset classes');
      }

      // Get unique asset classes
      const uniqueAssetClasses = [...new Set(data?.map(item => item.asset_class) || [])];
      return uniqueAssetClasses;
    },

    checkTableExists: async (tableName: string): Promise<boolean> => {
      if (!supabase) throw new Error('Supabase client not initialized');
      try {
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
    },
  },

  assets: {
    getAssets: async (): Promise<Asset[]> => {
      if (!supabase) throw new Error('Supabase client not initialized');
      const { data, error } = await supabase
        .from('assets')
        .select('*');

      if (error) {
        console.error('Error fetching assets:', error);
        throw new Error('Failed to fetch assets');
      }

      return data || [];
    },

    getAssetById: async (id: string): Promise<Asset | null> => {
      if (!supabase) throw new Error('Supabase client not initialized');
      const { data, error } = await supabase
        .from('assets')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching asset by ID:', error);
        return null;
      }

      return data || null;
    },

    createAsset: async (asset: Omit<Asset, 'id'>): Promise<Asset | null> => {
      if (!supabase) throw new Error('Supabase client not initialized');
      const { data, error } = await supabase
        .from('assets')
        .insert([asset])
        .select('*')
        .single();

      if (error) {
        console.error('Error creating asset:', error);
        throw new Error('Failed to create asset');
      }

      return data || null;
    },

    updateAsset: async (id: string, updates: Partial<Asset>): Promise<Asset | null> => {
      if (!supabase) throw new Error('Supabase client not initialized');
      const { data, error } = await supabase
        .from('assets')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('Error updating asset:', error);
        throw new Error('Failed to update asset');
      }

      return data || null;
    },

    deleteAsset: async (id: string): Promise<boolean> => {
      if (!supabase) throw new Error('Supabase client not initialized');
      const { error } = await supabase
        .from('assets')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting asset:', error);
        return false;
      }

      return true;
    },
  },

  analysis: {
    runAnalysis: async (params: StockAnalysisParams, onProgress?: (progress: number) => void): Promise<any[]> => {
      try {
        console.info('Starting analysis...');
        
        if (!supabase) {
          throw new Error('Supabase client not initialized');
        }
        
        if (!params.dataTableName) {
          throw new Error("Data table name is required for analysis");
        }
        
        // Simulate progress
        onProgress?.(5);
        
        // Call the Supabase function
        const { data, error } = await supabase.rpc('run_stock_analysis', {
          p_country: params.country,
          p_stock_market: params.stockMarket,
          p_asset_class: params.assetClass,
          p_operation: params.operation,
          p_reference_price: params.referencePrice,
          p_entry_percentage: params.entryPercentage,
          p_stop_percentage: params.stopPercentage,
          p_initial_capital: params.initialCapital,
          p_table_name: params.dataTableName,
          p_period: params.period,
          p_comparison_stocks: params.comparisonStocks || []
        });
        
        if (error) {
          console.error('Error during analysis:', error);
          throw new Error('Analysis failed');
        }
        
        // Simulate progress
        onProgress?.(90);
        
        console.info('Analysis completed successfully.');
        return data || [];
      } catch (error) {
        console.error('Error in runAnalysis:', error);
        throw error;
      }
    },

    getDetailedAnalysis: async (assetCode: string, params: StockAnalysisParams): Promise<DetailedResult | null> => {
      try {
        console.info(`Getting detailed analysis for asset: ${assetCode}`);
        
        if (!params.dataTableName) {
          throw new Error("Data table name is required for detailed analysis");
        }

        // Get stock data with proper null check
        const { data: stockDataArray, error: stockError } = await supabase.rpc('get_stock_data', {
          p_table_name: params.dataTableName,
          p_stock_code_param: assetCode,
          p_limit_rows: 1000
        });

        if (stockError) {
          console.error('Error fetching stock data:', stockError);
          throw new Error('Failed to fetch stock data');
        }

        if (!stockDataArray || stockDataArray.length === 0) {
          console.warn(`No stock data found for ${assetCode}`);
          return null;
        }

        console.info(`Found ${stockDataArray.length} records for ${assetCode}`);

        // Convert to trade history format with proper null safety
        const tradeHistory: TradeHistoryItem[] = stockDataArray.map((item: any) => {
          // Ensure item is not null before accessing properties
          if (!item) {
            return {
              date: '',
              entryPrice: 0,
              exitPrice: 0,
              profitLoss: 0,
              profitPercentage: 0,
              trade: '-',
              stop: '-',
              volume: 0,
              high: 0,
              low: 0,
              suggestedEntryPrice: 0,
              actualPrice: 0,
              lotSize: 0,
              stopPrice: 0,
              capital: 0,
              currentCapital: 0,
              stopTrigger: '-'
            };
          }

          return {
            date: item.date || '',
            entryPrice: Number(item.open) || 0,
            exitPrice: Number(item.close) || 0,
            profitLoss: 0,
            profitPercentage: 0,
            trade: '-',
            stop: '-',
            volume: Number(item.volume) || 0,
            high: Number(item.high) || 0,
            low: Number(item.low) || 0,
            suggestedEntryPrice: 0,
            actualPrice: 0,
            lotSize: 0,
            stopPrice: 0,
            capital: 0,
            currentCapital: 0,
            stopTrigger: '-'
          };
        });

        // Simulate analysis results for now
        const analysisResult: DetailedResult = {
          assetCode,
          assetName: assetCode,
          tradingDays: tradeHistory.length,
          trades: 0,
          tradePercentage: 0,
          profits: 0,
          profitPercentage: 0,
          losses: 0,
          lossPercentage: 0,
          stops: 0,
          stopPercentage: 0,
          finalCapital: params.initialCapital,
          profit: 0,
          averageGain: 0,
          averageLoss: 0,
          maxDrawdown: 0,
          sharpeRatio: 0,
          sortinoRatio: 0,
          recoveryFactor: 0,
          successRate: 0,
          tradeHistory,
          capitalEvolution: [{ date: tradeHistory[0]?.date || '', capital: params.initialCapital }]
        };

        return analysisResult;
      } catch (error) {
        console.error('Error in getDetailedAnalysis:', error);
        throw error;
      }
    },

    getAvailableStocks: async (tableName: string): Promise<any[]> => {
      if (!supabase) throw new Error('Supabase client not initialized');
      try {
        const { data, error } = await supabase.rpc('get_unique_stock_codes', {
          p_table_name: tableName
        });
        
        if (error) {
          console.error('Error fetching available stocks:', error);
          throw new Error('Failed to fetch available stocks');
        }
        
        // Convert to expected format
        return (data || []).map((code: string) => ({
          code,
          name: code,
          fullName: code
        }));
      } catch (error) {
        console.error('Error in getAvailableStocks:', error);
        throw error;
      }
    },

    getUsers: async (): Promise<User[]> => {
      if (!supabase) throw new Error('Supabase client not initialized');
      try {
        const { data: users, error } = await supabase
          .from('users')
          .select('*');
    
        if (error) {
          console.error('Error fetching users:', error);
          throw new Error('Failed to fetch users');
        }
    
        return users || [];
      } catch (error) {
        console.error('Error in getUsers:', error);
        throw error;
      }
    },
    
    updateUserAccountType: async (userId: string, accountType: 'free' | 'premium'): Promise<void> => {
      if (!supabase) throw new Error('Supabase client not initialized');
      try {
        const { error } = await supabase
          .from('users')
          .update({ account_type: accountType })
          .eq('id', userId);
    
        if (error) {
          console.error('Error updating user account type:', error);
          throw new Error('Failed to update user account type');
        }
      } catch (error) {
        console.error('Error in updateUserAccountType:', error);
        throw error;
      }
    },
  }
};

// Helper function for stop loss calculation with proper type handling
function calculateStopLoss(currentPrice: string | number, params: StockAnalysisParams): number {
  const price = typeof currentPrice === 'string' ? parseFloat(currentPrice) : currentPrice;
  if (isNaN(price)) return 0;
  
  const stopPercentage = params.stopPercentage / 100;
  return params.operation === 'buy' 
    ? price * (1 - stopPercentage)
    : price * (1 + stopPercentage);
}

// Helper function for entry price calculation with proper type handling
function calculateEntryPrice(currentPrice: string | number, params: StockAnalysisParams): number {
  const price = typeof currentPrice === 'string' ? parseFloat(currentPrice) : currentPrice;
  if (isNaN(price)) return 0;
  
  const entryPercentage = params.entryPercentage / 100;
  return params.operation === 'buy'
    ? price * (1 + entryPercentage)
    : price * (1 - entryPercentage);
}
