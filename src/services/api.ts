
import { supabase } from "@/integrations/supabase/client";
import { 
  StockAnalysisParams, 
  AnalysisResult, 
  DetailedResult, 
  MarketDataSource, 
  Asset, 
  User,
  TradeHistoryItem,
  CapitalPoint 
} from "@/types";
import { UserCheckResponse, StockDataItem } from "./apiTypes";

const ITEMS_PER_PAGE = 10;

const getAssets = async (page: number = 1, search: string = '', country: string = 'brazil', stockMarket: string = 'b3', assetClass: string = 'stocks'): Promise<{ data: Asset[]; total: number; }> => {
  // Since 'assets' table doesn't exist in Supabase, we'll return mock data for now
  const mockAssets: Asset[] = [
    {
      id: '1',
      code: 'WEGE3',
      name: 'Weg S.A.',
      country: 'brazil',
      stock_market: 'b3',
      asset_class: 'stocks',
      status: 'active'
    },
    {
      id: '2', 
      code: 'VALE3',
      name: 'Vale S.A.',
      country: 'brazil',
      stock_market: 'b3',
      asset_class: 'stocks',
      status: 'active'
    }
  ];

  // Filter by search if provided
  const filteredAssets = search 
    ? mockAssets.filter(asset => asset.code.toLowerCase().includes(search.toLowerCase()))
    : mockAssets;

  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const paginatedAssets = filteredAssets.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return {
    data: paginatedAssets,
    total: filteredAssets.length,
  };
};

const getAllAssets = async (): Promise<Asset[]> => {
  // Return mock data since assets table doesn't exist
  return [
    {
      id: '1',
      code: 'WEGE3',
      name: 'Weg S.A.',
      country: 'brazil',
      stock_market: 'b3',
      asset_class: 'stocks',
      status: 'active'
    },
    {
      id: '2', 
      code: 'VALE3',
      name: 'Vale S.A.',
      country: 'brazil',
      stock_market: 'b3',
      asset_class: 'stocks',
      status: 'active'
    }
  ];
};

const getAssetByCode = async (code: string): Promise<Asset | null> => {
  // Return mock data
  const mockAssets = await getAllAssets();
  return mockAssets.find(asset => asset.code === code) || null;
};

const createAsset = async (asset: Omit<Asset, 'id'>): Promise<Asset | null> => {
  // Mock implementation - would normally create in database
  return {
    id: Math.random().toString(),
    ...asset
  };
};

const updateAsset = async (id: string, updates: Partial<Asset>): Promise<Asset | null> => {
  // Mock implementation
  const asset = await getAssetByCode(id);
  if (!asset) return null;
  
  return {
    ...asset,
    ...updates
  };
};

const deleteAsset = async (id: string): Promise<void> => {
  // Mock implementation
  console.log('Asset deleted:', id);
};

const getMarketDataSources = async (): Promise<MarketDataSource[]> => {
  const { data, error } = await supabase
    .from('market_data_sources')
    .select('*');

  if (error) {
    console.error("Error fetching market data sources:", error);
    throw error;
  }

  return data || [];
};

const getDataTableName = async (country: string, stockMarket: string, assetClass: string): Promise<string | null> => {
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
    console.error("Error fetching data table name:", error);
    return null;
  }
};

const runAnalysis = async (
  params: StockAnalysisParams,
  onProgress?: (progress: number) => void
): Promise<AnalysisResult[]> => {
  try {
    if (!params.dataTableName) {
      throw new Error("Data table name is required to run analysis.");
    }

    // Simulate progress updates
    const totalSteps = 100;
    let currentProgress = 0;

    // Helper function to simulate progress
    const updateProgress = (increment: number) => {
      currentProgress += increment;
      if (onProgress) {
        onProgress(Math.min(currentProgress, totalSteps)); // Ensure progress does not exceed 100
      }
    };

    // Initial progress
    updateProgress(5);

    // Fetch stock data from the database
    const stockData = await fetchStockData(params);
    updateProgress(40);

    // Process the stock data and perform the analysis
    const { results } = processAnalysisData(stockData, params);
    updateProgress(50);

    return results;
  } catch (error) {
    console.error("Error running analysis:", error);
    throw error;
  }
};

const getDetailedAnalysis = async (
  assetCode: string,
  params: StockAnalysisParams
): Promise<DetailedResult | null> => {
  try {
    if (!params.dataTableName) {
      throw new Error("Data table name is required to fetch detailed analysis.");
    }

    // Fetch stock data from the database
    const stockData = await fetchStockData(params);

    // Process the stock data and perform the analysis
    const { detailedResults } = processAnalysisData(stockData, params);

    const detailedResult = detailedResults.get(assetCode);
    if (!detailedResult) {
      console.warn(`No detailed result found for asset code: ${assetCode}`);
      return null;
    }

    return detailedResult;
  } catch (error) {
    console.error("Error fetching detailed analysis:", error);
    throw error;
  }
};

