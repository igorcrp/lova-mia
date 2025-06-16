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
} from "@/components/ui/table"
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
} from "@/components/ui/alert-dialog"
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Asset } from "@/types";

export default function AdminAssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [newAssetName, setNewAssetName] = useState("");
  const [newAssetSymbol, setNewAssetSymbol] = useState("");
  const [newAssetMarket, setNewAssetMarket] = useState("");
  const [newAssetCountry, setNewAssetCountry] = useState("");
  const [newAssetAssetClass, setNewAssetAssetClass] = useState("");

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

  const handleAddAsset = () => {
    const newAsset: Asset = {
      id: String(Date.now()),
      name: newAssetName,
      symbol: newAssetSymbol,
      market: newAssetMarket,
      country: newAssetCountry,
      asset_class: newAssetAssetClass,
    };
    setAssets([...assets, newAsset]);
    handleCloseDialog();
  };

  const handleOpenEditDialog = (asset: Asset) => {
    setSelectedAsset(asset);
    setNewAssetName(asset.name);
    setNewAssetSymbol(asset.symbol);
    setNewAssetMarket(asset.market);
    setNewAssetCountry(asset.country);
    setNewAssetAssetClass(asset.asset_class);
    setIsEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    setIsEditDialogOpen(false);
    setSelectedAsset(null);
    setNewAssetName("");
    setNewAssetSymbol("");
    setNewAssetMarket("");
    setNewAssetCountry("");
    setNewAssetAssetClass("");
  };

  const handleUpdateAsset = () => {
    if (!selectedAsset) return;

    const updatedAsset: Asset = {
      ...selectedAsset,
      name: newAssetName,
      symbol: newAssetSymbol,
      market: newAssetMarket,
      country: newAssetCountry,
      asset_class: newAssetAssetClass,
    };

    const updatedAssets = assets.map((asset) =>
      asset.id === updatedAsset.id ? updatedAsset : asset
    );

    setAssets(updatedAssets);
    handleCloseEditDialog();
  };

  const handleDeleteAsset = (assetId: string) => {
    const updatedAssets = assets.filter((asset) => asset.id !== assetId);
    setAssets(updatedAssets);
  };

  const mockAssets: Asset[] = [
    { id: '1', name: 'Apple Inc.', symbol: 'AAPL', market: 'NASDAQ', country: 'USA', asset_class: 'Stock' },
    { id: '2', name: 'Microsoft Corporation', symbol: 'MSFT', market: 'NASDAQ', country: 'USA', asset_class: 'Stock' },
  ];

  return (
    <div>
      <div className="container py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Asset Management</h1>
          <Button onClick={handleOpenDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add Asset
          </Button>
        </div>

        <div className="mt-4">
          <Table>
            <TableCaption>A list of all registered assets.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Symbol</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Market</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Asset Class</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockAssets.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="font-medium">{asset.symbol}</TableCell>
                  <TableCell>{asset.name}</TableCell>
                  <TableCell>{asset.market}</TableCell>
                  <TableCell>{asset.country}</TableCell>
                  <TableCell>{asset.asset_class}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEditDialog(asset)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-red-500">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the asset
                            from our servers.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteAsset(asset.id)}>
                            Continue
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={6}>
                  {mockAssets.length} total assets
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
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCloseDialog}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAddAsset}>Add Asset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Asset Dialog */}
      <AlertDialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit Asset</AlertDialogTitle>
            <AlertDialogDescription>
              Edit the details for the selected asset.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit_name" className="text-right">
                Name
              </Label>
              <Input
                id="edit_name"
                value={newAssetName}
                onChange={(e) => setNewAssetName(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit_symbol" className="text-right">
                Symbol
              </Label>
              <Input
                id="edit_symbol"
                value={newAssetSymbol}
                onChange={(e) => setNewAssetSymbol(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit_market" className="text-right">
                Market
              </Label>
              <Input
                id="edit_market"
                value={newAssetMarket}
                onChange={(e) => setNewAssetMarket(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit_country" className="text-right">
                Country
              </Label>
              <Input
                id="edit_country"
                value={newAssetCountry}
                onChange={(e) => setNewAssetCountry(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit_asset_class" className="text-right">
                Asset Class
              </Label>
              <Input
                id="edit_asset_class"
                value={newAssetAssetClass}
                onChange={(e) => setNewAssetAssetClass(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCloseEditDialog}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUpdateAsset}>Update Asset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
