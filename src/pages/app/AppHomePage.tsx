import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUp, ArrowDown, TrendingUp, Globe, BarChart3 } from "lucide-react";
import { useDashboardData } from "@/hooks/useDashboardData";
export default function AppHomePage() {
  const {
    indices,
    stocks,
    economicData,
    selectedIndex,
    loading,
    handleIndexClick
  } = useDashboardData();

  // Market status data
  const marketStatus = [{
    region: "Asian",
    status: "Closed",
    color: "bg-red-100 text-red-800"
  }, {
    region: "European",
    status: "Open",
    color: "bg-green-100 text-green-800"
  }, {
    region: "American",
    status: "Open",
    color: "bg-green-100 text-green-800"
  }];

  // News data
  const news = ["US-China trade negotiations in London", "Provisional Measure on IOF in Brazil", "US inflation expectations", "American oil production under new administration"];
  return <div>
      <div className="space-y-6">
        {/* Market Status Section */}
        

        {/* Main Global Financial Indices Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Main Global Financial Indices (Real-time)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-center py-4">Loading real-time data...</div> : <div className="grid grid-cols-5 gap-3">
                {indices.map((index, i) => <div key={i} className={`p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors cursor-pointer ${selectedIndex === index.symbol ? 'ring-2 ring-primary' : ''}`} onClick={() => handleIndexClick(index.symbol)}>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      {index.name}
                    </div>
                    <div className="text-sm font-bold mb-1">
                      {index.value}
                    </div>
                    <div className={`flex items-center gap-1 text-xs ${index.isNegative ? 'text-red-600' : 'text-green-600'}`}>
                      {index.isNegative ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                      {index.changePercent}
                    </div>
                  </div>)}
              </div>}
          </CardContent>
        </Card>

        {/* Stocks Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Stocks - Top Gainers & Losers
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Click on an index above to see its top performing stocks
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Top Gainers */}
              <div>
                <h4 className="text-sm font-semibold mb-2 text-green-600">Top 5 Gainers</h4>
                <div className="grid grid-cols-5 gap-2">
                  {stocks.gainers.map((stock, i) => <div key={i} className="p-2 border rounded bg-green-50 dark:bg-green-950">
                      <div className="text-xs font-medium">{stock.symbol}</div>
                      <div className="text-xs">${stock.price}</div>
                      <div className="text-xs text-green-600">{stock.changePercent}</div>
                    </div>)}
                </div>
              </div>

              {/* Top Losers */}
              <div>
                <h4 className="text-sm font-semibold mb-2 text-red-600">Top 5 Losers</h4>
                <div className="grid grid-cols-5 gap-2">
                  {stocks.losers.map((stock, i) => <div key={i} className="p-2 border rounded bg-red-50 dark:bg-red-950">
                      <div className="text-xs font-medium">{stock.symbol}</div>
                      <div className="text-xs">${stock.price}</div>
                      <div className="text-xs text-red-600">{stock.changePercent}</div>
                    </div>)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Global Economic Indicators Section */}
        

        {/* News and Market Alerts Section */}
        
      </div>
    </div>;
}