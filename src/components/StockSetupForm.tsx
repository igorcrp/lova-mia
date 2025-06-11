
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StockAnalysisParams } from "@/types";
import { useSubscription } from "@/hooks/useSubscription";
import { SubscriptionUpgrade } from "@/components/SubscriptionUpgrade";

interface StockSetupFormProps {
  onSubmit: (params: StockAnalysisParams) => void;
  isLoading: boolean;
}

export function StockSetupForm({ onSubmit, isLoading }: StockSetupFormProps) {
  const { isFree } = useSubscription();
  const [country, setCountry] = useState("Brazil");
  const [stockMarket, setStockMarket] = useState("B3");
  const [assetClass, setAssetClass] = useState("Stocks");
  const [operation, setOperation] = useState<"buy" | "sell">("buy");
  const [referencePrice, setReferencePrice] = useState<"open" | "high" | "low" | "close">("open");
  const [entryPercentage, setEntryPercentage] = useState(1.5);
  const [stopPercentage, setStopPercentage] = useState(2.0);
  const [initialCapital, setInitialCapital] = useState(10000);
  const [period, setPeriod] = useState("1 month");

  // Free users can only select "1 month"
  const availablePeriods = isFree 
    ? ["1 month"]
    : ["1 month", "3 months", "6 months", "1 year", "2 years", "5 years"];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const params: StockAnalysisParams = {
      country,
      stockMarket,
      assetClass,
      operation,
      referencePrice,
      entryPercentage,
      stopPercentage,
      initialCapital,
      period,
    };
    
    onSubmit(params);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Stock Analysis Setup</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Brazil">Brazil</SelectItem>
                    <SelectItem value="United States">United States</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="stockMarket">Stock Market</Label>
                <Select value={stockMarket} onValueChange={setStockMarket}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select stock market" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="B3">B3</SelectItem>
                    <SelectItem value="NASDAQ">NASDAQ</SelectItem>
                    <SelectItem value="NYSE">NYSE</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assetClass">Asset Class</Label>
                <Select value={assetClass} onValueChange={setAssetClass}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select asset class" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Stocks">Stocks</SelectItem>
                    <SelectItem value="ETFs">ETFs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="operation">Operation</Label>
                <Select value={operation} onValueChange={(value) => setOperation(value as "buy" | "sell")}>
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
                <Select value={referencePrice} onValueChange={(value) => setReferencePrice(value as "open" | "high" | "low" | "close")}>
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

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="entryPercentage">Entry %</Label>
                <Input
                  id="entryPercentage"
                  type="number"
                  step="0.1"
                  value={entryPercentage}
                  onChange={(e) => setEntryPercentage(parseFloat(e.target.value))}
                  placeholder="1.5"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="stopPercentage">Stop %</Label>
                <Input
                  id="stopPercentage"
                  type="number"
                  step="0.1"
                  value={stopPercentage}
                  onChange={(e) => setStopPercentage(parseFloat(e.target.value))}
                  placeholder="2.0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="initialCapital">Initial Capital ($)</Label>
                <Input
                  id="initialCapital"
                  type="number"
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(parseInt(e.target.value))}
                  placeholder="10000"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="period">Period</Label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePeriods.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? "Running Analysis..." : "Run Analysis"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isFree && <SubscriptionUpgrade />}
    </div>
  );
}
