// This is a service layer to interact with Supabase and process data

import {
  supabase,
  fromDynamic,
  MarketDataSource,
  StockRecord,
} from "@/integrations/supabase/client";
import {
  AnalysisResult,
  Asset,
  DetailedResult,
  StockAnalysisParams,
  StockInfo,
  User,
  TradeHistoryItem,
} from "@/types"; // Added TradeHistoryItem
import { formatDateToYYYYMMDD, getDateRangeForPeriod } from "@/utils/dateUtils";
import {
  AuthError,
  AuthResponse as SupabaseAuthResponse,
  User as SupabaseUser,
  Session as SupabaseSession,
} from "@supabase/supabase-js";

// Define more specific types for API responses
// --- Auth Service Types ---
export interface AuthResponse {
  user: SupabaseUser | null;
  session: SupabaseSession | null;
  error?: AuthError | null;
}

export interface RegisterResponse extends AuthResponse {
  success?: boolean;
}

export interface GoogleLoginResponse {
  provider?: string;
  url?: string | null;
  error?: AuthError | null;
}

// --- MarketData Service Types ---
/**
 * Represents a partial row from the 'market_data_sources' table,
 * used internally for functions that don't need all MarketDataSource fields.
 */
interface MarketDataSourceItem {
  country?: string;
  stock_market?: string;
  asset_class?: string;
  stock_table?: string;
  // Other fields from market_data_sources can be added if needed by specific functions
}

/**
 * Represents the structure of a market status object from the 'market_status' table.
 */
export interface MarketStatus {
  id: string; // Typically the market identifier, e.g., 'B3'
  status: string; // e.g., 'open', 'closed', 'holiday', 'pre-market', 'post-market'
  last_checked: string; // ISO date-time string of when the status was last updated
  // Add any other relevant fields from the market_status table like 'next_open', 'next_close'
}

// --- Analysis Service Types ---
/**
 * Represents the expected structure of a single item from the 'get_unique_stock_codes' RPC.
 */
interface RpcStockCodeItem {
  stock_code: string;
  // name?: string; // If the RPC could also return a name, add it here.
}

/**
 * Represents a single record of stock data fetched from dynamic tables.
 * This should include all possible fields that analysis functions might rely on.
 */
export interface StockDataRecord {
  date: string; // ISO date string (YYYY-MM-DD)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number; // Volume might be optional for some data sources
  stock_code: string; // Identifier for the stock
  [key: string]: any; // Allow other dynamic fields (e.g., moving averages from source)
}

/**
 * Authentication API service
 */
export const auth = {
  /**
   * Login with email and password
   * @param email User's email
   * @param password User's password
   * @returns A promise that resolves to an AuthResponse object
   * @throws Will throw an error if login fails or email is not confirmed.
   */
  async login(email: string, password: string): Promise<AuthResponse> {
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
      // Ensure the thrown error is an instance of Error
      if (error instanceof AuthError) {
        throw error;
      }
      throw new Error(String(error));
    }
  },

  /**
   * Register a new user.
   * Creates an auth user in Supabase and then attempts to insert user details into the public.users table.
   * If the user insertion into `public.users` fails, the error is logged, but the function
   * will still return the auth user data. This is because the primary registration (auth user)
   * was successful. The caller should handle cases where `success` is false or user details
   * might be missing.
   * @param email User's email
   * @param password User's password
   * @param fullName User's full name
   * @returns A promise that resolves to a RegisterResponse object.
   * @throws Will throw an error if Supabase auth registration fails.
   */
  async register(email: string, password: string, fullName: string): Promise<RegisterResponse> {
    try {
      console.log(`Attempting to register user with email: ${email}`);

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login?confirmation=true`,
          data: {
            full_name: fullName,
          },
        },
      });

      if (authError) {
        console.error("Registration auth error:", authError);
        throw authError;
      }

      console.log("Auth registration successful:", authData);

      let userInsertionSuccess = false;
      if (authData.user) {
        const { error: userError } = await supabase.from("users").insert([
          {
            id: authData.user.id,
            email: email,
            name: fullName,
            level_id: 1, // Default level_id
            status_users: "pending", // Default status
            created_at: new Date().toISOString(),
          },
        ]);

        if (userError) {
          console.error("User data insertion error into public.users:", userError);
          // Specific behavior: Log error but do not throw.
          // The auth user is created, so the registration is partially successful.
          // The caller can check the 'success' flag in the response.
          console.warn(
            "User created in auth but not in public.users table. This might require manual intervention or a retry mechanism for user data insertion."
          );
        } else {
          userInsertionSuccess = true;
          console.log("User registration successful in public.users table");
        }
      }

      return {
        user: authData.user,
        session: authData.session,
        success: userInsertionSuccess,
        error: authError, // Should be null if no authError occurred
      };
    } catch (error) {
      console.error("Registration failed:", error);
      if (error instanceof AuthError) {
        throw error;
      }
      throw new Error(String(error));
    }
  },

  /**
   * Send password reset email.
   * @param email User's email
   * @returns A promise that resolves when the email is sent.
   * @throws Will throw an error if sending the reset email fails.
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
      if (error instanceof AuthError) {
        throw error;
      }
      throw new Error(String(error));
    }
  },

  /**
   * Update user password.
   * @param newPassword The new password for the user.
   * @returns A promise that resolves when the password is updated.
   * @throws Will throw an error if updating the password fails.
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
      if (error instanceof AuthError) {
        throw error;
      }
      throw new Error(String(error));
    }
  },

  /**
   * Resend confirmation email.
   * @param email User's email for whom to resend the confirmation.
   * @returns A promise that resolves when the confirmation email is resent.
   * @throws Will throw an error if resending the email fails.
   */
  async resendConfirmationEmail(email: string): Promise<void> {
    try {
      console.log(`Resending confirmation email to: ${email}`);
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email,
        options: {
          emailRedirectTo: `${window.location.origin}/login?confirmation=true`,
        },
      });

      if (error) {
        console.error("Resend confirmation email error:", error);
        throw error;
      }

      console.log("Confirmation email resent successfully");
    } catch (error) {
      console.error("Resend confirmation email failed:", error);
      if (error instanceof AuthError) {
        throw error;
      }
      throw new Error(String(error));
    }
  },

  /**
   * Login with Google.
   * Initiates the OAuth flow for Google login.
   * @returns A promise that resolves to a GoogleLoginResponse object.
   * @throws Will throw an error if initiating Google login fails.
   */
  async googleLogin(): Promise<GoogleLoginResponse> {
    try {
      console.log("Attempting to login with Google");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/login?provider=google`,
        },
      });

      if (error) {
        console.error("Google login error:", error);
        throw error;
      }

      console.log("Google login initiated:", data);
      // data contains provider and url, which is what we need.
      return {
        provider: data.provider,
        url: data.url,
        error: null,
      };
    } catch (error) {
      console.error("Google login failed:", error);
      if (error instanceof AuthError) {
        throw error;
      }
      // Ensure a GoogleLoginResponse is returned even in case of other errors
      return { error: new AuthError(String(error)) };
    }
  },

  /**
   * Logout current user.
   * @returns A promise that resolves when the user is logged out.
   * @throws Will throw an error if logout fails.
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
      if (error instanceof AuthError) {
        throw error;
      }
      throw new Error(String(error));
    }
  },

  /**
   * Get current user data from the `public.users` table.
   * This function calls the `check_user_by_email` RPC in Supabase.
   * It's currently using `userId` (which is expected to be an email) as the `p_email` parameter.
   * This should be verified if `userId` here is indeed an email or if it's a UUID.
   * For now, assuming `userId` is an email as per the RPC name and parameter `p_email`.
   * @param userId The email of the user to fetch data for.
   * @returns A promise that resolves to a User object or null if not found or an error occurs.
   */
  async getUserData(userId: string): Promise<User | null> {
    try {
      console.log(`Getting user data for ID/email: ${userId}`); // Clarified log

      // The RPC 'check_user_by_email' expects an email.
      // If userId is a UUID, this call will not work as intended.
      // Adding a comment here to highlight this for review.
      // Assuming userId is an email for now.
      const { data, error } = await supabase.rpc("check_user_by_email", {
        p_email: userId,
      });

      if (error) {
        console.error("Get user data error from RPC check_user_by_email:", error);
        // Do not throw here, return null as per original behavior on error
        return null;
      }

      console.log("User data retrieved from RPC:", data);

      // The RPC `check_user_by_email` returns an array of user-like objects.
      // We need to robustly convert this to our `User` type.
      if (Array.isArray(data) && data.length > 0) {
        const rpcUserData = data[0];

        // Validate required fields before casting
        if (
          !rpcUserData ||
          typeof rpcUserData.id !== "string" ||
          typeof rpcUserData.email !== "string"
        ) {
          console.error("Fetched user data is missing required fields (id, email).", rpcUserData);
          return null;
        }

        return {
          id: rpcUserData.id,
          email: rpcUserData.email,
          full_name: rpcUserData.name || "", // Provide default if name is missing
          level_id: typeof rpcUserData.level_id === "number" ? rpcUserData.level_id : 0, // Default level_id
          status: rpcUserData.status_users || "unknown", // Default status
          // Ensure email_verified is a boolean
          email_verified:
            typeof rpcUserData.email_verified === "boolean" ? rpcUserData.email_verified : false,
          // account_type seems to be a client-side concept or missing from this RPC result
          account_type: "free", // Default as per original
          // created_at should be a valid date string
          created_at: rpcUserData.created_at || new Date().toISOString(),
          last_login: rpcUserData.last_login_at || null, // Assuming last_login_at from DB
        } as User; // Cast to User after ensuring fields
      }

      console.log("No user data found or RPC returned empty array.");
      return null;
    } catch (error) {
      console.error("Get user data failed:", error);
      // Ensure null is returned on any exception as per original behavior
      return null;
    }
  },

  /**
   * Update user status to active after email confirmation.
   * @param userId The ID of the user to confirm.
   * @returns A promise that resolves when the user status is updated.
   * @throws Will throw an error if the update fails.
   */
  async confirmUserEmail(userId: string): Promise<void> {
    try {
      console.log(`Confirming email for user ID: ${userId}`);
      const { error } = await supabase
        .from("users")
        .update({ status_users: "active" }) // Ensure this matches your DB schema
        .eq("id", userId);

      if (error) {
        console.error("Email confirmation error:", error);
        throw error; // Re-throw DB errors
      }

      console.log("Email confirmed successfully for user ID:", userId);
    } catch (error) {
      console.error("Email confirmation failed:", error);
      // Ensure the thrown error is an instance of Error
      if (error instanceof Error) {
        // Could be PostgrestError
        throw error;
      }
      throw new Error(String(error));
    }
  },
};

