// This is a service layer to interact with Supabase and process data

import { supabase, fromDynamic, MarketDataSource, StockRecord } from '@/integrations/supabase/client';
import { AnalysisResult, Asset, DetailedResult, StockAnalysisParams, StockInfo, User, TradeHistoryItem } from '@/types'; // Added TradeHistoryItem
import { formatDateToYYYYMMDD, getDateRangeForPeriod } from '@/utils/dateUtils';

/**
 * Authentication API service
 */
export const auth = {
  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<any> {
    try {
      console.log(`Attempting to login with email: ${email}`);
      
      // REMOVIDO: Bloco que chamava RPC inexistente 'check_user_by_email'
      // A verificação de status agora é feita no AuthContext após o login do Supabase Auth

      // Autentica com Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("Login error:", error);
        // Verifica se o erro é por email não confirmado
        if (error.message.includes("Email not confirmed")) {
          throw new Error("PENDING_CONFIRMATION"); // Lança erro específico para tratamento no AuthContext
        }
        throw error; // Lança outros erros de autenticação
      }

      // REMOVIDO: Bloco que verificava status 'pending' após login bem-sucedido
      // Essa lógica agora está no AuthContext

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

  /**
   * Register a new user
   */
  async register(email: string, password: string, fullName: string): Promise<any> {
    try {
      console.log(`Attempting to register user with email: ${email}`);
      
      // Register user with Supabase Auth
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

      console.log("Auth registration successful:", authData);

      // Insert user data into public.users table with level_id=1 and status_user='pending'
      if (authData.user) {
        const { error: userError } = await supabase
          .from('users')
          .insert([
            {
              id: authData.user.id,
              email: email,
              name: fullName,
              level_id: 1,
              status_users: 'pending',
              created_at: new Date().toISOString(),
            }
          ]);

        if (userError) {
          console.error("User data insertion error:", userError);
          // Don't throw here, as the auth user is already created
          // Just log the error and continue
          console.warn("User created in auth but not in public.users table");
        } else {
          console.log("User registration successful in public.users table");
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

  /**
   * Send password reset email
   */
  async resetPassword(email: string): Promise<void> {
    try {
      console.log(`Sending password reset email to: ${email}`);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login?reset=true`,
      });

      if (error) {
        console.error("Password reset error:", error);
        throw error;
      }

      console.log("Password reset email sent successfully");
    } catch (error) {
      console.error("Password reset failed:", error);
      throw error;
    }
  },

  /**
   * Update user password
   */
  async updatePassword(newPassword: string): Promise<void> {
    try {
      console.log("Updating user password");
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        console.error("Password update error:", error);
        throw error;
      }

      console.log("Password updated successfully");
    } catch (error) {
      console.error("Password update failed:", error);
      throw error;
    }
  },

  /**
   * Resend confirmation email
   */
  async resendConfirmationEmail(email: string): Promise<void> {
    try {
      console.log(`Resending confirmation email to: ${email}`);
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: `${window.location.origin}/login?confirmation=true`,
        }
      });

      if (error) {
        console.error("Resend confirmation email error:", error);
        throw error;
      }

      console.log("Confirmation email resent successfully");
    } catch (error) {
      console.error("Resend confirmation email failed:", error);
      throw error;
    }
  },

  /**
   * Login with Google
   */
  async googleLogin(): Promise<any> {
    try {
      console.log("Attempting to login with Google");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/login?provider=google`
        }
      });

      if (error) {
        console.error("Google login error:", error);
        throw error;
      }

      console.log("Google login initiated:", data);
      return data;
    } catch (error) {
      console.error("Google login failed:", error);
      throw error;
    }
  },

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    try {
      console.log("Attempting to logout");
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("Logout error:", error);
        throw error;
      }

      console.log("Logout successful");
    } catch (error) {
      console.error("Logout failed:", error);
      throw error;
    }
  },

  /**
   * Get current user data from public.users table
   */
  async getUserData(userId: string): Promise<User | null> {
    try {
      console.log(`Getting user data for ID: ${userId}`);
      
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error("Get user data error:", error);
        return null;
      }

      console.log("User data retrieved:", data);
      
      if (data) {
        return {
          id: data.id,
          email: data.email,
          full_name: data.name,
          level_id: data.level_id,
          status: data.status_users,
          email_verified: data.email_verified,
          account_type: data.plan_type === 'premium' ? 'premium' : 'free',
          created_at: data.created_at,
          last_login: null,
          plan_type: data.plan_type
        } as User;
      }
      
      return null;
    } catch (error) {
      console.error("Get user data failed:", error);
      return null;
    }
  },

  /**
   * Update user status to active after email confirmation
   */
  async confirmUserEmail(userId: string): Promise<void> {
    try {
      console.log(`Confirming email for user ID: ${userId}`);
      const { error } = await supabase
        .from('users')
        .update({ status_users: 'active' })
        .eq('id', userId);

      if (error) {
        console.error("Email confirmation error:", error);
        throw error;
      }

      console.log("Email confirmed successfully");
    } catch (error) {
      console.error("Email confirmation failed:", error);
      throw error;
    }
  }
};

