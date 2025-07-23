
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Trash2, Search } from "lucide-react";
import { useAssets } from "@/hooks/useAssets";

export default function AdminAssetsPage() {
  const { assets, isLoading, addAsset, deleteAsset } = useAssets();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [newAssetName, setNewAssetName] = useState("");
  const [newAssetSymbol, setNewAssetSymbol] = useState("");
  const [newAssetMarket, setNewAssetMarket] = useState("");
  const [newAssetCountry, setNewAssetCountry] = useState("");
  const [newAssetAssetClass, setNewAssetAssetClass] = useState("");

  const filteredAssets = assets.filter(asset =>
    asset.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asset.market.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asset.country.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenDialog = () => {
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setNewAssetName("");
    setNewAssetSymbol("");
    setNewAssetMarket("");
    setNewAssetCountry("");
    setNewAssetAssetClass("");
  };

  const handleAddAsset = async () => {
    const result = await addAsset({
      name: newAssetName,
      symbol: newAssetSymbol,
      market: newAssetMarket,
      country: newAssetCountry,
      asset_class: newAssetAssetClass,
    });
    
    if (result) {
      handleCloseDialog();
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    await deleteAsset(assetId);
  };

  return (
    <div>
      <div className="container py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Asset Management</h1>
          <Button onClick={handleOpenDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add Asset
          </Button>
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
              Assets from all connected market data sources. 
              Total: {assets.length} assets from multiple exchanges.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Symbol</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Market</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Asset Class</TableHead>
                <TableHead>Source Table</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="flex items-center justify-center">
                      <div className="loading-circle" />
                      <span className="ml-3">Loading assets...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredAssets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {searchTerm ? "No assets found matching your search" : "No assets found"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAssets.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell className="font-medium">{asset.symbol}</TableCell>
                    <TableCell>{asset.name}</TableCell>
                    <TableCell>{asset.market}</TableCell>
                    <TableCell>{asset.country}</TableCell>
                    <TableCell>{asset.asset_class}</TableCell>
                    <TableCell>
                      <span className="text-xs bg-muted px-2 py-1 rounded">
                        {asset.table_source || 'N/A'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-red-500">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action will remove the asset "{asset.symbol}" from the display. 
                              This won't delete data from the source table.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteAsset(asset.id)}>
                              Remove
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
                <TableCell colSpan={7}>
                  {filteredAssets.length} total assets displayed
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </div>

      {/* Add Asset Dialog */}
      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add New Asset</AlertDialogTitle>
            <AlertDialogDescription>
              Enter the details for the new asset.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={newAssetName}
                onChange={(e) => setNewAssetName(e.target.value)}
                className="col-span-3"
                placeholder="Company/Asset name"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="symbol" className="text-right">
                Symbol
              </Label>
              <Input
                id="symbol"
                value={newAssetSymbol}
                onChange={(e) => setNewAssetSymbol(e.target.value)}
                className="col-span-3"
                placeholder="e.g., AAPL, VALE3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="market" className="text-right">
                Market
              </Label>
              <Input
                id="market"
                value={newAssetMarket}
                onChange={(e) => setNewAssetMarket(e.target.value)}
                className="col-span-3"
                placeholder="e.g., NASDAQ, B3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="country" className="text-right">
                Country
              </Label>
              <Input
                id="country"
                value={newAssetCountry}
                onChange={(e) => setNewAssetCountry(e.target.value)}
                className="col-span-3"
                placeholder="e.g., USA, Brazil"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="asset_class" className="text-right">
                Asset Class
              </Label>
              <Input
                id="asset_class"
                value={newAssetAssetClass}
                onChange={(e) => setNewAssetAssetClass(e.target.value)}
                className="col-span-3"
                placeholder="e.g., Stock, ETF"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCloseDialog}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAddAsset}>Add Asset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
