
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUp, ArrowDown, Clock, TrendingUp, Globe, Calendar } from "lucide-react";
import { useDashboardData } from "@/hooks/useDashboardData";

export default function AppHomePage() {
  const {
    marketIndices,
    selectedIndex,
    topStocks,
    loading,
    error,
    handleIndexClick,
    economicIndicators,
    marketStatus,
    news
  } = useDashboardData();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading market data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <p className="text-muted-foreground">Please try refreshing the page</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Market Status - Moved above Main Indices */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Market Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            {marketStatus.map((market, i) => (
              <Badge key={i} className={market.color}>
                {market.region}: {market.status}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main Financial Indices - Converted to Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Main Global Financial Indices (Real-time)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-3">
            {marketIndices.map((index) => (
              <div 
                key={index.symbol} 
                className={`p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors cursor-pointer ${
                  selectedIndex === index.symbol ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => handleIndexClick(index.name)}
              >
                <div className="text-xs font-medium text-muted-foreground mb-1">
                  {index.name}
                </div>
                <div className="text-sm font-bold mb-1">
                  {index.price.toFixed(2)}
                </div>
                <div className={`flex items-center gap-1 text-xs ${
                  index.change < 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {index.change < 0 ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                  {index.changePercent.toFixed(2)}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  H: {index.high.toFixed(2)} L: {index.low.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stocks Section - New Interactive Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Stocks - Top Gainers & Losers
            <Badge variant="outline" className="ml-2">
              {marketIndices.find(idx => idx.symbol === selectedIndex)?.name || 'S&P 500'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Top Gainers Row */}
            <div>
              <h4 className="text-sm font-semibold mb-2 text-green-600">Top 5 Gainers</h4>
              <div className="grid grid-cols-5 gap-3">
                {topStocks.gainers.map((stock) => (
                  <div key={stock.symbol} className="p-2 border rounded bg-green-50 hover:bg-green-100 transition-colors">
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      {stock.symbol}
                    </div>
                    <div className="text-sm font-bold mb-1">
                      ${stock.price.toFixed(2)}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-green-600">
                      <ArrowUp className="h-3 w-3" />
                      +{stock.changePercent.toFixed(2)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Losers Row */}
            <div>
              <h4 className="text-sm font-semibold mb-2 text-red-600">Top 5 Losers</h4>
              <div className="grid grid-cols-5 gap-3">
                {topStocks.losers.map((stock) => (
                  <div key={stock.symbol} className="p-2 border rounded bg-red-50 hover:bg-red-100 transition-colors">
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      {stock.symbol}
                    </div>
                    <div className="text-sm font-bold mb-1">
                      ${stock.price.toFixed(2)}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-red-600">
                      <ArrowDown className="h-3 w-3" />
                      {stock.changePercent.toFixed(2)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Global Economic Indicators */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Global Economic Indicators
          </CardTitle>
        </CardHeader>
        <CardContent>
          <h3 className="text-lg font-semibold mb-4">Major Economies</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Country</TableHead>
                <TableHead>GDP Growth 2025</TableHead>
                <TableHead>Inflation</TableHead>
                <TableHead>Interest Rate</TableHead>
                <TableHead>Currency (Exchange)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {economicIndicators.map((economy, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{economy.country}</TableCell>
                  <TableCell>{economy.gdpGrowth}</TableCell>
                  <TableCell>{economy.inflation}</TableCell>
                  <TableCell>{economy.interestRate}</TableCell>
                  <TableCell>{economy.currency}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Market News and Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Latest News
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {news.map((item, i) => (
                <li key={i} className="text-sm text-muted-foreground border-l-2 border-muted pl-3">
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Economic Calendar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                <span className="text-sm font-medium">Today</span>
                <Badge variant="outline">US GDP Data</Badge>
              </div>
              <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                <span className="text-sm font-medium">Tomorrow</span>
                <Badge variant="outline">Fed Meeting</Badge>
              </div>
              <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                <span className="text-sm font-medium">Friday</span>
                <Badge variant="outline">Jobs Report</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
