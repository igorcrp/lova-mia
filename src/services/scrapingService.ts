
import { supabase } from "@/integrations/supabase/client";

export interface IndexData {
  name: string;
  symbol: string;
  value: string;
  change: string;
  changePercent: string;
  isNegative: boolean;
}

export interface StockData {
  symbol: string;
  name: string;
  price: string;
  change: string;
  changePercent: string;
  isNegative: boolean;
}

export const fetchIndexDataViaScraping = async (): Promise<IndexData[]> => {
  try {
    console.log('Fetching indices data via web scraping...');
    
    const { data, error } = await supabase.functions.invoke('scrape-indices');
    
    if (error) {
      console.error('Error calling scrape-indices function:', error);
      throw error;
    }
    
    console.log('Successfully fetched indices data:', data?.length || 0, 'indices');
    return data || [];
    
  } catch (error) {
    console.error('Error fetching indices data:', error);
    return [];
  }
};

export const fetchStocksForIndexViaScraping = async (indexSymbol: string): Promise<{ gainers: StockData[], losers: StockData[] }> => {
  try {
    console.log(`Fetching stocks data for ${indexSymbol} via web scraping...`);
    
    const { data, error } = await supabase.functions.invoke('scrape-stocks', {
      body: { indexSymbol }
    });
    
    if (error) {
      console.error('Error calling scrape-stocks function:', error);
      throw error;
    }
    
    console.log(`Successfully fetched stocks data for ${indexSymbol}:`, data?.gainers?.length || 0, 'gainers,', data?.losers?.length || 0, 'losers');
    return data || { gainers: [], losers: [] };
    
  } catch (error) {
    console.error('Error fetching stocks data:', error);
    return { gainers: [], losers: [] };
  }
};
