import { supabase } from "@/integrations/supabase/client";
import { Asset, AnalysisResult, DetailedResult, StockAnalysisParams, MarketDataSource } from "@/types";

const createClient = () => {
  const client = supabase;
  return client;
};

const getProfile = async () => {
  try {
    const client = createClient();
    const { data, error } = await client.auth.getSession();

    if (error) {
      console.error("Error getting session:", error);
      return null;
    }

    const session = data.session;

    if (!session) {
      console.warn("No session found.");
      return null;
    }

    const user = session.user;

    if (!user) {
      console.warn("No user found in session.");
      return null;
    }

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("Error getting profile:", profileError);
      return null;
    }

    return profile;
  } catch (error) {
    console.error("Unexpected error:", error);
    return null;
  }
};

const updateProfile = async (updates: { full_name?: string; avatar_url?: string }) => {
  try {
    const client = createClient();
    const { data, error } = await client.auth.getSession();

    if (error) {
      console.error("Error getting session:", error);
      return null;
    }

    const session = data.session;

    if (!session) {
      console.warn("No session found.");
      return null;
    }

    const user = session.user;

    if (!user) {
      console.warn("No user found in session.");
      return null;
    }

    const { error: profileError } = await client
      .from("profiles")
      .update(updates)
      .eq("id", user.id);

    if (profileError) {
      console.error("Error updating profile:", profileError);
      return null;
    }

    return { success: true };
  } catch (error) {
    console.error("Unexpected error:", error);
    return null;
  }
};

// Define SubscriptionData interface
interface SubscriptionData {
  subscribed: boolean;
  subscription_tier?: string;
  subscription_end?: string;
}

const simulateAnalysisStep = async (stepNumber: number, totalSteps: number, onProgress?: (progress: number) => void) => {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
  
  if (onProgress) {
    const progress = (stepNumber / totalSteps) * 100;
    onProgress(progress);
  }
};

const generateMockTradeHistory = (assetCode: string, params: StockAnalysisParams, tradingDays: number) => {
  const history = [];
  let currentCapital = params.initialCapital;
  
  for (let i = 0; i < tradingDays; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (tradingDays - i));
    
    // Random trade simulation
    const hasTradeToday = Math.random() < 0.3; // 30% chance of trade
    
    if (hasTradeToday) {
      const entryPrice = 100 + Math.random() * 50;
      const exitPrice = entryPrice + (Math.random() - 0.5) * 10;
      const profitLoss = exitPrice - entryPrice;
      const tradeStatus = Math.random() > 0.3 ? 'Executed' : 'Not Executed';
      const stopStatus = Math.random() > 0.8 ? 'Executed' : '-';
      
      currentCapital += profitLoss;
      
      history.push({
        date: date.toISOString().split('T')[0],
        entryPrice,
        exitPrice,
        profitLoss,
        profitPercentage: (profitLoss / entryPrice) * 100,
        trade: tradeStatus as 'Executed' | 'Not Executed' | 'Buy' | 'Sell' | 'Close' | '-',
        stop: stopStatus as 'Executed' | 'Close' | '-',
        stopTrigger: stopStatus as 'Executed' | 'Close' | '-',
        volume: Math.floor(Math.random() * 10000),
        high: entryPrice + Math.random() * 5,
        low: entryPrice - Math.random() * 5,
        suggestedEntryPrice: entryPrice * 0.98,
        actualPrice: entryPrice,
        lotSize: Math.floor(Math.random() * 100) + 1,
        stopPrice: entryPrice * 0.95,
        capital: params.initialCapital,
        currentCapital
      });
    }
  }
  
  return history;
};