/**
 * Market Data API service for fetching market data
 */
const marketData = {
  /**
   * Get available countries with market data
   */
  async getCountries(): Promise<string[]> {
    try {
      // Use fromDynamic to query the market_data_sources table
      const { data, error } = await fromDynamic('market_data_sources')
        .select('country')
        .order('country');

      if (error) throw error;

      // Check if data exists before accessing properties
      if (!data || !Array.isArray(data)) return [];

      // Extract unique country names using a safer approach with type assertion
      const countries = [...new Set(data.map(item => (item as any).country).filter(Boolean))];
      return countries;
    } catch (error) {
      console.error('Failed to fetch countries:', error);
      return [];
    }
  },

  /**
   * Get available stock markets for a given country
   */
  async getStockMarkets(country: string): Promise<string[]> {
    try {
      // Use fromDynamic to query the market_data_sources table
      const { data, error } = await fromDynamic('market_data_sources')
        .select('stock_market')
        .eq('country', country)
        .order('stock_market');

      if (error) throw error;

      // Check if data exists before accessing properties
      if (!data || !Array.isArray(data)) return [];

      // Extract unique stock markets using a safer approach with type assertion
      const markets = [...new Set(data.map(item => (item as any).stock_market).filter(Boolean))];
      return markets;
    } catch (error) {
      console.error('Failed to fetch stock markets:', error);
      return [];
    }
  },

  /**
   * Get available asset classes for a given country and stock market
   */
  async getAssetClasses(country: string, stockMarket: string): Promise<string[]> {
    try {
      // Use fromDynamic to query the market_data_sources table
      const { data, error } = await fromDynamic('market_data_sources')
        .select('asset_class')
        .eq('country', country)
        .eq('stock_market', stockMarket)
        .order('asset_class');

      if (error) throw error;

      // Check if data exists before accessing properties
      if (!data || !Array.isArray(data)) return [];

      // Extract unique asset classes using a safer approach with type assertion
      const classes = [...new Set(data.map(item => (item as any).asset_class).filter(Boolean))];
      return classes;
    } catch (error) {
      console.error('Failed to fetch asset classes:', error);
      return [];
    }
  },

  /**
   * Get the data table name for a specific market data source
   */
  async getDataTableName(
    country: string,
    stockMarket: string,
    assetClass: string
  ): Promise<string | null> {
    try {
      // Use fromDynamic to query the market_data_sources table
      const { data, error } = await fromDynamic('market_data_sources')
        .select('stock_table')
        .eq('country', country)
        .eq('stock_market', stockMarket)
        .eq('asset_class', assetClass)
        .maybeSingle();

      if (error) {
        console.error('Error fetching data table name:', error);
        return null;
      }

      // Return the table name using safer access with type assertion
      return data ? (data as any).stock_table : null;
    } catch (error) {
      console.error('Failed to fetch data table name:', error);
      return null;
    }
  },
  
  /**
   * Check if the given table exists in the database
   */
  async checkTableExists(tableName: string): Promise<boolean> {
    try {
      if (!tableName) return false;
      
      // Try to query the table with limit 1 to check if it exists
      const { error } = await fromDynamic(tableName)
        .select('*')
        .limit(1);
      
      // If there's no error, the table exists
      return !error;
    } catch (error) {
      console.error('Error checking table existence:', error);
      return false;
    }
  },
  
  /**
   * Get market status by ID
   */
  async getMarketStatus(marketId: string): Promise<any> {
    try {
      const { data, error } = await fromDynamic('market_status')
        .select('*')
        .eq('id', marketId)
        .single();
        
      if (error) {
        console.error('Error fetching market status:', error);
        return null;
      }
      
      return data;
    } catch (error) {
      console.error('Failed to fetch market status:', error);
      return null;
    }
  },
  
  /**
   * Get all market data sources
   */
  async getAllMarketDataSources(): Promise<MarketDataSource[]> {
    try {
      const { data, error } = await fromDynamic('market_data_sources')
        .select('*')
        .order('country');
        
      if (error) {
        console.error('Error fetching market data sources:', error);
        return [];
      }

      return (data || []) as any as MarketDataSource[];
    } catch (error) {
      console.error('Failed to fetch market data sources:', error);
      return [];
    }
  },
  
  /**
   * Get market data sources by country
   */
  async getMarketDataSourcesByCountry(country: string): Promise<MarketDataSource[]> {
    try {
      const { data, error } = await fromDynamic('market_data_sources')
        .select('*')
        .eq('country', country)
        .order('stock_market');
        
      if (error) {
        console.error(`Error fetching market data sources for country ${country}:`, error);
        return [];
      }
      
      return (data || []) as any as MarketDataSource[];
    } catch (error) {
      console.error(`Failed to fetch market data sources for country ${country}:`, error);
      return [];
    }
  },
  
  /**
   * Get market data sources by country and stock market
   */
  async getMarketDataSourcesByCountryAndStockMarket(
    country: string, 
    stockMarket: string
  ): Promise<MarketDataSource[]> {
    try {
      const { data, error } = await fromDynamic('market_data_sources')
        .select('*')
        .eq('country', country)
        .eq('stock_market', stockMarket)
        .order('asset_class');
        
      if (error) {
        console.error(`Error fetching market data sources for country ${country} and stock market ${stockMarket}:`, error);
        return [];
      }
      
      return (data || []) as any as MarketDataSource[];
    } catch (error) {
      console.error(`Failed to fetch market data sources for country ${country} and stock market ${stockMarket}:`, error);
      return [];
    }
  }
};

