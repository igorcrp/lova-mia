import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RefreshCw, Trash2, Search, Eye, EyeOff, Power, PowerOff, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useAssetsControl, AssetWithMetadata } from "@/hooks/useAssetsControl";
import { toast } from "sonner";
import { useMemo } from "react";

export default function AdminAssetsPage() {
  const { 
    assets, 
    isLoading, 
    deleteAsset, 
    activateAsset, 
    deactivateAsset, 
    showAsset, 
    hideAsset, 
    populateAssetsControl,
    refetch 
  } = useAssetsControl();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<{
    key: keyof AssetWithMetadata | null;
    direction: 'asc' | 'desc';
  }>({ key: null, direction: 'asc' });

  const sortedAndFilteredAssets = useMemo(() => {
    let filtered = assets.filter(asset =>
      asset.stock_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.market?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.country?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.table_source.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        const aValue = a[sortConfig.key!];
        const bValue = b[sortConfig.key!];
        
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return filtered;
  }, [assets, searchTerm, sortConfig]);

  const handleSort = (key: keyof AssetWithMetadata) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getSortIcon = (key: keyof AssetWithMetadata) => {
    if (sortConfig.key !== key) {
      return <ArrowUpDown className="ml-1 h-4 w-4" />;
    }
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="ml-1 h-4 w-4" />
      : <ArrowDown className="ml-1 h-4 w-4" />;
  };

  const handleDeleteAsset = async (assetId: string) => {
    await deleteAsset(assetId);
  };

  const handleToggleActive = async (asset: any) => {
    if (asset.is_active) {
      await deactivateAsset(asset.id);
    } else {
      await activateAsset(asset.id);
    }
  };

  const handleToggleVisible = async (asset: any) => {
    if (asset.is_visible) {
      await hideAsset(asset.id);
    } else {
      await showAsset(asset.id);
    }
  };

  const handlePopulateAssets = async () => {
    toast.info("Populating assets control table...");
    await populateAssetsControl();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Asset Management</h1>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button onClick={refetch} variant="outline" className="w-full sm:w-auto">
            <RefreshCw className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Refresh</span>
            <span className="sm:hidden">Refresh</span>
          </Button>
          <Button onClick={handlePopulateAssets} variant="secondary" className="w-full sm:w-auto">
            <RefreshCw className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Populate Assets</span>
            <span className="sm:hidden">Populate</span>
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search assets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          Showing {sortedAndFilteredAssets.length} of {assets.length} assets
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableCaption>
              Assets control table with visibility and activity management. 
              Total: {assets.length} assets from multiple exchanges.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">
                  <button
                    className="flex items-center hover:bg-muted/50 p-1 rounded"
                    onClick={() => handleSort('stock_code')}
                  >
                    Stock Code
                    {getSortIcon('stock_code')}
                  </button>
                </TableHead>
                <TableHead className="hidden sm:table-cell">
                  <button
                    className="flex items-center hover:bg-muted/50 p-1 rounded"
                    onClick={() => handleSort('market')}
                  >
                    Market
                    {getSortIcon('market')}
                  </button>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <button
                    className="flex items-center hover:bg-muted/50 p-1 rounded"
                    onClick={() => handleSort('country')}
                  >
                    Country
                    {getSortIcon('country')}
                  </button>
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  <button
                    className="flex items-center hover:bg-muted/50 p-1 rounded"
                    onClick={() => handleSort('asset_class')}
                  >
                    Asset Class
                    {getSortIcon('asset_class')}
                  </button>
                </TableHead>
                <TableHead className="hidden xl:table-cell">
                  <button
                    className="flex items-center hover:bg-muted/50 p-1 rounded"
                    onClick={() => handleSort('table_source')}
                  >
                    Source Table
                    {getSortIcon('table_source')}
                  </button>
                </TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="text-center">Visible</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="flex items-center justify-center">
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      <span>Loading assets...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : sortedAndFilteredAssets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {searchTerm ? "No assets found matching your search" : "No assets found"}
                  </TableCell>
                </TableRow>
              ) : (
                sortedAndFilteredAssets.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell className="font-medium">
                      <div className="space-y-1">
                        <div>{asset.stock_code}</div>
                        <div className="sm:hidden space-y-1">
                          <div className="text-xs text-muted-foreground">{asset.market || 'Unknown'}</div>
                          <div className="text-xs text-muted-foreground">{asset.country || 'Unknown'}</div>
                          <Badge variant="outline" className="text-xs">
                            {asset.table_source}
                          </Badge>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{asset.market || 'Unknown'}</TableCell>
                    <TableCell className="hidden md:table-cell">{asset.country || 'Unknown'}</TableCell>
                    <TableCell className="hidden lg:table-cell">{asset.asset_class || 'Unknown'}</TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <Badge variant="outline" className="text-xs">
                        {asset.table_source}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center">
                        <Switch
                          checked={asset.is_active}
                          onCheckedChange={() => handleToggleActive(asset)}
                        />
                        {asset.is_active ? (
                          <Power className="ml-2 h-4 w-4 text-green-500" />
                        ) : (
                          <PowerOff className="ml-2 h-4 w-4 text-red-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center">
                        <Switch
                          checked={asset.is_visible}
                          onCheckedChange={() => handleToggleVisible(asset)}
                        />
                        {asset.is_visible ? (
                          <Eye className="ml-2 h-4 w-4 text-green-500" />
                        ) : (
                          <EyeOff className="ml-2 h-4 w-4 text-red-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action will permanently delete the asset "{asset.stock_code}" from the control table. 
                              This action cannot be undone. The asset will no longer be available to users.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleDeleteAsset(asset.id)}
                              className="bg-red-500 hover:bg-red-600"
                            >
                              Delete Permanently
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={8}>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <span className="text-sm">{sortedAndFilteredAssets.length} assets displayed</span>
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-sm">
                      <span>Active: {assets.filter(a => a.is_active).length}</span>
                      <span>Visible: {assets.filter(a => a.is_visible).length}</span>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </div>
    </div>
  );
}