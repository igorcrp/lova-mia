// This is a service layer to interact with Supabase and process data

import { supabase, fromDynamic, MarketDataSource, StockRecord } from '@/integrations/supabase/client';
import { AnalysisResult, Asset, DetailedResult, StockAnalysisParams, StockInfo } from '@/types';
import { formatDateToYYYYMMDD, getDateRangeForPeriod } from '@/utils/dateUtils';

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
      const stocks: StockInfo[] = data.map(code => ({
        code: String(code),
        name: String(code), // Use code as name if no name is available
      }));
      
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
      
      // Use fromDynamic to handle the dynamic table name
      // This resolves the TypeScript error where supabase.from() expects a literal table name
      const { data, error } = await fromDynamic(tableName)
        .select('stock_code, name')
        .order('stock_code');
      
      if (error) {
        console.error('Error in direct stock code query:', error);
        throw error;
      }

      if (!data) {
        console.warn(`No stock codes found in table ${tableName}`);
        return [];
      }
      
      // Extract stock codes with proper type safety
      const stocks: StockInfo[] = (data as any[])
        .filter(item => item && typeof item === 'object' && 'stock_code' in item && item.stock_code)
        .map(item => ({
          code: String(item.stock_code),
          name: item.name ? String(item.name) : String(item.stock_code)
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
      
      // Get date range based on period
      if (period) {
        const dateRange = getDateRangeForPeriod(period);
        console.info(`Getting stock data for ${stockCode} from ${tableName} with period ${period}`);
        console.info(`Date range: ${dateRange.startDate} to ${dateRange.endDate}`);
        
        // Use the period-filtered method
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
   * Fallback method to get stock data directly from the table
   */
  async getStockDataDirect(tableName: string, stockCode: string, limit: number = 300): Promise<any[]> {
    try {
      console.log(`Trying direct query to get stock data for ${stockCode} from ${tableName}`);
      
      const { data, error } = await fromDynamic(tableName)
        .select('*')
        .eq('stock_code', stockCode)
        .order('date', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error in direct stock data query:', error);
        throw error;
      }

      if (!data || !Array.isArray(data)) {
        console.warn(`No data found for ${stockCode} in table ${tableName}`);
        return [];
      }
      return data as any[];
    } catch (error) {
      console.error(`Failed in direct stock data query for ${stockCode}:`, error);
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
        .order('date', { ascending: true }); // Change to ascending order for chronological processing
      
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
        throw new Error('No stocks found for the selected criteria');
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

          const lastCurrentCapital = tradeHistory.length > 0 
            ? tradeHistory[tradeHistory.length - 1].currentCapital 
            : params.initialCapital;
          
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
      
      return results;
    } catch (error) {
      console.error('Failed to run analysis:', error);
      throw error;
    }
  },
  
  /**
   * Generate trade history for a stock using the updated formulas
   */
  async generateTradeHistory(stockData: any[], params: StockAnalysisParams): Promise<any[]> {
    const tradeHistory: any[] = [];
    let capital = params.initialCapital;
    
    // Sort data by date in ascending order
    const sortedData = [...stockData].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    console.info(`Generating trade history for ${sortedData.length} days of stock data`);
    
    for (let i = 0; i < sortedData.length; i++) {
      const currentData = sortedData[i];
      // Use previous day's data for calculations when available
      const previousData = i > 0 ? sortedData[i - 1] : null;
      // For the last day, use the current day as nextData
      const nextData = i < sortedData.length - 1 ? sortedData[i + 1] : currentData;
      
      // Get previous day capital (or initial capital if first day)
      const previousCapital = i > 0 
        ? tradeHistory[i-1].capital 
        : params.initialCapital;
      
      // Calculate suggested entry price based on previous day's reference price
      const referencePrice = previousData ? previousData[params.referencePrice] : currentData[params.referencePrice];
      let suggestedEntryPrice;
      
      if (params.operation === 'buy') {
        // For buy operations: Previous day's reference price - (Previous day's reference price * entry percentage)
        suggestedEntryPrice = referencePrice - (referencePrice * params.entryPercentage / 100);
      } else {
        // For sell operations: Previous day's reference price + (Previous day's reference price * entry percentage)
        suggestedEntryPrice = referencePrice + (referencePrice * params.entryPercentage / 100);
      }
      
      // Determine actual price based on conditional logic:
      // 1. If Open <= Suggested Entry → use the value of Open
      // 2. If Open > Suggested Entry >= Low → use the value of Suggested Entry
      // 3. If none of the above conditions are met → return '-'
      let actualPrice: number | string;
      if (currentData.open <= suggestedEntryPrice) {
        actualPrice = currentData.open;
      } else if (currentData.open > suggestedEntryPrice && suggestedEntryPrice >= currentData.low) {
        actualPrice = suggestedEntryPrice;
      } else {
        actualPrice = '-';
      }
      
      // Calculate lot size from previous day's capital and actual price
      // Only calculate if actualPrice is a number
      const lotSize = actualPrice !== '-' ? Math.floor(previousCapital / (actualPrice as number) / 10) * 10 : 0;
      
      // Determine if trade is executed
      let trade = "-";
      if (params.operation === 'buy') {
        // Buy: If Actual Price <= Suggested Entry OR Low <= Suggested Entry → "Executed"
        trade = (actualPrice !== '-' && (actualPrice <= suggestedEntryPrice || currentData.low <= suggestedEntryPrice)) ? "Executed" : "-";
      } else {
        // Sell: If Actual Price >= Suggested Entry OR High >= Suggested Entry → "Executed"
        trade = (actualPrice !== '-' && (actualPrice >= suggestedEntryPrice || currentData.high >= suggestedEntryPrice)) ? "Executed" : "-";
      }
      
      // Calculate stop price
      // Only calculate if actualPrice is a number
      const stopPrice = actualPrice !== '-' ? (params.operation === 'buy'
        ? (actualPrice as number) - ((actualPrice as number) * params.stopPercentage / 100)
        : (actualPrice as number) + ((actualPrice as number) * params.stopPercentage / 100)) : '-';
      
      // Determine if stop is triggered
      let stop = undefined;
      if (trade === "Executed" && i < sortedData.length - 1) {
        if (params.operation === 'buy') {
          // Buy: If Low < Stop Price → "Executed"
          stop = stopPrice !== '-' && nextData.low < stopPrice ? "Executed" : undefined;
        } else {
          // Sell: If High > Stop Price → "Executed"
          stop = stopPrice !== '-' && nextData.high > stopPrice ? "Executed" : undefined;
        }
      }
      
      // Calculate profit/loss
      let profit = 0;
      if (trade === "Executed" && actualPrice !== '-') {
        if (stop === "Executed" && stopPrice !== '-') {
          // If stop is triggered, calculate profit/loss based on stop price
          profit = params.operation === 'buy'
            ? ((stopPrice as number) - (actualPrice as number)) * lotSize
            : ((actualPrice as number) - (stopPrice as number)) * lotSize;
        } else {
          // Otherwise, calculate based on close price of the current day
          profit = params.operation === 'buy'
            ? (currentData.close - (actualPrice as number)) * lotSize
            : ((actualPrice as number) - currentData.close) * lotSize;
        }
      }
      
      // Update capital: Previous day's capital + current day's profit/loss
      capital = previousCapital + profit;
      
      // Create trade history item
      tradeHistory.push({
        date: currentData.date,
        entryPrice: currentData.open,
        exitPrice: currentData.close,
        high: currentData.high,
        low: currentData.low,
        volume: currentData.volume,
        profitLoss: profit, // Garantir que este campo está sendo passado
        profitPercentage: previousCapital > 0 ? (profit / previousCapital) * 100 : 0,
        trade,
        stop,
        suggestedEntryPrice,
        actualPrice,
        lotSize,
        stopPrice,
        capital,
        currentCapital: capital // Adicionar currentCapital aqui também
        });
    }
    
    console.info(`Generated ${tradeHistory.length} trade history entries`);
    return tradeHistory;
  },
  
  /**
   * Calculate capital evolution based on trade history
   */
  calculateCapitalEvolution(tradeHistory: any[], initialCapital: number): any[] {
    const capitalEvolution: any[] = [];
    
    for (const trade of tradeHistory) {
      capitalEvolution.push({
        date: trade.date,
        capital: trade.capital || initialCapital
      });
    }
    
    return capitalEvolution;
  },
  
  /**
   * Calculate detailed metrics based on trade history
   */
  calculateDetailedMetrics(stockData: any[], tradeHistory: any[], capitalEvolution: any[], params: StockAnalysisParams) {
    // Count the exact number of unique days in the Stock Details table
    const tradingDays = new Set(stockData.map(item => item.date)).size;
    
    // Count total executed trades
    const executedTrades = tradeHistory.filter(trade => trade.trade === 'Executed');
    const trades = executedTrades.length;
    
    // Count profits, losses, and stops based on the exact specifications
    const profits = executedTrades.filter(trade => 
      trade.profit > 0 && !trade.stop
    ).length;
    
    const losses = executedTrades.filter(trade => 
      trade.profit < 0 && !trade.stop
    ).length;
    
    const stops = executedTrades.filter(trade => 
      trade.stop === 'Executed' && trade.profit < 0
    ).length;
    
    // Sum the profit/loss values
    let totalProfit = 0;
    let totalLoss = 0;
    
    // Calculate total profits and losses
    for (const trade of executedTrades) {
      if (trade.profit > 0 && !trade.stop) {
        totalProfit += trade.profit;
      } else if (trade.profit < 0) {
        if (trade.stop === 'Executed') {
          // This is counted as a stop loss
        } else {
          // This is counted as a regular loss
          totalLoss += trade.profit;
        }
      }
    }
      
    // Calculate percentages with safety checks to avoid division by zero
    const tradePercentage = tradingDays > 0 ? (trades / tradingDays) * 100 : 0;
    const profitPercentage = trades > 0 ? (profits / trades) * 100 : 0;
    const lossPercentage = trades > 0 ? (losses / trades) * 100 : 0;
    const stopPercentage = trades > 0 ? (stops / trades) * 100 : 0;
    
    // Calculate final capital and profit from capital evolution
    const finalCapital = capitalEvolution.length > 0 
      ? capitalEvolution[capitalEvolution.length - 1].capital 
      : params.initialCapital;
      
    const profit = finalCapital - params.initialCapital;
    
    // Calculate average gain and loss
    const averageGain = profits > 0 
      ? totalProfit / profits 
      : 0;
      
    const averageLoss = losses > 0 
      ? Math.abs(totalLoss / losses) 
      : 0;
    
    // Calculate max drawdown
    let maxDrawdown = 0;
    let peak = params.initialCapital;
    
    for (const point of capitalEvolution) {
      if (point.capital > peak) {
        peak = point.capital;
      }
      
      const drawdown = peak > 0 ? (peak - point.capital) / peak : 0;
      
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
      
    // Calculate ratios
    const riskFreeRate = 0.02; // Assuming 2% risk-free rate
    
    // Calculate average return and standard deviation
    let totalReturn = 0;
    const returns: number[] = [];
    
    for (let i = 1; i < capitalEvolution.length; i++) {
      const prevCapital = capitalEvolution[i - 1].capital;
      const currentCapital = capitalEvolution[i].capital;
      
      if (prevCapital > 0) {
        const dailyReturn = (currentCapital - prevCapital) / prevCapital;
        totalReturn += dailyReturn;
        returns.push(dailyReturn);
      }
    }
    
    const avgReturn = returns.length > 0 ? totalReturn / returns.length : 0;
    
    // Standard deviation of returns
    let sumSquaredDiff = 0;
    
    for (const ret of returns) {
      sumSquaredDiff += Math.pow(ret - avgReturn, 2);
    }
    
    const stdDev = returns.length > 1 ? Math.sqrt(sumSquaredDiff / (returns.length - 1)) : 0;
    
    // Calculate downside deviation (for Sortino ratio)
    let sumSquaredDownsideDiff = 0;
    let downsideCount = 0;
    
    for (const ret of returns) {
      if (ret < 0) {
        sumSquaredDownsideDiff += Math.pow(ret, 2);
        downsideCount++;
      }
    }
    
    const downsideDev = downsideCount > 0 ? Math.sqrt(sumSquaredDownsideDiff / downsideCount) : 0;
    
    // Calculate Sharpe and Sortino ratios
    const sharpeRatio = stdDev > 0 ? (avgReturn - riskFreeRate) / stdDev : 0;
    const sortinoRatio = downsideDev > 0 ? (avgReturn - riskFreeRate) / downsideDev : 0;
    
    // Calculate recovery factor
    const recoveryFactor = maxDrawdown > 0 ? Math.abs(profit / maxDrawdown) : 0;
    
    // Calculate success rate
    const successRate = trades > 0 ? (profits / trades) * 100 : 0;
    
    return {
      tradingDays,
      trades,
      tradePercentage,
      profits,
      profitPercentage,
      losses,
      lossPercentage,
      stops,
      stopPercentage,
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
        params.period // Pass the period parameter to filter by date
      );
      
      if (!stockData || stockData.length === 0) {
        throw new Error(`No data found for stock ${stockCode} in table ${params.dataTableName} for the selected period`);
      }
      
      console.info(`Retrieved ${stockData.length} data points for ${stockCode} in the selected period`);
      
      // Generate trade history
      const tradeHistory = await this.generateTradeHistory(stockData, params);
      
      if (!tradeHistory || tradeHistory.length === 0) {
        throw new Error(`Failed to generate trade history for ${stockCode}`);
      }
      
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
  },

  /**
   * Get live stock quotes
   */
  async getLiveQuotes(symbols: string[]): Promise<any[]> {
    try {
      // Implementation for real data access would go here
      // For now we'll return a placeholder message
      console.log("getLiveQuotes would fetch real-time data from an API");
      return [];
    } catch (error) {
      console.error('Failed to fetch live quotes:', error);
      return [];
    }
  }
};

/**
 * Auth API service for handling authentication
 */
const auth = {
  /**
   * Log in with email and password
   */
  async login(email: string, password: string): Promise<any> {
    try {
      console.log("API login attempt for:", email);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) {
        console.error("Supabase auth error:", error);
        throw error;
      }
      
      console.log("Supabase auth response:", data);
      return data;
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  },
  
  /**
   * Log in with Google
   */
  async googleLogin(): Promise<any> {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      });
      
      if (error) {
        console.error("Google login error:", error);
        throw error;
      }
      
      console.log("Google auth response:", data);
      return data;
    } catch (error) {
      console.error("Google login failed:", error);
      throw error;
    }
  },
  
  /**
   * Log out
   */
  async logout(): Promise<void> {
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error("Logout error:", error);
        throw error;
      }
      
      return;
    } catch (error) {
      console.error("Logout failed:", error);
      throw error;
    }
  }
};

