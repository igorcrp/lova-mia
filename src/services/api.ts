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
      
      // Use direct query instead of RPC function that doesn't exist
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error("Get user data error:", error);
        throw error;
      }

      console.log("User data retrieved:", data);
      
      // Transform the data to match User interface
      if (data) {
        return {
          id: data.id,
          email: data.email,
          full_name: data.name || '',
          avatar_url: '',
          level_id: data.level_id || 1,
          status: data.status_users === 'active' ? 'active' : data.status_users === 'inactive' ? 'inactive' : 'pending',
          email_verified: data.email_verified || false,
          account_type: 'free',
          created_at: data.created_at,
          last_login: data.updated_at
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
 * Users API service for admin functionality
 */
const users = {
  /**
   * Get all users (alias for compatibility)
   */
  async getAll(): Promise<User[]> {
    return this.getUsers();
  },

  /**
   * Get all users
   */
  async getUsers(): Promise<User[]> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Get users error:", error);
        throw error;
      }

      // Transform the data to match User interface
      return (data || []).map(user => ({
        id: user.id,
        email: user.email,
        full_name: user.name || '',
        avatar_url: '',
        level_id: user.level_id || 1,
        status: user.status_users === 'active' ? 'active' : user.status_users === 'inactive' ? 'inactive' : 'pending',
        email_verified: user.email_verified || false,
        account_type: 'free',
        created_at: user.created_at,
        last_login: user.updated_at
      })) as User[];
    } catch (error) {
      console.error("Failed to get users:", error);
      return [];
    }
  },

  /**
   * Get user statistics for dashboard
   */
  async getUserStats(): Promise<any> {
    try {
      const users = await this.getUsers();
      
      const stats = {
        total: users.length,
        active: users.filter(u => u.status === 'active').length,
        pending: users.filter(u => u.status === 'pending').length,
        inactive: users.filter(u => u.status === 'inactive').length,
        premium: users.filter(u => u.account_type === 'premium').length,
        new: users.filter(u => {
          const createdDate = new Date(u.created_at);
          const lastWeek = new Date();
          lastWeek.setDate(lastWeek.getDate() - 7);
          return createdDate > lastWeek;
        }).length
      };

      return stats;
    } catch (error) {
      console.error("Failed to get user stats:", error);
      return {
        total: 0,
        active: 0,
        pending: 0,
        inactive: 0,
        premium: 0,
        new: 0
      };
    }
  },

  /**
   * Create new user (alias for compatibility)
   */
  async create(userData: any): Promise<User> {
    try {
      const { data, error } = await supabase
        .from('users')
        .insert([{
          email: userData.email,
          name: userData.full_name,
          level_id: userData.level_id,
          status_users: userData.status,
          email_verified: userData.email_verified
        }])
        .select()
        .single();

      if (error) {
        console.error("Create user error:", error);
        throw error;
      }

      return {
        id: data.id,
        email: data.email,
        full_name: data.name || '',
        avatar_url: '',
        level_id: data.level_id || 1,
        status: data.status_users === 'active' ? 'active' : data.status_users === 'inactive' ? 'inactive' : 'pending',
        email_verified: data.email_verified || false,
        account_type: userData.account_type || 'free',
        created_at: data.created_at,
        last_login: data.updated_at
      } as User;
    } catch (error) {
      console.error("Failed to create user:", error);
      throw error;
    }
  },

  /**
   * Update user status
   */
  async updateUserStatus(userId: string, status: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('users')
        .update({ status_users: status })
        .eq('id', userId);

      if (error) {
        console.error("Update user status error:", error);
        throw error;
      }
    } catch (error) {
      console.error("Failed to update user status:", error);
      throw error;
    }
  }
};

/**
 * Assets API service for admin functionality
 */
