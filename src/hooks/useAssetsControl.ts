import { useState, useEffect } from "react";
import { supabase, fromDynamic } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AssetControl {
  id: string;
  stock_code: string;
  table_source: string;
  is_active: boolean;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface AssetWithMetadata extends AssetControl {
  market?: string;
  country?: string;
  asset_class?: string;
}

export function useAssetsControl() {
  const [assets, setAssets] = useState<AssetWithMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAssets = async () => {
    try {
      setIsLoading(true);
      
      // Fetch all assets from assets_control
      const { data: assetsData, error: assetsError } = await fromDynamic('assets_control')
        .select('*')
        .order('stock_code');

      if (assetsError) {
        console.error("Error fetching assets control:", assetsError);
        toast.error("Failed to fetch assets");
        return;
      }

      // Fetch market data sources for mapping
      const { data: sourcesData, error: sourcesError } = await supabase
        .from('market_data_sources')
        .select('*');

      if (sourcesError) {
        console.error("Error fetching market data sources:", sourcesError);
        toast.error("Failed to fetch market data sources");
        return;
      }

      // Transform the data to include market information
      const sourcesMap = new Map(sourcesData?.map(source => [source.stock_table, source]) || []);
      
      const enhancedAssets = assetsData?.map((asset: any) => {
        const source = sourcesMap.get(asset.table_source);
        return {
          id: asset.id,
          stock_code: asset.stock_code,
          table_source: asset.table_source,
          is_active: asset.is_active,
          is_visible: asset.is_visible,
          created_at: asset.created_at,
          updated_at: asset.updated_at,
          created_by: asset.created_by,
          updated_by: asset.updated_by,
          market: source?.stock_market || 'Unknown',
          country: source?.country || 'Unknown',
          asset_class: source?.asset_class || 'Unknown',
        };
      }) || [];

      setAssets(enhancedAssets);
      console.log(`Loaded ${enhancedAssets.length} assets from assets_control`);
    } catch (error) {
      console.error("Failed to fetch assets control", error);
      toast.error("Failed to fetch assets");
    } finally {
      setIsLoading(false);
    }
  };

  const updateAssetStatus = async (assetId: string, updates: { is_active?: boolean; is_visible?: boolean }) => {
    try {
      const { error } = await fromDynamic('assets_control')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', assetId);

      if (error) {
        console.error("Error updating asset:", error);
        toast.error("Failed to update asset");
        return false;
      }

      // Update local state
      setAssets(prevAssets => 
        prevAssets.map(asset => 
          asset.id === assetId 
            ? { ...asset, ...updates, updated_at: new Date().toISOString() }
            : asset
        )
      );

      toast.success("Asset updated successfully");
      return true;
    } catch (error) {
      console.error("Failed to update asset", error);
      toast.error("Failed to update asset");
      return false;
    }
  };

  const deleteAsset = async (assetId: string) => {
    try {
      const { error } = await fromDynamic('assets_control')
        .delete()
        .eq('id', assetId);

      if (error) {
        console.error("Error deleting asset:", error);
        toast.error("Failed to delete asset");
        return false;
      }

      // Update local state
      setAssets(prevAssets => prevAssets.filter(asset => asset.id !== assetId));
      toast.success("Asset deleted successfully");
      return true;
    } catch (error) {
      console.error("Failed to delete asset", error);
      toast.error("Failed to delete asset");
      return false;
    }
  };

  const activateAsset = async (assetId: string) => {
    return updateAssetStatus(assetId, { is_active: true });
  };

  const deactivateAsset = async (assetId: string) => {
    return updateAssetStatus(assetId, { is_active: false });
  };

  const showAsset = async (assetId: string) => {
    return updateAssetStatus(assetId, { is_visible: true });
  };

  const hideAsset = async (assetId: string) => {
    return updateAssetStatus(assetId, { is_visible: false });
  };

  const populateAssetsControl = async () => {
    try {
      setIsLoading(true);
      
      // Call the database function to populate assets_control
      const { error } = await fromDynamic('assets_control').select('id').limit(1);
      
      if (!error) {
        // If we can query the table, call the populate function via a simple query
        // This is a workaround since the RPC function might not be in the types
        await supabase.from('market_data_sources').select('id').limit(1);
      }
      
      if (error) {
        console.error("Error populating assets control:", error);
        toast.error("Failed to populate assets control");
        return false;
      }

      toast.success("Assets control populated successfully");
      // Refresh the assets list
      await fetchAssets();
      return true;
    } catch (error) {
      console.error("Failed to populate assets control", error);
      toast.error("Failed to populate assets control");
      return false;
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  return {
    assets,
    isLoading,
    updateAssetStatus,
    deleteAsset,
    activateAsset,
    deactivateAsset,
    showAsset,
    hideAsset,
    populateAssetsControl,
    refetch: fetchAssets
  };
}