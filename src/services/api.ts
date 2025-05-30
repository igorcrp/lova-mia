
import { supabase, fromDynamic, type MarketDataSource, type StockRecord } from "@/integrations/supabase/client";
import { StockAnalysisParams, AnalysisResult, DetailedResult, TradeRecord } from "@/types";

// API configuration
const API_BASE_URL = 'https://api.example.com'; // Replace with actual API URL

// Helper function to simulate analysis calculations
const simulateAnalysis = (stockData: StockRecord[], params: StockAnalysisParams): AnalysisResult => {
  if (!stockData || stockData.length === 0) {
    return {
      stockCode: 'UNKNOWN',
      totalTrades: 0,
      winRate: 0,
      totalReturn: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      tradingDays: 0
    };
  }

  // Simple simulation based on price movements
  const trades = stockData.slice(0, -1).map((record, index) => {
    const nextRecord = stockData[index + 1];
    const entry = record.close;
    const exit = nextRecord.open;
    const return_pct = ((exit - entry) / entry) * 100;
    
    return {
      date: record.date,
      entry_price: entry,
      exit_price: exit,
      return_pct
    };
  });

  const winningTrades = trades.filter(t => t.return_pct > 0);
  const totalReturn = trades.reduce((sum, t) => sum + t.return_pct, 0);
  
  return {
    stockCode: stockData[0].stock_code,
    totalTrades: trades.length,
    winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
    totalReturn,
    maxDrawdown: Math.min(...trades.map(t => t.return_pct)),
    sharpeRatio: totalReturn / Math.sqrt(trades.length),
    tradingDays: stockData.length
  };
};

// Helper function to get date range based on period
const getDateRange = (period: string) => {
  const endDate = new Date();
  const startDate = new Date();
  
  switch (period) {
    case '1D':
      startDate.setDate(endDate.getDate() - 1);
      break;
    case '1W':
      startDate.setDate(endDate.getDate() - 7);
      break;
    case '1M':
      startDate.setMonth(endDate.getMonth() - 1);
      break;
    case '3M':
      startDate.setMonth(endDate.getMonth() - 3);
      break;
    case '6M':
      startDate.setMonth(endDate.getMonth() - 6);
      break;
    case '1Y':
      startDate.setFullYear(endDate.getFullYear() - 1);
      break;
    case '2Y':
      startDate.setFullYear(endDate.getFullYear() - 2);
      break;
    default:
      startDate.setMonth(endDate.getMonth() - 3); // Default to 3 months
  }
  
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  };
};

