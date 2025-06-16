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
  async login(email: string, password: string): Promise<{ user: User; session: any }> { // Improved return type
    try {
      console.log(`Attempting to login with email: ${email}`);

      // REMOVED: Block that called non-existent RPC 'check_user_by_email'
      // Status check is now done in AuthContext after Supabase Auth login

      // Authenticate with Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("Login error:", error);
        // Check if the error is due to unconfirmed email
        if (error.message.includes("Email not confirmed")) {
          throw new Error("PENDING_CONFIRMATION"); // Throw specific error for handling in AuthContext
        }
        throw error; // Throw other authentication errors
      }

      // REMOVED: Block that checked 'pending' status after successful login
      // This logic is now in AuthContext

      if (!data || !data.user || !data.session) { // Check for null data
        throw new Error("Login failed: No user data returned.");
      }

      console.log("Supabase Auth Login successful:", data);
      return {
        user: data.user as User, // Assert User type
        session: data.session,
      };
    } catch (error) {
      console.error("Login failed:", error);
      if (error instanceof Error && error.message === "PENDING_CONFIRMATION") {
        throw error;
      }
      // Ensure other Supabase errors are re-thrown
      if (error && typeof error === 'object' && 'status' in error) {
         throw error;
      }
      throw new Error(`Login failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /**
   * Register a new user
   */
  async register(email: string, password: string, fullName: string): Promise<{ user: User | null; session: any; success: boolean }> { // Improved return type
    try {
      console.log(`Attempting to register user with email: ${email}`);
      
      // Register user with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login?confirmation=true`,
          data: {
            full_name: fullName, // Ensure this matches your Supabase config if used in triggers/functions
          }
        }
      });

      if (authError) {
        console.error("Registration auth error:", authError);
        throw authError; // Re-throw Supabase error
      }

      console.log("Auth registration successful:", authData);

      if (!authData || !authData.user || !authData.session) {
        // This case should ideally be handled by authError, but as a safeguard:
        throw new Error("Registration failed: No user data returned from Supabase Auth.");
      }

      // Insert user data into public.users table with level_id=1 and status_user='pending'
      // It's important that `authData.user.id` exists here.
      const { error: userError } = await supabase
        .from('users')
        .insert([
          {
            id: authData.user.id, // Supabase user ID
            email: email,
            name: fullName, // Or authData.user.user_metadata?.full_name if preferred
            level_id: 1, // Default level
            status_users: 'pending', // Default status
            created_at: new Date().toISOString(),
          }
        ]);

      if (userError) {
        console.error("User data insertion error:", userError);
        // Critical decision: If creating the user profile fails, is the registration still successful?
        // For now, we'll consider it a partial failure if the auth user was created but profile wasn't.
        // The user exists in auth, but not in our public table. This needs careful handling.
        console.warn("User created in auth but not in public.users table. This may lead to issues.");
        // Depending on application requirements, you might want to:
        // 1. Delete the auth.user if the profile insertion fails (complex, requires admin rights or another call)
        // 2. Throw a specific error to indicate partial success / need for manual intervention
        // 3. Allow it and have a cleanup process or UI prompt for completion
        throw new Error(`User registration partially failed: Profile creation error: ${userError.message}`);
      } else {
        console.log("User registration successful in public.users table");
      }

      return {
        user: authData.user as User, // Assert User type
        session: authData.session,
        success: true
      };
    } catch (error) {
      console.error("Registration failed:", error);
      // Ensure Supabase errors are re-thrown
      if (error && typeof error === 'object' && 'status' in error) {
         throw error;
      }
      throw new Error(`Registration failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /**
   * Send password reset email
   */
  async resetPassword(email: string): Promise<void> {
    try {
      console.log(`Sending password reset email to: ${email}`);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login?reset=true`, // Ensure this page handles the reset token
      });

      if (error) {
        console.error("Password reset error:", error);
        throw error; // Re-throw Supabase error
      }

      console.log("Password reset email sent successfully");
    } catch (error) {
      console.error("Password reset failed:", error);
      // Ensure Supabase errors are re-thrown
      if (error && typeof error === 'object' && 'status' in error) {
         throw error;
      }
      throw new Error(`Password reset failed: ${error instanceof Error ? error.message : String(error)}`);
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
        throw error; // Re-throw Supabase error
      }

      console.log("Password updated successfully");
    } catch (error) {
      console.error("Password update failed:", error);
      // Ensure Supabase errors are re-thrown
      if (error && typeof error === 'object' && 'status' in error) {
         throw error;
      }
      throw new Error(`Password update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /**
   * Resend confirmation email
   */
  async resendConfirmationEmail(email: string): Promise<void> {
    try {
      console.log(`Resending confirmation email to: ${email}`);
      const { error } = await supabase.auth.resend({
        type: 'signup', // Or 'recovery' or other types as needed
        email: email,
        options: {
          emailRedirectTo: `${window.location.origin}/login?confirmation=true`, // Ensure this page handles the confirmation
        }
      });

      if (error) {
        console.error("Resend confirmation email error:", error);
        throw error; // Re-throw Supabase error
      }

      console.log("Confirmation email resent successfully");
    } catch (error) {
      console.error("Resend confirmation email failed:", error);
       // Ensure Supabase errors are re-thrown
      if (error && typeof error === 'object' && 'status' in error) {
         throw error;
      }
      throw new Error(`Resend confirmation email failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /**
   * Login with Google OAuth
   */
  async googleLogin(): Promise<{ provider: string; url: string | null }> { // Improved return type
    try {
      console.log("Attempting to login with Google");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/login?provider=google` // This page handles the OAuth callback
        }
      });

      if (error) {
        console.error("Google login error:", error);
        throw error; // Re-throw Supabase error
      }

      if (!data || !data.provider || !data.url) {
        throw new Error("Google login failed: No provider or URL returned.");
      }

      console.log("Google login initiated:", data);
      return { // Return a more specific type
        provider: data.provider,
        url: data.url,
      };
    } catch (error) {
      console.error("Google login failed:", error);
      // Ensure Supabase errors are re-thrown
      if (error && typeof error === 'object' && 'status' in error) {
         throw error;
      }
      throw new Error(`Google login failed: ${error instanceof Error ? error.message : String(error)}`);
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
        throw error; // Re-throw Supabase error
      }

      console.log("Logout successful");
    } catch (error) {
      console.error("Logout failed:", error);
      // Ensure Supabase errors are re-thrown
      if (error && typeof error === 'object' && 'status' in error) {
         throw error;
      }
      throw new Error(`Logout failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /**
   * Get current user data from the public.users table.
   * Assumes userId is the email for the RPC call.
   */
  async getUserData(userIdAsEmail: string): Promise<User | null> { // Parameter name clarified
    try {
      console.log(`Getting user data for email (used as ID): ${userIdAsEmail}`);
      
      // Using RPC 'check_user_by_email'. Ensure this RPC exists and is configured correctly.
      // The parameter p_email expects an email.
      const { data, error } = await supabase.rpc('check_user_by_email', {
        p_email: userIdAsEmail
      });

      if (error) {
        console.error("Get user data RPC error:", error);
        throw error; // Re-throw Supabase error
      }

      console.log("User data retrieved from RPC:", data);
      
      // Process the RPC result. The structure of 'data' depends on your RPC function.
      // Assuming the RPC returns an array of user-like objects.
      if (Array.isArray(data) && data.length > 0) {
        const rpcUserData = data[0];

        // Map RPC data to the User type. Adjust field names as necessary.
        // Ensure all required User fields are present or have defaults.
        const user: User = {
          id: rpcUserData.id, // This should be the Supabase Auth user ID (UUID)
          email: rpcUserData.email,
          full_name: rpcUserData.name, // Assuming 'name' from RPC maps to 'full_name'
          level_id: rpcUserData.level_id,
          // Ensure 'status_users' from RPC is compatible with User['status']
          status: rpcUserData.status_users as User['status'] || 'pending',
          email_verified: typeof rpcUserData.email_verified === 'boolean' ? rpcUserData.email_verified : false,
          account_type: rpcUserData.account_type || 'free', // Provide a default if not in RPC result
          created_at: rpcUserData.created_at || new Date().toISOString(), // Ensure date is in ISO format
          last_login: rpcUserData.last_login || null,
          // Add any other fields from the User type, ensuring they are mapped or defaulted
        };
        return user;
      }
      
      return null; // No user found or RPC returned empty
    } catch (error) {
      console.error("Get user data failed:", error);
      // Ensure Supabase errors are re-thrown
      if (error && typeof error === 'object' && 'status' in error) {
         throw error;
      }
      // For non-Supabase errors, or if Supabase error is not thrown as expected
      throw new Error(`Get user data failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /**
   * Update user status to active after email confirmation.
   * The `userId` here should be the Supabase Auth User ID (UUID).
   */
  async confirmUserEmail(userId: string): Promise<void> {
    try {
      console.log(`Confirming email for user ID: ${userId}`);
      const { error } = await supabase
        .from('users') // Target the 'users' table
        .update({ status_users: 'active' }) // Field to update
        .eq('id', userId); // Condition: where 'id' (PK of 'users' table, should be UUID) matches userId

      if (error) {
        console.error("Email confirmation error:", error);
        throw error; // Re-throw Supabase error
      }

      console.log("Email confirmed successfully for user:", userId);
    } catch (error) {
      console.error("Email confirmation failed:", error);
      // Ensure Supabase errors are re-thrown
      if (error && typeof error === 'object' && 'status' in error) {
         throw error;
      }
      throw new Error(`Email confirmation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

/**
 * Market Data API service for fetching market data.
 */
const marketData = {
  /**
   * Get available countries with market data.
   * Returns an array of country names or an empty array if none are found or an error occurs.
   */
  async getCountries(): Promise<string[]> {
    try {
      // Query the market_data_sources table using fromDynamic for flexibility
      const { data, error } = await fromDynamic('market_data_sources')
        .select('country')
        .order('country');

      if (error) {
        console.error('Error fetching countries:', error);
        throw error; // Re-throw Supabase error
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        console.log('No countries found.');
        return []; // Return empty array if no data
      }

      // Extract unique country names. Assumes 'country' field exists.
      // Filters out any null or undefined country values before adding to the Set.
      const countries = [...new Set(data.map(item => (item as { country: string | null })?.country).filter(Boolean) as string[])];
      return countries;
    } catch (error) {
      console.error('Failed to fetch countries:', error);
      // For non-Supabase errors or if Supabase error is not thrown as expected
      if (error && typeof error === 'object' && 'status' in error) {
        throw error;
      }
      throw new Error(`Failed to fetch countries: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /**
   * Get available stock markets for a given country.
   * Returns an array of stock market names or an empty array if none are found or an error occurs.
   */
  async getStockMarkets(country: string): Promise<string[]> {
    if (!country) {
      console.warn('getStockMarkets called without a country.');
      return [];
    }
    try {
      const { data, error } = await fromDynamic('market_data_sources')
        .select('stock_market')
        .eq('country', country)
        .order('stock_market');

      if (error) {
        console.error(`Error fetching stock markets for ${country}:`, error);
        throw error; // Re-throw Supabase error
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        console.log(`No stock markets found for ${country}.`);
        return [];
      }
      // Extracts unique stock market names. Assumes 'stock_market' field exists.
      const markets = [...new Set(data.map(item => (item as { stock_market: string | null })?.stock_market).filter(Boolean) as string[])];
      return markets;
    } catch (error) {
      console.error(`Failed to fetch stock markets for ${country}:`, error);
      if (error && typeof error === 'object' && 'status' in error) {
        throw error;
      }
      throw new Error(`Failed to fetch stock markets: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /**
   * Get available asset classes for a given country and stock market.
   * Returns an array of asset class names or an empty array if none are found or an error occurs.
   */
  async getAssetClasses(country: string, stockMarket: string): Promise<string[]> {
    if (!country || !stockMarket) {
      console.warn('getAssetClasses called with missing country or stockMarket.');
      return [];
    }
    try {
      const { data, error } = await fromDynamic('market_data_sources')
        .select('asset_class')
        .eq('country', country)
        .eq('stock_market', stockMarket)
        .order('asset_class');

      if (error) {
        console.error(`Error fetching asset classes for ${country} - ${stockMarket}:`, error);
        throw error; // Re-throw Supabase error
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        console.log(`No asset classes found for ${country} - ${stockMarket}.`);
        return [];
      }
      // Extracts unique asset class names. Assumes 'asset_class' field exists.
      const classes = [...new Set(data.map(item => (item as { asset_class: string | null })?.asset_class).filter(Boolean) as string[])];
      return classes;
    } catch (error) {
      console.error(`Failed to fetch asset classes for ${country} - ${stockMarket}:`, error);
      if (error && typeof error === 'object' && 'status' in error) {
        throw error;
      }
      throw new Error(`Failed to fetch asset classes: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /**
   * Get the data table name for a specific market data source.
   * Returns the table name as a string, or null if not found or an error occurs.
   */
  async getDataTableName(
    country: string,
    stockMarket: string,
    assetClass: string
  ): Promise<string | null> {
    if (!country || !stockMarket || !assetClass) {
      console.warn('getDataTableName called with missing parameters.');
      return null;
    }
    try {
      const { data, error } = await fromDynamic('market_data_sources')
        .select('stock_table')
        .eq('country', country)
        .eq('stock_market', stockMarket)
        .eq('asset_class', assetClass)
        .maybeSingle(); // Expects at most one row

      if (error) {
        console.error('Error fetching data table name:', error);
        // If it's a PostgREST error indicating "JSON object requested, multiple (or no) rows returned",
        // it means no unique source was found. In this case, returning null is appropriate.
        if (error.code === 'PGRST116') {
          console.log('No unique data table name found for the criteria.');
          return null;
        }
        throw error; // Re-throw other Supabase errors
      }

      return data ? (data as { stock_table: string | null })?.stock_table ?? null : null;
    } catch (error) {
      console.error('Failed to fetch data table name:', error);
      if (error && typeof error === 'object' && 'status' in error) {
        throw error;
      }
      throw new Error(`Failed to fetch data table name: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  
  /**
   * Check if the given table exists in the database.
   * Returns true if the table exists, false otherwise or if an error occurs.
   */
  async checkTableExists(tableName: string): Promise<boolean> {
    if (!tableName) {
      console.warn('checkTableExists called with no tableName.');
      return false; // Or throw new Error('Table name is required');
    }
    try {
      // Attempt to query the table with a limit of 1.
      // If the query is successful (even if it returns no rows), the table exists.
      const { error } = await fromDynamic(tableName)
        .select('id') // Select a common, indexed column if possible, otherwise '*'
        .limit(1);
      
      // If there's an error, it might be because the table doesn't exist (e.g., "relation does not exist")
      // Supabase errors often have a `code` property (e.g., '42P01' for undefined_table in PostgreSQL)
      if (error) {
        // Log the error for debugging but treat as "table does not exist" for this function's purpose.
        console.warn(`Error checking table existence for "${tableName}": ${error.message}`);
        return false;
      }
      return true; // No error means the table exists
    } catch (error) { // Catch any other unexpected errors
      console.error(`Unexpected error checking table existence for "${tableName}":`, error);
      throw new Error(`Failed to check table existence: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  
  /**
   * Get market status by ID.
   * Returns the market status object or null if not found or an error occurs.
   * TODO: Define a specific type for market status instead of `any`.
   */
  async getMarketStatus(marketId: string): Promise<any | null> { // TODO: Replace 'any' with a specific type
    if (!marketId) {
      console.warn('getMarketStatus called with no marketId.');
      return null;
    }
    try {
      const { data, error } = await fromDynamic('market_status')
        .select('*')
        .eq('id', marketId)
        .single(); // Expects exactly one row
        
      if (error) {
        console.error(`Error fetching market status for ID ${marketId}:`, error);
        // If PostgREST error "JSON object requested, multiple (or no) rows returned" (PGRST116),
        // it means no unique record was found. Return null.
        if (error.code === 'PGRST116') {
          console.log(`No market status found for ID ${marketId}.`);
          return null;
        }
        throw error; // Re-throw other Supabase errors
      }
      
      return data; // Data can be null if no row is found by .single() without erroring
    } catch (error) {
      console.error(`Failed to fetch market status for ID ${marketId}:`, error);
      if (error && typeof error === 'object' && 'status' in error) {
        throw error;
      }
      throw new Error(`Failed to fetch market status: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  
  /**
   * Get all market data sources.
   * Returns an array of MarketDataSource objects or an empty array if none are found or an error occurs.
   */
  async getAllMarketDataSources(): Promise<MarketDataSource[]> {
    try {
      const { data, error } = await fromDynamic('market_data_sources')
        .select('*') // Select all columns as defined in MarketDataSource
        .order('country');
        
      if (error) {
        console.error('Error fetching all market data sources:', error);
        throw error; // Re-throw Supabase error
      }

      if (!data) {
        console.log('No market data sources found.');
        return [];
      }
      // Cast the returned data to MarketDataSource[]
      // Supabase should return data matching the table structure.
      // Add runtime validation here if needed (e.g., using Zod) for stronger type safety.
      return data as MarketDataSource[];
    } catch (error) {
      console.error('Failed to fetch all market data sources:', error);
      if (error && typeof error === 'object' && 'status' in error) {
        throw error;
      }
      throw new Error(`Failed to fetch all market data sources: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  
  /**
   * Get market data sources by country.
   * Returns an array of MarketDataSource objects or an empty array if none are found or an error occurs.
   */
  async getMarketDataSourcesByCountry(country: string): Promise<MarketDataSource[]> {
    if (!country) {
      console.warn('getMarketDataSourcesByCountry called with no country.');
      return [];
    }
    try {
      const { data, error } = await fromDynamic('market_data_sources')
        .select('*')
        .eq('country', country)
        .order('stock_market');
        
      if (error) {
        console.error(`Error fetching market data sources for country ${country}:`, error);
        throw error; // Re-throw Supabase error
      }
      
      if (!data) {
        console.log(`No market data sources found for country ${country}.`);
        return [];
      }
      return data as MarketDataSource[];
    } catch (error) {
      console.error(`Failed to fetch market data sources for country ${country}:`, error);
      if (error && typeof error === 'object' && 'status' in error) {
        throw error;
      }
      throw new Error(`Failed to fetch market data sources by country: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  
  /**
   * Get market data sources by country and stock market.
   * Returns an array of MarketDataSource objects or an empty array if none are found or an error occurs.
   */
  async getMarketDataSourcesByCountryAndStockMarket(
    country: string, 
    stockMarket: string
  ): Promise<MarketDataSource[]> {
    if (!country || !stockMarket) {
      console.warn('getMarketDataSourcesByCountryAndStockMarket called with missing parameters.');
      return [];
    }
    try {
      const { data, error } = await fromDynamic('market_data_sources')
        .select('*')
        .eq('country', country)
        .eq('stock_market', stockMarket)
        .order('asset_class');
        
      if (error) {
        console.error(`Error fetching market data sources for ${country} - ${stockMarket}:`, error);
        throw error; // Re-throw Supabase error
      }
      
      if (!data) {
        console.log(`No market data sources found for ${country} - ${stockMarket}.`);
        return [];
      }
      return data as MarketDataSource[];
    } catch (error) {
      console.error(`Failed to fetch market data sources for ${country} - ${stockMarket}:`, error);
      if (error && typeof error === 'object' && 'status' in error) {
        throw error;
      }
      throw new Error(`Failed to fetch market data sources by country and stock market: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
};

/**
 * Stock Analysis API service.
 * Provides functions for fetching stock information, historical data,
 * and running financial analyses.
 */
const analysis = {
  /**
   * Retrieves a list of available stocks (codes and names) for a given data table.
   * It first tries an RPC call 'get_unique_stock_codes' and falls back to a direct query
   * on the table if the RPC fails or returns no data.
   * @param tableName - The name of the database table containing stock data.
   * @returns A Promise resolving to an array of StockInfo objects.
   * @throws Error if tableName is not provided or if direct query fails after RPC fallback.
   */
  async getAvailableStocks(tableName: string): Promise<StockInfo[]> {
    if (!tableName) {
      // Ensure tableName is provided, otherwise the function cannot proceed.
      throw new Error('Table name is required to get available stocks.');
    }

    console.log(`Getting available stocks from table: ${tableName}`);

    try {
      // Attempt to get unique stock codes using a dedicated RPC function.
      // This is often more efficient if the table is large.
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_unique_stock_codes', {
        p_table_name: tableName
      });

      if (rpcError) {
        console.warn('RPC call "get_unique_stock_codes" failed, falling back to direct query:', rpcError.message);
        // If RPC fails, attempt a direct query as a fallback.
        return await this.getAvailableStocksDirect(tableName);
      }

      if (!rpcData || !Array.isArray(rpcData) || rpcData.length === 0) {
        console.warn('No stock codes returned from RPC, falling back to direct query.');
        // If RPC returns no data, also attempt a direct query.
        return await this.getAvailableStocksDirect(tableName);
      }
      
      console.log(`Found ${rpcData.length} unique stock codes via RPC.`);
      
      // Transform the RPC data (which can be an array of strings or objects) into StockInfo objects.
      const stocks: StockInfo[] = rpcData.map((item: any) => {
        // The RPC might return simple strings or objects like { stock_code: 'XYZ' }.
        const stockCode: string = (typeof item === 'object' && item !== null && 'stock_code' in item)
                                  ? String(item.stock_code)
                                  : String(item);
        return {
          code: stockCode,
          name: stockCode, // Use code as name if no other name field is available from RPC.
        };
      });
      
      return stocks;
    } catch (error) { // Catch errors from the RPC call itself or from the fallback.
      console.error(`Failed to get available stocks for table "${tableName}":`, error);
      // If all attempts fail, re-throw the error or throw a new one.
      throw new Error(`Unable to fetch available stocks for ${tableName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  
  /**
   * Fallback method to get available stocks directly from the specified table.
   * This method queries the 'stock_code' column and dedupes the results.
   * @param tableName - The name of the database table.
   * @returns A Promise resolving to an array of StockInfo objects.
   * @throws Error if the direct query fails.
   */
  async getAvailableStocksDirect(tableName: string): Promise<StockInfo[]> {
    console.log(`Attempting direct query to get stock codes from table: ${tableName}`);

    try {
      // Select distinct stock codes. A limit is applied for performance reasons.
      // Note: Supabase's `select` doesn't directly support `DISTINCT ON` or `GROUP BY` for this simple case easily.
      // This approach fetches more data than necessary and dedupes client-side.
      // For very large tables, a server-side solution (like an RPC or view) is better.
      const { data, error } = await fromDynamic(tableName)
        .select('stock_code') // Only select the necessary column.
        .limit(2000); // Increased limit, adjust based on typical number of unique stocks.
      
      if (error) {
        console.error(`Error in direct stock code query for table "${tableName}":`, error);
        throw error; // Re-throw Supabase error to be caught by the caller.
      }

      if (!data || data.length === 0) {
        console.warn(`No stock codes found in table "${tableName}" via direct query.`);
        return []; // Return empty array if no data found.
      }
      
      // Extract unique stock codes using a Set for efficiency.
      const uniqueCodes = new Set<string>();
      (data as Array<{ stock_code: string | null }>) // Type assertion for items in data
        .filter(item => item && typeof item.stock_code === 'string' && item.stock_code) // Ensure stock_code is a non-empty string
        .forEach(item => uniqueCodes.add(item.stock_code!)); // Add to set (non-null asserted due to filter)
      
      // Transform unique codes into StockInfo objects.
      const stocks: StockInfo[] = Array.from(uniqueCodes).map(code => ({
        code: code,
        name: code, // Using code as name, as 'name' column might not exist or wasn't fetched.
      }));
      
      console.log(`Direct query found ${stocks.length} unique stock codes from table "${tableName}".`);
      return stocks;
    } catch (error) {
      console.error(`Failed in direct stock query for table "${tableName}":`, error);
      // Ensure Supabase errors are re-thrown or a new error is thrown.
      if (error && typeof error === 'object' && 'status' in error) {
         throw error;
      }
      throw new Error(`Direct query for available stocks failed for ${tableName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  
  /**
   * Retrieves historical stock data for a given stock code from a specific table.
   * Data can be filtered by a period string (e.g., "1M", "1Y") or fetched up to a limit.
   * @param tableName - The name of the table containing stock data.
   * @param stockCode - The stock code to fetch data for.
   * @param period - Optional period string (e.g., "1M", "3M", "1Y", "YTD").
   * @param limit - Optional limit for records if period is not specified (default: 300).
   * @returns A Promise resolving to an array of StockRecord objects (or `any[]` if StockRecord is not fully defined).
   * @throws Error if tableName or stockCode are not provided.
   */
  async getStockData(
    tableName: string,
    stockCode: string,
    period: string | undefined = undefined,
    limit: number = 300
  ): Promise<StockRecord[]> { // Changed return type to StockRecord[]
    if (!tableName || !stockCode) {
      throw new Error('Table name and stock code are required to get stock data.');
    }

    try {
      if (period) {
        // If a period is specified, calculate the date range and fetch data accordingly.
        const dateRange = getDateRangeForPeriod(period);
        console.info(`Getting stock data for ${stockCode} from ${tableName} for period ${period} (${dateRange.startDate} to ${dateRange.endDate})`);
        return await this.getStockDataDirectWithPeriod(tableName, stockCode, dateRange.startDate, dateRange.endDate);
      } else {
        // If no period, fetch data up to the specified limit.
        console.info(`Getting stock data for ${stockCode} from ${tableName} with limit ${limit}`);
        return await this.getStockDataDirect(tableName, stockCode, limit);
      }
    } catch (error) {
      console.error(`Failed to get stock data for ${stockCode} from table ${tableName}:`, error);
      // Re-throw any caught error to be handled by the caller.
      // Consider specific error types if needed for more granular error handling upstream.
      throw new Error(`Unable to fetch stock data: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  
  /**
   * Fallback method to get stock data directly from the table, limited by record count.
   * Fetches records ordered by date descending, then reverses for chronological order.
   * @param tableName - The name of the stock data table.
   * @param stockCode - The stock code.
   * @param limit - The maximum number of records to fetch.
   * @returns A Promise resolving to an array of StockRecord objects.
   * @throws Error if the query fails.
   */
  async getStockDataDirect(tableName: string, stockCode: string, limit: number = 300): Promise<StockRecord[]> {
    console.log(`Direct query for stock data: ${stockCode} from ${tableName}, limit ${limit}`);
    try {
      const { data, error } = await fromDynamic(tableName)
        .select('*') // Select all available columns for the stock record.
        .eq('stock_code', stockCode)
        .order('date', { ascending: false }) // Fetch latest data first.
        .limit(limit);

      if (error) {
        console.error(`Error in direct stock data query (limit-based) for ${stockCode} in ${tableName}:`, error);
        throw error; // Re-throw Supabase error.
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        console.warn(`No data found for ${stockCode} in table ${tableName} (limit-based).`);
        return []; // Return empty array if no records found.
      }
      // Data is fetched in descending order by date, so reverse it to be chronological.
      return (data as StockRecord[]).reverse();
    } catch (error) {
      console.error(`Failed in direct stock data query (limit-based) for ${stockCode} in ${tableName}:`, error);
      if (error && typeof error === 'object' && 'status' in error) {
         throw error;
      }
      throw new Error(`Direct stock data query (limit) failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
  
  /**
   * Fetches stock data for a specific stock and date range.
   * Data is ordered chronologically by date.
   * @param tableName - The name of the stock data table.
   * @param stockCode - The stock code.
   * @param startDate - The start date of the period (YYYY-MM-DD).
   * @param endDate - The end date of the period (YYYY-MM-DD).
   * @returns A Promise resolving to an array of StockRecord objects.
   * @throws Error if the query fails.
   */
  async getStockDataDirectWithPeriod(
    tableName: string, 
    stockCode: string, 
    startDate: string, 
    endDate: string
  ): Promise<StockRecord[]> {
    console.info(`Fetching stock data for ${stockCode} from ${tableName} between ${startDate} and ${endDate}`);
    try {
      const { data, error } = await fromDynamic(tableName)
        .select('*')
        .eq('stock_code', stockCode)
        .gte('date', startDate) // Greater than or equal to start date.
        .lte('date', endDate)   // Less than or equal to end date.
        .order('date', { ascending: true }); // Ensure chronological order.
      
      if (error) {
        console.error(`Error in period-filtered stock data query for ${stockCode} in ${tableName}:`, error);
        throw error; // Re-throw Supabase error.
      }
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        console.warn(`No data found for ${stockCode} in table ${tableName} for period ${startDate}-${endDate}.`);
        return [];
      }
      
      console.info(`Found ${data.length} records for ${stockCode} in period ${startDate}-${endDate}.`);
      return data as StockRecord[];
    } catch (error) {
      console.error(`Failed to fetch period-filtered data for ${stockCode} in ${tableName}:`, error);
      if (error && typeof error === 'object' && 'status' in error) {
         throw error;
      }
      throw new Error(`Period-filtered stock data query failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  /**
   * Runs a stock analysis based on the provided parameters.
   * This involves fetching stock data, generating trade history, and calculating metrics.
   * @param params - The parameters for the stock analysis (StockAnalysisParams).
   * @param progressCallback - Optional callback function to report progress (0-100).
   * @returns A Promise resolving to an array of AnalysisResult objects.
   * @throws Error if essential parameters are missing or if critical steps fail.
   */
  async runAnalysis(
    params: StockAnalysisParams,
    progressCallback?: (progress: number) => void
  ): Promise<AnalysisResult[]> {
    console.info('Running analysis with parameters:', params);

    // Validate essential parameters
    if (!params.country || !params.stockMarket || !params.assetClass) {
      throw new Error("Country, stockMarket, and assetClass are required for analysis.");
    }
    if (params.initialCapital == null || params.initialCapital <= 0) {
      throw new Error("Initial capital must be a positive number.");
    }

    const updateProgress = (value: number) => {
      if (progressCallback) {
        // Ensure progress is between 0 and 100.
        progressCallback(Math.min(Math.max(value, 0), 100));
      }
    };

    updateProgress(0); // Initial progress

    // Determine data table name if not provided in params.
    let dataTableName = params.dataTableName;
    if (!dataTableName) {
      dataTableName = await marketData.getDataTableName(
        params.country,
        params.stockMarket,
        params.assetClass
      );
      if (!dataTableName) {
        throw new Error('Could not determine data table name for analysis. Check market data source configuration.');
      }
      params.dataTableName = dataTableName; // Store it back in params for subsequent calls
    }
    updateProgress(5); // Progress after getting table name

    // Get all available stocks for the determined data table.
    const allStocks = await this.getAvailableStocks(dataTableName);
    updateProgress(10);

    if (!allStocks || allStocks.length === 0) {
      console.warn(`No stocks found for table ${dataTableName}. Analysis cannot proceed.`);
      return []; // Return empty if no stocks to analyze.
    }
    console.info(`Found ${allStocks.length} stocks for analysis in table ${dataTableName}.`);

    // Filter stocks if comparisonStocks are specified.
    const stocksToProcess = params.comparisonStocks && params.comparisonStocks.length > 0
      ? allStocks.filter(s => params.comparisonStocks!.includes(s.code))
      : allStocks;
      
    if (stocksToProcess.length === 0) {
      console.warn('No stocks selected for processing after filtering with comparisonStocks.');
      return [];
    }
    console.info(`Processing ${stocksToProcess.length} stocks.`);

    const results: AnalysisResult[] = [];
    const totalStocksToProcess = stocksToProcess.length;

    // Process each stock.
    for (let i = 0; i < totalStocksToProcess; i++) {
      const stock = stocksToProcess[i];
      console.info(`Processing stock ${i + 1}/${totalStocksToProcess}: ${stock.code}`);
      
      try {
        // Fetch historical data for the current stock.
        const stockData: StockRecord[] = await this.getStockData(
          dataTableName,
          stock.code,
          params.period // Use period from params for fetching data.
        );

        if (!stockData || stockData.length === 0) {
          console.warn(`No data found for stock ${stock.code} in period ${params.period}, skipping.`);
          continue; // Skip to the next stock if no data.
        }
        console.info(`Retrieved ${stockData.length} data points for ${stock.code}.`);
        
        // Generate trade history based on stock data and analysis parameters.
        // Type assertion for stockData elements if they are generic 'any' from getStockData
        const tradeHistory = await this.generateTradeHistory(stockData as any[], params);
        
        if (!tradeHistory || tradeHistory.length === 0) {
          console.warn(`No trade history generated for ${stock.code}, skipping.`);
          continue; // Skip if no trades were generated.
        }

        // Calculate capital evolution over time.
        const capitalEvolution = this.calculateCapitalEvolution(tradeHistory, params.initialCapital);

        // Calculate detailed performance metrics.
        // Type assertion for stockData elements
        const metrics = this.calculateDetailedMetrics(stockData as any[], tradeHistory, capitalEvolution, params);

        results.push({
          assetCode: stock.code,
          assetName: stock.name || stock.code, // Use stock name or code.
          lastCurrentCapital: capitalEvolution.length > 0
            ? capitalEvolution[capitalEvolution.length - 1].capital
            : params.initialCapital,
          ...metrics // Spread calculated metrics.
        });

      } catch (e) {
        // Log error for the specific stock and continue with the rest.
        console.error(`Error analyzing stock ${stock.code}:`, e);
        // Optionally, could add a partial result with error info to results array.
      }
      // Update progress: 10% for setup, 80% for stock processing, 10% for finalization.
      updateProgress(10 + Math.round(((i + 1) / totalStocksToProcess) * 80));
    }

    // Sort results by profit percentage in descending order.
    results.sort((a, b) => b.profitPercentage - a.profitPercentage);

    updateProgress(100); // Final progress update.
    console.info('Analysis run completed.');
    return results;
  },
  
  /**
   * Generates a history of trades based on stock data and analysis parameters.
   * Note: The financial logic here is complex and preserved as-is.
   * Type safety for `stockData` elements (assumed to be `StockRecord`-like) is important.
   * @param stockData - Array of historical stock data records. Each record should have at least date, open, low, high, close, and the referencePrice field.
   * @param params - The parameters for the stock analysis (StockAnalysisParams).
   * @returns A Promise resolving to an array of TradeHistoryItem objects.
   */
  async generateTradeHistory(stockData: StockRecord[], params: StockAnalysisParams): Promise<TradeHistoryItem[]> {
    const tradeHistory: TradeHistoryItem[] = [];
    let capital = params.initialCapital; // Current capital, starts with initial capital.
    
    // Ensure data is sorted by date in ascending order for chronological processing.
    // The getStockData methods should already provide sorted data if period is used.
    // If not, uncomment and adapt:
    // const sortedData = [...stockData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedData = stockData; // Assuming stockData is already sorted chronologically.

    console.info(`Generating trade history for ${sortedData.length} days of stock data for asset using strategy: ${params.operation}`);
    
    for (let i = 0; i < sortedData.length; i++) {
      const currentData: StockRecord = sortedData[i];
      const previousData: StockRecord | null = i > 0 ? sortedData[i - 1] : null;
      
      // Capital from the end of the previous day (or initial capital if it's the first day).
      const previousDayCapital: number = i > 0
        ? (tradeHistory[i-1].currentCapital ?? params.initialCapital)
        : params.initialCapital;
      
      // Determine the reference price for calculating entry.
      // Uses previous day's specified reference price field, or current day's if no previous day.
      const referencePriceValue: number = previousData
        ? Number(previousData[params.referencePrice as keyof StockRecord])
        : Number(currentData[params.referencePrice as keyof StockRecord]);

      if (isNaN(referencePriceValue)) {
        console.warn(`Invalid reference price for date ${currentData.date}, skipping trade evaluation for this day.`);
        // Consider how to handle this: skip day, use a default, or halt?
        // For now, pushing a minimal entry to maintain array length for consistency if needed, or just continue.
        // This example will effectively skip making a trade decision if reference price is NaN.
        // To push a "no action" record:
        /* tradeHistory.push({ ... minimal TradeHistoryItem ... }); continue; */
      }

      let suggestedEntryPrice: number;
      if (params.operation === 'buy') {
        suggestedEntryPrice = referencePriceValue - (referencePriceValue * params.entryPercentage / 100);
      } else { // 'sell' operation
        suggestedEntryPrice = referencePriceValue + (referencePriceValue * params.entryPercentage / 100);
      }
      
      // Determine actual transaction price based on market conditions.
      let actualPrice: number | '-' = '-'; // Default to '-' if no trade executed or price not met.
      const currentOpen = Number(currentData.open);
      const currentLow = Number(currentData.low);

      if (params.operation === 'buy') {
        if (currentOpen <= suggestedEntryPrice) {
          actualPrice = currentOpen;
        } else if (currentOpen > suggestedEntryPrice && suggestedEntryPrice >= currentLow) {
          actualPrice = suggestedEntryPrice; // Assumes limit order filled at suggested price.
        }
      } else { // 'sell' operation
         // Logic for sell: If open is >= suggested, or high is >= suggested and suggested is above open
        const currentHigh = Number(currentData.high);
        if (currentOpen >= suggestedEntryPrice) {
            actualPrice = currentOpen;
        } else if (currentOpen < suggestedEntryPrice && suggestedEntryPrice <= currentHigh) {
            actualPrice = suggestedEntryPrice;
        }
      }
      
      // Calculate lot size based on available capital and actual price.
      const lotSize: number = actualPrice !== '-' && previousDayCapital > 0 && actualPrice > 0
        ? Math.floor(previousDayCapital / actualPrice / 10) * 10 // e.g. round to nearest 10 shares
        : 0;
      
      // Determine if a trade (Buy/Sell) is executed.
      let trade: TradeHistoryItem['trade'] = "-";
      if (lotSize > 0 && actualPrice !== '-') { // A trade can only occur if lotsize is positive
        if (params.operation === 'buy') {
          if (actualPrice <= suggestedEntryPrice || currentLow <= suggestedEntryPrice) trade = "Buy";
        } else { // 'sell'
          const currentHigh = Number(currentData.high);
          if (actualPrice >= suggestedEntryPrice || currentHigh >= suggestedEntryPrice) trade = "Sell";
        }
      }
      
      // Calculate stop price if a trade is executed.
      const stopPrice: number | '-' = trade !== "-" && actualPrice !== '-'
        ? (params.operation === 'buy'
            ? actualPrice - (actualPrice * params.stopPercentage / 100)
            : actualPrice + (actualPrice * params.stopPercentage / 100))
        : '-';
      
      // Determine if stop-loss is triggered on the CURRENT day.
      let stopTrigger: TradeHistoryItem['stopTrigger'] = '-';
      if (trade !== "-" && stopPrice !== '-') {
        if (params.operation === 'buy' && Number(currentData.low) <= stopPrice) {
          stopTrigger = "Executed";
        } else if (params.operation === 'sell' && Number(currentData.high) >= stopPrice) {
          stopTrigger = "Executed";
        }
      }
      
      // Calculate profit or loss for the day.
      let profitLoss: number = 0;
      if (trade !== "-" && actualPrice !== '-') {
        const exitPriceForCalc: number = stopTrigger === "Executed" && stopPrice !== '-'
          ? stopPrice // Exit at stop price if triggered.
          : Number(currentData.close); // Otherwise, exit at close price for daily P/L.

        profitLoss = params.operation === 'buy'
          ? (exitPriceForCalc - actualPrice) * lotSize
          : (actualPrice - exitPriceForCalc) * lotSize;
      }
      
      // Update capital.
      // Capital is previous day's capital + P/L from current day's trade activities.
      const currentDayCapital = Math.max(0, previousDayCapital + profitLoss);
      
      tradeHistory.push({
        date: formatDateToYYYYMMDD(new Date(currentData.date)), // Ensure date is in YYYY-MM-DD string format
        entryPrice: Number(currentData.open),
        exitPrice: Number(currentData.close),
        high: Number(currentData.high),
        low: Number(currentData.low),
        volume: Number(currentData.volume) || 0, // Ensure volume is a number
        suggestedEntryPrice,
        actualPrice,
        trade,
        lotSize,
        stopPrice,
        stopTrigger,
        profitLoss,
        currentCapital: currentDayCapital
      });
    }
    
    console.info(`Generated ${tradeHistory.length} trade history entries.`);
    return tradeHistory;
  },
  
  /**
   * Calculates the evolution of capital over time based on trade history.
   * @param tradeHistory - Array of TradeHistoryItem objects.
   * @param initialCapital - The starting capital amount.
   * @returns An array of objects, each with a date and the capital amount on that date.
   */
  calculateCapitalEvolution(
    tradeHistory: TradeHistoryItem[],
    initialCapital: number
  ): { date: string; capital: number }[] {
    if (!tradeHistory || tradeHistory.length === 0) {
      // Return initial capital at current date if no trades.
      return [{ date: formatDateToYYYYMMDD(new Date()), capital: initialCapital }];
    }

    const capitalEvolution: { date: string; capital: number }[] = [];
    
    // Start with initial capital on the date of the first trade (or slightly before).
    // This ensures the chart starts correctly.
    // The first trade's 'currentCapital' already reflects P/L for that day based on 'previousDayCapital' being initialCapital.
    // So, the point before the first trade should be (date_of_first_trade, initialCapital)
    // Or, if tradeHistory[0].currentCapital is capital *after* first day's P/L, this is more complex.
    // Assuming tradeHistory[0].currentCapital is the capital *after* the first day's P/L.
    // We need a point representing capital *before* any P/L on that first day.

    // Find the earliest date in trade history to correctly place initial capital point.
    const firstTradeDate = new Date(tradeHistory[0].date);
    // This adds a point representing the capital *before* any trading activity on the first day.
    capitalEvolution.push({ date: formatDateToYYYYMMDD(firstTradeDate), capital: initialCapital });

    for (const trade of tradeHistory) {
      // Record capital at each point a trade occurs or P/L is realized.
      // trade.currentCapital is the capital at the *end* of the day of 'trade.date'.
      capitalEvolution.push({
        date: trade.date, // Already formatted string from generateTradeHistory
        capital: trade.currentCapital ?? initialCapital // Fallback to initialCapital if undefined, though unlikely
      });
    }
    
    // Deduplicate entries for the same date, keeping the last one (most up-to-date for that day).
    // This is crucial if multiple records for the same date could exist or if initial capital point coincides.
    const uniqueCapitalEvolution = Array.from(
      new Map(capitalEvolution.map(item => [item.date, item])).values()
    ).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Ensure chronological order after deduplication.

    return uniqueCapitalEvolution;
  },
  
  /**
   * Calculates detailed financial metrics based on stock data, trade history, capital evolution, and parameters.
   * Note: The financial logic here is complex and preserved as-is.
   * Type safety for `stockData` elements (assumed `StockRecord`-like) and `capitalEvolution` elements is important.
   * @param stockData - Array of historical stock data records.
   * @param tradeHistory - Array of TradeHistoryItem objects.
   * @param capitalEvolution - Array of capital evolution points.
   * @param params - The parameters for the stock analysis (StockAnalysisParams).
   * @returns An object containing various calculated metrics.
   */
  calculateDetailedMetrics(
    stockData: StockRecord[], // Assuming StockRecord has a 'date' property
    tradeHistory: TradeHistoryItem[],
    capitalEvolution: { date: string; capital: number }[],
    params: StockAnalysisParams
  ): Omit<DetailedResult, 'assetCode' | 'assetName' | 'tradeHistory' | 'capitalEvolution'> {
    // Number of unique trading days from the provided stock data.
    const tradingDays: number = new Set(stockData.map(item => item.date)).size;
    
    // Filter for trades that were actually executed (Buy or Sell).
    const executedTrades: TradeHistoryItem[] = tradeHistory.filter(trade => trade.trade === 'Buy' || trade.trade === 'Sell');
    const tradesCount: number = executedTrades.length; // Total number of executed trades.
    
    // Count profitable trades, loss-making trades (not stopped out), and stopped-out trades.
    const profitableTrades: number = executedTrades.filter(trade => trade.profitLoss > 0).length;
    const losingTradesNotStopped: number = executedTrades.filter(trade => trade.profitLoss < 0 && trade.stopTrigger !== 'Executed').length;
    const stoppedTrades: number = executedTrades.filter(trade => trade.stopTrigger === 'Executed').length;
    
    // Calculate total profit and total loss from executed trades.
    let totalProfitValue: number = 0;
    let totalLossValue: number = 0; // Represents the sum of all negative P/L values.
    
    for (const trade of executedTrades) {
      if (trade.profitLoss > 0) {
        totalProfitValue += trade.profitLoss;
      } else if (trade.profitLoss < 0) {
        totalLossValue += trade.profitLoss; // profitLoss is already negative.
      }
    }
      
    // Calculate various percentage metrics.
    const tradePercentage: number = tradingDays > 0 ? (tradesCount / tradingDays) * 100 : 0;
    const profitRate: number = tradesCount > 0 ? (profitableTrades / tradesCount) * 100 : 0;
    const lossRate: number = tradesCount > 0 ? (losingTradesNotStopped / tradesCount) * 100 : 0; // Percentage of trades that were losses but not stopped.
    const stopRate: number = tradesCount > 0 ? (stoppedTrades / tradesCount) * 100 : 0; // Percentage of trades that hit stop-loss.
    
    // Determine final capital from the last point in capital evolution.
    const finalCapital: number = capitalEvolution.length > 0
      ? capitalEvolution[capitalEvolution.length - 1].capital 
      : params.initialCapital;
      
    const totalNetProfit: number = finalCapital - params.initialCapital;
    // Typo in original: overallProfitPercentage. Corrected to use totalNetProfit
    const profitPercentage: number = params.initialCapital > 0 ? (totalNetProfit / params.initialCapital) * 100 : 0;
    
    // Calculate average gain per profitable trade and average loss per losing/stopped trade.
    const averageGain: number = profitableTrades > 0 ? totalProfitValue / profitableTrades : 0;
    // Total number of trades that resulted in a loss (either stopped or not).
    const totalLosingOrStoppedTrades = losingTradesNotStopped + stoppedTrades;
    const averageLoss: number = totalLosingOrStoppedTrades > 0
      ? Math.abs(totalLossValue) / totalLosingOrStoppedTrades // totalLossValue is negative, so use Math.abs.
      : 0;
    
    // Calculate maximum drawdown from capital evolution.
    let maxDrawdownPercentage: number = 0;
    let peakCapital: number = params.initialCapital;
    
    for (const point of capitalEvolution) {
      const currentCapitalPoint = Number(point.capital);
      if (isNaN(currentCapitalPoint)) continue;

      if (currentCapitalPoint > peakCapital) {
        peakCapital = currentCapitalPoint;
      }
      const drawdown: number = peakCapital > 0 ? (peakCapital - currentCapitalPoint) / peakCapital : 0;
      if (drawdown > maxDrawdownPercentage) {
        maxDrawdownPercentage = drawdown;
      }
    }
    maxDrawdownPercentage *= 100; // Express as percentage.
      
    // Placeholder for more complex financial ratios.
    const sharpeRatio: number = 0;
    const sortinoRatio: number = 0;
    // Recovery factor: Net Profit / Max Drawdown Value
    const maxDrawdownValue = maxDrawdownPercentage / 100 * params.initialCapital;
    const recoveryFactor: number = maxDrawdownValue > 0 ? Math.abs(totalNetProfit / maxDrawdownValue) : 0;
    
    // Success rate: Percentage of profitable trades out of all executed trades.
    const successRate: number = tradesCount > 0 ? (profitableTrades / tradesCount) * 100 : 0;
    
    return {
      tradingDays,
      trades: tradesCount,
      tradePercentage,
      profits: profitableTrades,
      // profitPercentage was overall profit percentage, now using profitRate for consistency with lossRate/stopRate
      profitPercentage: profitRate, // This is rate of profitable trades among all trades
      losses: losingTradesNotStopped, // Trades that lost money but weren't stopped
      lossPercentage: lossRate,     // Rate of such trades
      stops: stoppedTrades,         // Trades that were stopped out
      stopPercentage: stopRate,     // Rate of stopped trades
      finalCapital,
      profit: totalNetProfit,       // Overall profit/loss value
      // overallProfitPercentage, // This was the original name for total profit %
      averageGain,
      averageLoss,
      maxDrawdown: maxDrawdownPercentage,
      sharpeRatio,
      sortinoRatio,
      recoveryFactor,
      successRate // Percentage of profitable trades
    };
  },

  /**
   * Retrieves a detailed analysis for a specific stock, including trade history,
   * capital evolution, and calculated metrics.
   * @param stockCode - The stock code for which to get detailed analysis.
   * @param params - The parameters for the stock analysis (StockAnalysisParams).
   * @returns A Promise resolving to a DetailedResult object.
   * @throws Error if the analysis cannot be performed (e.g., data table not found).
   */
  async getDetailedAnalysis(
    stockCode: string,
    params: StockAnalysisParams
  ): Promise<DetailedResult> {
    console.info(`Getting detailed analysis for ${stockCode} with params:`, params);

    // Ensure dataTableName is available, fetching if necessary.
    let dataTableName = params.dataTableName;
    if (!dataTableName) {
      if (!params.country || !params.stockMarket || !params.assetClass) {
         throw new Error("Country, stockMarket, and assetClass parameters are required if dataTableName is not provided.");
      }
      dataTableName = await marketData.getDataTableName(
        params.country,
        params.stockMarket,
        params.assetClass
      );
      if (!dataTableName) {
        throw new Error('Could not determine data table name for detailed analysis.');
      }
      params.dataTableName = dataTableName; // Persist for this call
    }

    // Fetch historical stock data.
    const stockData: StockRecord[] = await this.getStockData(
      dataTableName,
      stockCode,
      params.period // Use period specified in parameters.
    );

    // If no data, return a default structure indicating no analysis could be performed.
    if (!stockData || stockData.length === 0) {
      console.warn(`No data found for stock ${stockCode} in table ${dataTableName} for period ${params.period}. Returning default structure.`);
      return {
        assetCode: stockCode,
        assetName: stockCode, // Default to stock code if name isn't readily available.
        tradeHistory: [],
        capitalEvolution: [{ date: formatDateToYYYYMMDD(new Date()), capital: params.initialCapital }],
        tradingDays: 0, trades: 0, tradePercentage: 0, profits: 0, profitPercentage: 0,
        losses: 0, lossPercentage: 0, stops: 0, stopPercentage: 0,
        finalCapital: params.initialCapital, profit: 0, averageGain: 0, averageLoss: 0,
        maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0, successRate: 0
      };
    }
    console.info(`Retrieved ${stockData.length} data points for ${stockCode} for detailed analysis.`);

    // Generate trade history. Type assertion for stockData elements.
    const tradeHistory: TradeHistoryItem[] = await this.generateTradeHistory(stockData as any[], params);

    // Calculate capital evolution.
    const capitalEvolution: { date: string; capital: number }[] = this.calculateCapitalEvolution(tradeHistory, params.initialCapital);

    // Calculate performance metrics. Type assertion for stockData elements.
    const metrics = this.calculateDetailedMetrics(stockData as any[], tradeHistory, capitalEvolution, params);

    return {
      assetCode: stockCode,
      assetName: stockCode, // Ideally, fetch stock name if available, else use code.
      tradeHistory,
      capitalEvolution,
      ...metrics
    };
  }
};

// Export the API services
export const api = {
  auth,
  marketData,
  analysis
};

