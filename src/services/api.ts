import { supabase, fromDynamic } from "@/integrations/supabase/client";
import {
  MarketDataSource,
  StockAnalysisParams,
  AnalysisResult,
  TradeHistoryItem,
} from "@/types";
import { filterDataByPeriod } from "@/utils/dateUtils";
import { calculateMetrics } from "@/utils/analysisUtils";

// Auth functions
export const signUp = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
    options: {
      data: {
        level_id: 1,
        status_users: 'pending'
      }
    }
  });
  
  if (error) {
    console.error("Sign up failed:", error);
    throw error;
  }
  
  return data;
};

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });
  
  if (error) {
    console.error("Sign in failed:", error);
    throw error;
  }
  
  return data;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  
  if (error) {
    console.error("Sign out failed:", error);
    throw error;
  }
};

export const resetPassword = async (email: string) => {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/update-password`,
  });
  
  if (error) {
    console.error("Password reset failed:", error);
    throw error;
  }
  
  return data;
};

export const updatePassword = async (password: string) => {
  const { data, error } = await supabase.auth.updateUser({ password: password });
  
  if (error) {
    console.error("Password update failed:", error);
    throw error;
  }
  
  return data;
};

export const getUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

export const getSession = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};

// Updated user data handling
export const handleUserDataFromCheck = (userData: any) => {
  return {
    id: userData.id || '',
    email: userData.email || '',
    full_name: userData.name || userData.full_name || '',
    avatar_url: userData.avatar_url,
    level_id: userData.level_id || 1,
    status: userData.status_users || 'pending',
    email_verified: userData.email_verified || false,
    account_type: 'free',
    created_at: userData.created_at || new Date().toISOString(),
    last_login: userData.last_login
  };
};

// Market Data functions
export const getMarketDataSources = async (): Promise<MarketDataSource[]> => {
  try {
    const { data, error } = await supabase
      .from('market_data_sources')
      .select('*');
    
    if (error) {
      console.error("Error fetching market data sources:", error);
      throw new Error(error.message);
    }
    
    return data || [];
  } catch (error) {
    console.error("Failed to fetch market data sources:", error);
    throw error;
  }
};

export const getDataTableName = async (country: string, stockMarket: string, assetClass: string): Promise<string | null> => {
  try {
    const { data, error } = await supabase
      .from('market_data_sources')
      .select('stock_table')
      .eq('country', country)
      .eq('stock_market', stockMarket)
      .eq('asset_class', assetClass)
      .single();
    
    if (error) {
      console.error("Error fetching data table name:", error);
      return null;
    }
    
    return data ? data.stock_table : null;
  } catch (error) {
    console.error("Failed to fetch data table name:", error);
    return null;
  }
};

// Fixed analysis functions
export const runAnalysis = async (params: StockAnalysisParams, onProgress?: (progress: number) => void): Promise<AnalysisResult[]> => {
  console.log('Starting analysis with params:', params);
  
  try {
    onProgress?.(10);
    
    const dataTableName = params.dataTableName || await getDataTableName(
      params.country, 
      params.stockMarket, 
      params.assetClass
    );
    
    if (!dataTableName) {
      throw new Error("Failed to identify data source");
    }
    
    onProgress?.(25);
    
    console.log(`Using table: ${dataTableName}`);
    
    const { data: stocks, error: stocksError } = await supabase.rpc('get_unique_stock_codes', {
      p_table_name: dataTableName
    });
    
    if (stocksError) {
      console.error('Error fetching unique stock codes:', stocksError);
      throw new Error(`Failed to fetch stock codes: ${stocksError.message}`);
    }
    
    if (!stocks || stocks.length === 0) {
      throw new Error("No stocks found for the given criteria");
    }
    
    console.log(`Found ${stocks.length} stocks to analyze`);
    onProgress?.(40);
    
    const results: AnalysisResult[] = [];
    const progressStep = 50 / stocks.length;
    
    for (let i = 0; i < stocks.length; i++) {
      const stockCode = stocks[i];
      console.log(`Analyzing stock ${i + 1}/${stocks.length}: ${stockCode}`);
      
      try {
        const { data: stockData, error: stockDataError } = await supabase.rpc('get_stock_data', {
          p_table_name: dataTableName,
          p_stock_code_param: stockCode
        });
        
        if (stockDataError) {
          console.error(`Error fetching data for ${stockCode}:`, stockDataError);
          continue;
        }
        
        if (!stockData || stockData.length === 0) {
          console.warn(`No data found for stock: ${stockCode}`);
          continue;
        }
        
        const item = stockData.find((item: any) => item !== null && item !== undefined);
        if (!item) {
          console.warn(`No valid data found for stock: ${stockCode}`);
          continue;
        }
        
        const stockName = item.stock_code || stockCode;
        
        // Filter data by period
        const filteredData = filterDataByPeriod(stockData, params.period);
        
        if (filteredData.length < 10) {
          console.warn(`Not enough data for ${stockCode} (${filteredData.length} records)`);
          continue;
        }
        
        const tradeHistory = generateTradeHistory(filteredData, params, stockCode);
        const metrics = calculateMetrics(tradeHistory, params.initialCapital);
        
        const result: AnalysisResult = {
          assetCode: stockCode,
          assetName: stockName,
          tradingDays: filteredData.length,
          trades: metrics.totalTrades,
          tradePercentage: metrics.totalTrades > 0 ? (metrics.totalTrades / filteredData.length) * 100 : 0,
          profits: metrics.profits,
          profitPercentage: metrics.totalTrades > 0 ? (metrics.profits / metrics.totalTrades) * 100 : 0,
          losses: metrics.losses,
          lossPercentage: metrics.totalTrades > 0 ? (metrics.losses / metrics.totalTrades) * 100 : 0,
          stops: metrics.stops,
          stopPercentage: metrics.totalTrades > 0 ? (metrics.stops / metrics.totalTrades) * 100 : 0,
          finalCapital: metrics.finalCapital,
          profit: metrics.finalCapital - params.initialCapital,
          averageGain: metrics.averageGain,
          averageLoss: metrics.averageLoss,
          maxDrawdown: metrics.maxDrawdown,
          sharpeRatio: metrics.sharpeRatio,
          sortinoRatio: metrics.sortinoRatio,
          recoveryFactor: metrics.recoveryFactor,
          successRate: metrics.successRate,
          tradeHistory: tradeHistory
        };
        
        results.push(result);
        
      } catch (stockError) {
        console.error(`Error analyzing stock ${stockCode}:`, stockError);
        continue;
      }
      
      onProgress?.(40 + (i + 1) * progressStep);
    }
    
    onProgress?.(95);
    
    console.log(`Analysis completed. Generated ${results.length} results out of ${stocks.length} stocks.`);
    
    return results;
    
  } catch (error) {
    console.error('Analysis failed:', error);
    throw error;
  }
};

// Fixed generateTradeHistory function
const generateTradeHistory = (data: any[], params: StockAnalysisParams, stockCode: string): TradeHistoryItem[] => {
  const history: TradeHistoryItem[] = [];
  let currentCapital = params.initialCapital;
  
  for (let i = 0; i < data.length; i++) {
    const dayData = data[i];
    const referencePrice = Number(dayData[params.referencePrice]) || 0;
    const high = Number(dayData.high) || 0;
    const low = Number(dayData.low) || 0;
    const close = Number(dayData.close) || 0;
    const volume = Number(dayData.volume) || 0;
    
    if (referencePrice <= 0 || high <= 0 || low <= 0 || close <= 0) {
      continue;
    }
    
    const entryPriceCalc = referencePrice * (1 + (params.entryPercentage / 100));
    const stopPriceCalc = referencePrice * (1 - (params.stopPercentage / 100));
    
    let trade = 'Not Executed';
    let actualPrice: number | string = '-';
    let stopPrice: number | string = '-';
    let profitLoss = 0;
    let lotSize = 0;
    
    if (params.operation === 'buy') {
      if (low <= entryPriceCalc) {
        trade = 'Buy';
        actualPrice = Number(entryPriceCalc.toFixed(2));
        stopPrice = Number(stopPriceCalc.toFixed(2));
        lotSize = Math.floor(currentCapital / actualPrice);
        
        if (low <= stopPrice) {
          profitLoss = (stopPrice - actualPrice) * lotSize;
        } else {
          profitLoss = (close - actualPrice) * lotSize;
        }
        
        currentCapital += profitLoss;
      }
    }
    
    const historyItem: TradeHistoryItem = {
      date: dayData.date,
      entryPrice: referencePrice,
      exitPrice: close,
      profitLoss: profitLoss,
      profitPercentage: actualPrice !== '-' ? ((close - Number(actualPrice)) / Number(actualPrice)) * 100 : 0,
      trade: trade as any,
      stop: typeof stopPrice === 'number' && low <= stopPrice ? 'Executed' : '-',
      volume: volume,
      high: high,
      low: low,
      suggestedEntryPrice: entryPriceCalc,
      actualPrice: actualPrice,
      lotSize: lotSize,
      stopPrice: stopPrice,
      currentCapital: currentCapital
    };
    
    history.push(historyItem);
  }
  
  return history;
};

export const getDetailedAnalysis = async (assetCode: string, params: StockAnalysisParams) => {
  try {
    const dataTableName = params.dataTableName || await getDataTableName(
      params.country,
      params.stockMarket,
      params.assetClass
    );
    
    if (!dataTableName) {
      throw new Error("Failed to identify data source");
    }
    
    const { data: stockData, error: stockDataError } = await supabase.rpc('get_stock_data', {
      p_table_name: dataTableName,
      p_stock_code_param: assetCode
    });
    
    if (stockDataError) {
      console.error(`Error fetching data for ${assetCode}:`, stockDataError);
      throw new Error(`Failed to fetch stock data: ${stockDataError.message}`);
    }
    
    if (!stockData || stockData.length === 0) {
      console.warn(`No data found for stock: ${assetCode}`);
      throw new Error(`No data found for stock: ${assetCode}`);
    }
    
    const item = stockData.find((item: any) => item !== null && item !== undefined);
    if (!item) {
      console.warn(`No valid data found for stock: ${assetCode}`);
      throw new Error(`No valid data found for stock: ${assetCode}`);
    }
    
    const stockName = item.stock_code || assetCode;
    
    // Filter data by period
    const filteredData = filterDataByPeriod(stockData, params.period);
    
    if (filteredData.length < 10) {
      console.warn(`Not enough data for ${assetCode} (${filteredData.length} records)`);
      throw new Error(`Not enough data for ${assetCode}`);
    }
    
    const tradeHistory = generateTradeHistory(filteredData, params, assetCode);
    const metrics = calculateMetrics(tradeHistory, params.initialCapital);
    
    const capitalEvolution = tradeHistory.map(item => ({
      date: item.date,
      capital: item.currentCapital || 0
    }));
    
    const detailedResult = {
      assetCode: assetCode,
      assetName: stockName,
      tradingDays: filteredData.length,
      trades: metrics.totalTrades,
      tradePercentage: metrics.totalTrades > 0 ? (metrics.totalTrades / filteredData.length) * 100 : 0,
      profits: metrics.profits,
      profitPercentage: metrics.totalTrades > 0 ? (metrics.profits / metrics.totalTrades) * 100 : 0,
      losses: metrics.losses,
      lossPercentage: metrics.totalTrades > 0 ? (metrics.losses / metrics.totalTrades) * 100 : 0,
      stops: metrics.stops,
      stopPercentage: metrics.totalTrades > 0 ? (metrics.stops / metrics.totalTrades) * 100 : 0,
      finalCapital: metrics.finalCapital,
      profit: metrics.finalCapital - params.initialCapital,
      averageGain: metrics.averageGain,
      averageLoss: metrics.averageLoss,
      maxDrawdown: metrics.maxDrawdown,
      sharpeRatio: metrics.sharpeRatio,
      sortinoRatio: metrics.sortinoRatio,
      recoveryFactor: metrics.recoveryFactor,
      successRate: metrics.successRate,
      tradeHistory: tradeHistory,
      capitalEvolution: capitalEvolution
    };
    
    return detailedResult;
    
  } catch (error) {
    console.error('Failed to fetch detailed analysis:', error);
    throw error;
  }
};