/**
 * Market Data API service for fetching market data.
 * This service interacts with the `market_data_sources` and `market_status` tables,
 * as well as dynamically named tables based on market data.
 */
const marketData = {
  /**
   * Get available countries with market data.
   * Fetches unique country names from the 'market_data_sources' table.
   * @returns A promise that resolves to an array of unique country names (string[]).
   *          Returns an empty array if an error occurs during fetching or if no data is found.
   *          Logs errors to the console.
   */
  async getCountries(): Promise<string[]> {
    try {
      // Query distinct countries from the market_data_sources table
      const { data, error } = await fromDynamic("market_data_sources")
        .select("country")
        .order("country");

      if (error) {
        console.error("Supabase error fetching countries:", error.message);
        // It's often better to throw the error or a custom error,
        // but current pattern is to return [] for graceful degradation.
        // throw new Error(`Failed to fetch countries: ${error.message}`);
        return [];
      }

      if (!data || !Array.isArray(data)) {
        console.warn("No data returned from countries query.");
        return [];
      }

      // Extract unique, non-null/undefined country names.
      // Using MarketDataSourceItem for better type safety than 'as any'.
      const countries = [
        ...new Set(
          data
            .map((item) => (item as MarketDataSourceItem).country)
            // Filter out any null, undefined, or empty string values after map.
            .filter(
              (country): country is string => typeof country === "string" && country.trim() !== ""
            )
        ),
      ];
      return countries;
    } catch (error) {
      // This catches errors from the Supabase client itself or unexpected issues.
      console.error("Failed to fetch countries due to an unexpected error:", error);
      return []; // Graceful failure: return empty array.
    }
  },

  /**
   * Get available stock markets for a given country.
   * Fetches unique stock market names from 'market_data_sources' for the specified country.
   * @param country The name of the country. Must be a non-empty string.
   * @returns A promise that resolves to an array of unique stock market names (string[]).
   *          Returns an empty array if the country is invalid, an error occurs, or no data is found.
   *          Logs errors to the console.
   */
  async getStockMarkets(country: string): Promise<string[]> {
    if (!country || typeof country !== "string" || country.trim() === "") {
      console.warn("getStockMarkets called with an invalid or empty country.");
      return [];
    }
    try {
      const { data, error } = await fromDynamic("market_data_sources")
        .select("stock_market")
        .eq("country", country)
        .order("stock_market");

      if (error) {
        console.error(`Supabase error fetching stock markets for ${country}:`, error.message);
        return [];
      }

      if (!data || !Array.isArray(data)) {
        console.warn(`No data returned for stock markets query for ${country}.`);
        return [];
      }

      const markets = [
        ...new Set(
          data
            .map((item) => (item as MarketDataSourceItem).stock_market)
            .filter(
              (market): market is string => typeof market === "string" && market.trim() !== ""
            )
        ),
      ];
      return markets;
    } catch (error) {
      console.error(`Failed to fetch stock markets for ${country}:`, error);
      return [];
    }
  },

  /**
   * Get available asset classes for a given country and stock market.
   * Fetches unique asset class names from 'market_data_sources'.
   * @param country The name of the country. Must be a non-empty string.
   * @param stockMarket The name of the stock market. Must be a non-empty string.
   * @returns A promise that resolves to an array of unique asset class names (string[]).
   *          Returns an empty array if parameters are invalid, an error occurs, or no data is found.
   *          Logs errors to the console.
   */
  async getAssetClasses(country: string, stockMarket: string): Promise<string[]> {
    if (
      !country ||
      typeof country !== "string" ||
      country.trim() === "" ||
      !stockMarket ||
      typeof stockMarket !== "string" ||
      stockMarket.trim() === ""
    ) {
      console.warn("getAssetClasses called with invalid or empty country or stockMarket.");
      return [];
    }
    try {
      const { data, error } = await fromDynamic("market_data_sources")
        .select("asset_class")
        .eq("country", country)
        .eq("stock_market", stockMarket)
        .order("asset_class");

      if (error) {
        console.error(
          `Supabase error fetching asset classes for ${country} - ${stockMarket}:`,
          error.message
        );
        return [];
      }

      if (!data || !Array.isArray(data)) {
        console.warn(`No data returned for asset classes query for ${country} - ${stockMarket}.`);
        return [];
      }

      const classes = [
        ...new Set(
          data
            .map((item) => (item as MarketDataSourceItem).asset_class)
            .filter(
              (assetClass): assetClass is string =>
                typeof assetClass === "string" && assetClass.trim() !== ""
            )
        ),
      ];
      return classes;
    } catch (error) {
      console.error(`Failed to fetch asset classes for ${country} - ${stockMarket}:`, error);
      return [];
    }
  },

  /**
   * Get the data table name for a specific market data source.
   * Fetches the 'stock_table' field from 'market_data_sources'.
   * @param country The country of the market. Must be a non-empty string.
   * @param stockMarket The stock market. Must be a non-empty string.
   * @param assetClass The asset class. Must be a non-empty string.
   * @returns A promise that resolves to the table name (string) or null if not found, parameters are invalid, or an error occurs.
   *          Logs errors to the console.
   */
  async getDataTableName(
    country: string,
    stockMarket: string,
    assetClass: string
  ): Promise<string | null> {
    if (
      !country ||
      typeof country !== "string" ||
      country.trim() === "" ||
      !stockMarket ||
      typeof stockMarket !== "string" ||
      stockMarket.trim() === "" ||
      !assetClass ||
      typeof assetClass !== "string" ||
      assetClass.trim() === ""
    ) {
      console.warn("getDataTableName called with invalid or empty parameters.");
      return null;
    }
    try {
      const { data, error } = await fromDynamic("market_data_sources")
        .select("stock_table")
        .eq("country", country)
        .eq("stock_market", stockMarket)
        .eq("asset_class", assetClass)
        .maybeSingle(); // Expects at most one row or null.

      if (error) {
        console.error("Supabase error fetching data table name:", error.message);
        return null; // Return null on error as per existing behavior.
      }

      // data is MarketDataSourceItem | null
      // Safely access stock_table.
      const tableName = (data as MarketDataSourceItem | null)?.stock_table;
      return tableName && typeof tableName === "string" && tableName.trim() !== ""
        ? tableName
        : null;
    } catch (error) {
      console.error("Failed to fetch data table name due to an unexpected error:", error);
      return null;
    }
  },

  /**
   * Check if the given table exists and is queryable in the database.
   * This method attempts a minimal query (SELECT with LIMIT 1) on the specified table.
   * A successful query (no error) implies existence and accessibility.
   * Note: This checks accessibility for the current Supabase role, not absolute existence.
   * @param tableName The name of the table to check. Must be a non-empty string.
   * @returns A promise that resolves to true if the table likely exists and is queryable, false otherwise.
   *          Logs errors to the console.
   */
  async checkTableExists(tableName: string): Promise<boolean> {
    if (!tableName || typeof tableName !== "string" || tableName.trim() === "") {
      console.warn("checkTableExists called with an invalid or empty tableName.");
      return false;
    }
    try {
      // Attempt to select a single column with limit 1.
      // If the table doesn't exist or isn't accessible, Supabase should return an error.
      const { error } = await fromDynamic(tableName)
        .select("id") // Assuming 'id' or any common column exists. Use '*' if unsure.
        .limit(1);

      // If 'error' is null, the query succeeded, meaning the table exists and is accessible.
      // Specific PostgreSQL error codes (e.g., '42P01' for undefined_table) can be checked in 'error.code'.
      if (error) {
        console.warn(
          `checkTableExists: Query failed for table '${tableName}'. Error: ${error.message}`
        );
        return false;
      }
      return true;
    } catch (err) {
      // This catch block handles unexpected errors from the fromDynamic call itself or other client-side issues.
      console.error(`Error during checkTableExists for table '${tableName}':`, err);
      return false;
    }
  },

  /**
   * Get market status by its ID from the 'market_status' table.
   * @param marketId The ID of the market status to fetch (e.g., 'B3'). Must be a non-empty string.
   * @returns A promise that resolves to a MarketStatus object or null if not found, marketId is invalid, or an error occurs.
   *          Logs errors to the console.
   */
  async getMarketStatus(marketId: string): Promise<MarketStatus | null> {
    if (!marketId || typeof marketId !== "string" || marketId.trim() === "") {
      console.warn("getMarketStatus called with an invalid or empty marketId.");
      return null;
    }
    try {
      const { data, error } = await fromDynamic("market_status")
        .select("*") // Fetches all columns, expecting them to match MarketStatus interface.
        .eq("id", marketId)
        .single(); // Expects exactly one row. Returns error if 0 or >1 rows.

      if (error) {
        // PostgrestError PGRST116: "JSON object requested, multiple (or no) rows returned"
        // This error code from Supabase/PostgREST indicates that no row was found (or more than one, though 'id' should be unique).
        if (error.code === "PGRST116") {
          console.warn(`Market status not found for ID: ${marketId}. (Error: ${error.message})`);
        } else {
          console.error(`Error fetching market status for ID ${marketId}:`, error.message);
        }
        return null; // Return null for "not found" or other database errors.
      }

      // Data should conform to MarketStatus. Add runtime validation if necessary.
      return data as MarketStatus;
    } catch (err) {
      console.error(
        `Failed to fetch market status for ID ${marketId} due to an unexpected error:`,
        err
      );
      return null;
    }
  },

  /**
   * Get all market data sources from the 'market_data_sources' table.
   * @returns A promise that resolves to an array of MarketDataSource objects.
   *          Returns an empty array if an error occurs or no data is found.
   *          Logs errors to the console.
   */
  async getAllMarketDataSources(): Promise<MarketDataSource[]> {
    try {
      const { data, error } = await fromDynamic("market_data_sources")
        .select("*") // Selects all columns, assuming they match the MarketDataSource type.
        .order("country"); // Default ordering.

      if (error) {
        console.error("Error fetching all market data sources:", error.message);
        // Consider if re-throwing is more appropriate for critical data.
        // For now, returning empty array on error.
        return [];
      }

      // 'data' from Supabase can be null if no rows are found.
      // The cast 'as MarketDataSource[]' assumes the DB schema matches the TS type.
      // Runtime validation (e.g., with Zod) would be safer for complex objects.
      return data || [];
    } catch (err) {
      console.error("Failed to fetch all market data sources due to an unexpected error:", err);
      return [];
    }
  },

  /**
   * Get market data sources for a specific country.
   * @param country The name of the country. Must be a non-empty string.
   * @returns A promise that resolves to an array of MarketDataSource objects for the given country.
   *          Returns an empty array if the country is invalid, an error occurs, or no data is found.
   *          Logs errors to the console.
   */
  async getMarketDataSourcesByCountry(country: string): Promise<MarketDataSource[]> {
    if (!country || typeof country !== "string" || country.trim() === "") {
      console.warn("getMarketDataSourcesByCountry called with an invalid or empty country.");
      return [];
    }
    try {
      const { data, error } = await fromDynamic("market_data_sources")
        .select("*")
        .eq("country", country)
        .order("stock_market");

      if (error) {
        console.error(`Error fetching market data sources for country ${country}:`, error.message);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error(`Failed to fetch market data sources for country ${country}:`, err);
      return [];
    }
  },

  /**
   * Get market data sources for a specific country and stock market.
   * @param country The name of the country. Must be a non-empty string.
   * @param stockMarket The name of the stock market. Must be a non-empty string.
   * @returns A promise that resolves to an array of MarketDataSource objects.
   *          Returns an empty array if parameters are invalid, an error occurs, or no data is found.
   *          Logs errors to the console.
   */
  async getMarketDataSourcesByCountryAndStockMarket(
    country: string,
    stockMarket: string
  ): Promise<MarketDataSource[]> {
    if (
      !country ||
      typeof country !== "string" ||
      country.trim() === "" ||
      !stockMarket ||
      typeof stockMarket !== "string" ||
      stockMarket.trim() === ""
    ) {
      console.warn(
        "getMarketDataSourcesByCountryAndStockMarket called with invalid or empty parameters."
      );
      return [];
    }
    try {
      const { data, error } = await fromDynamic("market_data_sources")
        .select("*")
        .eq("country", country)
        .eq("stock_market", stockMarket)
        .order("asset_class");

      if (error) {
        console.error(
          `Error fetching market data sources for ${country} - ${stockMarket}:`,
          error.message
        );
        return [];
      }

      return data || [];
    } catch (err) {
      console.error(`Failed to fetch market data sources for ${country} - ${stockMarket}:`, err);
      return [];
    }
  },
};

/**
 * Stock Analysis API service.
 * Provides functions to fetch stock data, run analysis, and generate trading signals.
 */
const analysis = {
  /**
   * Get a list of available stocks (unique stock codes) for a specific data table.
   * It first tries to use the 'get_unique_stock_codes' RPC and falls back to a direct query.
   * @param tableName The name of the data table (e.g., 'br_stocks_daily'). Must be a non-empty string.
   * @returns A promise that resolves to an array of StockInfo objects.
   *          Returns an empty array if the table name is invalid, an error occurs, or no stocks are found.
   *          Logs errors to the console.
   */
  async getAvailableStocks(tableName: string): Promise<StockInfo[]> {
    if (!tableName || typeof tableName !== "string" || tableName.trim() === "") {
      console.warn("getAvailableStocks called with an invalid or empty tableName.");
      return [];
    }

    try {
      console.log(`Getting available stocks from table: ${tableName} using RPC.`);

      const { data: rpcData, error: rpcError } = await supabase.rpc("get_unique_stock_codes", {
        p_table_name: tableName,
      });

      if (rpcError) {
        console.error(
          `Error calling RPC 'get_unique_stock_codes' for table ${tableName}: ${rpcError.message}. Falling back to direct query.`
        );
        // Fallback to direct table query if the RPC fails
        return await this.getAvailableStocksDirect(tableName);
      }

      // The RPC is expected to return an array of objects like { stock_code: 'XYZ' } or simple strings.
      // The RpcStockCodeItem type helps handle this.
      const rpcResult = rpcData as RpcStockCodeItem[] | string[];

      if (!rpcResult || !Array.isArray(rpcResult) || rpcResult.length === 0) {
        console.warn(
          `No stock codes returned from RPC for table ${tableName}. Falling back to direct query.`
        );
        return await this.getAvailableStocksDirect(tableName);
      }

      console.log(`Found ${rpcResult.length} unique stock codes via RPC for table ${tableName}.`);

      const stocks: StockInfo[] = rpcResult
        .map((item) => {
          const stockCode =
            typeof item === "object" && item !== null && "stock_code" in item
              ? String((item as RpcStockCodeItem).stock_code)
              : String(item);
          return {
            code: stockCode,
            name: stockCode, // Use code as name if no other name source is available from RPC
          };
        })
        .filter((stock) => stock.code.trim() !== ""); // Ensure stock code is not empty

      return [...new Map(stocks.map((stock) => [stock.code, stock])).values()]; // Ensure uniqueness by code
    } catch (error) {
      // Catches unexpected errors
      console.error(`Failed to get available stocks for ${tableName}:`, error);
      // Attempt fallback one last time in case of unexpected error in primary try block
      try {
        return await this.getAvailableStocksDirect(tableName);
      } catch (directQueryError) {
        console.error(`Fallback direct query also failed for ${tableName}:`, directQueryError);
        return [];
      }
    }
  },

  /**
   * Fallback method to get unique stock codes directly from the specified table.
   * This is used if the RPC method in getAvailableStocks fails.
   * @param tableName The name of the data table. Must be a non-empty string.
   * @returns A promise that resolves to an array of StockInfo objects.
   *          Returns an empty array on error or if no stocks are found.
   *          Logs errors to the console.
   * @internal
   */
  async getAvailableStocksDirect(tableName: string): Promise<StockInfo[]> {
    if (!tableName || typeof tableName !== "string" || tableName.trim() === "") {
      console.warn("getAvailableStocksDirect called with an invalid or empty tableName.");
      return [];
    }
    try {
      console.log(`Trying direct query to get stock codes from ${tableName}.`);

      // Selecting only 'stock_code' and applying a limit for performance.
      // The actual uniqueness will be handled client-side.
      const { data, error } = await fromDynamic(tableName)
        .select("stock_code") // Only select the stock_code column
        .limit(2000); // Increased limit, but be mindful of performance on very large tables.

      if (error) {
        console.error(`Error in direct stock code query for table ${tableName}: ${error.message}`);
        // Do not re-throw here; let the calling function handle this as a failed fallback.
        return [];
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        console.warn(`No stock codes found in table ${tableName} via direct query.`);
        return [];
      }

      // Extract unique, non-null, and non-empty stock codes.
      const uniqueCodes = new Set<string>();
      data.forEach((item) => {
        // Ensure item is an object and has a stock_code property.
        if (item && typeof item === "object" && "stock_code" in item) {
          const stockCode = String((item as { stock_code: any }).stock_code);
          if (stockCode.trim() !== "") {
            uniqueCodes.add(stockCode);
          }
        }
      });

      const stocks: StockInfo[] = Array.from(uniqueCodes).map((code) => ({
        code: code,
        name: code, // Using stock_code as name as 'name' column isn't guaranteed here.
      }));

      console.log(`Direct query found ${stocks.length} unique stock codes in table ${tableName}.`);
      return stocks;
    } catch (error) {
      // Catches unexpected errors
      console.error(`Failed in direct stock query for ${tableName}:`, error);
      return [];
    }
  },

  /**
   * Get historical stock data for a specific stock code from a given table.
   * Can filter by period or limit the number of records.
   * @param tableName The data table name. Must be a non-empty string.
   * @param stockCode The stock code. Must be a non-empty string.
   * @param period Optional period string (e.g., '1M', '1Y') to define date range.
   * @param limit The maximum number of records to return if period is not specified (default: 300).
   * @returns A promise that resolves to an array of StockDataRecord objects.
   *          Returns an empty array if parameters are invalid, an error occurs, or no data is found.
   *          Logs errors to the console.
   */
  async getStockData(
    tableName: string,
    stockCode: string,
    period: string | undefined = undefined,
    limit = 300
  ): Promise<StockDataRecord[]> {
    if (
      !tableName ||
      typeof tableName !== "string" ||
      tableName.trim() === "" ||
      !stockCode ||
      typeof stockCode !== "string" ||
      stockCode.trim() === ""
    ) {
      console.warn("getStockData called with invalid or empty tableName or stockCode.");
      return [];
    }
    if (typeof limit !== "number" || limit <= 0) {
      console.warn(`getStockData: Invalid limit value ${limit}. Using default of 300.`);
      limit = 300;
    }

    try {
      if (period && typeof period === "string" && period.trim() !== "") {
        const dateRange = getDateRangeForPeriod(period);
        console.info(
          `Getting stock data for ${stockCode} from ${tableName} with period ${period} (${dateRange.startDate} to ${dateRange.endDate})`
        );
        return await this.getStockDataDirectWithPeriod(
          tableName,
          stockCode,
          dateRange.startDate,
          dateRange.endDate
        );
      } else {
        console.info(`Getting stock data for ${stockCode} from ${tableName} with limit: ${limit}`);
        return await this.getStockDataDirect(tableName, stockCode, limit);
      }
    } catch (error) {
      // Should ideally be caught by helper functions
      console.error(`Failed to get stock data for ${stockCode} from ${tableName}:`, error);
      return [];
    }
  },

  /**
   * Fetches stock data directly from the table, ordered by date descending, limited by `limit`.
   * @param tableName The data table name.
   * @param stockCode The stock code.
   * @param limit The maximum number of records.
   * @returns A promise that resolves to an array of StockDataRecord objects, sorted ascending by date.
   *          Returns an empty array on error or if no data.
   * @internal
   */
  async getStockDataDirect(
    tableName: string,
    stockCode: string,
    limit = 300
  ): Promise<StockDataRecord[]> {
    // Input validation for tableName and stockCode should be done by the public calling function.
    try {
      console.log(
        `Querying direct stock data for ${stockCode} from ${tableName} with limit ${limit}.`
      );

      const { data, error } = await fromDynamic(tableName)
        .select("*") // Select all columns, assuming they match StockDataRecord or are handled.
        .eq("stock_code", stockCode)
        .order("date", { ascending: false }) // Get latest data first for limit behavior
        .limit(limit);

      if (error) {
        console.error(
          `Error in direct stock data query (limit) for ${stockCode} in ${tableName}: ${error.message}`
        );
        return []; // Return empty on error.
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        console.warn(`No data found for ${stockCode} in table ${tableName} with limit ${limit}.`);
        return [];
      }
      // Data is fetched in descending order due to limit, so reverse to make it ascending for analysis.
      // Ensure data conforms to StockDataRecord. Add runtime validation if schema is uncertain.
      return (data as StockDataRecord[]).reverse();
    } catch (error) {
      // Catches unexpected errors
      console.error(
        `Unexpected error in getStockDataDirect for ${stockCode} from ${tableName}:`,
        error
      );
      return [];
    }
  },

  /**
   * Fetches stock data directly from the table, filtered by a date range, ordered by date ascending.
   * @param tableName The data table name.
   * @param stockCode The stock code.
   * @param startDate The start date for filtering (YYYY-MM-DD).
   * @param endDate The end date for filtering (YYYY-MM-DD).
   * @returns A promise that resolves to an array of StockDataRecord objects.
   *          Returns an empty array on error or if no data.
   * @internal
   */
  async getStockDataDirectWithPeriod(
    tableName: string,
    stockCode: string,
    startDate: string,
    endDate: string
  ): Promise<StockDataRecord[]> {
    // Input validation for tableName, stockCode, startDate, endDate should be by public calling function or robustly handled.
    try {
      console.info(
        `Fetching stock data for ${stockCode} from ${tableName} between ${startDate} and ${endDate}.`
      );

      const { data, error } = await fromDynamic(tableName)
        .select("*")
        .eq("stock_code", stockCode)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true }); // Ascending order for chronological processing.

      if (error) {
        console.error(
          `Error in period-filtered stock data query for ${stockCode} in ${tableName}: ${error.message}`
        );
        return [];
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        console.warn(
          `No data found for ${stockCode} in table ${tableName} for period ${startDate}-${endDate}.`
        );
        return [];
      }

      console.info(
        `Found ${data.length} records for ${stockCode} in ${tableName} for period ${startDate}-${endDate}.`
      );
      // Ensure data conforms to StockDataRecord.
      return data as StockDataRecord[];
    } catch (error) {
      // Catches unexpected errors
      console.error(
        `Unexpected error in getStockDataDirectWithPeriod for ${stockCode} from ${tableName}:`,
        error
      );
      return [];
    }
  },

  // --- Start: Functions copied from api-18.ts --- (These will be refactored in subsequent steps)

  /**
   * Run stock analysis with given parameters.
   * This function orchestrates fetching stock data, generating trade history, and calculating metrics.
   * @param params Parameters for the stock analysis, including market, asset, and strategy settings.
   * @param progressCallback Optional callback function to report analysis progress (0-100).
   * @returns A promise that resolves to an array of AnalysisResult objects, sorted by profit percentage.
   *          Returns an empty array if essential data (like table name or stocks) cannot be fetched.
   * @throws Throws an error if critical setup (like fetching data table name) fails.
   */
  async runAnalysis(
    params: StockAnalysisParams,
    progressCallback?: (progress: number) => void
  ): Promise<AnalysisResult[]> {
    // Validate essential parameters
    if (!params || !params.country || !params.stockMarket || !params.assetClass) {
      console.error("runAnalysis: Missing critical parameters (country, stockMarket, assetClass).");
      throw new Error("runAnalysis: Missing critical parameters for market identification.");
    }
    // Further validation of numerical params in StockAnalysisParams can be added here or when they are used.

    try {
      console.info("Running analysis with parameters:", params);

      let currentProgress = 0;
      const updateProgress = (increment: number) => {
        currentProgress += increment;
        if (progressCallback) {
          progressCallback(Math.min(Math.max(currentProgress, 0), 100));
        }
      };

      let tableName = params.dataTableName;
      if (!tableName) {
        tableName = await marketData.getDataTableName(
          params.country,
          params.stockMarket,
          params.assetClass
        );
        if (!tableName) {
          console.error(
            `Could not determine data table name for ${params.country}, ${params.stockMarket}, ${params.assetClass}.`
          );
          throw new Error("Could not determine data table name. Analysis cannot proceed.");
        }
        // Optionally update params.dataTableName if it's mutable and meant to be stored.
      }
      updateProgress(10); // Progress after getting table name

      const stocks = await this.getAvailableStocks(tableName);
      if (!stocks || stocks.length === 0) {
        console.warn(`No stocks found for table ${tableName}. Analysis cannot proceed.`);
        updateProgress(90); // Jump progress to 100 if no stocks
        return [];
      }
      console.info(`Found ${stocks.length} stocks for analysis in table ${tableName}.`);
      updateProgress(10); // Progress after getting stocks (total 20)

      const results: AnalysisResult[] = [];
      const stocksToProcess =
        params.comparisonStocks && params.comparisonStocks.length > 0
          ? stocks.filter((s) => params.comparisonStocks!.includes(s.code))
          : stocks;

      const progressPerStock = stocksToProcess.length > 0 ? 70 / stocksToProcess.length : 0;

      for (let i = 0; i < stocksToProcess.length; i++) {
        const stock = stocksToProcess[i];
        console.info(`Processing stock ${i + 1}/${stocksToProcess.length}: ${stock.code}`);

        try {
          const stockData = await this.getStockData(
            tableName,
            stock.code,
            params.period // Pass period for date filtering
          );

          if (!stockData || stockData.length === 0) {
            console.warn(`No data found for stock ${stock.code} in table ${tableName}, skipping.`);
            updateProgress(progressPerStock); // Still update progress
            continue;
          }

          // Ensure stockData is StockDataRecord[]
          const tradeHistory = await this.generateTradeHistory(
            stockData as StockDataRecord[],
            params
          );
          if (!tradeHistory || tradeHistory.length === 0) {
            console.warn(`No trade history generated for ${stock.code}, skipping.`);
            updateProgress(progressPerStock);
            continue;
          }

          const capitalEvolution = this.calculateCapitalEvolution(
            tradeHistory,
            params.initialCapital
          );
          // Ensure stockData is StockDataRecord[] for calculateDetailedMetrics
          const metrics = this.calculateDetailedMetrics(
            stockData as StockDataRecord[],
            tradeHistory,
            capitalEvolution,
            params
          );

          results.push({
            assetCode: stock.code,
            assetName: stock.name || stock.code, // Use stock name if available
            lastCurrentCapital:
              capitalEvolution.length > 0
                ? capitalEvolution[capitalEvolution.length - 1].capital
                : params.initialCapital,
            ...metrics,
          });
        } catch (e: any) {
          // Catch errors during individual stock processing
          console.error(`Error analyzing stock ${stock.code}: ${e.message}`, e);
          // Optionally, add a partial error result to 'results' if needed.
        } finally {
          updateProgress(progressPerStock); // Update progress regardless of individual error
        }
      }

      results.sort((a, b) => b.profitPercentage - a.profitPercentage);
      updateProgress(10); // Final 10% for sorting and completion
      console.info("Analysis run completed.");
      return results;
    } catch (error: any) {
      // Catch errors in the main setup (e.g., getting table name)
      console.error(`Failed to run analysis: ${error.message}`, error);
      // Re-throw critical errors or return empty array if preferred by calling UI
      throw error;
    }
  },

  /**
   * Generate trade history for a stock based on its data and analysis parameters.
   * @param stockData An array of StockDataRecord for a single stock, sorted chronologically (ascending by date).
   * @param params The parameters for the analysis, including strategy settings.
   * @returns A promise that resolves to an array of TradeHistoryItem objects.
   *          Returns an empty array if input is invalid or no trades are generated.
   *          Logs warnings or errors to the console.
   * @remarks This function contains complex trading logic. Ensure parameters are validated before calling.
   *          The `actualPrice` in TradeHistoryItem can be a number or '-' (string).
   */
  async generateTradeHistory(
    stockData: StockDataRecord[],
    params: StockAnalysisParams
  ): Promise<TradeHistoryItem[]> {
    // Basic input validation
    if (!stockData || stockData.length === 0) {
      console.warn("generateTradeHistory: stockData is empty or invalid.");
      return [];
    }
    if (
      !params ||
      typeof params.initialCapital !== "number" ||
      typeof params.entryPercentage !== "number" ||
      typeof params.stopPercentage !== "number" ||
      !params.referencePrice ||
      !params.operation
    ) {
      console.error(
        "generateTradeHistory: Missing or invalid strategy parameters in StockAnalysisParams."
      );
      return [];
    }

    const tradeHistory: TradeHistoryItem[] = [];
    let capital = params.initialCapital;

    // Data should already be sorted chronologically by getStockData
    // const sortedData = [...stockData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedData = stockData; // Assuming it's pre-sorted

    console.info(
      `Generating trade history for ${sortedData.length} days of stock data for stock: ${sortedData[0]?.stock_code}`
    );

    for (let i = 0; i < sortedData.length; i++) {
      const currentData = sortedData[i];
      const previousData = i > 0 ? sortedData[i - 1] : null;

      const previousCapital =
        i > 0 && tradeHistory[i - 1]
          ? (tradeHistory[i - 1].currentCapital ?? params.initialCapital)
          : params.initialCapital;

      // Ensure referencePrice field exists and is a number
      const refPriceField = params.referencePrice as keyof StockDataRecord;
      let referencePriceValue: number;

      if (previousData && typeof previousData[refPriceField] === "number") {
        referencePriceValue = previousData[refPriceField] as number;
      } else if (typeof currentData[refPriceField] === "number") {
        // Fallback to current day's reference price if previous day's is not available or invalid
        referencePriceValue = currentData[refPriceField] as number;
      } else {
        console.warn(
          `generateTradeHistory: Valid referencePrice ('${String(refPriceField)}') not found for date ${currentData.date}, stock ${currentData.stock_code}. Skipping day.`
        );
        // Push a minimal entry to maintain array length if necessary, or simply skip
        tradeHistory.push({
          date: currentData.date,
          entryPrice: currentData.open,
          exitPrice: currentData.close,
          high: currentData.high,
          low: currentData.low,
          volume: currentData.volume,
          suggestedEntryPrice: 0,
          actualPrice: "-",
          trade: "-",
          lotSize: 0,
          stopPrice: "-",
          stopTrigger: "-",
          profitLoss: 0,
          currentCapital: previousCapital, // Capital carries over
        });
        continue;
      }

      let suggestedEntryPrice: number;
      if (params.operation === "buy") {
        suggestedEntryPrice =
          referencePriceValue - (referencePriceValue * params.entryPercentage) / 100;
      } else {
        // 'sell'
        suggestedEntryPrice =
          referencePriceValue + (referencePriceValue * params.entryPercentage) / 100;
      }

      let actualPrice: number | "-" = "-"; // Use union type for clarity
      if (currentData.open <= suggestedEntryPrice && params.operation === "buy") {
        actualPrice = currentData.open;
      } else if (
        currentData.open > suggestedEntryPrice &&
        suggestedEntryPrice >= currentData.low &&
        params.operation === "buy"
      ) {
        actualPrice = suggestedEntryPrice;
      } else if (currentData.open >= suggestedEntryPrice && params.operation === "sell") {
        actualPrice = currentData.open;
      } else if (
        currentData.open < suggestedEntryPrice &&
        suggestedEntryPrice <= currentData.high &&
        params.operation === "sell"
      ) {
        actualPrice = suggestedEntryPrice;
      }

      const lotSize =
        actualPrice !== "-" && previousCapital > 0 && actualPrice > 0
          ? Math.floor(previousCapital / actualPrice / 10) * 10
          : 0;

      let tradeType: TradeHistoryItem["trade"] = "-";
      if (lotSize > 0 && actualPrice !== "-") {
        // A trade can only occur if lotSize > 0
        if (params.operation === "buy") {
          tradeType =
            actualPrice <= suggestedEntryPrice || currentData.low <= suggestedEntryPrice
              ? "Buy"
              : "-";
        } else {
          // 'sell'
          tradeType =
            actualPrice >= suggestedEntryPrice || currentData.high >= suggestedEntryPrice
              ? "Sell"
              : "-";
        }
      }

      let stopPrice: number | "-" = "-";
      if (tradeType !== "-" && actualPrice !== "-") {
        stopPrice =
          params.operation === "buy"
            ? actualPrice - (actualPrice * params.stopPercentage) / 100
            : actualPrice + (actualPrice * params.stopPercentage) / 100;
      }

      let stopTrigger: TradeHistoryItem["stopTrigger"] = "-";
      if (tradeType !== "-" && stopPrice !== "-" && actualPrice !== "-") {
        if (params.operation === "buy" && currentData.low <= stopPrice) {
          stopTrigger = "Executed";
        } else if (params.operation === "sell" && currentData.high >= stopPrice) {
          stopTrigger = "Executed";
        }
      }

      let profitLoss = 0;
      if (tradeType !== "-" && actualPrice !== "-") {
        const exitPriceForCalc =
          stopTrigger === "Executed" && stopPrice !== "-" ? stopPrice : currentData.close;
        profitLoss =
          params.operation === "buy"
            ? (exitPriceForCalc - actualPrice) * lotSize
            : (actualPrice - exitPriceForCalc) * lotSize;
      }

      capital = Math.max(0, previousCapital + profitLoss);

      tradeHistory.push({
        date: currentData.date,
        entryPrice: currentData.open,
        exitPrice: currentData.close,
        high: currentData.high,
        low: currentData.low,
        volume: currentData.volume,
        suggestedEntryPrice,
        actualPrice,
        trade: tradeType,
        lotSize,
        stopPrice,
        stopTrigger,
        profitLoss,
        currentCapital: capital,
      });
    }

    console.info(
      `Generated ${tradeHistory.length} trade history entries for stock: ${sortedData[0]?.stock_code}.`
    );
    return tradeHistory;
  },

  /**
   * Calculate capital evolution based on trade history.
   * @param tradeHistory An array of TradeHistoryItem objects.
   * @param initialCapital The starting capital amount.
   * @returns An array of objects representing capital at different dates.
   *          Returns a single point with initial capital if trade history is empty.
   *          The returned array represents points where capital changed or at period boundaries.
   */
  calculateCapitalEvolution(
    tradeHistory: TradeHistoryItem[],
    initialCapital: number
  ): { date: string; capital: number }[] {
    // If tradeHistory is empty, return initial capital at a generic "current" date.
    if (!tradeHistory || tradeHistory.length === 0) {
      return [{ date: formatDateToYYYYMMDD(new Date()), capital: initialCapital }];
    }

    const evolution: { date: string; capital: number }[] = [];

    // Start with initial capital. Use the date of the first trade.
    // It's crucial that tradeHistory is sorted by date.
    const firstTradeDate = tradeHistory[0].date;
    // Ensure a valid date string for the first point.
    evolution.push({
      date: firstTradeDate || formatDateToYYYYMMDD(new Date()),
      capital: initialCapital,
    });

    let lastRecordedCapital = initialCapital;

    for (const trade of tradeHistory) {
      // Ensure currentCapital is a number; fallback to lastRecordedCapital if undefined/null.
      const dayCapital =
        typeof trade.currentCapital === "number" ? trade.currentCapital : lastRecordedCapital;

      // If the date is the same as the last entry in evolution, update that entry's capital.
      // This ensures that for a given date, we store the end-of-day capital.
      if (evolution.length > 0 && evolution[evolution.length - 1].date === trade.date) {
        evolution[evolution.length - 1].capital = dayCapital;
      } else {
        // If it's a new date, add a new point to the evolution.
        evolution.push({ date: trade.date, capital: dayCapital });
      }
      lastRecordedCapital = dayCapital;
    }

    // The loop structure should correctly capture the EOD capital for each distinct date
    // where a trade occurred or capital was updated. No further deduplication is strictly necessary
    // if tradeHistory items are processed chronologically and represent daily states.
    return evolution;
  },

  /**
   * Calculate detailed metrics based on trade history and stock data.
   * @param stockData An array of StockDataRecord for the asset.
   * @param tradeHistory An array of TradeHistoryItem for the asset.
   * @param capitalEvolution An array representing capital evolution over time.
   * @param params The analysis parameters, including initial capital.
   * @returns An object containing various calculated performance metrics.
   * @remarks Ensure stockData is properly typed as StockDataRecord[].
   */
  calculateDetailedMetrics(
    stockData: StockDataRecord[],
    tradeHistory: TradeHistoryItem[],
    capitalEvolution: { date: string; capital: number }[],
    params: StockAnalysisParams
  ): Omit<DetailedResult, "assetCode" | "assetName" | "tradeHistory" | "capitalEvolution"> {
    // Return only metrics
    // Validate inputs
    if (!stockData) {
      console.warn(
        "calculateDetailedMetrics: stockData is null/undefined. Metrics will be zero or default."
      );
      stockData = []; // Ensure it's an array to prevent errors in .map or .length
    }
    if (!tradeHistory) tradeHistory = [];
    if (!capitalEvolution) capitalEvolution = [];
    if (!params) {
      console.error("calculateDetailedMetrics: params is undefined. Cannot calculate metrics.");
      // Return a zeroed-out structure for all metrics if params are missing.
      return {
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
      };
    }

    const tradingDays = stockData.length > 0 ? new Set(stockData.map((item) => item.date)).size : 0;
    const executedTrades = tradeHistory.filter(
      (trade) => trade.trade === "Buy" || trade.trade === "Sell"
    );
    const trades = executedTrades.length;

    const profitsCount = executedTrades.filter((trade) => (trade.profitLoss ?? 0) > 0).length;
    const lossesCount = executedTrades.filter(
      (trade) => (trade.profitLoss ?? 0) < 0 && trade.stopTrigger !== "Executed"
    ).length;
    const stopsCount = executedTrades.filter((trade) => trade.stopTrigger === "Executed").length;

    let sumOfPositiveProfitLoss = 0;
    let sumOfNegativeProfitLoss = 0;

    executedTrades.forEach((trade) => {
      const pl = trade.profitLoss ?? 0; // Default to 0 if profitLoss is null or undefined
      if (pl > 0) {
        sumOfPositiveProfitLoss += pl;
      } else if (pl < 0) {
        sumOfNegativeProfitLoss += pl;
      }
    });

    const tradePercentage = tradingDays > 0 ? (trades / tradingDays) * 100 : 0;
    const profitRate = trades > 0 ? (profitsCount / trades) * 100 : 0;
    const lossRate = trades > 0 ? (lossesCount / trades) * 100 : 0;
    const stopRate = trades > 0 ? (stopsCount / trades) * 100 : 0;

    const finalCapital =
      capitalEvolution.length > 0
        ? (capitalEvolution[capitalEvolution.length - 1].capital ?? params.initialCapital)
        : params.initialCapital;

    const netProfit = finalCapital - params.initialCapital;

    const averageGain = profitsCount > 0 ? sumOfPositiveProfitLoss / profitsCount : 0;

    // Number of trades that resulted in a loss (including stops that were losses)
    const numberOfLossMakingTrades = executedTrades.filter((t) => (t.profitLoss ?? 0) < 0).length;
    const averageLoss =
      numberOfLossMakingTrades > 0
        ? Math.abs(sumOfNegativeProfitLoss / numberOfLossMakingTrades)
        : 0;

    let maxDrawdown = 0;
    let peakCapital = params.initialCapital;

    // Use a temporary evolution array starting with initial capital for drawdown calculation
    const evolutionForDrawdownCalc = [
      { date: "", capital: params.initialCapital },
      ...capitalEvolution,
    ];

    evolutionForDrawdownCalc.forEach((point) => {
      const currentCapitalPoint = Number(point.capital);
      if (isNaN(currentCapitalPoint)) {
        console.warn(
          `Invalid capital point ${point.capital} on ${point.date} during drawdown calculation.`
        );
        return; // Skip this point
      }

      if (currentCapitalPoint > peakCapital) {
        peakCapital = currentCapitalPoint;
      }
      // Drawdown is calculated relative to the current peak.
      const drawdown = peakCapital > 0 ? (peakCapital - currentCapitalPoint) / peakCapital : 0;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    });
    maxDrawdown *= 100; // Express as percentage

    // Placeholder values for ratios that require more complex calculations (e.g., risk-free rate, std dev of returns)
    const sharpeRatio = 0;
    const sortinoRatio = 0;

    // Recovery Factor: Net Profit / Absolute Max Drawdown Value
    // Absolute Max Drawdown Value is the actual currency amount of the largest peak-to-trough decline.
    // peakCapital here refers to the all-time peak during the period.
    // maxDrawdown (as a percentage) is relative to the peak *at the time of the drawdown*.
    // For a more standard definition, max drawdown value = peakCapital * maxDrawdown (percentage).
    // However, if peakCapital is updated *after* a drawdown, this might not be the "largest drop from any peak".
    // A common way: Max Drawdown Value = Peak Capital encountered before the trough - Trough Capital
    // The current 'maxDrawdown' percentage is the highest percentage drop from ANY peak.
    // So, Max Drawdown Value (absolute) = params.initialCapital * (maxDrawdown / 100) if drawdown is relative to initial capital,
    // or if it's relative to the peak that preceded the max drawdown, then that peak * (maxDrawdown/100).
    // Let's assume maxDrawdown percentage is the one we calculated (largest % drop from a peak).
    // The value of the drawdown would be that percentage of the peak *from which it fell*.
    // This is complex. For simplicity, if netProfit is 0 and maxDrawdown is 0, recoveryFactor is 0 or undefined.
    // If netProfit > 0 and maxDrawdown == 0, it implies infinite recovery or perfect run.
    let recoveryFactor = 0;
    if (maxDrawdown > 0) {
      // This assumes maxDrawdown percentage is of initialCapital, which is a simplification.
      // A more accurate max drawdown value would be needed for a robust recovery factor.
      const absoluteMaxDrawdownValue = params.initialCapital * (maxDrawdown / 100);
      if (absoluteMaxDrawdownValue > 0) {
        recoveryFactor = netProfit / absoluteMaxDrawdownValue;
      }
    } else if (netProfit > 0) {
      recoveryFactor = Infinity; // Positive profit with no drawdown
    }

    const successRate = trades > 0 ? (profitsCount / trades) * 100 : 0;

    return {
      tradingDays,
      trades,
      tradePercentage,
      profits: profitsCount,
      profitPercentage: profitRate,
      losses: lossesCount,
      lossPercentage: lossRate,
      stops: stopsCount,
      stopPercentage: stopRate,
      finalCapital,
      profit: netProfit,
      averageGain,
      averageLoss,
      maxDrawdown,
      sharpeRatio,
      sortinoRatio,
      recoveryFactor,
      successRate,
    };
  },

  /**
   * Get detailed analysis for a specific stock, including trade history, capital evolution, and metrics.
   * @param stockCode The stock code for which to get detailed analysis. Must be a non-empty string.
   * @param params Parameters for the stock analysis, including market identification and strategy settings.
   * @returns A promise that resolves to a DetailedResult object.
   *          Returns a default/empty structure if critical data (like stock data) is missing.
   * @throws Throws an error if essential parameters (like market identifiers in `params`) are missing or if the data table name cannot be determined.
   */
  async getDetailedAnalysis(
    stockCode: string,
    params: StockAnalysisParams
  ): Promise<DetailedResult> {
    // --- Input Validation ---
    if (!stockCode || typeof stockCode !== "string" || stockCode.trim() === "") {
      console.error("getDetailedAnalysis: stockCode is invalid or empty.");
      // Return a default structure. Ensure params.initialCapital is accessible or provide a fallback.
      const initialCapital = params?.initialCapital ?? 0;
      return {
        assetCode: stockCode || "UNKNOWN",
        assetName: stockCode || "Unknown",
        tradeHistory: [],
        capitalEvolution: [{ date: formatDateToYYYYMMDD(new Date()), capital: initialCapital }],
        tradingDays: 0,
        trades: 0,
        tradePercentage: 0,
        profits: 0,
        profitPercentage: 0,
        losses: 0,
        lossPercentage: 0,
        stops: 0,
        stopPercentage: 0,
        finalCapital: initialCapital,
        profit: 0,
        averageGain: 0,
        averageLoss: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        recoveryFactor: 0,
        successRate: 0,
      };
    }
    if (
      !params ||
      !params.country ||
      !params.stockMarket ||
      !params.assetClass ||
      typeof params.initialCapital !== "number"
    ) {
      console.error(
        "getDetailedAnalysis: Missing or invalid critical parameters (country, stockMarket, assetClass, initialCapital)."
      );
      throw new Error(
        "getDetailedAnalysis: Missing or invalid critical parameters for the analysis."
      );
    }

    // --- Default Result Structure (for early exit on data issues) ---
    const defaultEmptyResult: DetailedResult = {
      assetCode: stockCode,
      assetName: stockCode,
      tradeHistory: [],
      capitalEvolution: [
        { date: formatDateToYYYYMMDD(new Date()), capital: params.initialCapital },
      ],
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
      successRate: 0,
    };

    try {
      console.info(
        `Getting detailed analysis for ${stockCode} with params:`,
        JSON.stringify(params)
      );

      let tableName = params.dataTableName;
      if (!tableName) {
        tableName = await marketData.getDataTableName(
          params.country,
          params.stockMarket,
          params.assetClass
        );
        if (!tableName) {
          console.error(
            `Could not determine data table name for detailed analysis of ${stockCode}. Market: ${params.country}, ${params.stockMarket}, ${params.assetClass}`
          );
          // This is a critical failure, so throwing an error is appropriate.
          throw new Error(
            `Could not determine data table name for ${stockCode}. Analysis cannot proceed.`
          );
        }
      }

      const stockData = await this.getStockData(tableName, stockCode, params.period);
      if (!stockData || stockData.length === 0) {
        console.warn(
          `No data found for stock ${stockCode} in table ${tableName} for the period "${params.period || "all"}". Returning empty analysis.`
        );
        return defaultEmptyResult;
      }
      console.info(
        `Retrieved ${stockData.length} data points for ${stockCode} in period "${params.period || "all"}".`
      );

      const tradeHistory = await this.generateTradeHistory(stockData, params);
      const capitalEvolution = this.calculateCapitalEvolution(tradeHistory, params.initialCapital);
      const metrics = this.calculateDetailedMetrics(
        stockData,
        tradeHistory,
        capitalEvolution,
        params
      );

      return {
        assetCode: stockCode,
        assetName: stockCode, // Placeholder, ideally fetch real name if available (e.g. from getAvailableStocks)
        tradeHistory,
        capitalEvolution,
        ...metrics,
      };
    } catch (error: any) {
      // Catch errors from data fetching or analysis steps
      console.error(`Failed to get detailed analysis for ${stockCode}: ${error.message}`, error);
      // Re-throw to allow higher-level error handling (e.g., by UI to show a notification).
      // Alternatively, return defaultEmptyResult if a graceful fallback is always preferred.
      throw error;
    }
  },

  // --- End: Functions copied from api-18.ts --- (If any were actually copied and not refactored)
};

// Export the API services
export const api = {
  auth,
  marketData,
  analysis,
};
