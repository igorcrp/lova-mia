import { useState, useEffect } from "react";
import { api } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnalysisResult, StockAnalysisParams } from "@/types";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowRight, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
export default function AppHomePage() {
  const [topPerformers, setTopPerformers] = useState<AnalysisResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"30" | "60" | "90">("30");

  // Dummy data for the chart
  const chartData = [{
    date: "Jan",
    value: 10000
  }, {
    date: "Feb",
    value: 10800
  }, {
    date: "Mar",
    value: 11200
  }, {
    date: "Apr",
    value: 10900
  }, {
    date: "May",
    value: 11800
  }, {
    date: "Jun",
    value: 12400
  }, {
    date: "Jul",
    value: 12900
  }];
  useEffect(() => {
    const fetchTopPerformers = async () => {
      try {
        setIsLoading(true);

        // In a real app, we would fetch data for the specific time range
        // Here we're using the same simulated data
        const params: StockAnalysisParams = {
          operation: "buy",
          country: "USA",
          stockMarket: "NASDAQ",
          assetClass: "Ações",
          referencePrice: "close",
          period: "3m",
          entryPercentage: 1,
          stopPercentage: 1,
          initialCapital: 10000,
          // Now comparisonStocks is valid in the interface
          comparisonStocks: []
        };
        const results = await api.analysis.runAnalysis(params, () => {});

        // Sort by profit percentage
        const sorted = [...results].sort((a, b) => b.profitPercentage - a.profitPercentage);
        setTopPerformers(sorted.slice(0, 5)); // Take top 5
      } catch (error) {
        console.error("Failed to fetch top performers", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTopPerformers();
  }, [timeRange]);
  return <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg">Portfolio Performance</CardTitle>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-8 text-xs">1M</Button>
              <Button variant="outline" size="sm" className="h-8 text-xs bg-primary/10">6M</Button>
              <Button variant="outline" size="sm" className="h-8 text-xs">1Y</Button>
              <Button variant="outline" size="sm" className="h-8 text-xs">All</Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5
              }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" />
                  <YAxis tickFormatter={value => `$${value.toLocaleString()}`} />
                  <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, "Value"]} labelFormatter={label => `Date: ${label}`} />
                  <Line type="monotone" dataKey="value" stroke="#3b82f6" activeDot={{
                  r: 6
                }} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg">Top Performers</CardTitle>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className={`h-7 text-xs px-2 ${timeRange === "30" ? "bg-primary/10" : ""}`} onClick={() => setTimeRange("30")}>
                  30d
                </Button>
                <Button variant="ghost" size="sm" className={`h-7 text-xs px-2 ${timeRange === "60" ? "bg-primary/10" : ""}`} onClick={() => setTimeRange("60")}>
                  60d
                </Button>
                <Button variant="ghost" size="sm" className={`h-7 text-xs px-2 ${timeRange === "90" ? "bg-primary/10" : ""}`} onClick={() => setTimeRange("90")}>
                  90d
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? <div className="h-[260px] flex items-center justify-center">
                <div className="loading-circle" />
              </div> : <div className="space-y-4">
                {topPerformers.map((stock, index) => <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-2 rounded-full">
                        <TrendingUp className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium">{stock.assetCode}</div>
                        <div className="text-xs text-muted-foreground">{stock.assetName}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-green-600 dark:text-green-400">
                        +{stock.profitPercentage.toFixed(2)}%
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ${stock.profit.toFixed(2)}
                      </div>
                    </div>
                  </div>)}
                
                <Link to="/app/daytrade">
                  <Button variant="ghost" size="sm" className="w-full mt-2">
                    View All
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>}
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        
      </div>
    </div>;
}
