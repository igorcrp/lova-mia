// This is a service layer to interact with Supabase and process data

import { supabase, fromDynamic, MarketDataSource, StockRecord } from '@/integrations/supabase/client';
import { AnalysisResult, Asset, DetailedResult, StockAnalysisParams, StockInfo, User, TradeHistoryItem } from '@/types';
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

  /**
   * Register a new user
   */
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

      console.log("Auth registration successful:", authData);

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
      
      const { data, error } = await supabase.rpc('check_user_by_email', {
        p_email: userId
      });

      if (error) {
        console.error("Get user data error:", error);
        throw error;
      }

      console.log("User data retrieved:", data);
      
      if (Array.isArray(data) && data.length > 0) {
        const userData = data[0];
        return {
          id: userId,
          email: userId,
          full_name: userData.status_users || 'Unknown',
          level_id: userData.level_id || 1,
          status: userData.status_users as any,
          email_verified: Boolean(userData.user_exists),
          account_type: 'free',
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
      const { data, error } = await fromDynamic('market_data_sources')
        .select('country')
        .order('country');

      if (error) throw error;

      if (!data || !Array.isArray(data)) return [];

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
      const { data, error } = await fromDynamic('market_data_sources')
        .select('stock_market')
        .eq('country', country)
        .order('stock_market');

      if (error) throw error;

      if (!data || !Array.isArray(data)) return [];

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
      const { data, error } = await fromDynamic('market_data_sources')
        .select('asset_class')
        .eq('country', country)
        .eq('stock_market', stockMarket)
        .order('asset_class');

      if (error) throw error;

      if (!data || !Array.isArray(data)) return [];

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
      
      const { error } = await fromDynamic(tableName)
        .select('*')
        .limit(1);
      
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

      return (data || []).map((item: any) => ({
        ...item,
        id: String(item.id)
      })) as MarketDataSource[];
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
      
      return (data || []).map((item: any) => ({
        ...item,
        id: String(item.id)
      })) as MarketDataSource[];
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
      
      return (data || []).map((item: any) => ({
        ...item,
        id: String(item.id)
      })) as MarketDataSource[];
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
      
      const { data, error } = await supabase.rpc('get_unique_stock_codes', {
        p_table_name: tableName
      });

      if (error) {
        console.error('Error getting unique stock codes:', error);
        return await this.getAvailableStocksDirect(tableName);
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        console.warn('No stock codes returned from function, trying direct query');
        return await this.getAvailableStocksDirect(tableName);
      }
      
      console.log(`Found ${data.length} unique stock codes`);
      
      const stocks: StockInfo[] = data.map(item => {
        const stockCode = (typeof item === 'object' && item !== null && 'stock_code' in item) 
                          ? String(item.stock_code) 
                          : String(item);
        return {
          code: stockCode,
          name: stockCode,
        };
      });
      
      return stocks;
    } catch (error) {
      console.error('Failed to get available stocks:', error);
      return await this.getAvailableStocksDirect(tableName);
    }
  },
  
  /**
   * Fallback method to get stocks directly from the table
   */
  async getAvailableStocksDirect(tableName: string): Promise<StockInfo[]> {
    try {
      console.log(`Trying direct query to get stock codes from ${tableName}`);
      
      const { data, error } = await fromDynamic(tableName)
        .select('stock_code')
        .limit(1000);
      
      if (error) {
        console.error('Error in direct stock code query:', error);
        throw error;
      }

      if (!data) {
        console.warn(`No stock codes found in table ${tableName}`);
        return [];
      }
      
      const uniqueCodes = new Set<string>();
      (data as any[])
        .filter(item => item && typeof item === 'object' && 'stock_code' in item && item.stock_code)
        .forEach(item => uniqueCodes.add(String(item.stock_code)));
      
      const stocks: StockInfo[] = Array.from(uniqueCodes).map(code => ({
        code: code,
        name: code
      }));
      
      console.log(`Direct query found ${stocks.length} stock codes`);
      return stocks;
    } catch (error) {
      console.error(`Failed in direct stock query for ${tableName}:`, error);
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
      
      if (period) {
        const dateRange = getDateRangeForPeriod(period);
        console.info(`Getting stock data for ${stockCode} from ${tableName} with period ${period}`);
        console.info(`Date range: ${dateRange.startDate} to ${dateRange.endDate}`);
        
        return await this.getStockDataDirectWithPeriod(tableName, stockCode, dateRange.startDate, dateRange.endDate);
      } else {
        console.info(`Getting stock data for ${stockCode} from ${tableName} without period filtering (using limit: ${limit})`);
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
        .order('date', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error in direct stock data query (limit):', error);
        throw error;
      }

      if (!data || !Array.isArray(data)) {
        console.warn(`No data found for ${stockCode} in table ${tableName}`);
        return [];
      }
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
        .order('date', { ascending: true });
      
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

      updateProgress(10);
      const stocks = await this.getAvailableStocks(params.dataTableName);
      
      console.info(`Found ${stocks.length} stocks for analysis`);
      
      if (!stocks || stocks.length === 0) {
        console.warn('No stocks found for the selected criteria');
        return []; 
      }
      
      updateProgress(10);
      
      const results: AnalysisResult[] = [];
      
      const stocksToProcess = params.comparisonStocks && params.comparisonStocks.length > 0
        ? stocks.filter(s => params.comparisonStocks!.includes(s.code))
        : stocks;
        
      for (let i = 0; i < stocksToProcess.length; i++) {
        const stock = stocksToProcess[i];
        console.info(`Processing stock ${i+1}/${stocksToProcess.length}: ${stock.code}`);
        
        try {
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
          
          const tradeHistory = await this.generateTradeHistory(stockData, params);
          
          if (!tradeHistory || tradeHistory.length === 0) {
            console.warn(`No trade history generated for ${stock.code}, skipping`);
            continue;
          }
          
          const capitalEvolution = this.calculateCapitalEvolution(tradeHistory, params.initialCapital);

          const metrics = this.calculateDetailedMetrics(stockData, tradeHistory, capitalEvolution, params);
          
          results.push({
            assetCode: stock.code,
            assetName: stock.name || stock.code,
            lastCurrentCapital: capitalEvolution.length > 0 
              ? capitalEvolution[capitalEvolution.length - 1].capital 
              : params.initialCapital,
            ...metrics
          });
          
          const progressIncrement = 70 / stocksToProcess.length;
          updateProgress(progressIncrement);
          
        } catch (e) {
          console.error(`Error analyzing stock ${stock.code}:`, e);
        }
      }
      
      results.sort((a, b) => b.profitPercentage - a.profitPercentage);
      
      updateProgress(10);
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
    
    const sortedData = [...stockData].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    console.info(`Generating trade history for ${sortedData.length} days of stock data`);
    
    for (let i = 0; i < sortedData.length; i++) {
      const currentData = sortedData[i];
      const previousData = i > 0 ? sortedData[i - 1] : null;
      
      const previousCapital = i > 0 
        ? (tradeHistory[i-1].currentCapital ?? params.initialCapital)
        : params.initialCapital;
      
      const referencePrice = previousData ? Number(previousData[params.referencePrice]) : Number(currentData[params.referencePrice]);
      let suggestedEntryPrice: number;
      
      if (params.operation === 'buy') {
        suggestedEntryPrice = referencePrice - (referencePrice * params.entryPercentage / 100);
      } else {
        suggestedEntryPrice = referencePrice + (referencePrice * params.entryPercentage / 100);
      }
      
      let actualPrice: number | string;
      const openPrice = Number(currentData.open);
      const lowPrice = Number(currentData.low);
      
      if (openPrice <= suggestedEntryPrice) {
        actualPrice = openPrice;
      } else if (openPrice > suggestedEntryPrice && suggestedEntryPrice >= lowPrice) {
        actualPrice = suggestedEntryPrice;
      } else {
        actualPrice = '-';
      }
      
      const lotSize = actualPrice !== '-' && previousCapital > 0 && Number(actualPrice) > 0
        ? Math.floor(previousCapital / Number(actualPrice) / 10) * 10 
        : 0;
      
      let trade: TradeHistoryItem['trade'] = "-";
      if (params.operation === 'buy') {
        trade = (actualPrice !== '-' && (Number(actualPrice) <= suggestedEntryPrice || lowPrice <= suggestedEntryPrice)) ? "Buy" : "-";
      } else {
        trade = (actualPrice !== '-' && (Number(actualPrice) >= suggestedEntryPrice || Number(currentData.high) >= suggestedEntryPrice)) ? "Sell" : "-";
      }
      
      const stopPrice = actualPrice !== '-' ? (params.operation === 'buy'
        ? Number(actualPrice) - (Number(actualPrice) * params.stopPercentage / 100)
        : Number(actualPrice) + (Number(actualPrice) * params.stopPercentage / 100)) : '-';
      
      let stopTrigger: string = '-';
      if (trade !== "-" && stopPrice !== '-') {
        if (params.operation === 'buy') {
          stopTrigger = Number(currentData.low) <= Number(stopPrice) ? "Executed" : "-";
        } else {
          stopTrigger = Number(currentData.high) >= Number(stopPrice) ? "Executed" : "-";
        }
      }
      
      let profitLoss = 0;
      if (trade !== "-" && actualPrice !== '-') {
        if (stopTrigger === "Executed" && stopPrice !== '-') {
          profitLoss = params.operation === 'buy'
            ? (Number(stopPrice) - Number(actualPrice)) * lotSize
            : (Number(actualPrice) - Number(stopPrice)) * lotSize;
        } else {
          profitLoss = params.operation === 'buy'
            ? (Number(currentData.close) - Number(actualPrice)) * lotSize
            : (Number(actualPrice) - Number(currentData.close)) * lotSize;
        }
      }
      
      capital = Math.max(0, previousCapital + profitLoss);
      
      tradeHistory.push({
        date: currentData.date,
        entryPrice: Number(currentData.open),
        exitPrice: Number(currentData.close),
        high: Number(currentData.high),
        low: Number(currentData.low),
        volume: Number(currentData.volume),
        suggestedEntryPrice,
        actualPrice,
        trade,
        lotSize,
        stopPrice,
        stopTrigger,
        profitLoss,
        currentCapital: capital,
        profitPercentage: 0
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
    
    capitalEvolution.push({ date: tradeHistory[0].date, capital: initialCapital }); 

    for (const trade of tradeHistory) {
      if ((trade.profitLoss ?? 0) !== 0) { 
        capitalEvolution.push({
          date: trade.date,
          capital: trade.currentCapital ?? initialCapital 
        });
      }
    }
    
    const lastTrade = tradeHistory[tradeHistory.length - 1];
    if (capitalEvolution[capitalEvolution.length - 1]?.date !== lastTrade.date) {
         capitalEvolution.push({ date: lastTrade.date, capital: lastTrade.currentCapital ?? initialCapital });
    }

    const uniqueCapitalEvolution = Array.from(new Map(capitalEvolution.map(item => [item.date, item])).values());

    return uniqueCapitalEvolution;
  },
  
  /**
   * Calculate detailed metrics based on trade history
   */
  calculateDetailedMetrics(stockData: any[], tradeHistory: TradeHistoryItem[], capitalEvolution: any[], params: StockAnalysisParams) {
    const tradingDays = new Set(stockData.map(item => item.date)).size;
    
    const executedTrades = tradeHistory.filter(trade => trade.trade === 'Buy' || trade.trade === 'Sell');
    const trades = executedTrades.length;
    
    const profits = executedTrades.filter(trade => (trade.profitLoss ?? 0) > 0).length;
    const losses = executedTrades.filter(trade => (trade.profitLoss ?? 0) < 0 && trade.stopTrigger !== 'Executed').length;
    const stops = executedTrades.filter(trade => trade.stopTrigger === 'Executed').length;
    
    let totalProfit = 0;
    let totalLoss = 0;
    
    for (const trade of executedTrades) {
      const profitLoss = trade.profitLoss ?? 0;
      if (profitLoss > 0) {
        totalProfit += profitLoss;
      } else if (profitLoss < 0) {
        totalLoss += profitLoss; 
      }
    }
      
    const tradePercentage = tradingDays > 0 ? (trades / tradingDays) * 100 : 0;
    const profitRate = trades > 0 ? (profits / trades) * 100 : 0;
    const lossRate = trades > 0 ? (losses / trades) * 100 : 0;
    const stopRate = trades > 0 ? (stops / trades) * 100 : 0;
    
    const finalCapital = capitalEvolution.length > 0 
      ? capitalEvolution[capitalEvolution.length - 1].capital 
      : params.initialCapital;
      
    const profit = finalCapital - params.initialCapital;
    const overallProfitPercentage = params.initialCapital > 0 ? (profit / params.initialCapital) * 100 : 0;
    
    const averageGain = profits > 0 
      ? totalProfit / profits 
      : 0;
      
    const averageLoss = (losses + stops) > 0
      ? Math.abs(executedTrades.filter(t => (t.profitLoss ?? 0) < 0).reduce((sum, t) => sum + (t.profitLoss ?? 0), 0)) / (losses + stops) 
      : 0;
    
    let maxDrawdown = 0;
    let peak = params.initialCapital;
    
    for (const point of capitalEvolution) {
      const currentCapitalPoint = Number(point.capital);
      if (isNaN(currentCapitalPoint)) continue;

      if (currentCapitalPoint > peak) {
        peak = currentCapitalPoint;
      }
      
      const drawdown = peak > 0 ? (peak - currentCapitalPoint) / peak : 0;
      
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    maxDrawdown = maxDrawdown * 100;
      
    const sharpeRatio = 0;
    const sortinoRatio = 0;
    const recoveryFactor = maxDrawdown > 0 ? Math.abs(profit / (maxDrawdown / 100 * params.initialCapital)) : 0;
    
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
      
      const tradeHistory = await this.generateTradeHistory(stockData, params);
      
      const capitalEvolution = this.calculateCapitalEvolution(tradeHistory, params.initialCapital);
      
      const metrics = this.calculateDetailedMetrics(stockData, tradeHistory, capitalEvolution, params);
      
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
  },
};

export const api = {
  auth,
  marketData,
  analysis
};
