
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "@/services/api";
import { Asset } from "@/types";
import { toast } from "sonner";

export default function AdminAssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [countries, setCountries] = useState<string[]>([]);
  const [stockMarkets, setStockMarkets] = useState<string[]>([]);
  const [assetClasses, setAssetClasses] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedStockMarket, setSelectedStockMarket] = useState("");
  const [selectedAssetClass, setSelectedAssetClass] = useState("");
  
  // New asset form state
  const [showForm, setShowForm] = useState(false);
  const [newAsset, setNewAsset] = useState({
    code: "",
    name: "",
    country: "",
    stock_market: "",
    asset_class: "",
    status: "active" as const
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [assetsData, countriesData] = await Promise.all([
          api.assets.getAllAssets(),
          api.marketData.getAvailableCountries()
        ]);
        
        setAssets(assetsData);
        setCountries(countriesData);
      } catch (error) {
        console.error("Failed to fetch assets data", error);
        toast.error("Erro ao carregar dados dos ativos");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, []);

  // Load stock markets when country changes
  useEffect(() => {
    const loadStockMarkets = async () => {
      if (selectedCountry) {
        try {
          const markets = await api.marketData.getAvailableStockMarkets(selectedCountry);
          setStockMarkets(markets);
          setSelectedStockMarket("");
          setSelectedAssetClass("");
        } catch (error) {
          console.error("Failed to load stock markets", error);
        }
      } else {
        setStockMarkets([]);
        setSelectedStockMarket("");
        setSelectedAssetClass("");
      }
    };
    
    loadStockMarkets();
  }, [selectedCountry]);

  // Load asset classes when stock market changes
  useEffect(() => {
    const loadAssetClasses = async () => {
      if (selectedCountry && selectedStockMarket) {
        try {
          const classes = await api.marketData.getAvailableAssetClasses(selectedCountry, selectedStockMarket);
          setAssetClasses(classes);
          setSelectedAssetClass("");
        } catch (error) {
          console.error("Failed to load asset classes", error);
        }
      } else {
        setAssetClasses([]);
        setSelectedAssetClass("");
      }
    };
    
    loadAssetClasses();
  }, [selectedCountry, selectedStockMarket]);

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const createdAsset = await api.assets.create(newAsset);
      setAssets([...assets, createdAsset]);
      setNewAsset({
        code: "",
        name: "",
        country: "",
        stock_market: "",
        asset_class: "",
        status: "active"
      });
      setShowForm(false);
      toast.success("Ativo criado com sucesso!");
    } catch (error) {
      console.error("Failed to create asset", error);
      toast.error("Erro ao criar ativo");
    }
  };

  const filteredAssets = assets.filter(asset =>
    asset.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asset.country.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asset.stock_market.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="loading-circle" />
        <span className="ml-3">Loading...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Assets Management</h1>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-2" />
          Add New Asset
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create New Asset</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateAsset} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="code">Asset Code</Label>
                  <Input
                    id="code"
                    value={newAsset.code}
                    onChange={(e) => setNewAsset({...newAsset, code: e.target.value})}
                    placeholder="e.g., AAPL"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="name">Asset Name</Label>
                  <Input
                    id="name"
                    value={newAsset.name}
                    onChange={(e) => setNewAsset({...newAsset, name: e.target.value})}
                    placeholder="e.g., Apple Inc."
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="country">Country</Label>
                  <Select
                    value={newAsset.country}
                    onValueChange={(value) => setNewAsset({...newAsset, country: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.map((country) => (
                        <SelectItem key={country} value={country}>
                          {country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="stock_market">Stock Market</Label>
                  <Input
                    id="stock_market"
                    value={newAsset.stock_market}
                    onChange={(e) => setNewAsset({...newAsset, stock_market: e.target.value})}
                    placeholder="e.g., NASDAQ"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="asset_class">Asset Class</Label>
                  <Input
                    id="asset_class"
                    value={newAsset.asset_class}
                    onChange={(e) => setNewAsset({...newAsset, asset_class: e.target.value})}
                    placeholder="e.g., Stock"
                    required
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button type="submit">Create Asset</Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Assets</CardTitle>
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            <Input
              placeholder="Search assets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredAssets.map((asset) => (
              <div key={asset.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-semibold">{asset.code}</div>
                  <div className="text-sm text-gray-600">{asset.name}</div>
                  <div className="text-xs text-gray-500">
                    {asset.country} • {asset.stock_market} • {asset.asset_class}
                  </div>
                </div>
                <Badge variant={asset.status === 'active' ? 'default' : 'secondary'}>
                  {asset.status}
                </Badge>
              </div>
            ))}
            
            {filteredAssets.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No assets found matching your search.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