/**
 * Stock Analysis API service
 */
const analysis = {
  /**
   * Get a list of available stocks for a specific data table
   */
  async getAvailableStocks(tableName: string): Promise<StockInfo[]> {
    try {
      if (!tableName) {
        throw new Error('Table name is required');
      }
      
      console.log(`Getting available stocks from table: ${tableName}`);
      
      // Use database function to get unique stock codes - this ensures we get ALL stocks
      const { data, error } = await supabase.rpc('get_unique_stock_codes', {
        p_table_name: tableName
      });

      if (error) {
        console.error('Error getting unique stock codes:', error);
        // Fallback to direct table query if the function fails
        return await this.getAvailableStocksDirect(tableName);
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        console.warn('No stock codes returned from function, trying direct query');
        return await this.getAvailableStocksDirect(tableName);
      }
      
      console.log(`Found ${data.length} unique stock codes`);
      
      // Transform the data into StockInfo objects
		const stocks: StockInfo[] = data.map(item => {
		  // Add null check for item
		  if (!item) {
			return { code: '', name: '' };
		  }
        
        // Check if item is an object and has 'asset_code' property
		  if (typeof item === 'object' && item !== null && 'asset_code' in item) {
			const typedItem = item as { asset_code: string };
			return { 
			  code: typedItem.asset_code,
			  name: typedItem.asset_code // Use code as name fallback
			};
		  }
        // If item is directly a string (e.g., from a simple select query)
		  return { 
			code: String(item),
			name: String(item) // Use code as name fallback
		  };
		}).filter(stock => stock.code); // Filter out empty codes
      
      return stocks;
    } catch (error) {
      console.error('Failed to fetch available stocks:', error);
      return [];
    }
  },

  /**
   * Fallback method to get available stocks by directly querying the table
   */
  async getAvailableStocksDirect(tableName: string): Promise<StockInfo[]> {
    try {
      console.log(`Getting available stocks directly from table: ${tableName}`);
      const { data, error } = await fromDynamic(tableName)
        .select('stock_code')
        .order('stock_code', { ascending: true })
        .limit(1000); // Limit to prevent excessive data transfer

      if (error) throw error;

      if (!data || !Array.isArray(data)) return [];

      const stocks: StockInfo[] = data.map(item => ({ 
        code: (item as any).stock_code,
        name: (item as any).stock_code // Use code as name fallback
      }));
      return stocks;
    } catch (error) {
      console.error('Failed to fetch available stocks directly:', error);
      return [];
    }
  },

  /**
   * Run a stock analysis based on provided parameters
   */
  async runAnalysis(params: StockAnalysisParams, progressCallback?: (progress: number) => void): Promise<AnalysisResult[]> {
    try {
      console.log("Running stock analysis with params:", params);

      // Simulate progress updates
      if (progressCallback) {
        progressCallback(25);
      }

      // Fix: Use only the period parameter for getDateRangeForPeriod
      const { startDate, endDate } = getDateRangeForPeriod(params.period);

      if (progressCallback) {
        progressCallback(50);
      }

      // For now, return mock data - this should be replaced with actual Supabase RPC call
      const mockResults: AnalysisResult[] = [
        {
          assetCode: "AAPL",
          assetName: "Apple Inc.",
          tradingDays: 22,
          trades: 15,
          tradePercentage: 68.18,
          profits: 10,
          profitPercentage: 66.67,
          losses: 3,
          lossPercentage: 20.0,
          stops: 2,
          stopPercentage: 13.33,
          finalCapital: 105000,
          profit: 5000,
          averageGain: 500,
          averageLoss: -200,
          maxDrawdown: -1500,
          sharpeRatio: 1.2,
          sortinoRatio: 1.5,
          recoveryFactor: 3.33,
          successRate: 66.67
        }
      ];

      if (progressCallback) {
        progressCallback(100);
      }

      return mockResults;
    } catch (error) {
      console.error("Failed to run stock analysis:", error);
      throw error;
    }
  },

  /**
   * Get detailed analysis result for a specific asset code
   */
  async getDetailedAnalysis(
    assetCode: string,
    params: StockAnalysisParams
  ): Promise<DetailedResult | null> {
    try {
      console.log(`Getting detailed analysis for ${assetCode} with params:`, params);

      // Fix: Use only the period parameter for getDateRangeForPeriod
      const { startDate, endDate } = getDateRangeForPeriod(params.period);

      // For now, return mock data - this should be replaced with actual Supabase RPC call
      const mockResult: DetailedResult = {
        assetCode: assetCode,
        assetName: "Mock Asset",
        tradingDays: 22,
        trades: 15,
        tradePercentage: 68.18,
        profits: 10,
        profitPercentage: 66.67,
        losses: 3,
        lossPercentage: 20.0,
        stops: 2,
        stopPercentage: 13.33,
        finalCapital: 105000,
        profit: 5000,
        averageGain: 500,
        averageLoss: -200,
        maxDrawdown: -1500,
        sharpeRatio: 1.2,
        sortinoRatio: 1.5,
        recoveryFactor: 3.33,
        successRate: 66.67,
        tradeHistory: [
          {
            date: "2024-01-01",
            entryPrice: 100,
            exitPrice: 105,
            profitLoss: 500,
            profitPercentage: 5,
            trade: "Buy",
            stopPrice: 95,
            currentCapital: 100500,
            volume: 1000,
            high: 106,
            low: 99,
            suggestedEntryPrice: 100.5,
            actualPrice: 100,
            lotSize: 100
          }
        ],
        capitalEvolution: [
          { date: "2024-01-01", capital: 100000 },
          { date: "2024-01-02", capital: 100500 }
        ]
      };

      return mockResult;
    } catch (error) {
      console.error("Failed to get detailed analysis:", error);
      return null;
    }
  },
};

