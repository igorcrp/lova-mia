import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/services/api";
import { Asset } from "@/types";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Upload, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export default function AdminAssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewAssetDialog, setShowNewAssetDialog] = useState(false);
  
  const [countries, setCountries] = useState<string[]>([]);
  const [stockMarkets, setStockMarkets] = useState<string[]>([]);
  const [assetClasses, setAssetClasses] = useState<string[]>([]);
  
  const [newAsset, setNewAsset] = useState<Partial<Asset>>({
    code: "",
    name: "",
    country: "",
    stock_market: "",
    asset_class: "",
    status: "active"
  });
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        // Mock data for assets as api.assets does not exist
        const assetsData: Asset[] = [
          { id: "1", code: "AAPL", name: "Apple Inc.", country: "USA", stock_market: "NASDAQ", asset_class: "Stock", status: "active", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          { id: "2", code: "MSFT", name: "Microsoft Corp.", country: "USA", stock_market: "NASDAQ", asset_class: "Stock", status: "active", created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        ];
        const countriesData = await api.marketData.getCountries();
        
        // Ensure assets have the right status type
        const typedAssets: Asset[] = assetsData.map(asset => ({
          ...asset,
          status: asset.status === 'active' ? 'active' : 'inactive'
        }));
        
        setAssets(typedAssets);
        setCountries(countriesData);
      } catch (error) {
        console.error("Failed to fetch data", error);
        toast.error("Failed to fetch assets");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  useEffect(() => {
    const fetchStockMarkets = async () => {
      if (!newAsset.country) {
        setStockMarkets([]);
        return;
      }
      
      try {
        const marketsData = await api.marketData.getStockMarkets(newAsset.country);
        setStockMarkets(marketsData);
        
        // Reset stock market and asset class when country changes
        setNewAsset(prev => ({
          ...prev,
          stock_market: "",
          asset_class: ""
        }));
      } catch (error) {
        console.error("Failed to fetch stock markets", error);
      }
    };
    
    fetchStockMarkets();
  }, [newAsset.country]);
  
  useEffect(() => {
    const fetchAssetClasses = async () => {
      if (!newAsset.country || !newAsset.stock_market) {
        setAssetClasses([]);
        return;
      }
      
      try {
        const classesData = await api.marketData.getAssetClasses(
          newAsset.country,
          newAsset.stock_market
        );
        setAssetClasses(classesData);
        
        // Reset asset class when stock market changes
        setNewAsset(prev => ({
          ...prev,
          asset_class: ""
        }));
      } catch (error) {
        console.error("Failed to fetch asset classes", error);
      }
    };
    
    fetchAssetClasses();
  }, [newAsset.country, newAsset.stock_market]);
  
  const handleAddAsset = async () => {
    try {
      // Mocking asset creation as api.assets.create does not exist
      const createdAsset: Asset = {
        id: String(assets.length + 1),
        ...newAsset,
        status: newAsset.status === 'active' ? 'active' : 'inactive',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      } as Asset;
      
      setAssets([...assets, createdAsset]);
      setShowNewAssetDialog(false);
      toast.success("Asset added successfully");
      
      // Reset form
      setNewAsset({
        code: "",
        name: "",
        country: "",
        stock_market: "",
        asset_class: "",
        status: "active"
      });
    } catch (error) {
      console.error("Failed to add asset", error);
      toast.error("Failed to add asset");
    }
  };
  
  const downloadTemplate = () => {
    // In a real app, this would generate and download a CSV template
    toast("Template CSV download initiated");
  };
  
  const handleImportCSV = () => {
    // In a real app, this would open a file picker and handle CSV import
    toast("CSV import functionality would be implemented here");
  };
  
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Gestão de Ativos</h1>
      
      <div className="flex justify-between items-center mb-6">
        <div className="relative w-full max-w-sm">
          <Input
            placeholder="Buscar ativos por código, nome ou mercado..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-4 h-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="default" onClick={() => setShowNewAssetDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Ativo
          </Button>
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Template CSV
          </Button>
          <Button variant="outline" onClick={handleImportCSV}>
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
        </div>
      </div>
      
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <input type="checkbox" className="h-4 w-4" />
              </TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Mercado</TableHead>
              <TableHead>Classificação</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-20">
                  <div className="flex flex-col items-center justify-center">
                    <div className="loading-circle mb-2" />
                    <span>Loading assets...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : assets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-20">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <FileText className="h-12 w-12 mb-4 opacity-20" />
                    <h3 className="text-xl font-medium mb-1">No assets found</h3>
                    <p className="mb-4">Add your first asset to get started</p>
                    <Button onClick={() => setShowNewAssetDialog(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Asset
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              assets.filter(asset => 
                asset.code.toLowerCase().includes(searchQuery.toLowerCase()) || 
                asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                asset.stock_market.toLowerCase().includes(searchQuery.toLowerCase())
              ).map(asset => (
                <TableRow key={asset.id}>
                  <TableCell>
                    <input type="checkbox" className="h-4 w-4" />
                  </TableCell>
                  <TableCell>{asset.code}</TableCell>
                  <TableCell>{asset.name}</TableCell>
                  <TableCell>{asset.country}</TableCell>
                  <TableCell>{asset.stock_market}</TableCell>
                  <TableCell>{asset.asset_class}</TableCell>
                  <TableCell>
                    <Badge variant={asset.status === "active" ? "default" : "outline"}>
                      {asset.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">...</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Add Asset Dialog */}
      <Dialog open={showNewAssetDialog} onOpenChange={setShowNewAssetDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Asset</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                value={newAsset.code || ""}
                onChange={(e) => setNewAsset({ ...newAsset, code: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={newAsset.name || ""}
                onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="country">Country</Label>
              <Select
                value={newAsset.country}
                onValueChange={(value) => setNewAsset({ ...newAsset, country: value })}
              >
                <SelectTrigger id="country">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {countries.map(country => (
                    <SelectItem key={country} value={country}>
                      {country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="stockMarket">Stock Market</Label>
              <Select
                value={newAsset.stock_market}
                onValueChange={(value) => setNewAsset({ ...newAsset, stock_market: value })}
                disabled={!newAsset.country || stockMarkets.length === 0}
              >
                <SelectTrigger id="stockMarket">
                  <SelectValue placeholder="Select stock market" />
                </SelectTrigger>
                <SelectContent>
                  {stockMarkets.map(market => (
                    <SelectItem key={market} value={market}>
                      {market}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="assetClass">Asset Class</Label>
              <Select
                value={newAsset.asset_class}
                onValueChange={(value) => setNewAsset({ ...newAsset, asset_class: value })}
                disabled={!newAsset.stock_market || assetClasses.length === 0}
              >
                <SelectTrigger id="assetClass">
                  <SelectValue placeholder="Select asset class" />
                </SelectTrigger>
                <SelectContent>
                  {assetClasses.map(assetClass => (
                    <SelectItem key={assetClass} value={assetClass}>
                      {assetClass}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select
                value={newAsset.status}
                onValueChange={(value: "active" | "inactive") => 
                  setNewAsset({ ...newAsset, status: value })
                }
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowNewAssetDialog(false)}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              onClick={handleAddAsset} 
              disabled={!newAsset.code || !newAsset.name || !newAsset.country || 
                      !newAsset.stock_market || !newAsset.asset_class}
            >
              Add Asset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

