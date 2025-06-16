
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUp, ArrowDown, TrendingUp, BarChart3 } from "lucide-react";
import { useDashboardData } from "@/hooks/useDashboardData";

export default function AppHomePage() {
  const {
    indices,
    stocks,
    economicData,
    selectedIndex,
    loading,
    stocksLoading,
    handleIndexClick
  } = useDashboardData();
  
  const getSelectedIndexName = () => {
    const index = indices.find(idx => idx.symbol === selectedIndex);
    return index ? index.name : selectedIndex;
  };
  
  return (
    <div className="space-y-6">
      {/* Main Global Financial Indices Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Main Global Financial Indices (Real-time)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="text-sm text-muted-foreground">Loading real-time data...</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {indices.map((index, i) => (
                <div 
                  key={index.symbol} 
                  className={`p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors cursor-pointer ${
                    selectedIndex === index.symbol ? 'ring-2 ring-primary bg-primary/5' : ''
                  }`} 
                  onClick={() => handleIndexClick(index.symbol)}
                >
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    {index.name}
                  </div>
                  <div className="text-sm font-bold mb-1">
                    {index.value}
                  </div>
                  <div className={`flex items-center gap-1 text-xs ${
                    index.isNegative ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {index.isNegative ? (
                      <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUp className="h-3 w-3" />
                    )}
                    {index.changePercent}
                  </div>
                </div>
              ))}
            </div>
          )}
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
            Top performing stocks for {getSelectedIndexName()} (Click on an index above to change)
          </p>
        </CardHeader>
        <CardContent>
          {stocksLoading ? (
            <div className="text-center py-8">
              <div className="text-sm text-muted-foreground">Loading stocks data for {getSelectedIndexName()}...</div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Top Gainers */}
              <div>
                <h4 className="text-sm font-semibold mb-3 text-green-600 flex items-center gap-2">
                  <ArrowUp className="h-4 w-4" />
                  Top 5 Gainers
                </h4>
                {stocks.gainers && stocks.gainers.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {stocks.gainers.map((stock, i) => (
                      <div key={`${stock.symbol}-gainer-${i}`} className="p-3 border rounded bg-green-50 dark:bg-green-950/20">
                        <div className="text-sm font-medium">{stock.symbol}</div>
                        <div className="text-sm text-muted-foreground">${stock.price}</div>
                        <div className="text-sm text-green-600 font-medium">{stock.changePercent}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground py-4">No gainers data available</div>
                )}
              </div>

              {/* Top Losers */}
              <div>
                <h4 className="text-sm font-semibold mb-3 text-red-600 flex items-center gap-2">
                  <ArrowDown className="h-4 w-4" />
                  Top 5 Losers
                </h4>
                {stocks.losers && stocks.losers.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {stocks.losers.map((stock, i) => (
                      <div key={`${stock.symbol}-loser-${i}`} className="p-3 border rounded bg-red-50 dark:bg-red-950/20">
                        <div className="text-sm font-medium">{stock.symbol}</div>
                        <div className="text-sm text-muted-foreground">${stock.price}</div>
                        <div className="text-sm text-red-600 font-medium">{stock.changePercent}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground py-4">No losers data available</div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
