import React, { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StockAnalysisParams } from "@/types";

interface StockSetupFormProps {
  onSubmit: (params: StockAnalysisParams) => void;
  isLoading: boolean;
  isPremium?: boolean;
}

export function StockSetupForm({ onSubmit, isLoading, isPremium = false }: StockSetupFormProps) {
  const [formData, setFormData] = useState<StockAnalysisParams>({
    country: "",
    stockMarket: "",
    assetClass: "",
    operation: "buy",
    referencePrice: "open",
    entryPercentage: 1.5,
    stopPercentage: 2.0,
    initialCapital: 10000,
    period: "1month",
    comparisonStocks: [],
  });
  const [countries, setCountries] = useState<string[]>([]);
  const [stockMarkets, setStockMarkets] = useState<string[]>([]);
  const [assetClasses, setAssetClasses] = useState<string[]>([]);

  useEffect(() => {
    const fetchCountries = async () => {
      const response = await fetch("/api/market-data/countries");
      const data = await response.json();
      setCountries(data);
    };

    fetchCountries();
  }, []);

  useEffect(() => {
    const fetchStockMarkets = async () => {
      if (formData.country) {
        const response = await fetch(
          `/api/market-data/stock-markets?country=${formData.country}`
        );
        const data = await response.json();
        setStockMarkets(data);
      }
    };

    fetchStockMarkets();
  }, [formData.country]);

  useEffect(() => {
    const fetchAssetClasses = async () => {
      if (formData.country && formData.stockMarket) {
        const response = await fetch(
          `/api/market-data/asset-classes?country=${formData.country}&stockMarket=${formData.stockMarket}`
        );
        const data = await response.json();
        setAssetClasses(data);
      }
    };

    fetchAssetClasses();
  }, [formData.country, formData.stockMarket]);

  const handleSelectChange = (name: string, value: string) => {
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = event.target;
    setFormData({
      ...formData,
      [name]: Number(value),
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(formData);
  };

  const periodOptions = isPremium ? [
    { value: "1week", label: "1 Week" },
    { value: "1month", label: "1 Month" },
    { value: "3months", label: "3 Months" },
    { value: "6months", label: "6 Months" },
    { value: "1year", label: "1 Year" },
    { value: "2years", label: "2 Years" },
    { value: "5years", label: "5 Years" },
  ] : [
    { value: "1month", label: "1 Month" },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="country">Country</Label>
          <Select name="country" value={formData.country} onValueChange={(value) => {
              handleSelectChange("country", value);
              setFormData(prev => ({ ...prev, stockMarket: '', assetClass: '' })); // Reset stockMarket and assetClass
            }}>
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
          <Select name="stockMarket" value={formData.stockMarket} onValueChange={(value) => {
              handleSelectChange("stockMarket", value);
              setFormData(prev => ({ ...prev, assetClass: '' })); // Reset assetClass
            }}>
            <SelectTrigger>
              <SelectValue placeholder="Select stock market" />
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
          <Select name="assetClass" value={formData.assetClass} onValueChange={(value) => handleSelectChange("assetClass", value)}>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="operation">Operation</Label>
          <Select name="operation" value={formData.operation} onValueChange={(value) => handleSelectChange("operation", value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select operation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="buy">Buy</SelectItem>
              <SelectItem value="sell">Sell</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="referencePrice">Reference Price</Label>
          <Select name="referencePrice" value={formData.referencePrice} onValueChange={(value) => handleSelectChange("referencePrice", value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select reference price" />
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="entryPercentage">Entry Percentage (%)</Label>
          <Input
            type="number"
            name="entryPercentage"
            step="0.01"
            min="0"
            max="100"
            value={formData.entryPercentage}
            onChange={handleInputChange}
            placeholder="e.g., 1.5"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="stopPercentage">Stop Percentage (%)</Label>
          <Input
            type="number"
            name="stopPercentage"
            step="0.01"
            min="0"
            max="100"
            value={formData.stopPercentage}
            onChange={handleInputChange}
            placeholder="e.g., 2.0"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="initialCapital">Initial Capital ($)</Label>
          <Input
            type="number"
            name="initialCapital"
            min="1"
            value={formData.initialCapital}
            onChange={handleInputChange}
            placeholder="e.g., 10000"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="period">
          Period {!isPremium && <span className="text-sm text-blue-600">(Free plan: 1 month only)</span>}
        </Label>
        <Select name="period" value={formData.period} onValueChange={(value) => handleSelectChange("period", value)}>
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

      <Button type="submit" disabled={isLoading}>
        {isLoading ? "Loading..." : "Show Results"}
      </Button>
    </form>
  );
}
