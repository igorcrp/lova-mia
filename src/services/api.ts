
import { SupabaseClient } from '@supabase/supabase-js';
import {
  Asset,
  MarketDataSource,
  StockAnalysisParams,
  StockInfo,
  User,
} from '@/types';
import { supabase, fromDynamic } from '@/integrations/supabase/client';

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
      full_name: data.name || '',
      avatar_url: '',
      level_id: data.level_id,
      status: data.status_users === 'active' ? 'active' : 'inactive',
      email_verified: data.email_verified,
      account_type: data.plan_type === 'premium' ? 'premium' : 'free',
      created_at: data.created_at,
      last_login: '',
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
  // Map the updates to match the database schema
  const dbUpdates: { name?: string } = {};
  if (updates.full_name) {
    dbUpdates.name = updates.full_name;
  }

  const { data, error } = await supabase
    .from('users')
    .update(dbUpdates)
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error updating user profile:', error);
    return { data: null, error };
  }

  return { data, error };
};

// Additional auth methods needed by AuthContext
const login = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return {
    user: data.user,
    session: data.session?.access_token || '',
  };
};

const googleLogin = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
  });

  if (error) {
    throw error;
  }

  // OAuth response doesn't immediately provide user data, return null for user
  return {
    user: null,
    session: '',
  };
};

const register = async (email: string, password: string, fullName: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  return { data, error };
};

const resetPassword = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) {
    throw error;
  }
};

const resendConfirmationEmail = async (email: string) => {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
  });
  if (error) {
    throw error;
  }
};

const logout = async () => {
  return await supabase.auth.signOut();
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

    // Convert id from number to string to match the type
    return (data || []).map(item => ({
      ...item,
      id: String(item.id)
    }));
  } catch (error) {
    console.error('Error in getMarketDataSources:', error);
    return [];
  }
};

const addMarketDataSource = async (
  marketDataSource: Omit<MarketDataSource, 'id'>
): Promise<MarketDataSource | null> => {
  try {
    // Convert back to database format (id as number)
    const dbData = {
      ...marketDataSource,
    };

    const { data, error } = await supabase
      .from('market_data_sources')
      .insert([dbData])
      .select('*')
      .single();

    if (error) {
      console.error('Error adding market data source:', error);
      return null;
    }

    // Convert id to string for return
    return data ? { ...data, id: String(data.id) } : null;
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
    // Remove id from updates since it shouldn't be updated
    const { id: _, ...dbUpdates } = updates;

    const { data, error } = await supabase
      .from('market_data_sources')
      .update(dbUpdates)
      .eq('id', parseInt(id)) // Convert string id to number for database
      .select('*')
      .single();

    if (error) {
      console.error('Error updating market data source:', error);
      return null;
    }

    // Convert id to string for return
    return data ? { ...data, id: String(data.id) } : null;
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
      .eq('id', parseInt(id)); // Convert string id to number for database

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

// Additional helper methods for admin functionality
const getCountries = async (): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('market_data_sources')
      .select('country')
      .order('country');

    if (error) {
      console.error('Error fetching countries:', error);
      return [];
    }

    const uniqueCountries = [...new Set(data?.map(item => item.country) || [])];
    return uniqueCountries;
  } catch (error) {
    console.error('Error in getCountries:', error);
    return [];
  }
};

const getStockMarkets = async (country: string): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('market_data_sources')
      .select('stock_market')
      .eq('country', country)
      .order('stock_market');

    if (error) {
      console.error('Error fetching stock markets:', error);
      return [];
    }

    const uniqueMarkets = [...new Set(data?.map(item => item.stock_market) || [])];
    return uniqueMarkets;
  } catch (error) {
    console.error('Error in getStockMarkets:', error);
    return [];
  }
};

const getAssetClasses = async (country: string, stockMarket: string): Promise<string[]> => {
  try {
    const { data, error } = await supabase
      .from('market_data_sources')
      .select('asset_class')
      .eq('country', country)
      .eq('stock_market', stockMarket)
      .order('asset_class');

    if (error) {
      console.error('Error fetching asset classes:', error);
      return [];
    }

    const uniqueClasses = [...new Set(data?.map(item => item.asset_class) || [])];
    return uniqueClasses;
  } catch (error) {
    console.error('Error in getAssetClasses:', error);
    return [];
  }
};

// Assets Actions - Note: These are placeholder implementations since assets table doesn't exist
const getAssets = async (): Promise<Asset[]> => {
  try {
    // Since there's no assets table, return empty array
    console.warn('Assets table does not exist in database');
    return [];
  } catch (error) {
    console.error('Error in getAssets:', error);
    return [];
  }
};

const addAsset = async (asset: Omit<Asset, 'id'>): Promise<Asset | null> => {
  try {
    // Since there's no assets table, return null
    console.warn('Assets table does not exist in database');
    return null;
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
    // Since there's no assets table, return null
    console.warn('Assets table does not exist in database');
    return null;
  } catch (error) {
    console.error('Error in updateAsset:', error);
    return null;
  }
};

const deleteAsset = async (id: string): Promise<boolean> => {
  try {
    // Since there's no assets table, return false
    console.warn('Assets table does not exist in database');
    return false;
  } catch (error) {
    console.error('Error in deleteAsset:', error);
    return false;
  }
};

// Analysis Actions
const runAnalysis = async (
  params: StockAnalysisParams,
  onProgress?: (progress: number) => void
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
              if (onProgress) onProgress(progress);
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

const getAvailableStocks = async (country: string, stockMarket: string, dataTableName: string): Promise<StockInfo[]> => {
  try {
    const { data, error } = await fromDynamic(dataTableName)
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
    login,
    googleLogin,
    register,
    resetPassword,
    resendConfirmationEmail,
    logout,
  },
  marketData: {
    getMarketDataSources,
    addMarketDataSource,
    updateMarketDataSource,
    deleteMarketDataSource,
    getDataTableName,
    getAvailableStocks,
    getCountries,
    getStockMarkets,
    getAssetClasses,
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
