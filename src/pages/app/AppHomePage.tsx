import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUp, ArrowDown, TrendingUp, BarChart3, RefreshCw } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useDashboardData } from "@/hooks/useDashboardData";
import { memo } from "react";

// Componente memorizado para evitar re-renders desnecessários
const IndexCard = memo(({
  index,
  isSelected,
  onClick
}: {
  index: any;
  isSelected: boolean;
  onClick: () => void;
}) => <div className={`p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors cursor-pointer ${isSelected ? 'ring-2 ring-primary bg-primary/5' : ''}`} onClick={onClick}>
    <div className="text-xs font-medium text-muted-foreground mb-1 truncate">
      {index.name}
    </div>
    <div className="text-sm font-bold mb-1">
      {index.value || 'N/A'}
    </div>
    <div className={`flex items-center gap-1 text-xs ${index.isNegative ? 'text-red-600' : 'text-green-600'}`}>
      {index.isNegative ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
      {index.changePercent || '0.00%'}
    </div>
  </div>);
IndexCard.displayName = 'IndexCard';
export default function AppHomePage() {
  const {
    indices,
    stocks,
    selectedIndex,
    loading,
    stocksLoading,
    error,
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
            Main Global Financial Indices
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="text-center py-4">
              <div className="text-sm text-red-600">Error loading data. Automatic refresh in progress...</div>
            </div>
          )}
          {loading && !error ? (
            <div className="text-center py-8">
              <div className="flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Loading real-time data...</span>
              </div>
            </div>
          ) : indices.length === 0 && !loading && !error ? (
            <div className="text-center py-8">
              <div className="text-sm text-muted-foreground">Loading indices data...</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {indices.map(index => (
                <IndexCard 
                  key={index.symbol} 
                  index={index} 
                  isSelected={selectedIndex === index.symbol} 
                  onClick={() => handleIndexClick(index.symbol)} 
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stocks Section */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Top Performing Stocks
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Highest gainers & biggest losers for {getSelectedIndexName()} (Click on an index above to change)
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {stocksLoading ? (
            <div className="text-center py-8">
              <div className="flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Loading stocks data for {getSelectedIndexName()}...</span>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Top Gainers */}
              <div>
                <h4 className="text-sm font-semibold mb-3 text-green-600 flex items-center gap-2">
                  <ArrowUp className="h-4 w-4" />
                  Top 5 Gainers (Highest % Increase)
                </h4>
                {stocks.gainers && stocks.gainers.length > 0 ? (
                  <div className="grid grid-cols-3 md:grid-cols-1 lg:grid-cols-5 gap-3">
                    {stocks.gainers.map((stock, i) => (
                      <div key={`${stock.symbol}-gainer-${selectedIndex}-${i}`} className="p-3 border rounded bg-green-50 dark:bg-green-950/20">
                        <div className="text-sm font-medium truncate">{stock.symbol}</div>
                        <div className="text-xs text-muted-foreground truncate">{stock.name}</div>
                        <div className="text-sm text-muted-foreground">${stock.price || 'N/A'}</div>
                        <div className="text-sm text-green-600 font-medium">{stock.changePercent || 'N/A'}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground py-4">Loading gainers data...</div>
                )}
              </div>

              {/* Top Losers */}
              <div>
                <h4 className="text-sm font-semibold mb-3 text-red-600 flex items-center gap-2">
                  <ArrowDown className="h-4 w-4" />
                  Top 5 Losers (Biggest % Decrease)
                </h4>
                {stocks.losers && stocks.losers.length > 0 ? (
                  <div className="grid grid-cols-3 md:grid-cols-1 lg:grid-cols-5 gap-3">
                    {stocks.losers.map((stock, i) => (
                      <div key={`${stock.symbol}-loser-${selectedIndex}-${i}`} className="p-3 border rounded bg-red-50 dark:bg-red-950/20">
                        <div className="text-sm font-medium truncate">{stock.symbol}</div>
                        <div className="text-xs text-muted-foreground truncate">{stock.name}</div>
                        <div className="text-sm text-muted-foreground">${stock.price || 'N/A'}</div>
                        <div className="text-sm text-red-600 font-medium">{stock.changePercent || 'N/A'}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground py-4">Loading losers data...</div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