const fetchStockData = async (params: StockAnalysisParams): Promise<StockDataItem[]> => {
  try {
    if (!params.dataTableName) {
      throw new Error("Data table name is required to fetch stock data.");
    }

    let query = supabase
      .from(params.dataTableName)
      .select('*')
      .eq('stock_code', params.comparisonStocks ? params.comparisonStocks[0] : 'WEGE3')

    // Conditionally filter by date range based on the selected period
    if (params.period !== 'all') {
      const today = new Date();
      let startDate: Date;

      switch (params.period) {
        case '1 month':
          startDate = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
          break;
        case '3 months':
          startDate = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
          break;
        case '6 months':
          startDate = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
          break;
        case '1 year':
          startDate = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
          break;
        case '2 years':
          startDate = new Date(today.getFullYear() - 2, today.getMonth(), today.getDate());
          break;
        case '3 years':
          startDate = new Date(today.getFullYear() - 3, today.getMonth(), today.getDate());
          break;
        case '5 years':
          startDate = new Date(today.getFullYear() - 5, today.getMonth(), today.getDate());
          break;
        default:
          throw new Error(`Unsupported period: ${params.period}`);
      }

      // Format the dates to string in 'YYYY-MM-DD' format
      const formattedStartDate = startDate.toISOString().slice(0, 10);
      const formattedEndDate = today.toISOString().slice(0, 10);

      query = query.gte('date', formattedStartDate).lte('date', formattedEndDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching stock data:", error);
      throw error;
    }

    return processStockData(data || []);
  } catch (error) {
    console.error("Error fetching stock data:", error);
    throw error;
  }
};

const checkUser = async (email: string): Promise<User | null> => {
  try {
    const { data, error } = await supabase
      .rpc('check_user_exists', { email_param: email });

    if (error) {
      console.error('Error checking user:', error);
      return null;
    }

    // Handle the API response with proper typing
    const response = data as UserCheckResponse;
    
    if (response.user_exists) {
      return {
        id: response.id || '',
        email: response.email || email,
        full_name: response.name || '',
        level_id: response.level_id || 1,
        status: response.status_users as 'active' | 'inactive' | 'pending' || 'active',
        email_verified: response.email_verified || false,
        plan_type: 'free' // Default plan type
      };
    }

    return null;
  } catch (error) {
    console.error('Error in checkUser:', error);
    return null;
  }
};

const getSubscriptionStatus = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('stripe_subscription_status')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error("Error fetching subscription status:", error);
      return null;
    }
    
    return data ? data.stripe_subscription_status : null;
  } catch (error) {
    console.error("Error fetching subscription status:", error);
    return null;
  }
};

const createSupabaseClient = async (accessToken: string) => {
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: ''
  })

  if (error) {
    console.log('Error in setSession', error)
    return null
  }

  return data
}

const getCustomerPortalUrl = async () => {
    try {
        const { data, error } = await supabase.functions.invoke('customer-portal');

        if (error) {
            console.error('Error invoking customer-portal function:', error);
            return null;
        }

        return data?.url || null;
    } catch (error) {
        console.error('Error getting customer portal URL:', error);
        return null;
    }
};

const createCheckoutSession = async () => {
  try {
      const { data, error } = await supabase.functions.invoke('create-checkout');

      if (error) {
          console.error('Error invoking create-checkout function:', error);
          return null;
      }

      return data?.url || null;
  } catch (error) {
      console.error('Error creating checkout session:', error);
      return null;
  }
};

const processStockData = (data: any[]): StockDataItem[] => {
  return data.map(item => {
    if (!item) return null; // Handle null items
    
    return {
      stock_code: item.stock_code || '',
      date: item.date || '',
      open: Number(item.open) || 0,
      high: Number(item.high) || 0,
      low: Number(item.low) || 0,
      close: Number(item.close) || 0,
      volume: Number(item.volume) || 0
    };
  }).filter(item => item !== null) as StockDataItem[]; // Filter out null items
};

