
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { api } from "@/services/api";
import { StockAnalysisParams } from "@/types";
import { toast } from "@/components/ui/use-toast";
import { useSubscription } from "@/hooks/useSubscription";
import { UpgradePrompt } from "@/components/UpgradePrompt";

interface StockSetupFormProps {
  onSubmit: (params: StockAnalysisParams) => void;
  isLoading: boolean;
}

// Helper function to get date string in YYYY-MM-DD format
const getDateString = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

export function StockSetupForm({ onSubmit, isLoading }: StockSetupFormProps) {
  const { isFree } = useSubscription();
  
  // State for form data
  const [formData, setFormData] = useState<StockAnalysisParams>({
    country: "",
    stockMarket: "",
    assetClass: "",
    period: "1month",
    operation: "buy",
    referencePrice: "close",
    entryPercentage: 0.5,
    stopPercentage: 2,
    initialCapital: 100000,
    startDate: getDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)), // 30 days ago
    endDate: getDateString(new Date()),
  });

  // Data source configurations
  const [dataSources, setDataSources] = useState<any[]>([]);
  const [stockMarkets, setStockMarkets] = useState<string[]>([]);
  const [assetClasses, setAssetClasses] = useState<string[]>([]);

  // Period options - limited for free users
  const periodOptions = isFree 
    ? [{ value: "1month", label: "1 Month" }]
    : [
        { value: "1month", label: "1 Month" },
        { value: "3months", label: "3 Months" },
        { value: "6months", label: "6 Months" },
        { value: "1year", label: "1 Year" },
        { value: "2years", label: "2 Years" },
        { value: "3years", label: "3 Years" },
        { value: "5years", label: "5 Years" },
        { value: "custom", label: "Custom Period" }
      ];

  // Load data sources on component mount
  useEffect(() => {
    const loadDataSources = async () => {
      try {
        const sources = await api.marketData.getDataSources();
        setDataSources(sources);
        
        // Extract unique countries
        const uniqueCountries = Array.from(new Set(sources.map((s: any) => s.country)));
        // For now, we'll use the first country as default if available
        if (uniqueCountries.length > 0 && !formData.country) {
          setFormData(prev => ({ ...prev, country: uniqueCountries[0] }));
        }
      } catch (error) {
        console.error("Failed to load data sources:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load data sources. Please try again."
        });
      }
    };
    
    loadDataSources();
  }, []);

  // Update stock markets when country changes
  useEffect(() => {
    if (formData.country) {
      const countryMarkets = dataSources
        .filter((source: any) => source.country === formData.country)
        .map((source: any) => source.stock_market);
      const uniqueMarkets = Array.from(new Set(countryMarkets));
      setStockMarkets(uniqueMarkets);
      
      // Reset dependent fields
      setFormData(prev => ({ ...prev, stockMarket: "", assetClass: "" }));
      setAssetClasses([]);
    }
  }, [formData.country, dataSources]);

  // Update asset classes when stock market changes
  useEffect(() => {
    if (formData.country && formData.stockMarket) {
      const marketAssets = dataSources
        .filter((source: any) => source.country === formData.country && source.stock_market === formData.stockMarket)
        .map((source: any) => source.asset_class);
      const uniqueAssets = Array.from(new Set(marketAssets));
      setAssetClasses(uniqueAssets);
      
      // Reset asset class
      setFormData(prev => ({ ...prev, assetClass: "" }));
    }
  }, [formData.country, formData.stockMarket, dataSources]);

  // Force period to 1month for free users
  useEffect(() => {
    if (isFree && formData.period !== "1month") {
      setFormData(prev => ({ ...prev, period: "1month" }));
    }
  }, [isFree]);

  const handleInputChange = (field: keyof StockAnalysisParams, value: string | number) => {
    // Prevent period change for free users
    if (field === "period" && isFree && value !== "1month") {
      return;
    }
    
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.country || !formData.stockMarket || !formData.assetClass) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please select country, stock market, and asset class."
      });
      return;
    }

    // Validate custom period dates
    if (formData.period === "custom") {
      if (!formData.startDate || !formData.endDate) {
        toast({
          variant: "destructive",
          title: "Invalid Period",
          description: "Please provide both start and end dates for custom period."
        });
        return;
      }
      
      if (new Date(formData.startDate) >= new Date(formData.endDate)) {
        toast({
          variant: "destructive",
          title: "Invalid Period",
          description: "Start date must be before end date."
        });
        return;
      }
    }

    onSubmit(formData);
  };

  const countries = Array.from(new Set(dataSources.map((s: any) => s.country)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Setup Stock Analysis</CardTitle>
        <CardDescription>
          Configure your analysis parameters to test different strategies
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Data Source Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Select value={formData.country} onValueChange={(value) => handleInputChange("country", value)}>
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

            <div className="space-y-2">
              <Label htmlFor="stockMarket">Stock Market</Label>
              <Select 
                value={formData.stockMarket} 
                onValueChange={(value) => handleInputChange("stockMarket", value)}
                disabled={!formData.country}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select market" />
                </SelectTrigger>
                <SelectContent>
                  {stockMarkets.map((market) => (
                    <SelectItem key={market} value={market}>
                      {market}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assetClass">Asset Class</Label>
              <Select 
                value={formData.assetClass} 
                onValueChange={(value) => handleInputChange("assetClass", value)}
                disabled={!formData.stockMarket}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select asset class" />
                </SelectTrigger>
                <SelectContent>
                  {assetClasses.map((asset) => (
                    <SelectItem key={asset} value={asset}>
                      {asset}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Analysis Period */}
          <div className="space-y-2">
            <Label htmlFor="period">Analysis Period {isFree && "(Limited to 1 Month on Free Plan)"}</Label>
            <Select 
              value={formData.period} 
              onValueChange={(value) => handleInputChange("period", value)}
              disabled={isFree}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                {periodOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Period Dates */}
          {formData.period === "custom" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate || ""}
                  onChange={(e) => handleInputChange("startDate", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.endDate || ""}
                  onChange={(e) => handleInputChange("endDate", e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Trading Parameters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Operation Type */}
            <div className="space-y-3">
              <Label>Operation Type</Label>
              <RadioGroup 
                value={formData.operation} 
                onValueChange={(value) => handleInputChange("operation", value)}
                className="flex space-x-6"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="buy" id="buy" />
                  <Label htmlFor="buy">Buy</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sell" id="sell" />
                  <Label htmlFor="sell">Sell</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Reference Price */}
            <div className="space-y-2">
              <Label htmlFor="referencePrice">Reference Price</Label>
              <Select value={formData.referencePrice} onValueChange={(value) => handleInputChange("referencePrice", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="close">Close</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Percentage Parameters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entryPercentage">Entry Percentage (%)</Label>
              <Input
                id="entryPercentage"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={formData.entryPercentage}
                onChange={(e) => handleInputChange("entryPercentage", parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stopPercentage">Stop Loss Percentage (%)</Label>
              <Input
                id="stopPercentage"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={formData.stopPercentage}
                onChange={(e) => handleInputChange("stopPercentage", parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Initial Capital */}
          <div className="space-y-2">
            <Label htmlFor="initialCapital">Initial Capital ($)</Label>
            <Input
              id="initialCapital"
              type="number"
              min="1000"
              step="1000"
              value={formData.initialCapital}
              onChange={(e) => handleInputChange("initialCapital", parseFloat(e.target.value) || 100000)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Running Analysis..." : "Show Results"}
          </Button>
        </form>
        
        {/* Show upgrade prompt for free users */}
        {isFree && <UpgradePrompt />}
      </CardContent>
    </Card>
  );
}
