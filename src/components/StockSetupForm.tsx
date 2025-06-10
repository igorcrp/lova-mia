
import { useState } from "react";
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
import { Loader2 } from "lucide-react";
import { StockAnalysisParams } from "@/types";
import { StockSetupFormProps } from "@/components/interfaces/StockSetupFormProps";

export function StockSetupForm({ onSubmit, isLoading, planType, subscriptionLoading }: StockSetupFormProps) {
  const [country, setCountry] = useState("brazil");
  const [stockMarket, setStockMarket] = useState("b3");
  const [assetClass, setAssetClass] = useState("stocks");
  const [operation, setOperation] = useState<"buy" | "sell">("buy");
  const [referencePrice, setReferencePrice] = useState<"open" | "high" | "low" | "close">("open");
  const [entryPercentage, setEntryPercentage] = useState("2");
  const [stopPercentage, setStopPercentage] = useState("1");
  const [initialCapital, setInitialCapital] = useState("1000");
  const [period, setPeriod] = useState("1 month");
  const [comparisonStocks, setComparisonStocks] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const params: StockAnalysisParams = {
      country,
      stockMarket,
      assetClass,
      operation,
      referencePrice,
      entryPercentage: Number(entryPercentage),
      stopPercentage: Number(stopPercentage),
      initialCapital: Number(initialCapital),
      period,
      comparisonStocks: comparisonStocks.split(",").map((s) => s.trim()),
    };

    onSubmit(params);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="country">Country</Label>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="brazil">Brazil</SelectItem>
              {/* <SelectItem value="usa">USA</SelectItem> */}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="stockMarket">Stock Market</Label>
          <Select value={stockMarket} onValueChange={setStockMarket}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="b3">B3 (Brasil)</SelectItem>
              {/* <SelectItem value="nasdaq">NASDAQ (USA)</SelectItem> */}
              {/* <SelectItem value="nyse">NYSE (USA)</SelectItem> */}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="assetClass">Asset Class</Label>
          <Select value={assetClass} onValueChange={setAssetClass}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stocks">Stocks</SelectItem>
              {/* <SelectItem value="etfs">ETFs</SelectItem> */}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="operation">Operation</Label>
          <Select value={operation} onValueChange={(value: "buy" | "sell") => setOperation(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="buy">Buy</SelectItem>
              <SelectItem value="sell">Sell</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="referencePrice">Reference Price</Label>
          <Select value={referencePrice} onValueChange={(value: "open" | "high" | "low" | "close") => setReferencePrice(value)}>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="entryPercentage">Entry Percentage (%)</Label>
          <Input
            id="entryPercentage"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={entryPercentage}
            onChange={(e) => setEntryPercentage(e.target.value)}
            required
          />
        </div>

        <div>
          <Label htmlFor="stopPercentage">Stop Percentage (%)</Label>
          <Input
            id="stopPercentage"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={stopPercentage}
            onChange={(e) => setStopPercentage(e.target.value)}
            required
          />
        </div>

        <div>
          <Label htmlFor="initialCapital">Initial Capital ($)</Label>
          <Input
            id="initialCapital"
            type="number"
            step="0.01"
            min="0"
            value={initialCapital}
            onChange={(e) => setInitialCapital(e.target.value)}
            required
          />
        </div>
      </div>

      <div>
        <Label htmlFor="period">Period</Label>
        <Select 
          value={period} 
          onValueChange={setPeriod}
          disabled={planType === 'free'}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1 month">1 Month</SelectItem>
            {planType === 'premium' && (
              <>
                <SelectItem value="3 months">3 Months</SelectItem>
                <SelectItem value="6 months">6 Months</SelectItem>
                <SelectItem value="1 year">1 Year</SelectItem>
                <SelectItem value="2 years">2 Years</SelectItem>
                <SelectItem value="3 years">3 Years</SelectItem>
                <SelectItem value="5 years">5 Years</SelectItem>
                <SelectItem value="all">All Available Data</SelectItem>
              </>
            )}
          </SelectContent>
        </Select>
        {planType === 'free' && (
          <p className="text-sm text-muted-foreground mt-1">
            Free plan is limited to 1 month period. Upgrade to Premium for all periods.
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="comparisonStocks">Comparison Stocks (comma-separated)</Label>
        <Input
          id="comparisonStocks"
          type="text"
          placeholder="e.g., WEGE3, MGLU3"
          value={comparisonStocks}
          onChange={(e) => setComparisonStocks(e.target.value)}
        />
      </div>

      <Button
        type="submit"
        disabled={isLoading || subscriptionLoading}
        className="w-full"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          'Show Results'
        )}
      </Button>
    </form>
  );
}
