import { supabase, fromDynamic, MarketDataSource, StockRecord } from '@/integrations/supabase/client';
import { AnalysisResult, Asset, DetailedResult, StockAnalysisParams, StockInfo, User, TradeHistoryItem } from '@/types';
import { formatDateToYYYYMMDD, getDateRangeForPeriod } from '@/utils/dateUtils';

// Serviço de autenticação (inalterado)
export const auth = {
  // ... mantenha igual ...
};

/**
 * Market Data API service para buscar dados de mercado
 */
const marketData = {
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
  },

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
  }
};

/**
 * Stock Analysis API service
 */
const analysis = {
  async getAvailableStocks(tableName: string): Promise<StockInfo[]> {
    try {
      if (!tableName) throw new Error('Table name is required');
      const { data, error } = await supabase.rpc('get_unique_stock_codes', {
        p_table_name: tableName
      });
      if (error) {
        console.error('Error getting unique stock codes:', error);
        return await this.getAvailableStocksDirect(tableName);
      }
      if (!data || !Array.isArray(data) || data.length === 0) {
        return await this.getAvailableStocksDirect(tableName);
      }
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

  async getAvailableStocksDirect(tableName: string): Promise<StockInfo[]> {
    try {
      const { data, error } = await fromDynamic(tableName)
        .select('stock_code')
        .groupBy('stock_code')
        .order('stock_code');
      if (error) {
        console.error('Error in direct stock code query:', error);
        throw error;
      }
      if (!data) return [];
      const stocks: StockInfo[] = (data as any[])
        .filter(item => item && typeof item === 'object' && 'stock_code' in item && item.stock_code)
        .map(item => ({
          code: String(item.stock_code),
          name: String(item.stock_code)
        }));
      return stocks;
    } catch (error) {
      console.error(`Failed in direct stock query for ${tableName}:`, error);
      return [];
    }
  },

  async getStockData(tableName: string, stockCode: string, period: string | undefined = undefined, limit: number = 300): Promise<any[]> {
    try {
      if (!tableName || !stockCode) throw new Error('Table name and stock code are required');
      if (period) {
        const dateRange = getDateRangeForPeriod(period);
        return await this.getStockDataDirectWithPeriod(tableName, stockCode, dateRange.startDate, dateRange.endDate);
      } else {
        return await this.getStockDataDirect(tableName, stockCode, limit);
      }
    } catch (error) {
      console.error('Failed to get stock data:', error);
      return [];
    }
  },

  async getStockDataDirect(tableName: string, stockCode: string, limit: number = 300): Promise<any[]> {
    try {
      const { data, error } = await fromDynamic(tableName)
        .select('*')
        .eq('stock_code', stockCode)
        .order('date', { ascending: false })
        .limit(limit);
      if (error) throw error;
      if (!data || !Array.isArray(data)) return [];
      return (data as any[]).reverse();
    } catch (error) {
      console.error(`Failed in direct stock data query (limit) for ${stockCode}:`, error);
      return [];
    }
  },

  async getStockDataDirectWithPeriod(
    tableName: string,
    stockCode: string,
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    try {
      const { data, error } = await fromDynamic(tableName)
        .select('*')
        .eq('stock_code', stockCode)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });
      if (error) throw error;
      if (!data || !Array.isArray(data)) return [];
      return data as any[];
    } catch (error) {
      console.error(`Failed to fetch period-filtered data for ${stockCode}:`, error);
      return [];
    }
  },

  async runAnalysis(
    params: StockAnalysisParams,
    progressCallback?: (progress: number) => void
  ): Promise<AnalysisResult[]> {
    try {
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
        if (!tableName) throw new Error('Could not determine data table name');
        params.dataTableName = tableName;
      }

      updateProgress(10);
      const stocks = await this.getAvailableStocks(params.dataTableName);

      if (!stocks || stocks.length === 0) {
        return [];
      }

      updateProgress(10);

      const results: AnalysisResult[] = [];
      const stocksToProcess = params.comparisonStocks && params.comparisonStocks.length > 0
        ? stocks.filter(s => params.comparisonStocks!.includes(s.code))
        : stocks;

      for (let i = 0; i < stocksToProcess.length; i++) {
        const stock = stocksToProcess[i];
        try {
          const stockData = await this.getStockData(
            params.dataTableName,
            stock.code,
            params.period
          );
          if (!stockData || stockData.length === 0) continue;
          const tradeHistory = await this.generateTradeHistory(stockData, params);
          if (!tradeHistory || tradeHistory.length === 0) continue;
          const lastCapital = tradeHistory[tradeHistory.length - 1].currentCapital ?? params.initialCapital;
          results.push({
            assetCode: stock.code,
            assetName: stock.name || stock.code,
            lastCurrentCapital: lastCapital,
            tradingDays: stockData.length,
            trades: 0, profits: 0, profitPercentage: 0, losses: 0, lossPercentage: 0, stops: 0, stopPercentage: 0,
            finalCapital: lastCapital,
            profit: lastCapital - params.initialCapital,
            averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0, successRate: 0
          });
          updateProgress(70 / stocksToProcess.length);
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

  // Lógica simplificada: apenas gera history para uso do WeeklyPortfolioPage
  async generateTradeHistory(stockData: any[], params: StockAnalysisParams): Promise<TradeHistoryItem[]> {
    if (!stockData || stockData.length === 0) return [];
    // Apenas retorna dados brutos, todo processamento semanal é feito na página WeeklyPortfolioPage
    return stockData.map(d => ({
      date: d.date,
      open: d.open,
      close: d.close,
      high: d.high,
      low: d.low,
      volume: d.volume,
      trade: '-',
      profit: 0,
      capital: params.initialCapital
    }));
  },

  async getDetailedAnalysis(
    stockCode: string,
    params: StockAnalysisParams
  ): Promise<DetailedResult> {
    try {
      if (!params.dataTableName) {
        const tableName = await marketData.getDataTableName(
          params.country,
          params.stockMarket,
          params.assetClass
        );
        if (!tableName) throw new Error('Could not determine data table name');
        params.dataTableName = tableName;
      }
      const stockData = await this.getStockData(
        params.dataTableName,
        stockCode,
        params.period
      );
      if (!stockData || stockData.length === 0) {
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
      const tradeHistory = await this.generateTradeHistory(stockData, params);
      return {
        assetCode: stockCode,
        assetName: stockCode,
        tradeHistory,
        capitalEvolution: [{ date: stockData[0]?.date || '', capital: params.initialCapital }],
        tradingDays: stockData.length,
        trades: 0, profits: 0, profitPercentage: 0, losses: 0, lossPercentage: 0, stops: 0, stopPercentage: 0,
        finalCapital: params.initialCapital, profit: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0, successRate: 0
      };
    } catch (error) {
      console.error(`Failed to get detailed analysis for ${stockCode}:`, error);
      throw error;
    }
  }
};

export const api = {
  auth,
  marketData,
  analysis
};
