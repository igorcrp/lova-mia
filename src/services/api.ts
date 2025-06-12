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
      
      // Use a função check_user_by_email em vez de get_current_user
      const { data, error } = await supabase.rpc('check_user_by_email', {
        p_email: userId // Usando userId como email para compatibilidade
      });

      if (error) {
        console.error("Get user data error:", error);
        throw error;
      }

      console.log("User data retrieved:", data);
      
      // Converter o resultado para o tipo User
      if (Array.isArray(data) && data.length > 0) {
        const userData = data[0];
        return {
          id: userData.id,
          email: userData.email,
          full_name: userData.name,
          level_id: userData.level_id,
          status: userData.status_users as any,
          email_verified: userData.email_verified, // Assuming this property exists on userData
          account_type: 'free', // Valor padrão
          created_at: new Date().toISOString(),
          last_login: null
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
      // Corrected to handle potential object return from RPC
      const stocks: StockInfo[] = data.map(item => {
        // Check if item is an object and has 'asset_code' property
        if (typeof item === 'object' && item !== null && 'asset_code' in item) {
          return { code: (item as { asset_code: string }).asset_code };
        }
        // If item is directly a string (e.g., from a simple select query)
        return { code: String(item) };
      });
      
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
        .select('asset_code')
        .order('asset_code', { ascending: true })
        .limit(1000); // Limit to prevent excessive data transfer

      if (error) throw error;

      if (!data || !Array.isArray(data)) return [];

      const stocks: StockInfo[] = data.map(item => ({ code: (item as any).asset_code }));
      return stocks;
    } catch (error) {
      console.error('Failed to fetch available stocks directly:', error);
      return [];
    }
  },

  /**
   * Run a stock analysis based on provided parameters
   */
  async runStockAnalysis(params: StockAnalysisParams): Promise<AnalysisResult | null> {
    try {
      console.log("Running stock analysis with params:", params);

      const { startDate, endDate } = getDateRangeForPeriod(params.period, params.startDate, params.endDate);

      const { data, error } = await supabase.rpc("run_stock_analysis", {
        p_country: params.country,
        p_stock_market: params.stockMarket,
        p_asset_class: params.assetClass,
        p_operation: params.operation,
        p_reference_price: params.referencePrice,
        p_entry_percentage: params.entryPercentage,
        p_stop_percentage: params.stopPercentage,
        p_initial_capital: params.initialCapital,
        p_start_date: startDate,
        p_end_date: endDate,
        p_asset_code: params.assetCode || null, // Pass null if not provided
        p_comparison_stocks: params.comparisonStocks || null, // Pass null if not provided
      });

      if (error) {
        console.error("Error running stock analysis:", error);
        throw error;
      }

      console.log("Stock analysis result:", data);
      return data as AnalysisResult;
    } catch (error) {
      console.error("Failed to run stock analysis:", error);
      return null;
    }
  },

  /**
   * Get detailed analysis result for a specific asset code
   */
  async getDetailedAnalysisResult(
    params: StockAnalysisParams,
    assetCode: string
  ): Promise<DetailedResult | null> {
    try {
      console.log(`Getting detailed analysis for ${assetCode} with params:`, params);

      const { startDate, endDate } = getDateRangeForPeriod(params.period, params.startDate, params.endDate);

      const { data, error } = await supabase.rpc("get_detailed_analysis", {
        p_country: params.country,
        p_stock_market: params.stockMarket,
        p_asset_class: params.assetClass,
        p_operation: params.operation,
        p_reference_price: params.referencePrice,
        p_entry_percentage: params.entryPercentage,
        p_stop_percentage: params.stopPercentage,
        p_initial_capital: params.initialCapital,
        p_start_date: startDate,
        p_end_date: endDate,
        p_asset_code: assetCode,
      });

      if (error) {
        console.error("Error getting detailed analysis:", error);
        throw error;
      }

      console.log("Detailed analysis result:", data);
      return data as DetailedResult;
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

      return (data || []) as Asset[];
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

      return data as Asset;
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

      return data as Asset;
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
