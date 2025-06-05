import { useState, useEffect } from "react";
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { api, Asset } from "@/services/api";
import { toast } from "@/components/ui/use-toast";

export default function AdminAssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newAsset, setNewAsset] = useState({ name: '', symbol: '', market: '' });

  useEffect(() => {
    const fetchAssets = async () => {
      try {
        const assetsData = await api.assets.getAll();
        setAssets(assetsData);
      } catch (error) {
        console.error("Failed to fetch assets", error);
      }
    };

    fetchAssets();
  }, []);

  const handleCreateAsset = async (assetData: Partial<Asset>) => {
    try {
      // Ensure required fields are present
      const requiredAsset = {
        name: assetData.name || '',
        symbol: assetData.symbol || '',
        market: assetData.market || ''
      };
      
      const createdAsset = await api.assets.createAsset(requiredAsset);
      if (createdAsset) {
        setAssets(prev => [...prev, {
          id: Date.now().toString(), // Temporary ID
          ...requiredAsset,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);
        setIsCreateDialogOpen(false);
        setNewAsset({ name: '', symbol: '', market: '' });
        toast({
          title: "Success",
          description: "Asset created successfully",
        });
      }
    } catch (error) {
      console.error('Failed to create asset:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create asset",
      });
    }
  };

  return (
    <div>
      <div className="container mx-auto py-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold">Assets</h1>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="primary">Create Asset</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create Asset</DialogTitle>
                <DialogDescription>
                  Add a new asset to the list.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">
                    Name
                  </Label>
                  <Input id="name" value={newAsset.name} onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="symbol" className="text-right">
                    Symbol
                  </Label>
                  <Input id="symbol" value={newAsset.symbol} onChange={(e) => setNewAsset({ ...newAsset, symbol: e.target.value })} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="market" className="text-right">
                    Market
                  </Label>
                  <Input id="market" value={newAsset.market} onChange={(e) => setNewAsset({ ...newAsset, market: e.target.value })} className="col-span-3" />
                </div>
              </div>
              <Button onClick={() => handleCreateAsset(newAsset)}>Create</Button>
            </DialogContent>
          </Dialog>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Id</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Market</TableHead>
                <TableHead>Created At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="font-medium">{asset.id}</TableCell>
                  <TableCell>{asset.name}</TableCell>
                  <TableCell>{asset.symbol}</TableCell>
                  <TableCell>{asset.market}</TableCell>
                  <TableCell>{asset.created_at}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
