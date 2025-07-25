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
import { RefreshCw, Trash2, Search, Eye, EyeOff, Power, PowerOff } from "lucide-react";
import { useAssetsControl } from "@/hooks/useAssetsControl";
import { toast } from "sonner";

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

  const filteredAssets = assets.filter(asset =>
    asset.stock_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asset.market?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asset.country?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asset.table_source.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
    <div>
      <div className="container py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Asset Management</h1>
          <div className="flex gap-2">
            <Button onClick={refetch} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={handlePopulateAssets} variant="secondary">
              <RefreshCw className="mr-2 h-4 w-4" />
              Populate Assets
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex items-center space-x-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search assets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="text-sm text-muted-foreground">
            Showing {filteredAssets.length} of {assets.length} assets
          </div>
        </div>

        <div className="mt-4">
          <Table>
            <TableCaption>
              Assets control table with visibility and activity management. 
              Total: {assets.length} assets from multiple exchanges.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Stock Code</TableHead>
                <TableHead>Market</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Asset Class</TableHead>
                <TableHead>Source Table</TableHead>
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
              ) : filteredAssets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {searchTerm ? "No assets found matching your search" : "No assets found"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAssets.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell className="font-medium">{asset.stock_code}</TableCell>
                    <TableCell>{asset.market || 'Unknown'}</TableCell>
                    <TableCell>{asset.country || 'Unknown'}</TableCell>
                    <TableCell>{asset.asset_class || 'Unknown'}</TableCell>
                    <TableCell>
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
                  <div className="flex justify-between items-center">
                    <span>{filteredAssets.length} assets displayed</span>
                    <div className="flex gap-4 text-sm">
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