export const api = {
  marketData: {
    async getDataTableName(country: string, stockMarket: string, assetClass: string): Promise<string | null> {
      try {
        console.log('Fetching data table name for:', { country, stockMarket, assetClass });
        
        const { data, error } = await supabase
          .from('market_data_sources')
          .select('stock_table')
          .eq('country', country)
          .eq('stock_market', stockMarket)
          .eq('asset_class', assetClass)
          .maybeSingle();

        if (error) {
          console.error('Error fetching data table name:', error);
          throw error;
        }

        if (!data) {
          console.warn('No data source found for the specified criteria');
          return null;
        }

        console.log('Found data table:', data.stock_table);
        return data.stock_table;
      } catch (error) {
        console.error('Failed to get data table name:', error);
        throw error;
      }
    },

    async getMarketDataSources(): Promise<MarketDataSource[]> {
      try {
        console.log('Fetching market data sources...');
        
        const { data, error } = await supabase
          .from('market_data_sources')
          .select('*')
          .order('country', { ascending: true })
          .order('stock_market', { ascending: true });

        if (error) {
          console.error('Error fetching market data sources:', error);
          throw error;
        }

        console.log('Fetched market data sources:', data?.length || 0, 'records');
        return data || [];
      } catch (error) {
        console.error('Failed to fetch market data sources:', error);
        throw error;
      }
    },

    async getUniqueStockCodes(tableName: string): Promise<string[]> {
      try {
        console.log('Fetching unique stock codes from table:', tableName);
        
        // Use the PostgreSQL function to get unique stock codes
        const { data, error } = await supabase
          .rpc('get_unique_stock_codes', { p_table_name: tableName });

        if (error) {
          console.error('Error fetching unique stock codes:', error);
          throw error;
        }

        console.log('Fetched unique stock codes:', data?.length || 0, 'codes');
        return data || [];
      } catch (error) {
        console.error('Failed to fetch unique stock codes:', error);
        throw error;
      }
    },

    async getStockData(tableName: string, stockCode: string, params: StockAnalysisParams): Promise<StockRecord[]> {
      try {
        console.log('Fetching stock data for:', { tableName, stockCode, params });
        
        // Use the PostgreSQL function to get stock data
        const { data, error } = await supabase
          .rpc('get_stock_data', { 
            p_table_name: tableName, 
            p_stock_code_param: stockCode,
            p_limit_rows: 500 // Increase limit for better analysis
          });

        if (error) {
          console.error('Error fetching stock data:', error);
          throw error;
        }

        console.log('Fetched stock data:', data?.length || 0, 'records');
        return data || [];
      } catch (error) {
        console.error('Failed to fetch stock data:', error);
        throw error;
      }
    }
  },

  analysis: {
    async runAnalysis(params: StockAnalysisParams, onProgress?: (progress: number) => void): Promise<AnalysisResult[]> {
      try {
        console.log('Running analysis with params:', params);
        
        if (!params.dataTableName) {
          throw new Error('Data table name is required for analysis');
        }

        // Get unique stock codes from the specified table
        const stockCodes = await api.marketData.getUniqueStockCodes(params.dataTableName);
        
        if (stockCodes.length === 0) {
          console.warn('No stock codes found in the specified table');
          return [];
        }

        console.log(`Processing ${stockCodes.length} stocks...`);
        
        const results: AnalysisResult[] = [];
        const totalStocks = Math.min(stockCodes.length, 50); // Limit to 50 stocks for performance
        
        for (let i = 0; i < totalStocks; i++) {
          const stockCode = stockCodes[i];
          
          try {
            // Update progress
            if (onProgress) {
              onProgress((i / totalStocks) * 100);
            }
            
            // Fetch stock data for this specific stock
            const stockData = await api.marketData.getStockData(params.dataTableName, stockCode, params);
            
            if (stockData && stockData.length > 0) {
              // Simulate analysis for this stock
              const result = simulateAnalysis(stockData, params);
              results.push(result);
              
              console.log(`Processed ${stockCode}: ${result.totalTrades} trades, ${result.winRate.toFixed(1)}% win rate`);
            }
          } catch (stockError) {
            console.error(`Failed to process stock ${stockCode}:`, stockError);
            // Continue with next stock instead of failing completely
          }
        }

        console.log(`Analysis completed: processed ${results.length} stocks`);
        return results.sort((a, b) => b.totalReturn - a.totalReturn); // Sort by total return descending
      } catch (error) {
        console.error('Analysis failed:', error);
        throw error;
      }
    },

    async getDetailedAnalysis(stockCode: string, params: StockAnalysisParams): Promise<DetailedResult> {
      try {
        console.log('Getting detailed analysis for:', stockCode, params);
        
        if (!params.dataTableName) {
          throw new Error('Data table name is required for detailed analysis');
        }

        // Fetch stock data for detailed analysis
        const stockData = await api.marketData.getStockData(params.dataTableName, stockCode, params);
        
        if (!stockData || stockData.length === 0) {
          throw new Error(`No data found for stock ${stockCode}`);
        }

        // Generate trade history from stock data
        const tradeHistory: TradeRecord[] = stockData.slice(0, -1).map((record, index) => {
          const nextRecord = stockData[index + 1];
          const entry = record.close;
          const exit = nextRecord.open;
          const return_pct = ((exit - entry) / entry) * 100;
          
          return {
            date: record.date,
            type: return_pct > 0 ? 'win' as const : 'loss' as const,
            entryPrice: entry,
            exitPrice: exit,
            returnPct: return_pct,
            volume: record.volume || 0
          };
        });

        // Calculate summary statistics
        const winningTrades = tradeHistory.filter(t => t.returnPct > 0);
        const totalReturn = tradeHistory.reduce((sum, t) => sum + t.returnPct, 0);
        
        const result: DetailedResult = {
          stockCode,
          totalTrades: tradeHistory.length,
          winRate: tradeHistory.length > 0 ? (winningTrades.length / tradeHistory.length) * 100 : 0,
          totalReturn,
          maxDrawdown: Math.min(...tradeHistory.map(t => t.returnPct)),
          sharpeRatio: totalReturn / Math.sqrt(tradeHistory.length),
          tradingDays: stockData.length,
          tradeHistory,
          monthlyReturns: [], // Could be calculated from tradeHistory if needed
          riskMetrics: {
            volatility: Math.sqrt(tradeHistory.reduce((sum, t) => sum + Math.pow(t.returnPct, 2), 0) / tradeHistory.length),
            maxConsecutiveLosses: 0, // Could be calculated from tradeHistory
            averageWin: winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.returnPct, 0) / winningTrades.length : 0,
            averageLoss: 0 // Could be calculated from losing trades
          }
        };

        console.log('Detailed analysis completed for:', stockCode);
        return result;
      } catch (error) {
        console.error('Failed to get detailed analysis:', error);
        throw error;
      }
    }
  }
};