const assets = {
  /**
   * Get all assets (alias for compatibility)
   */
  async getAll(): Promise<Asset[]> {
    return this.getAssets();
  },

  /**
   * Get all assets
   */
  async getAssets(): Promise<Asset[]> {
    try {
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('*')
        .order('country');

      if (error) {
        console.error("Get assets error:", error);
        throw error;
      }

      // Transform market data sources to assets
      return (data || []).map(source => ({
        id: source.id.toString(),
        code: source.stock_table,
        name: `${source.country} - ${source.stock_market}`,
        country: source.country,
        stock_market: source.stock_market,
        asset_class: source.asset_class,
        status: 'active'
      })) as Asset[];
    } catch (error) {
      console.error("Failed to get assets:", error);
      return [];
    }
  },

  /**
   * Get total asset count for dashboard
   */
  async getTotalCount(): Promise<number> {
    try {
      const assets = await this.getAssets();
      return assets.length;
    } catch (error) {
      console.error("Failed to get asset count:", error);
      return 0;
    }
  },

  /**
   * Create new asset (alias for compatibility)
   */
  async create(asset: Partial<Asset>): Promise<Asset> {
    return this.createAsset(asset);
  },

  /**
   * Create new asset
   */
  async createAsset(asset: Partial<Asset>): Promise<Asset> {
    try {
      const { data, error } = await supabase
        .from('market_data_sources')
        .insert([{
          country: asset.country,
          stock_market: asset.stock_market,
          asset_class: asset.asset_class,
          stock_table: asset.code
        }])
        .select()
        .single();

      if (error) {
        console.error("Create asset error:", error);
        throw error;
      }

      return {
        id: data.id.toString(),
        code: data.stock_table,
        name: `${data.country} - ${data.stock_market}`,
        country: data.country,
        stock_market: data.stock_market,
        asset_class: data.asset_class,
        status: 'active'
      } as Asset;
    } catch (error) {
      console.error("Failed to create asset:", error);
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
        // Assuming the RPC returns objects like { stock_code: 'XYZ' } or just strings
        const stockCode = (typeof item === 'object' && item !== null && 'stock_code' in item) 
                          ? String(item.stock_code) 
                          : String(item); // Fallback if it's just a string
        return {
          code: stockCode,
          name: stockCode, // Use code as name if no name is available
        };
      });
      
      return stocks;
    } catch (error) {
      console.error('Failed to get available stocks:', error);
      // Ensure fallback is called even if the initial try block fails
      return await this.getAvailableStocksDirect(tableName);
    }
  },
  
  /**
   * Fallback method to get stocks directly from the table
   */
  async getAvailableStocksDirect(tableName: string): Promise<StockInfo[]> {
    try {
      console.log(`Trying direct query to get stock codes from ${tableName}`);
      
      // Use fromDynamic to handle the dynamic table name
      const { data, error } = await fromDynamic(tableName)
        .select('stock_code')
        .order('stock_code');
      
      if (error) {
        console.error('Error in direct stock code query:', error);
        // Throw the error to be caught by the outer catch block
        throw error;
      }

      if (!data) {
        console.warn(`No stock codes found in table ${tableName}`);
        return [];
      }
      
      // Extract stock codes with proper type safety
      const uniqueCodes = [...new Set(data.map((item: any) => item.stock_code))];
      
      const stocks: StockInfo[] = uniqueCodes
        .filter(code => code)
        .map(code => ({
          code: String(code),
          name: String(code)
        }));
      
      console.log(`Direct query found ${stocks.length} stock codes`);
      return stocks;
    } catch (error) {
      console.error(`Failed in direct stock query for ${tableName}:`, error);
      // Return empty array on failure
      return [];
    }
  },
  
  /**
   * Get stock data from a specific table and stock code
   */
  async getStockData(tableName: string, stockCode: string, period: string | undefined = undefined, limit: number = 300): Promise<any[]> {
    try {
      if (!tableName || !stockCode) {
        throw new Error('Table name and stock code are required');
      }
      
      // Get date range based on period
      if (period) {
        const dateRange = getDateRangeForPeriod(period);
        console.info(`Getting stock data for ${stockCode} from ${tableName} with period ${period}`);
        console.info(`Date range: ${dateRange.startDate} to ${dateRange.endDate}`);
        
        // Use the period-filtered method
        return await this.getStockDataDirectWithPeriod(tableName, stockCode, dateRange.startDate, dateRange.endDate);
      } else {
        console.info(`Getting stock data for ${stockCode} from ${tableName} without period filtering (using limit: ${limit})`);
        // If no period, use the limit-based method
        return await this.getStockDataDirect(tableName, stockCode, limit);
      }
    } catch (error) {
      console.error('Failed to get stock data:', error);
      return [];
    }
  },
  
  /**
   * Fallback method to get stock data directly from the table (limit based)
   */
  async getStockDataDirect(tableName: string, stockCode: string, limit: number = 300): Promise<any[]> {
    try {
      console.log(`Trying direct query to get stock data for ${stockCode} from ${tableName} with limit ${limit}`);
      
      const { data, error } = await fromDynamic(tableName)
        .select('*')
        .eq('stock_code', stockCode)
        .order('date', { ascending: false }) // Get latest data first
        .limit(limit);

      if (error) {
        console.error('Error in direct stock data query (limit):', error);
        throw error;
      }

      if (!data || !Array.isArray(data)) {
        console.warn(`No data found for ${stockCode} in table ${tableName}`);
        return [];
      }
      // Reverse the data to have it in ascending order for processing
      return (data as any[]).reverse(); 
    } catch (error) {
      console.error(`Failed in direct stock data query (limit) for ${stockCode}:`, error);
      return [];
    }
  },
  
  /**
   * Get stock data with period filtering
   */
  async getStockDataDirectWithPeriod(
    tableName: string, 
    stockCode: string, 
    startDate: string, 
    endDate: string
  ): Promise<any[]> {
    try {
      console.info(`Fetching stock data for ${stockCode} from ${tableName} between ${startDate} and ${endDate}`);
      
      const { data, error } = await fromDynamic(tableName)
        .select('*')
        .eq('stock_code', stockCode)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true }); // Ascending order for chronological processing
      
      if (error) {
        console.error('Error in period-filtered stock data query:', error);
        throw error;
      }
      
      if (!data || !Array.isArray(data)) {
        console.warn(`No data found for ${stockCode} in table ${tableName} for the specified period`);
        return [];
      }
      
      console.info(`Found ${data.length} records for ${stockCode} in the specified period`);
      return data as any[];

    } catch (error) {
      console.error(`Failed to fetch period-filtered data for ${stockCode}:`, error);
      return [];
    }
  },

  /**
   * Run stock analysis with given parameters
   */
  async runAnalysis(
    params: StockAnalysisParams,
    progressCallback?: (progress: number) => void
  ): Promise<AnalysisResult[]> {
    try {
      console.info('Running analysis with parameters:', params);
      
      // Set up progress tracking
      let progress = 0;
      const updateProgress = (increment: number) => {
        progress += increment;
        if (progressCallback) {
          progressCallback(Math.min(progress, 100));
        }
      };

      if (!params.dataTableName) {
        const tableName = await marketData.getDataTableName(
          params.country,
          params.stockMarket,
          params.assetClass
        );
        if (!tableName) {
          throw new Error('Could not determine data table name');
        }
        params.dataTableName = tableName;
      }

      // Get all available stocks for the given asset class
      updateProgress(10);
      const stocks = await this.getAvailableStocks(params.dataTableName);
      
      console.info(`Found ${stocks.length} stocks for analysis`);
      
      if (!stocks || stocks.length === 0) {
        // Changed from throw to return empty array to avoid breaking the UI
        console.warn('No stocks found for the selected criteria');
        return []; 
      }
      
      updateProgress(10);
      
      // Process each stock based on the selection criteria
      const results: AnalysisResult[] = [];
      
      // Process each stock sequentially to avoid overloading the database
      const stocksToProcess = params.comparisonStocks && params.comparisonStocks.length > 0
        ? stocks.filter(s => params.comparisonStocks!.includes(s.code))
        : stocks;
        
      for (let i = 0; i < stocksToProcess.length; i++) {
        const stock = stocksToProcess[i];
        console.info(`Processing stock ${i+1}/${stocksToProcess.length}: ${stock.code}`);
        
        try {
          // Get the stock's historical data with period filtering
          const stockData = await this.getStockData(
            params.dataTableName, 
            stock.code,
            params.period
          );
          
          if (!stockData || stockData.length === 0) {
            console.warn(`No data found for stock ${stock.code}, skipping`);
            continue;
          }
          
          console.info(`Retrieved ${stockData.length} data points for ${stock.code}`);
          
          // Generate trade history for the stock
          const tradeHistory = await this.generateTradeHistory(stockData, params);
          
          if (!tradeHistory || tradeHistory.length === 0) {
            console.warn(`No trade history generated for ${stock.code}, skipping`);
            continue;
          }
          
          // Calculate capital evolution based on the trade history
          const capitalEvolution = this.calculateCapitalEvolution(tradeHistory, params.initialCapital);

          // Calculate detailed metrics for the stock
          const metrics = this.calculateDetailedMetrics(stockData, tradeHistory, capitalEvolution, params);
          
          // Add the result to the list
          results.push({
            assetCode: stock.code,
            assetName: stock.name || stock.code,
            lastCurrentCapital: capitalEvolution.length > 0 
              ? capitalEvolution[capitalEvolution.length - 1].capital 
              : params.initialCapital,
            ...metrics
          });
          
          // Update progress based on how many stocks we've processed
          const progressIncrement = 70 / stocksToProcess.length;
          updateProgress(progressIncrement);
          
        } catch (e) {
          console.error(`Error analyzing stock ${stock.code}:`, e);
          // Continue with other stocks
        }
      }
      
      // Sort results by profit percentage (descending)
      results.sort((a, b) => b.profitPercentage - a.profitPercentage);
      
      updateProgress(10); // Final progress update
      return results;
    } catch (error) {
      console.error('Failed to run analysis:', error);
      throw error;
    }
  },
  
  /**
   * Generate trade history for a stock using the updated formulas
   */
    async generateTradeHistory(stockData: any[], params: StockAnalysisParams): Promise<TradeHistoryItem[]> {
      const tradeHistory: TradeHistoryItem[] = [];
      let capital = params.initialCapital;
      
      // Ensure data is sorted by date in ascending order
      const sortedData = [...stockData].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    
      console.info(`Generating trade history for ${sortedData.length} days of stock data`);
      
      for (let i = 0; i < sortedData.length; i++) {
        const currentData = sortedData[i];
        // Use previous day's data for calculations when available
        const previousData = i > 0 ? sortedData[i - 1] : null;
        
        // Get previous day capital (or initial capital if first day)
        const previousCapital = i > 0 
          ? (tradeHistory[i-1].currentCapital ?? params.initialCapital)
          : params.initialCapital;
        
        // Calculate suggested entry price based on previous day's reference price
        // Use current day's reference price if previous day is not available
        const referencePrice = previousData ? previousData[params.referencePrice] : currentData[params.referencePrice];
        let suggestedEntryPrice: number;
        
        if (params.operation === 'buy') {
          // Buy: Previous day's reference price - (Previous day's reference price * entry percentage)
          suggestedEntryPrice = referencePrice - (referencePrice * params.entryPercentage / 100);
        } else {
          // Sell: Previous day's reference price + (Previous day's reference price * entry percentage)
          suggestedEntryPrice = referencePrice + (referencePrice * params.entryPercentage / 100);
        }
        
        // Determine actual price based on conditional logic:
        let actualPrice: number | string;
        if (currentData.open <= suggestedEntryPrice) {
          actualPrice = currentData.open;
        } else if (currentData.open > suggestedEntryPrice && suggestedEntryPrice >= currentData.low) {
          actualPrice = suggestedEntryPrice;
        } else {
          actualPrice = '-';
        }
        
        // Calculate lot size from previous day's capital and actual price
        const lotSize = actualPrice !== '-' && previousCapital > 0 && Number(actualPrice) > 0
          ? Math.floor(previousCapital / Number(actualPrice) / 10 * 10 
          : 0;
        
        // Determine if trade is executed
        let trade: TradeHistoryItem['trade'] = "-";
        if (params.operation === 'buy') {
          // Buy: If Actual Price <= Suggested Entry OR Low <= Suggested Entry → "Executed"
          trade = (actualPrice !== '-' && (Number(actualPrice) <= suggestedEntryPrice || currentData.low <= suggestedEntryPrice)) ? "Buy" : "-";
        } else {
          // Sell: If Actual Price >= Suggested Entry OR High >= Suggested Entry → "Executed"
          trade = (actualPrice !== '-' && (Number(actualPrice) >= suggestedEntryPrice || currentData.high >= suggestedEntryPrice)) ? "Sell" : "-";
        }
        
        // Calculate stop price - ensure it's a number
        const stopPrice = actualPrice !== '-' ? (params.operation === 'buy'
          ? Number(actualPrice) - (Number(actualPrice) * params.stopPercentage / 100)
          : Number(actualPrice) + (Number(actualPrice) * params.stopPercentage / 100)) : 0;
        
        // Determine if stop is triggered based on the CURRENT day's low/high
        let stop: "Executed" | "-" = '-';
        if (trade !== "-" && stopPrice > 0) {
          if (params.operation === 'buy') {
            // Buy: If CURRENT Low <= Stop Price → "Executed"
            stop = currentData.low <= stopPrice ? "Executed" : "-";
          } else {
            // Sell: If CURRENT High >= Stop Price → "Executed"
            stop = currentData.high >= stopPrice ? "Executed" : "-";
          }
        }
        
        // Calculate profit/loss
        let profitLoss = 0;
        if (trade !== "-" && actualPrice !== '-') {
          if (stop === "Executed" && stopPrice > 0) {
            // If stop is triggered on the SAME day, use stop price
            profitLoss = params.operation === 'buy'
              ? (stopPrice - Number(actualPrice)) * lotSize
              : (Number(actualPrice) - stopPrice) * lotSize;
          } else {
            // Otherwise, use the close price of the CURRENT day
            profitLoss = params.operation === 'buy'
              ? (currentData.close - Number(actualPrice)) * lotSize
              : (Number(actualPrice) - currentData.close) * lotSize;
          }
        }
        
        // Update capital: Previous day's capital + current day's profit/loss
        capital = Math.max(0, previousCapital + profitLoss);
        
        // Create trade history item
        tradeHistory.push({
          date: currentData.date,
          entryPrice: actualPrice !== '-' ? Number(actualPrice) : 0, // Corrigido para sempre number
          exitPrice: currentData.close,
          high: currentData.high,
          low: currentData.low,
          close: currentData.close,
          volume: currentData.volume,
          suggestedEntryPrice,
          actualPrice,
          trade,
          lotSize,
          stopPrice: stopPrice > 0 ? stopPrice : '-',
          stop, // Já está tipado corretamente como "Executed" | "-"
          profitLoss,
          profitPercentage: previousCapital > 0 ? (profitLoss / previousCapital) * 100 : 0,
          currentCapital: capital
        });
      }
      
      console.info(`Generated ${tradeHistory.length} trade history entries`);
      return tradeHistory;
    },
  
  /**
   * Calculate capital evolution based on trade history
   */
  calculateCapitalEvolution(tradeHistory: TradeHistoryItem[], initialCapital: number): { date: string; capital: number }[] {
    if (!tradeHistory || tradeHistory.length === 0) {
      return [{ date: new Date().toISOString().split('T')[0], capital: initialCapital }];
    }

    const capitalEvolution: { date: string; capital: number }[] = [];
    
    // Add initial capital point if the first trade isn't the very first day possible
    capitalEvolution.push({ date: tradeHistory[0].date, capital: initialCapital }); 

    for (const trade of tradeHistory) {
      // Only add points where capital changes (i.e., a trade happened or stop triggered)
      if (trade.profitLoss !== 0) { 
        capitalEvolution.push({
          date: trade.date,
          // Use currentCapital which reflects the capital AFTER the day's P/L
          capital: trade.currentCapital ?? initialCapital 
        });
      }
    }
    
    // Ensure the last day's capital is included if no trade happened
    const lastTrade = tradeHistory[tradeHistory.length - 1];
    if (capitalEvolution[capitalEvolution.length - 1]?.date !== lastTrade.date) {
         capitalEvolution.push({ date: lastTrade.date, capital: lastTrade.currentCapital ?? initialCapital });
    }

    // Remove duplicates based on date, keeping the last entry for that date
    const uniqueCapitalEvolution = Array.from(new Map(capitalEvolution.map(item => [item.date, item])).values());

    return uniqueCapitalEvolution;
  },
  
  /**
   * Calculate detailed metrics based on trade history
   */
  calculateDetailedMetrics(stockData: any[], tradeHistory: TradeHistoryItem[], capitalEvolution: any[], params: StockAnalysisParams) {
    // Count the exact number of unique days in the Stock Details table
    const tradingDays = new Set(stockData.map(item => item.date)).size;
    
    // Filter for days where a trade was initiated (Buy or Sell)
    const executedTrades = tradeHistory.filter(trade => trade.trade === 'Buy' || trade.trade === 'Sell');
    const trades = executedTrades.length;
    
    // Count profits, losses, and stops based on the profitLoss and stop fields
    const profits = executedTrades.filter(trade => Number(trade.profitLoss) > 0).length;
    const losses = executedTrades.filter(trade => Number(trade.profitLoss) < 0 && trade.stop !== 'Executed').length;
    const stops = executedTrades.filter(trade => trade.stop === 'Executed').length;
    
    // Sum the profit/loss values
    let totalProfit = 0;
    let totalLoss = 0;
    
    // Calculate total profits and losses from executed trades
    for (const trade of executedTrades) {
      if (Number(trade.profitLoss) > 0) {
        totalProfit += Number(trade.profitLoss);
      } else if (Number(trade.profitLoss) < 0) {
        // Accumulate all negative P/L as total loss
        totalLoss += Number(trade.profitLoss); 
      }
    }
      
    // Calculate percentages with safety checks to avoid division by zero
    const tradePercentage = tradingDays > 0 ? (trades / tradingDays) * 100 : 0;
    const profitRate = trades > 0 ? (profits / trades) * 100 : 0;
    const lossRate = trades > 0 ? (losses / trades) * 100 : 0;
    const stopRate = trades > 0 ? (stops / trades) * 100 : 0;
    
    // Calculate final capital and profit from capital evolution
    const finalCapital = capitalEvolution.length > 0 
      ? capitalEvolution[capitalEvolution.length - 1].capital 
      : params.initialCapital;
      
    const profit = finalCapital - params.initialCapital;
    const overallProfitPercentage = params.initialCapital > 0 ? (profit / params.initialCapital) * 100 : 0;
    
    // Calculate average gain and loss
    const averageGain = profits > 0 
      ? totalProfit / profits 
      : 0;
      
    // Use absolute value for average loss calculation
    const averageLoss = (losses + stops) > 0
      ? Math.abs(executedTrades.filter(t => Number(t.profitLoss) < 0).reduce((sum, t) => sum + Number(t.profitLoss), 0)) / (losses + stops) 
      : 0;
    
    // Calculate max drawdown from capital evolution
    let maxDrawdown = 0;
    let peak = params.initialCapital;
    
    for (const point of capitalEvolution) {
      // Ensure capital is treated as a number
      const currentCapitalPoint = Number(point.capital);
      if (isNaN(currentCapitalPoint)) continue;

      if (currentCapitalPoint > peak) {
        peak = currentCapitalPoint;
      }
      
      // Calculate drawdown relative to the peak
      const drawdown = peak > 0 ? (peak - currentCapitalPoint) / peak : 0;
      
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    maxDrawdown = maxDrawdown * 100; // Express as percentage
      
    // --- Ratios Calculation (Simplified Example) ---
    const sharpeRatio = 0; // Placeholder
    const sortinoRatio = 0; // Placeholder
    const recoveryFactor = maxDrawdown > 0 ? Math.abs(profit / (maxDrawdown / 100 * params.initialCapital)) : 0;
    
    // Calculate success rate (Profits / Total Trades)
    const successRate = trades > 0 ? (profits / trades) * 100 : 0;
    
    return {
      tradingDays,
      trades,
      tradePercentage,
      profits,
      profitPercentage: profitRate,
      losses,
      lossPercentage: lossRate,
      stops,
      stopPercentage: stopRate,
      finalCapital,
      profit,
      averageGain,
      averageLoss,
      maxDrawdown,
      sharpeRatio,
      sortinoRatio,
      recoveryFactor,
      successRate
    };
  },

  /**
   * Get detailed analysis for a specific stock
   */
  async getDetailedAnalysis(
    stockCode: string,
    params: StockAnalysisParams
  ): Promise<DetailedResult> {
    try {
      console.info(`Getting detailed analysis for ${stockCode} with params:`, params);
      
      if (!params.dataTableName) {
        const tableName = await marketData.getDataTableName(
          params.country, 
          params.stockMarket, 
          params.assetClass
        );
        if (!tableName) {
          throw new Error('Could not determine data table name');
        }
        params.dataTableName = tableName;
      }
      
      // Get the stock data from the database with period filtering
      const stockData = await this.getStockData(
        params.dataTableName, 
        stockCode,
        params.period
      );
      
      if (!stockData || stockData.length === 0) {
        console.warn(`No data found for stock ${stockCode} in table ${params.dataTableName} for the selected period`);
        return {
          assetCode: stockCode,
          assetName: stockCode,
          tradeHistory: [],
          capitalEvolution: [{ date: new Date().toISOString().split('T')[0], capital: params.initialCapital }],
          tradingDays: 0,
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
          successRate: 0
        };
      }
      
      console.info(`Retrieved ${stockData.length} data points for ${stockCode} in the selected period`);
      
      // Generate trade history
      const tradeHistory = await this.generateTradeHistory(stockData, params);
      
      // Calculate capital evolution
      const capitalEvolution = this.calculateCapitalEvolution(tradeHistory, params.initialCapital);
      
      // Calculate metrics
      const metrics = this.calculateDetailedMetrics(stockData, tradeHistory, capitalEvolution, params);
      
      // Return detailed result
      return {
        assetCode: stockCode,
        assetName: stockCode,
        tradeHistory,
        capitalEvolution,
        ...metrics
      };
    } catch (error) {
      console.error(`Failed to get detailed analysis for ${stockCode}:`, error);
      throw error; 
    }
  }
};

// Export the API services
export const api = {
  auth,
  users,
  assets,
  marketData,
  analysis
};
