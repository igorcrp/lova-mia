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
      
      // Use the secure function to get user data
      const { data, error } = await supabase.rpc('get_current_user');

      if (error) {
        console.error("Get user data error:", error);
        throw error;
      }

      console.log("User data retrieved:", data);
      return data as User;
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
      return [];
    }
  },
  
  /**
   * Fallback method to get available stocks directly from the table
   */
  async getAvailableStocksDirect(tableName: string): Promise<StockInfo[]> {
    try {
      console.log(`Getting available stocks directly from table: ${tableName}`);
      
      // Query the table directly to get unique stock codes
      const { data, error } = await fromDynamic(tableName)
        .select('stock_code')
        .limit(1000); // Limit to prevent excessive data retrieval
      
      if (error) {
        console.error('Error getting stocks directly:', error);
        return [];
      }
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        console.warn('No stocks found in table');
        return [];
      }
      
      // Extract unique stock codes
      const uniqueCodes = [...new Set(data.map(item => (item as any).stock_code).filter(Boolean))];
      
      // Transform into StockInfo objects
      return uniqueCodes.map(code => ({
        code: String(code),
        name: String(code), // Use code as name if no name is available
      }));
    } catch (error) {
      console.error('Failed to get available stocks directly:', error);
      return [];
    }
  },
  
  /**
   * Get stock data for a specific stock and period
   */
  async getStockData(
    tableName: string,
    stockCode: string,
    period: string
  ): Promise<any[]> {
    try {
      console.log(`Getting stock data for ${stockCode} from ${tableName} for period ${period}`);
      
      // Get date range for the specified period
      const { startDate, endDate } = getDateRangeForPeriod(period);
      
      // Format dates for database query
      const formattedStartDate = formatDateToYYYYMMDD(startDate);
      const formattedEndDate = formatDateToYYYYMMDD(endDate);
      
      console.log(`Date range: ${formattedStartDate} to ${formattedEndDate}`);
      
      // Query the database for stock data within the date range
      const { data, error } = await fromDynamic(tableName)
        .select('*')
        .eq('stock_code', stockCode)
        .gte('date', formattedStartDate)
        .lte('date', formattedEndDate)
        .order('date');
      
      if (error) {
        console.error(`Error getting stock data for ${stockCode}:`, error);
        return [];
      }
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        console.warn(`No data found for ${stockCode} in the specified period`);
        return [];
      }
      
      console.log(`Retrieved ${data.length} data points for ${stockCode}`);
      
      return data as any[];
    } catch (error) {
      console.error(`Failed to get stock data for ${stockCode}:`, error);
      return [];
    }
  },
  
  /**
   * Run analysis on stocks based on parameters
   */
  async runAnalysis(
    params: StockAnalysisParams,
    progressCallback?: (progress: number) => void
  ): Promise<AnalysisResult[]> {
    try {
      console.log('Running analysis with params:', params);
      
      if (!params.dataTableName) {
        throw new Error('Data table name is required');
      }
      
      // Get available stocks
      const stocks = await this.getAvailableStocks(params.dataTableName);
      
      if (stocks.length === 0) {
        console.warn('No stocks available for analysis');
        return [];
      }
      
      console.log(`Found ${stocks.length} stocks for analysis`);
      
      // Limit the number of stocks to analyze
      const stocksToAnalyze = stocks.slice(0, params.maxResults || 10);
      
      console.log(`Analyzing ${stocksToAnalyze.length} stocks`);
      
      // Create placeholder results
      const results: AnalysisResult[] = stocksToAnalyze.map(stock => ({
        assetCode: stock.code,
        assetName: stock.name || stock.code,
        tradingDays: 0,
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
      }));
      
      // Report initial progress
      if (progressCallback) {
        progressCallback(0);
      }
      
      return results;
    } catch (error) {
      console.error('Analysis failed:', error);
      throw error;
    }
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
        params.period // Pass the period parameter to filter by date
      );
      
      if (!stockData || stockData.length === 0) {
        // Return a default structure instead of throwing error to allow UI to handle it
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
      
      return {
        assetCode: stockCode,
        assetName: stockCode,
        tradeHistory: [],
        capitalEvolution: [{ date: new Date().toISOString().split('T')[0], capital: params.initialCapital }],
        tradingDays: stockData.length,
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
    } catch (error) {
      console.error(`Failed to get detailed analysis for ${stockCode}:`, error);
      // Re-throw the error to be caught by the calling function
      throw error; 
    }
  }
};

// Export the API services
export const api = {
  auth,
  marketData,
  analysis
};