const processAnalysisData = (
  stockData: StockDataItem[], 
  params: StockAnalysisParams
): { results: AnalysisResult[], detailedResults: Map<string, DetailedResult> } => {
  const results: AnalysisResult[] = [];
  const detailedResults = new Map<string, DetailedResult>();
  
  // Group data by stock code
  const groupedData = stockData.reduce((acc, item) => {
    if (!acc[item.stock_code]) {
      acc[item.stock_code] = [];
    }
    acc[item.stock_code].push(item);
    return acc;
  }, {} as Record<string, StockDataItem[]>);

  Object.entries(groupedData).forEach(([stockCode, data]) => {
    if (data.length === 0) return;

    // Sort data by date
    const sortedData = data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    let capital = params.initialCapital;
    const trades: number[] = [];
    const tradeHistory: TradeHistoryItem[] = [];
    const capitalEvolution: CapitalPoint[] = [];
    
    let totalTrades = 0;
    let profitableTrades = 0;
    let stopTrades = 0;

    sortedData.forEach((dayData, index) => {
      // Convert string/number types to numbers properly
      const open = Number(dayData.open);
      const high = Number(dayData.high);
      const low = Number(dayData.low);
      const close = Number(dayData.close);
      const volume = Number(dayData.volume);

      // Calculate entry price based on reference price
      let referencePrice = open;
      if (params.referencePrice === 'high') referencePrice = high;
      else if (params.referencePrice === 'low') referencePrice = low;
      else if (params.referencePrice === 'close') referencePrice = close;

      const entryPrice = referencePrice * (1 + (params.entryPercentage / 100) * (params.operation === 'buy' ? 1 : -1));
      const stopPrice = referencePrice * (1 - (params.stopPercentage / 100) * (params.operation === 'buy' ? 1 : -1));

      let tradeType = '-';
      let stopType = '-';
      let profitLoss = 0;

      if (params.operation === 'buy') {
        if (low <= entryPrice && trades.length === 0) {
          totalTrades++;
          tradeType = 'Buy';
          if (high >= stopPrice) {
            stopTrades++;
            stopType = 'Executed';
            profitLoss = -(capital * (params.stopPercentage / 100));
            capital += profitLoss;
          } else {
            profitableTrades++;
            profitLoss = capital * 0.02; // Mock profit calculation
            capital += profitLoss;
          }
          trades.push(profitLoss);
        }
      } else if (params.operation === 'sell') {
        if (high >= entryPrice && trades.length === 0) {
          totalTrades++;
          tradeType = 'Sell';
          if (low <= stopPrice) {
            stopTrades++;
            stopType = 'Executed';
            profitLoss = -(capital * (params.stopPercentage / 100));
            capital += profitLoss;
          } else {
            profitableTrades++;
            profitLoss = capital * 0.02; // Mock profit calculation
            capital += profitLoss;
          }
          trades.push(profitLoss);
        }
      }

      const tradeItem: TradeHistoryItem = {
        date: dayData.date,
        entryPrice: open,
        exitPrice: close,
        high: high,
        low: low,
        volume: volume,
        profitLoss: 0, // Calculate based on your logic
        profitPercentage: 0,
        trade: '-',
        stop: '-',
        suggestedEntryPrice: referencePrice,
        actualPrice: referencePrice,
        lotSize: 100,
        stopPrice: 0,
        currentCapital: capital,
        stopTrigger: '-'
      };

      tradeHistory.push(tradeItem);
      capitalEvolution.push({ date: dayData.date, capital });
    });

    const initialCapital = params.initialCapital;
    const profit = capital - initialCapital;
    const averageGain = trades.filter(t => t > 0).reduce((a, b) => a + b, 0) / Math.max(trades.filter(t => t > 0).length, 1);
    const averageLoss = Math.abs(trades.filter(t => t < 0).reduce((a, b) => a + b, 0)) / Math.max(trades.filter(t => t < 0).length, 1);
    const maxDrawdown = 0; // Calculate based on your logic
    const sharpeRatio = 0; // Calculate based on your logic
    const sortinoRatio = 0; // Calculate based on your logic
    const recoveryFactor = 0; // Calculate based on your logic
    const successRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;
    
    const result: AnalysisResult = {
      assetCode: stockCode,
      assetName: stockCode,
      tradingDays: sortedData.length,
      trades: totalTrades,
      tradePercentage: totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0,
      profits: profitableTrades,
      profitPercentage: totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0,
      losses: totalTrades - profitableTrades - stopTrades,
      lossPercentage: totalTrades > 0 ? ((totalTrades - profitableTrades - stopTrades) / totalTrades) * 100 : 0,
      stops: stopTrades,
      stopPercentage: totalTrades > 0 ? (stopTrades / totalTrades) * 100 : 0,
      finalCapital: capital,
      profit: capital - params.initialCapital,
      averageGain: trades.filter(t => t > 0).reduce((a, b) => a + b, 0) / Math.max(trades.filter(t => t > 0).length, 1),
      averageLoss: Math.abs(trades.filter(t => t < 0).reduce((a, b) => a + b, 0)) / Math.max(trades.filter(t => t < 0).length, 1),
      maxDrawdown: 0, // Calculate based on your logic
      sharpeRatio: 0, // Calculate based on your logic
      sortinoRatio: 0, // Calculate based on your logic
      recoveryFactor: 0, // Calculate based on your logic
      successRate: totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0
    };

    results.push(result);

    const detailedResult: DetailedResult = {
      ...result,
      tradeHistory,
      capitalEvolution
    };

    detailedResults.set(stockCode, detailedResult);
  });

  return { results, detailedResults };
};

export const api = {
  getAssets,
  getAllAssets,
  getAssetByCode,
  createAsset,
  updateAsset,
  deleteAsset,
  marketData: {
    getMarketDataSources,
    getDataTableName
  },
  analysis: {
    runAnalysis,
    getDetailedAnalysis
  },
  checkUser,
  getSubscriptionStatus,
  createSupabaseClient,
  getCustomerPortalUrl,
  createCheckoutSession
};
