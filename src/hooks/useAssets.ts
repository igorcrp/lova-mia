
import { useState, useEffect } from "react";
import { supabase, fromDynamic } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Asset {
  id: string;
  name: string;
  symbol: string;
  market: string;
  country: string;
  asset_class: string;
  table_source?: string;
}

export interface MarketDataSource {
  id: number;
  country: string;
  stock_market: string;
  asset_class: string;
  stock_table: string;
}

export function useAssets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [marketSources, setMarketSources] = useState<MarketDataSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMarketSources = async () => {
    try {
      const { data, error } = await supabase
        .from('market_data_sources')
        .select('*');

      if (error) {
        console.error("Error fetching market sources:", error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error("Failed to fetch market sources", error);
      return [];
    }
  };

  const fetchAssetsFromTable = async (tableName: string, source: MarketDataSource) => {
    try {
      console.log(`Fetching assets from table: ${tableName}`);
      
      const { data, error } = await fromDynamic(tableName)
        .select('stock_code')
        .limit(1000);

      if (error) {
        console.error(`Error fetching from ${tableName}:`, error);
        return [];
      }

      if (!data || !Array.isArray(data) || data.length === 0) {
        console.log(`No data found in table: ${tableName}`);
        return [];
      }

      // Get unique stock codes
      const uniqueStockCodes = [...new Set(data.map((item: any) => item?.stock_code).filter(Boolean))];
      console.log(`Found ${uniqueStockCodes.length} unique assets in ${tableName}`);

      return uniqueStockCodes.map(stockCode => ({
        id: `${tableName}_${stockCode}`,
        name: stockCode, // Using stock_code as name since we don't have company names
        symbol: stockCode,
        market: source.stock_market,
        country: source.country,
        asset_class: source.asset_class,
        table_source: tableName
      }));
    } catch (error) {
      console.error(`Failed to fetch assets from ${tableName}:`, error);
      return [];
    }
  };

  const fetchAllAssets = async () => {
    try {
      setIsLoading(true);
      
      // First, get all market data sources
      const sources = await fetchMarketSources();
      setMarketSources(sources);
      
      if (sources.length === 0) {
        console.log("No market data sources found");
        setAssets([]);
        return;
      }

      // Then, fetch assets from each table
      const allAssets: Asset[] = [];
      
      for (const source of sources) {
        const tableAssets = await fetchAssetsFromTable(source.stock_table, source);
        allAssets.push(...tableAssets);
      }

      console.log(`Total assets fetched: ${allAssets.length}`);
      setAssets(allAssets);
    } catch (error) {
      console.error("Failed to fetch assets", error);
      toast.error("Failed to fetch assets");
    } finally {
      setIsLoading(false);
    }
  };

  const addAsset = async (assetData: {
    name: string;
    symbol: string;
    market: string;
    country: string;
    asset_class: string;
  }) => {
    // For now, we'll add to a local state since we're reading from existing tables
    // In a real scenario, you might want to add to a separate assets table
    const newAsset: Asset = {
      id: String(Date.now()),
      ...assetData,
      table_source: 'manual'
    };
    
    setAssets([...assets, newAsset]);
    toast.success("Asset added successfully");
    return newAsset;
  };

  const deleteAsset = async (assetId: string) => {
    // For assets from database tables, we won't actually delete
    // Just remove from local state
    setAssets(assets.filter(asset => asset.id !== assetId));
    toast.success("Asset removed from view");
  };

  useEffect(() => {
    fetchAllAssets();
  }, []);

  return {
    assets,
    marketSources,
    isLoading,
    addAsset,
    deleteAsset,
    refetch: fetchAllAssets
  };
}