export const api = {
  // Assets methods
  getAssets: async (page = 1, search = "", country = "", stockMarket = "", assetClass = "") => {
    try {
      let query = supabase.from("market_data_sources").select("*");
      
      if (search) {
        query = query.or(`country.ilike.%${search}%,stock_market.ilike.%${search}%,asset_class.ilike.%${search}%`);
      }
      
      if (country) {
        query = query.eq("country", country);
      }
      
      if (stockMarket) {
        query = query.eq("stock_market", stockMarket);
      }
      
      if (assetClass) {
        query = query.eq("asset_class", assetClass);
      }

      const pageSize = 10;
      const offset = (page - 1) * pageSize;
      
      const { data, error, count } = await query
        .range(offset, offset + pageSize - 1)
        .order("id");

      if (error) throw error;

      // Transform market data sources to assets format
      const assets: Asset[] = (data || []).map(item => ({
        id: item.id,
        code: `${item.country}-${item.stock_market}-${item.asset_class}`,
        name: `${item.country} ${item.stock_market} ${item.asset_class}`,
        country: item.country,
        stock_market: item.stock_market,
        asset_class: item.asset_class,
        status: 'active' as const
      }));

      return {
        data: assets,
        total: count || 0
      };
    } catch (error) {
      console.error("Error fetching assets:", error);
      return { data: [], total: 0 };
    }
  },

  getAllAssets: async () => {
    try {
      const { data, error } = await supabase
        .from("market_data_sources")
        .select("*")
        .order("id");

      if (error) throw error;

      // Transform market data sources to assets format
      const assets: Asset[] = (data || []).map(item => ({
        id: item.id,
        code: `${item.country}-${item.stock_market}-${item.asset_class}`,
        name: `${item.country} ${item.stock_market} ${item.asset_class}`,
        country: item.country,
        stock_market: item.stock_market,
        asset_class: item.asset_class,
        status: 'active' as const
      }));

      return assets;
    } catch (error) {
      console.error("Error fetching all assets:", error);
      return [];
    }
  },

  // Market data methods
  marketData: {
    getSources: async () => {
      try {
        const { data, error } = await supabase
          .from("market_data_sources")
          .select("*")
          .order("country, stock_market, asset_class");

        if (error) throw error;
        return data || [];
      } catch (error) {
        console.error("Error fetching market data sources:", error);
        return [];
      }
    },

    getCountries: async () => {
      try {
        const { data, error } = await supabase
          .from("market_data_sources")
          .select("country")
          .order("country");

        if (error) throw error;
        
        const countries = [...new Set((data || []).map(item => item.country))];
        return countries;
      } catch (error) {
        console.error("Error fetching countries:", error);
        return [];
      }
    },

    getStockMarkets: async (country: string) => {
      try {
        const { data, error } = await supabase
          .from("market_data_sources")
          .select("stock_market")
          .eq("country", country)
          .order("stock_market");

        if (error) throw error;
        
        const markets = [...new Set((data || []).map(item => item.stock_market))];
        return markets;
      } catch (error) {
        console.error("Error fetching stock markets:", error);
        return [];
      }
    },

    getAssetClasses: async (country: string, stockMarket: string) => {
      try {
        const { data, error } = await supabase
          .from("market_data_sources")
          .select("asset_class")
          .eq("country", country)
          .eq("stock_market", stockMarket)
          .order("asset_class");

        if (error) throw error;
        
        const assetClasses = [...new Set((data || []).map(item => item.asset_class))];
        return assetClasses;
      } catch (error) {
        console.error("Error fetching asset classes:", error);
        return [];
      }
    },

    getDataTableName: async (country: string, stockMarket: string, assetClass: string) => {
      try {
        const { data, error } = await supabase
          .from("market_data_sources")
          .select("stock_table")
          .eq("country", country)
          .eq("stock_market", stockMarket)
          .eq("asset_class", assetClass)
          .single();

        if (error) throw error;
        return data?.stock_table || null;
      } catch (error) {
        console.error("Error fetching data table name:", error);
        return null;
      }
    }
  },

  // Analysis methods
  analysis: {
    runAnalysis: async (params: StockAnalysisParams, onProgress?: (progress: number) => void): Promise<AnalysisResult[]> => {
      try {
        console.info('Starting analysis with params:', params);
        
        // Simulate multi-step analysis
        await simulateAnalysisStep(1, 5, onProgress);
        
        // Get assets from the specified market
        const sources = await api.marketData.getSources();
        const filteredSources = sources.filter(source => 
          source.country === params.country &&
          source.stock_market === params.stockMarket &&
          source.asset_class === params.assetClass
        );

        await simulateAnalysisStep(2, 5, onProgress);

        // Generate mock results for each source
        const results: AnalysisResult[] = filteredSources.slice(0, 10).map((source, index) => {
          const tradingDays = 252;
          const trades = Math.floor(Math.random() * 50) + 10;
          const profits = Math.floor(trades * (0.4 + Math.random() * 0.3));
          const losses = trades - profits;
          const stops = Math.floor(trades * 0.2);
          
          const finalCapital = params.initialCapital + (Math.random() - 0.3) * params.initialCapital * 0.5;
          const profit = finalCapital - params.initialCapital;
          
          return {
            assetCode: `${source.country}_${source.stock_market}_${index + 1}`,
            assetName: `${source.country} ${source.stock_market} Asset ${index + 1}`,
            tradingDays,
            trades,
            tradePercentage: (trades / tradingDays) * 100,
            profits,
            profitPercentage: (profits / trades) * 100,
            losses,
            lossPercentage: (losses / trades) * 100,
            stops,
            stopPercentage: (stops / trades) * 100,
            finalCapital,
            profit,
            averageGain: Math.random() * 500 + 100,
            averageLoss: -(Math.random() * 300 + 50),
            maxDrawdown: Math.random() * 15 + 5,
            sharpeRatio: Math.random() * 2 - 0.5,
            sortinoRatio: Math.random() * 2.5 - 0.5,
            recoveryFactor: Math.random() * 3 + 0.5,
            successRate: (profits / trades) * 100
          };
        });

        await simulateAnalysisStep(3, 5, onProgress);
        await simulateAnalysisStep(4, 5, onProgress);
        await simulateAnalysisStep(5, 5, onProgress);

        return results;
      } catch (error) {
        console.error("Analysis failed:", error);
        throw new Error("Failed to run analysis");
      }
    },

    getDetailedAnalysis: async (assetCode: string, params: StockAnalysisParams): Promise<DetailedResult> => {
      try {
        console.info('Getting detailed analysis for:', assetCode);
        
        // Simulate getting detailed data
        const tradingDays = 252;
        const trades = Math.floor(Math.random() * 50) + 10;
        const profits = Math.floor(trades * (0.4 + Math.random() * 0.3));
        const losses = trades - profits;
        const stops = Math.floor(trades * 0.2);
        
        const finalCapital = params.initialCapital + (Math.random() - 0.3) * params.initialCapital * 0.5;
        const profit = finalCapital - params.initialCapital;
        
        // Generate trade history
        const tradeHistory = generateMockTradeHistory(assetCode, params, tradingDays);
        
        // Generate capital evolution
        const capitalEvolution = tradeHistory.map(trade => ({
          date: trade.date,
          capital: trade.currentCapital || params.initialCapital
        }));

        const result: DetailedResult = {
          assetCode,
          assetName: `Detailed ${assetCode}`,
          tradingDays,
          trades,
          tradePercentage: (trades / tradingDays) * 100,
          profits,
          profitPercentage: (profits / trades) * 100,
          losses,
          lossPercentage: (losses / trades) * 100,
          stops,
          stopPercentage: (stops / trades) * 100,
          finalCapital,
          profit,
          averageGain: Math.random() * 500 + 100,
          averageLoss: -(Math.random() * 300 + 50),
          maxDrawdown: Math.random() * 15 + 5,
          sharpeRatio: Math.random() * 2 - 0.5,
          sortinoRatio: Math.random() * 2.5 - 0.5,
          recoveryFactor: Math.random() * 3 + 0.5,
          successRate: (profits / trades) * 100,
          tradeHistory,
          capitalEvolution
        };

        return result;
      } catch (error) {
        console.error("Failed to get detailed analysis:", error);
        throw new Error("Failed to get detailed analysis");
      }
    }
  },

  // Subscription methods
  subscription: {
    checkSubscription: async (): Promise<SubscriptionData> => {
      try {
        const { data, error } = await supabase.functions.invoke('check-subscription');
        
        if (error) throw error;
        
        return data || { subscribed: false };
      } catch (error) {
        console.error("Error checking subscription:", error);
        return { subscribed: false };
      }
    },

    createCheckoutSession: async () => {
      try {
        const { data, error } = await supabase.functions.invoke('create-checkout');
        
        if (error) throw error;
        
        return data;
      } catch (error) {
        console.error("Error creating checkout session:", error);
        throw new Error("Failed to create checkout session");
      }
    },

    createCustomerPortal: async () => {
      try {
        const { data, error } = await supabase.functions.invoke('customer-portal');
        
        if (error) throw error;
        
        return data;
      } catch (error) {
        console.error("Error creating customer portal session:", error);
        throw new Error("Failed to create customer portal session");
      }
    }
  }
};
