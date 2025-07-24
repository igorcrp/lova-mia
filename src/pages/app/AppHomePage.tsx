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
}) => <div className={`glass-card p-4 hover-lift cursor-pointer transition-all duration-300 ${isSelected ? 'premium-glow ring-2 ring-primary bg-primary/5' : ''}`} onClick={onClick}>
    <div className="text-xs font-medium text-muted-foreground mb-2 truncate">
      {index.name}
    </div>
    <div className="text-base font-semibold mb-2 text-foreground">
      {index.value || 'N/A'}
    </div>
    <div className={`flex items-center gap-1.5 text-sm font-medium ${index.isNegative ? 'text-destructive' : 'text-success'}`}>
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
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-display mb-2">
          Welcome to <span className="gradient-text">Alpha Quant</span>
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Professional trading analysis platform trusted by thousands of traders worldwide. 
          Monitor global indices and discover top performing stocks in real-time.
        </p>
      </div>

      {/* Main Global Financial Indices Section */}
      <div className="card-premium p-6 hover-lift">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gradient-primary rounded-lg">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-display">Global Financial Indices</h2>
            <p className="text-sm text-muted-foreground">Real-time market performance worldwide</p>
          </div>
        </div>
        <div className="min-h-[200px]">
          {error && (
            <div className="text-center py-8">
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <div className="text-sm text-destructive font-medium">Error loading data</div>
                <div className="text-xs text-muted-foreground mt-1">Automatic refresh in progress...</div>
              </div>
            </div>
          )}
          {loading && !error ? (
            <div className="text-center py-12">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Loading real-time market data...</span>
                <div className="text-xs text-muted-foreground">Connecting to global exchanges</div>
              </div>
            </div>
          ) : indices.length === 0 && !loading && !error ? (
            <div className="text-center py-12">
              <div className="text-sm text-muted-foreground">Preparing market data...</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
        </div>
      </div>

      {/* Stocks Section */}
      <div className="card-premium p-6 hover-lift">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gradient-success rounded-lg">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-display">Top Performing Stocks</h2>
            <p className="text-sm text-muted-foreground">
              Highest gainers & biggest losers for <span className="font-medium text-primary">{getSelectedIndexName()}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Click on an index above to change the market selection
            </p>
          </div>
        </div>
        <div className="min-h-[300px]">
          {stocksLoading ? (
            <div className="text-center py-12">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Loading stocks data for {getSelectedIndexName()}...</span>
                <div className="text-xs text-muted-foreground">Analyzing market performance</div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Top Gainers */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-success/20 rounded-lg">
                    <ArrowUp className="h-4 w-4 text-success" />
                  </div>
                  <h3 className="text-lg font-semibold text-success">Top 5 Gainers</h3>
                  <span className="text-xs text-muted-foreground">Highest % Increase</span>
                </div>
                {stocks.gainers && stocks.gainers.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    {stocks.gainers.map((stock, i) => (
                      <div key={`${stock.symbol}-gainer-${selectedIndex}-${i}`} className="glass-card p-4 hover-lift">
                        <div className="text-sm font-semibold text-foreground truncate">{stock.symbol}</div>
                        <div className="text-xs text-muted-foreground truncate mb-2">{stock.name}</div>
                        <div className="text-sm text-muted-foreground mb-1">${stock.price || 'N/A'}</div>
                        <div className="text-sm text-success font-semibold">{stock.changePercent || 'N/A'}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground py-8 text-center">
                    <div className="animate-pulse">Loading gainers data...</div>
                  </div>
                )}
              </div>

              {/* Top Losers */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-destructive/20 rounded-lg">
                    <ArrowDown className="h-4 w-4 text-destructive" />
                  </div>
                  <h3 className="text-lg font-semibold text-destructive">Top 5 Losers</h3>
                  <span className="text-xs text-muted-foreground">Biggest % Decrease</span>
                </div>
                {stocks.losers && stocks.losers.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    {stocks.losers.map((stock, i) => (
                      <div key={`${stock.symbol}-loser-${selectedIndex}-${i}`} className="glass-card p-4 hover-lift">
                        <div className="text-sm font-semibold text-foreground truncate">{stock.symbol}</div>
                        <div className="text-xs text-muted-foreground truncate mb-2">{stock.name}</div>
                        <div className="text-sm text-muted-foreground mb-1">${stock.price || 'N/A'}</div>
                        <div className="text-sm text-destructive font-semibold">{stock.changePercent || 'N/A'}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground py-8 text-center">
                    <div className="animate-pulse">Loading losers data...</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
