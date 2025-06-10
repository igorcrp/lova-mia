import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { Database } from './schema';
import {
  Asset,
  MarketDataSource,
  StockAnalysisParams,
  StockInfo,
  User,
} from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);

// Auth Actions
const getCurrentUser = async (): Promise<User | null> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error fetching user data:', error);
    return null;
  }

  if (data) {
    return {
      id: data.id,
      email: data.email,
      full_name: data.full_name,
      avatar_url: data.avatar_url,
      level_id: data.level_id,
      status: data.status,
      email_verified: data.email_verified,
      account_type: data.account_type,
      created_at: data.created_at,
      last_login: data.last_login,
      session: user,
    };
  }

  return null;
};

const signIn = async (email: string, password: string) => {
  return await supabase.auth.signInWithPassword({
    email,
    password,
  });
};

const signUp = async (email: string, password: string, full_name: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: full_name,
      },
    },
  });

  if (error) {
    console.error('Error signing up:', error);
    return { data: null, error };
  }

  return { data, error };
};

const signOut = async () => {
  return await supabase.auth.signOut();
};

const updateUserProfile = async (
  id: string,
  updates: { full_name?: string; avatar_url?: string }
) => {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error updating user profile:', error);
    return { data: null, error };
  }

  return { data, error };
};

// Market Data Source Actions
const getMarketDataSources = async (): Promise<MarketDataSource[]> => {
  try {
    const { data, error } = await supabase
      .from('market_data_sources')
      .select('*');

    if (error) {
      console.error('Error fetching market data sources:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getMarketDataSources:', error);
    return [];
  }
};

const addMarketDataSource = async (
  marketDataSource: Omit<MarketDataSource, 'id'>
): Promise<MarketDataSource | null> => {
  try {
    const { data, error } = await supabase
      .from('market_data_sources')
      .insert([marketDataSource])
      .select('*')
      .single();

    if (error) {
      console.error('Error adding market data source:', error);
      return null;
    }

    return data || null;
  } catch (error) {
    console.error('Error in addMarketDataSource:', error);
    return null;
  }
};

const updateMarketDataSource = async (
  id: string,
  updates: Partial<MarketDataSource>
): Promise<MarketDataSource | null> => {
  try {
    const { data, error } = await supabase
      .from('market_data_sources')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('Error updating market data source:', error);
      return null;
    }

    return data || null;
  } catch (error) {
    console.error('Error in updateMarketDataSource:', error);
    return null;
  }
};

const deleteMarketDataSource = async (id: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('market_data_sources')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting market data source:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteMarketDataSource:', error);
    return false;
  }
};

// Assets Actions
const getAssets = async (): Promise<Asset[]> => {
  try {
    const { data, error } = await supabase.from('assets').select('*');

    if (error) {
      console.error('Error fetching assets:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getAssets:', error);
    return [];
  }
};

const addAsset = async (asset: Omit<Asset, 'id'>): Promise<Asset | null> => {
  try {
    const { data, error } = await supabase
      .from('assets')
      .insert([asset])
      .select('*')
      .single();

    if (error) {
      console.error('Error adding asset:', error);
      return null;
    }

    return data || null;
  } catch (error) {
    console.error('Error in addAsset:', error);
    return null;
  }
};

const updateAsset = async (
  id: string,
  updates: Partial<Asset>
): Promise<Asset | null> => {
  try {
    const { data, error } = await supabase
      .from('assets')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('Error updating asset:', error);
      return null;
    }

    return data || null;
  } catch (error) {
    console.error('Error in updateAsset:', error);
    return null;
  }
};

const deleteAsset = async (id: string): Promise<boolean> => {
  try {
    const { error } = await supabase.from('assets').delete().eq('id', id);

    if (error) {
      console.error('Error deleting asset:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteAsset:', error);
    return false;
  }
};

// Analysis Actions
const runAnalysis = async (
  params: StockAnalysisParams,
  onProgress: (progress: number) => void
) => {
  const apiUrl = '/api/analysis';

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.message || `HTTP error! status: ${response.status}`
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is empty');
    }

    const decoder = new TextDecoder();
    let partialData = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      partialData += decoder.decode(value);

      let progress, result;
      try {
        const lastNewlineIndex = partialData.lastIndexOf('\n');
        if (lastNewlineIndex !== -1) {
          const completeData = partialData.substring(0, lastNewlineIndex);
          partialData = partialData.substring(lastNewlineIndex + 1);

          completeData.split('\n').forEach((jsonString) => {
            if (jsonString.trim() === '') return;
            const parsedData = JSON.parse(jsonString);

            if (parsedData.type === 'progress') {
              progress = parsedData.value;
              onProgress(progress);
            } else if (parsedData.type === 'result') {
              result = parsedData.value;
            }
          });
        }
      } catch (e) {
        console.warn('Error parsing JSON data:', e);
      }
    }

    try {
      const lastResult = JSON.parse(partialData);
      return lastResult;
    } catch (e) {
      console.warn('Error parsing final JSON data:', e);
    }

    return [];
  } catch (error) {
    console.error('Error running analysis:', error);
    throw error;
  }
};

const getDetailedAnalysis = async (
  assetCode: string,
  params: StockAnalysisParams
) => {
  try {
    const apiUrl = `/api/analysis/detailed?assetCode=${assetCode}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching detailed analysis:', error);
    return null;
  }
};

const getDataTableName = async (
  country: string,
  stockMarket: string,
  assetClass: string
): Promise<string | undefined> => {
  try {
    const { data, error } = await supabase
      .from('market_data_sources')
      .select('stock_table')
      .eq('country', country)
      .eq('stock_market', stockMarket)
      .eq('asset_class', assetClass)
      .single();

    if (error) {
      console.error('Error fetching data table name:', error);
      return undefined;
    }

    return data?.stock_table;
  } catch (error) {
    console.error('Error in getDataTableName:', error);
    return undefined;
  }
};

// Fix null checks for item in getAvailableStocks method
const getAvailableStocks = async (country: string, stockMarket: string, dataTableName: string): Promise<StockInfo[]> => {
  try {
    const { data, error } = await supabase
      .from(dataTableName)
      .select('stock_code')
      .eq('country', country)
      .eq('stock_market', stockMarket)
      .limit(5000);

    if (error) {
      console.error('Error fetching available stocks:', error);
      return [];
    }

    if (!data || !Array.isArray(data)) {
      console.warn('No data returned for available stocks');
      return [];
    }
    
    const uniqueCodes = new Set<string>();
    (data as any[])
      .filter(item => item !== null && typeof item === 'object' && 'stock_code' in item)
      .forEach(item => {
        if (item && item.stock_code) {
          uniqueCodes.add(String(item.stock_code));
        }
      });
    
    const stocks: StockInfo[] = Array.from(uniqueCodes).map(code => ({
      code: code,
      name: code
    }));
    
    return stocks;
  } catch (error) {
    console.error('Error in getAvailableStocks:', error);
    return [];
  }
};

export const api = {
  auth: {
    getCurrentUser,
    signIn,
    signUp,
    signOut,
    updateUserProfile,
  },
  marketData: {
    getMarketDataSources,
    addMarketDataSource,
    updateMarketDataSource,
    deleteMarketDataSource,
    getDataTableName,
    getAvailableStocks,
  },
  assets: {
    getAssets,
    addAsset,
    updateAsset,
    deleteAsset,
  },
  analysis: {
    runAnalysis,
    getDetailedAnalysis,
  },
};
