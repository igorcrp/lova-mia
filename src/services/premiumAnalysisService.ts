// Premium Analysis Service - Optimized processing for Premium users
import { supabase, fromDynamic } from '@/integrations/supabase/client';
import { AnalysisResult, DetailedResult, StockAnalysisParams, StockInfo, TradeHistoryItem } from '@/types';
import { getDateRangeForPeriod } from '@/utils/dateUtils';

export const premiumAnalysisService = {
  async runOptimizedAnalysis(
    params: StockAnalysisParams,
    progressCallback?: (progress: number) => void
  ): Promise<AnalysisResult[]> {
    try {
      console.info(`Running PREMIUM optimized analysis with parameters:`, params);
      console.info(`DEBUG PREMIUM: ComparisonStocks received:`, params.comparisonStocks);
      
      let progress = 0;
      const updateProgress = (increment: number) => {
        progress += increment;
        if (progressCallback) {
          progressCallback(Math.min(progress, 100));
        }
      };

      if (!params.dataTableName) {
        const tableName = await this.getDataTableName(
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
      
      const stocks = await this.getAvailableStocksOptimized(params.dataTableName);
      console.info(`Found ${stocks.length} stocks for PREMIUM analysis`);
      
      if (!stocks || stocks.length === 0) {
        console.warn('No stocks found for the selected criteria');
        return [];
      }
      
      updateProgress(15);
      
      const stocksToProcess = params.comparisonStocks && params.comparisonStocks.length > 0
        ? stocks.filter(s => params.comparisonStocks!.includes(s.code))
        : stocks;
      
      console.info(`DEBUG PREMIUM: Processing ${stocksToProcess.length} stocks (filtered from ${stocks.length})`);
      console.info(`DEBUG PREMIUM: Stocks to process:`, stocksToProcess.map(s => s.code));
      
      const batchSize = 10;
      const results: AnalysisResult[] = [];
      
      for (let i = 0; i < stocksToProcess.length; i += batchSize) {
        const batch = stocksToProcess.slice(i, i + batchSize);
        console.info(`Processing PREMIUM batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(stocksToProcess.length/batchSize)}`);
        
        const batchPromises = batch.map(stock => this.processStockOptimized(stock, params));
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            results.push(result.value);
            console.info(`DEBUG PREMIUM: Successfully processed ${batch[index].code}`);
          } else if (result.status === 'rejected') {
            console.error(`DEBUG PREMIUM: Error processing stock ${batch[index].code}:`, result.reason);
          }
        });
        
        const progressIncrement = (60 / Math.ceil(stocksToProcess.length / batchSize));
        updateProgress(progressIncrement);
      }
      
      results.sort((a, b) => b.profitPercentage - a.profitPercentage);
      
      updateProgress(15);
      console.info(`PREMIUM analysis completed. Processed ${results.length} stocks successfully.`);
      return results;
    } catch (error) {
      console.error('Failed to run PREMIUM optimized analysis:', error);
      throw error;
    }
  },

  async processStockOptimized(stock: StockInfo, params: StockAnalysisParams): Promise<AnalysisResult | null> {
    try {
      console.log(`[DEBUG] Processing ${stock.code} from table ${params.dataTableName}`);
      
      const stockData = await this.getStockDataOptimized(
        params.dataTableName!, 
        stock.code,
        params.period
      );
      
      console.log(`[DEBUG] ${stock.code}: Retrieved ${stockData?.length || 0} data points`);
      
      if (!stockData || stockData.length === 0) {
        console.warn(`[DEBUG] No data found for stock ${stock.code}, skipping`);
        return null;
      }
      
      const tradeHistory = await this.generateTradeHistoryOptimized(stockData, params);
      
      console.log(`[DEBUG] ${stock.code}: Generated ${tradeHistory?.length || 0} trade history entries`);
      
      if (!tradeHistory || tradeHistory.length === 0) {
        console.warn(`[DEBUG] No trade history generated for ${stock.code}, skipping`);
        return null;
      }
      
      const { capitalEvolution, metrics } = this.calculateMetricsOptimized(
        stockData, 
        tradeHistory, 
        params.initialCapital
      );
      
      // Get the most recent Current Capital from trade history
      const sortedTradeHistory = [...tradeHistory].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      const lastTrade = sortedTradeHistory[sortedTradeHistory.length - 1];
      const lastCurrentCapital = lastTrade.currentCapital ?? params.initialCapital;
      
      // Debug log para verificar se a correção está funcionando no premium service
      console.log(`[DEBUG PREMIUM ${stock.code}] CORRECTED Final Capital:`, {
        totalTrades: sortedTradeHistory.length,
        lastTradeDate: lastTrade.date,
        lastCurrentCapital: lastTrade.currentCapital,
        finalCapital: lastCurrentCapital,
        initialCapital: params.initialCapital
      });
      
      // Calcular o profit correto baseado no lastCurrentCapital
      const correctProfit = lastCurrentCapital - params.initialCapital;
      
      return {
        assetCode: stock.code,
        assetName: stock.code,
        lastCurrentCapital: lastCurrentCapital,
        ...metrics,
        // Garantir que finalCapital e profit estão corretos (override após spread)
        finalCapital: lastCurrentCapital,
        profit: correctProfit
      };
    } catch (error) {
      console.error(`[DEBUG ERROR] Error in optimized processing for stock ${stock.code}:`, error);
      return null;
    }
  },

  async getStockDataOptimized(
    tableName: string, 
    stockCode: string, 
    period: string | undefined = undefined
  ): Promise<any[]> {
    try {
      if (!tableName || !stockCode) {
        throw new Error('Table name and stock code are required');
      }
      
      console.log(`[DEBUG] Getting stock data for ${stockCode} from ${tableName} with period ${period || 'no period (300 limit)'}`);
      
      // Get date range based on period
      if (period) {
        const dateRange = getDateRangeForPeriod(period);
        console.info(`[DEBUG] Date range: ${dateRange.startDate} to ${dateRange.endDate}`);
        
        // Use the period-filtered method
        const result = await this.getStockDataDirectWithPeriod(tableName, stockCode, dateRange.startDate, dateRange.endDate);
        console.log(`[DEBUG] Period-filtered query returned ${result.length} records`);
        return result;
      } else {
        // If no period, use the limit-based method
        const result = await this.getStockDataDirect(tableName, stockCode, 300);
        console.log(`[DEBUG] Limit-based query returned ${result.length} records`);
        return result;
      }
    } catch (error) {
      console.error(`[DEBUG ERROR] Failed to get optimized stock data for ${stockCode}:`, error);
      return [];
    }
  },

  /**
   * Fallback method to get stock data directly from the table (limit based)
   */
  async getStockDataDirect(tableName: string, stockCode: string, limit: number = 300): Promise<any[]> {
    try {
      console.log(`Trying direct optimized query to get stock data for ${stockCode} from ${tableName} with limit ${limit}`);
      
      const { data, error } = await fromDynamic(tableName)
        .select('*')
        .eq('stock_code', stockCode)
        .order('date', { ascending: false }) // Get latest data first
        .limit(limit);

      if (error) {
        console.error('Error in direct optimized stock data query (limit):', error);
        throw error;
      }

      if (!data || !Array.isArray(data)) {
        console.warn(`No data found for ${stockCode} in table ${tableName}`);
        return [];
      }
      // Reverse the data to have it in ascending order for processing
      return (data as any[]).reverse(); 
    } catch (error) {
      console.error(`Failed in direct optimized stock data query (limit) for ${stockCode}:`, error);
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
      console.info(`Fetching optimized stock data for ${stockCode} from ${tableName} between ${startDate} and ${endDate}`);
      
      const { data, error } = await fromDynamic(tableName)
        .select('*')
        .eq('stock_code', stockCode)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true }); // Ascending order for chronological processing
      
      if (error) {
        console.error('Error in period-filtered optimized stock data query:', error);
        throw error;
      }
      
      if (!data || !Array.isArray(data)) {
        console.warn(`No data found for ${stockCode} in table ${tableName} for the specified period`);
        return [];
      }
      
      console.info(`Found ${data.length} records for ${stockCode} in the specified period`);
      return data as any[];

    } catch (error) {
      console.error(`Failed to fetch period-filtered optimized data for ${stockCode}:`, error);
      return [];
    }
  },

  async getAvailableStocksOptimized(tableName: string): Promise<StockInfo[]> {
    try {
      console.log(`[DEBUG] Getting available stocks from table: ${tableName}`);
      
      const { data, error } = await supabase.rpc('get_unique_stock_codes', {
        p_table_name: tableName
      });

      if (error) {
        console.log(`[DEBUG] RPC failed for ${tableName}, trying fallback:`, error);
        return await this.getAvailableStocksFallback(tableName);
      }
      if (!data || !Array.isArray(data) || data.length === 0) {
        console.log(`[DEBUG] No data from RPC for ${tableName}, trying fallback`);
        return await this.getAvailableStocksFallback(tableName);
      }
      
      console.info(`Found ${data.length} stocks in ${tableName}:`, data.slice(0, 10));
      
      return data.map(item => ({
        code: typeof item === 'string' ? item : String(item),
      }));
    } catch (error) {
      console.error('Failed to get optimized available stocks:', error);
      return await this.getAvailableStocksFallback(tableName);
    }
  },

  async getAvailableStocksFallback(tableName: string): Promise<StockInfo[]> {
    try {
      const { data, error } = await fromDynamic(tableName)
        .select('stock_code')
        .limit(2000);
      
      if (error) throw error;
      if (!data) return [];
      
      const uniqueCodes = new Set<string>();
      (data as any[])
        .filter(item => item && typeof item === 'object' && 'stock_code' in item && item.stock_code)
        .forEach(item => uniqueCodes.add(String(item.stock_code)));
      
      return Array.from(uniqueCodes).map(code => ({
        code: code,
      }));
    } catch (error) {
      console.error(`Failed in fallback stock query for ${tableName}:`, error);
      return [];
    }
  },

  async generateTradeHistoryOptimized(stockData: any[], params: StockAnalysisParams): Promise<TradeHistoryItem[]> {
    const tradeHistory: TradeHistoryItem[] = [];
    let capital = params.initialCapital;
    
    const sortedData = [...stockData].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    for (let i = 0; i < sortedData.length; i++) {
      const currentData = sortedData[i];
      const previousData = i > 0 ? sortedData[i - 1] : null;
      const previousCapital = i > 0 ? (tradeHistory[i-1].currentCapital ?? params.initialCapital) : params.initialCapital;
      
      const referencePrice = previousData ? previousData[params.referencePrice] : currentData[params.referencePrice];
      
      const suggestedEntryPrice = params.operation === 'buy'
        ? referencePrice - (referencePrice * params.entryPercentage / 100)
        : referencePrice + (referencePrice * params.entryPercentage / 100);
      
      const openPrice = Number(currentData.open);
      const lowPrice = Number(currentData.low);
      const highPrice = Number(currentData.high);
      const closePrice = Number(currentData.close);
      
      let actualPrice: number | string;
      if (params.operation === 'buy') {
        if (openPrice <= suggestedEntryPrice) {
          actualPrice = openPrice;
        } else if (openPrice > suggestedEntryPrice && suggestedEntryPrice >= lowPrice) {
          actualPrice = suggestedEntryPrice;
        } else {
          actualPrice = '-';
        }
      } else {
        if (openPrice >= suggestedEntryPrice) {
          actualPrice = openPrice;
        } else if (openPrice < suggestedEntryPrice && suggestedEntryPrice <= highPrice) {
          actualPrice = suggestedEntryPrice;
        } else {
          actualPrice = '-';
        }
      }
      
      const lotSize = actualPrice !== '-' && previousCapital > 0 && Number(actualPrice) > 0
        ? Math.floor(previousCapital / Number(actualPrice) / 10) * 10 
        : 0;
      
      let trade: string;
      if (params.operation === 'buy') {
        trade = (actualPrice !== '-' && (Number(actualPrice) <= suggestedEntryPrice || lowPrice <= suggestedEntryPrice)) ? "Buy" : "-";
      } else {
        trade = (actualPrice !== '-' && (Number(actualPrice) >= suggestedEntryPrice || highPrice >= suggestedEntryPrice)) ? "Sell" : "-";
      }
      
      const stopPrice = actualPrice !== '-' ? (params.operation === 'buy'
        ? Number(actualPrice) - (Number(actualPrice) * params.stopPercentage / 100)
        : Number(actualPrice) + (Number(actualPrice) * params.stopPercentage / 100)) : '-';
      
      let stopTrigger: string = '-';
      if (trade !== "-" && stopPrice !== '-') {
        if (params.operation === 'buy') {
          stopTrigger = lowPrice <= Number(stopPrice) ? "Executed" : "-";
        } else {
          stopTrigger = highPrice >= Number(stopPrice) ? "Executed" : "-";
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
            ? (closePrice - Number(actualPrice)) * lotSize
            : (Number(actualPrice) - closePrice) * lotSize;
        }
      }
      
      capital = Math.max(0, previousCapital + profitLoss);
      
      tradeHistory.push({
        date: currentData.date,
        entryPrice: openPrice,
        exitPrice: closePrice,
        high: highPrice,
        low: lowPrice,
        volume: Number(currentData.volume),
        suggestedEntryPrice,
        actualPrice,
        trade,
        lotSize,
        stopPrice,
        stopTrigger,
        profitLoss,
        currentCapital: capital
      });
    }
    
    return tradeHistory;
  },

  calculateMetricsOptimized(stockData: any[], tradeHistory: TradeHistoryItem[], initialCapital: number) {
    const capitalEvolution: { date: string; capital: number }[] = [];
    capitalEvolution.push({ date: tradeHistory[0]?.date || new Date().toISOString().split('T')[0], capital: initialCapital });

    for (const trade of tradeHistory) {
      if (trade.profitLoss !== 0) {
        capitalEvolution.push({
          date: trade.date,
          capital: trade.currentCapital ?? initialCapital
        });
      }
    }

    const lastTrade = tradeHistory[tradeHistory.length - 1];
    if (lastTrade && capitalEvolution[capitalEvolution.length - 1]?.date !== lastTrade.date) {
      capitalEvolution.push({ date: lastTrade.date, capital: lastTrade.currentCapital ?? initialCapital });
    }

    const uniqueCapitalEvolution = Array.from(new Map(capitalEvolution.map(item => [item.date, item])).values());

    const tradingDays = new Set(stockData.map(item => item.date)).size;
    const executedTrades = tradeHistory.filter(trade => trade.trade === 'Buy' || trade.trade === 'Sell');
    const trades = executedTrades.length;
    
    let profits = 0;
    let losses = 0;
    let stops = 0;
    let totalProfit = 0;
    let totalLoss = 0;
    
    for (const trade of executedTrades) {
      if (trade.profitLoss > 0) {
        profits++;
        totalProfit += trade.profitLoss;
      } else if (trade.profitLoss < 0) {
        if (trade.stopTrigger === 'Executed') {
          stops++;
        } else {
          losses++;
        }
        totalLoss += trade.profitLoss;
      }
    }
    
    const tradePercentage = tradingDays > 0 ? (trades / tradingDays) * 100 : 0;
    const profitRate = trades > 0 ? (profits / trades) * 100 : 0;
    const lossRate = trades > 0 ? (losses / trades) * 100 : 0;
    const stopRate = trades > 0 ? (stops / trades) * 100 : 0;
    
    const sortedTradeHistory = [...tradeHistory].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const lastTradeItem = sortedTradeHistory[sortedTradeHistory.length - 1];
    const finalCapital = lastTradeItem.currentCapital || initialCapital;
      
    const profit = finalCapital - initialCapital;
    const overallProfitPercentage = initialCapital > 0 ? (profit / initialCapital) * 100 : 0;
    
    const averageGain = profits > 0 ? totalProfit / profits : 0;
    const averageLoss = (losses + stops) > 0 ? Math.abs(totalLoss) / (losses + stops) : 0;
    
    let maxDrawdown = 0;
    let peak = initialCapital;
    
    for (const point of uniqueCapitalEvolution) {
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
    
    const recoveryFactor = maxDrawdown > 0 ? Math.abs(profit / (maxDrawdown / 100 * initialCapital)) : 0;
    const successRate = trades > 0 ? (profits / trades) * 100 : 0;
    
    const metrics = {
      tradingDays,
      trades,
      tradePercentage,
      profits,
      profitPercentage: profitRate,
      losses,
      lossPercentage: lossRate,
      stops,
      stopPercentage: stopRate,
      // finalCapital removido - será definido no método principal
      profit,
      averageGain,
      averageLoss,
      maxDrawdown,
      sharpeRatio: 0,
      sortinoRatio: 0,
      recoveryFactor,
      successRate
    };

    return {
      capitalEvolution: uniqueCapitalEvolution,
      metrics
    };
  },

  async getDataTableName(country: string, stockMarket: string, assetClass: string): Promise<string | null> {
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
  }
};