/**
 * Admin API service
 */
const admin = {
  /**
   * Get all assets
   */
  async getAssets(): Promise<Asset[]> {
    try {
      const { data, error } = await fromDynamic('assets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching assets:', error);
        return [];
      }

      // Fix: Add proper type assertion and null check
      return (data || []) as unknown as Asset[];
    } catch (error) {
      console.error('Failed to fetch assets:', error);
      return [];
    }
  },

  /**
   * Add a new asset
   */
  async addAsset(asset: Omit<Asset, 'id' | 'created_at'>): Promise<Asset | null> {
    try {
      const { data, error } = await fromDynamic('assets')
        .insert({
          ...asset,
          created_at: new Date().toISOString(), // Ensure created_at is set
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding asset:', error);
        throw error;
      }

      // Fix: Add proper type assertion
      return data as unknown as Asset;
    } catch (error) {
      console.error('Failed to add asset:', error);
      return null;
    }
  },

  /**
   * Update an existing asset
   */
  async updateAsset(asset: Asset): Promise<Asset | null> {
    try {
      const { data, error } = await fromDynamic('assets')
        .update(asset)
        .eq('id', asset.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating asset:', error);
        throw error;
      }

      // Fix: Add proper type assertion
      return data as unknown as Asset;
    } catch (error) {
      console.error('Failed to update asset:', error);
      return null;
    }
  },

  /**
   * Delete an asset
   */
  async deleteAsset(id: string): Promise<boolean> {
    try {
      const { error } = await fromDynamic('assets')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting asset:', error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Failed to delete asset:', error);
      return false;
    }
  },
};

export const api = {
  auth,
  marketData,
  analysis,
  admin,
};