/**
 * Users API service for user management
 */
const users = {
  /**
   * Get user statistics
   */
  async getUserStats(): Promise<any> {
    try {
      // Mock implementation for now
      return {
        total: 153,
        active: 128,
        pending: 15,
        inactive: 10,
        premium: 42,
        new: 8
      };
    } catch (error) {
      console.error('Failed to fetch user stats:', error);
      return {
        total: 0,
        active: 0,
        pending: 0,
        inactive: 0
      };
    }
  },
  
  /**
   * Get list of users
   */
  async getUsers(): Promise<any[]> {
    try {
      // Mock implementation for now
      return Array(10).fill(0).map((_, i) => ({
        id: `user-${i}`,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        status: i % 3 === 0 ? 'active' : i % 3 === 1 ? 'pending' : 'inactive',
        created_at: new Date(Date.now() - i * 86400000).toISOString(),
        last_login: i % 2 === 0 ? new Date(Date.now() - i * 3600000).toISOString() : null
      }));
    } catch (error) {
      console.error('Failed to fetch users:', error);
      return [];
    }
  },
  
  /**
   * Get all users - Alias for getUsers
   */
  async getAll(): Promise<any[]> {
    return this.getUsers();
  },

  /**
   * Create a new user
   */
  async create(userData: any): Promise<any> {
    try {
      // Mock implementation for now
      console.log('Creating user with data:', userData);
      return {
        id: `user-${Date.now()}`,
        ...userData,
        created_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Failed to create user:', error);
      throw error;
    }
  },
  
  /**
   * Update user status
   */
  async updateUserStatus(userId: string, status: string): Promise<boolean> {
    try {
      // Mock implementation for now
      console.log(`Updating user ${userId} status to ${status}`);
      return true;
    } catch (error) {
      console.error(`Failed to update user ${userId} status:`, error);
      return false;
    }
  }
};

/**
 * Assets API service for managing assets
 */
const assets = {
  /**
   * Get total count of assets
   */
  async getTotalCount(): Promise<number> {
    try {
      // Mock implementation for now
      return 1254;
    } catch (error) {
      console.error('Failed to fetch total assets count:', error);
      return 0;
    }
  },
  
  /**
   * Get list of assets
   */
  async getAssets(): Promise<any[]> {
    try {
      // Mock implementation for now
      return Array(10).fill(0).map((_, i) => ({
        id: `asset-${i}`,
        code: `ASSET${i}`,
        name: `Asset ${i}`,
        country: i % 3 === 0 ? 'Brazil' : i % 3 === 1 ? 'USA' : 'Europe',
        stock_market: i % 2 === 0 ? 'B3' : 'NASDAQ',
        type: i % 4 === 0 ? 'Stock' : i % 4 === 1 ? 'ETF' : i % 4 === 2 ? 'Fund' : 'Bond',
        price: Math.random() * 1000 + 10,
        change: (Math.random() * 10 - 5).toFixed(2)
      }));
    } catch (error) {
      console.error('Failed to fetch assets:', error);
      return [];
    }
  },
  
  /**
   * Get all assets - Alias for getAssets
   */
  async getAll(): Promise<Asset[]> {
    return this.getAssets() as any as Asset[];
  },
  
  /**
   * Create a new asset
   */
  async create(assetData: Partial<Asset>): Promise<Asset> {
    try {
      // Mock implementation for now
      console.log('Creating asset with data:', assetData);
      return {
        id: `asset-${Date.now()}`,
        code: assetData.code || '',
        name: assetData.name || '',
        country: assetData.country || '',
        stock_market: assetData.stock_market || '',
        asset_class: assetData.asset_class || '',
        status: assetData.status || 'active'
      };
    } catch (error) {
      console.error('Failed to create asset:', error);
      throw error;
    }
  }
};

export const api = {
  marketData,
  analysis,
  auth,
  users,
  assets
};
