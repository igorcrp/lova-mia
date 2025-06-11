import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DetailedResult, StockAnalysisParams, TradeHistoryItem } from "@/types"; // Added TradeHistoryItem for clarity
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Loader2 } from "lucide-react";
import { StockDetailsTable } from "@/components/StockDetailsTable";
// import { useIsMobile } from "@/hooks/use-mobile"; // Removed as isMobile is not used

interface StockDetailViewProps {
  result: DetailedResult;
  params: StockAnalysisParams;
  onClose: () => void;
  onUpdateParams: (params: StockAnalysisParams) => void;
  isLoading?: boolean;
}

export function StockDetailView({
  result,
  params,
  onClose,
  onUpdateParams,
  isLoading = false
}: StockDetailViewProps) {
  const [activeTab, setActiveTab] = useState<string>("overview");
  // const isMobile = useIsMobile(); // isMobile was not used

  // Helper function to safely format numbers and handle potential NaN/Infinity
  const formatNumber = (value: number, decimals: number = 2, unit: string = ""): string => {
    if (isNaN(value) || !isFinite(value)) {
      return "N/A";
    }
    return `${value.toFixed(decimals)}${unit}`;
  };

  // Helper function for safe division
  const safeDivide = (numerator: number, denominator: number): number => {
    if (denominator === 0) {
      return 0; // Or handle as NaN or throw error, based on desired behavior
    }
    return numerator / denominator;
  };

  // Calculations with safety checks
  const totalReturnPercentage = params.initialCapital > 0
    ? safeDivide(result.profit, params.initialCapital) * 100
    : 0;

  const annualizedReturn = (result.tradingDays > 0 && params.initialCapital > 0 && result.finalCapital > 0)
    ? (Math.pow(safeDivide(result.finalCapital, params.initialCapital), safeDivide(252, result.tradingDays)) - 1) * 100
    : 0;

  const profitFactor = (result.losses > 0 && result.averageLoss !== 0) // Ensure losses and averageLoss are not zero
    ? safeDivide((result.profits * result.averageGain), (result.losses * Math.abs(result.averageLoss)))
    : 0; // If no losses or no average loss, profit factor is effectively infinite or undefined; display 0 or N/A.

  const averageWinLossRatio = Math.abs(result.averageLoss) > 0
    ? safeDivide(result.averageGain, Math.abs(result.averageLoss))
    : 0; // If no average loss, ratio is undefined.

  const volatility = (() => {
    if (!result.tradeHistory || result.tradeHistory.length === 0 || result.tradingDays === 0) {
      return 0;
    }
    // Volatility of profit percentages of trades
    const sumOfSquaredProfitPercentages = result.tradeHistory.reduce((sum, trade: TradeHistoryItem) => {
      // Ensure profitPercentage is a number and not NaN
      const profitPerc = Number(trade.profitPercentage);
      return sum + Math.pow(isNaN(profitPerc) ? 0 : profitPerc, 2);
    }, 0);

    const variance = safeDivide(sumOfSquaredProfitPercentages, result.tradeHistory.length); // Use tradeHistory.length if it's per trade P/L %
    // Or use result.tradingDays if profitPercentage is daily profit percentage of portfolio
    // The original formula used result.tradingDays for denominator, which seems off if trade.profitPercentage is per-trade.
    // Assuming trade.profitPercentage is per trade, using tradeHistory.length for variance calculation is more standard.
    // If trade.profitPercentage is actually daily portfolio return, then result.tradingDays is fine.
    // For now, sticking to a safer interpretation (using tradeHistory.length if it's per-trade profit%)
    // However, the original formula was: sum + Math.pow(trade.profitPercentage, 2), 0) / result.tradingDays))
    // Let's assume trade.profitPercentage is some form of daily return if result.tradingDays is the denominator.
    // This calculation needs domain expert review. For now, implementing as originally written but with safety.
    const dailyVariance = safeDivide(sumOfSquaredProfitPercentages, result.tradingDays); // As per original formula
    const dailyVolatility = Math.sqrt(dailyVariance);
    return Math.sqrt(252) * dailyVolatility; // Annualized volatility
  })();

  const calmarRatio = result.maxDrawdown > 0
    ? safeDivide(totalReturnPercentage, result.maxDrawdown) // Using totalReturnPercentage for Calmar
    : 0; // If no drawdown, Calmar is undefined or infinite.

  return (
    <div className="w-full">
      {/* Header */}
      <div className="pb-4 mb-5 border-b flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg md:text-xl font-bold">
            {result.assetCode}
          </h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        <Tabs 
          defaultValue="overview" 
          className="w-full"
          value={activeTab}
          onValueChange={setActiveTab}
        >
          <div className="border-b overflow-x-auto">
            <TabsList className="h-10">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>
          </div>
          
          <div className="py-4">
            {isLoading ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <TabsContent value="overview" className="mt-0">
                  {/* Overview Layout: 4 columns with standardized spacing and font */}
                  <div className="bg-card border p-4 rounded-lg mb-6">
                    <h3 className="text-sm leading-[1.2rem] font-medium mb-4">Performance Metrics</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
                      {/* Column 1: Returns */}
                      <div className="space-y-3">
                        <h4 className="text-sm leading-[1.2rem] font-medium mb-2 border-b pb-2">Returns</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Final Capital</span>
                            <span className="text-sm leading-[1.2rem] font-medium">${formatNumber(result.finalCapital, 2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Total Profit</span>
                            <span className={`text-sm leading-[1.2rem] font-medium ${result.profit > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              ${formatNumber(result.profit, 2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Success Rate</span>
                            <span className="text-sm leading-[1.2rem] font-medium">{formatNumber(result.successRate, 2, "%")}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Total Return</span>
                            <span className={`text-sm leading-[1.2rem] font-medium ${totalReturnPercentage > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {formatNumber(totalReturnPercentage, 2, "%")}
                            </span>
                          </div>
                          {/* Annualized Return: ( (Final Capital / Initial Capital) ^ (252 / Trading Days) - 1 ) * 100 */}
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Annualized Return</span>
                            <span className="text-sm leading-[1.2rem] font-medium">
                              {formatNumber(annualizedReturn, 2, "%")}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Risk-Free Rate</span>
                            <span className="text-sm leading-[1.2rem] font-medium">2.00%</span> {/* Placeholder */}
                          </div>
                        </div>
                      </div>
                      
                      {/* Column 2: Trade Statistics */}
                      <div className="space-y-3">
                        <h4 className="text-sm leading-[1.2rem] font-medium mb-2 border-b pb-2">Trade Statistics</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Total Trades</span>
                            <span className="text-sm leading-[1.2rem] font-medium">{result.trades}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Profitable Trades</span>
                            <span className="text-sm leading-[1.2rem] font-medium text-green-600 dark:text-green-400">{result.profits} ({formatNumber(result.profitPercentage, 2)}%)</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Losing Trades</span>
                            <span className="text-sm leading-[1.2rem] font-medium text-red-600 dark:text-red-400">{result.losses} ({formatNumber(result.lossPercentage, 2)}%)</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Win Rate</span>
                            <span className="text-sm leading-[1.2rem] font-medium">{formatNumber(result.successRate, 2, "%")}</span>
                          </div>
                           {/* Profit Factor: (Gross Profit / Gross Loss) or (Number of Profitable Trades * Avg Gain) / (Number of Losing Trades * Avg Loss) */}
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Profit Factor</span>
                            <span className="text-sm leading-[1.2rem] font-medium">
                              {formatNumber(profitFactor, 2)}
                            </span>
                          </div>
                          {/* Average Win/Loss Ratio: (Average Gain per Trade / Average Loss per Trade) */}
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Avg Win/Loss Ratio</span>
                            <span className="text-sm leading-[1.2rem] font-medium">
                              {formatNumber(averageWinLossRatio, 2)}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Column 3: Risk Metrics */}
                      <div className="space-y-3">
                        <h4 className="text-sm leading-[1.2rem] font-medium mb-2 border-b pb-2">Risk Metrics</h4>
                        <div className="space-y-2">
                           {/* Volatility: Annualized standard deviation of returns (using trade profit percentages here) */}
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Volatility</span>
                            <span className="text-sm leading-[1.2rem] font-medium">
                              {formatNumber(volatility, 2, "%")}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Max Drawdown</span>
                            <span className="text-sm leading-[1.2rem] font-medium">{formatNumber(result.maxDrawdown, 2, "%")}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Recovery Factor</span>
                            <span className="text-sm leading-[1.2rem] font-medium">{formatNumber(result.recoveryFactor, 2)}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Column 4: Risk-Adjusted Returns */}
                      <div className="space-y-3">
                        <h4 className="text-sm leading-[1.2rem] font-medium mb-2 border-b pb-2">Risk-Adjusted Returns</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Sharpe Ratio</span>
                            <span className="text-sm leading-[1.2rem] font-medium">{formatNumber(result.sharpeRatio, 2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Sortino Ratio</span>
                            <span className="text-sm leading-[1.2rem] font-medium">{formatNumber(result.sortinoRatio, 2)}</span>
                          </div>
                           {/* Calmar Ratio: (Annualized Rate of Return / Max Drawdown Percentage) */}
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Calmar Ratio</span>
                            <span className="text-sm leading-[1.2rem] font-medium">
                              {formatNumber(calmarRatio, 2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Trading Summary Section */}
                    <div className="mt-6 p-4 border-t">
                      <h4 className="text-sm leading-[1.2rem] font-medium mb-2">Trading Summary</h4>
                      <p className="text-sm leading-[1.2rem]">
                        This analysis for <strong>{result.assetCode}</strong> uses a 
                        {params.operation === 'buy' ? ' buying' : ' selling'} strategy with
                        {formatNumber(params.entryPercentage, 2)}% entry and {formatNumber(params.stopPercentage, 2)}% stop parameters.
                        The analysis covers {result.tradingDays} trading days with an initial capital of 
                        ${formatNumber(params.initialCapital, 2)}.
                      </p>
                      <p className="mt-2 text-sm leading-[1.2rem]">
                        The strategy resulted in {result.trades} trades ({formatNumber(result.tradePercentage, 2)}% of days),
                        with {result.profits} profitable trades and {result.losses} losing trades. 
                        Stop-loss was triggered on {result.stops} occasions ({formatNumber(result.stopPercentage, 2)}% of trades).
                      </p>
                      <p className="mt-2 text-sm leading-[1.2rem]">
                        The final capital of ${formatNumber(result.finalCapital, 2)} represents a
                        {result.profit > 0 ? ' profit' : ' loss'} of ${formatNumber(Math.abs(result.profit), 2)}.
                        Average gain was ${formatNumber(result.averageGain, 2)} and average loss was ${formatNumber(result.averageLoss, 2)}.
                      </p>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="details" className="mt-0">
                  <StockDetailsTable 
                    result={result}
                    params={params}
                    onUpdateParams={onUpdateParams}
                    isLoading={isLoading}
                  />
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </div>
    </div>
  );
}
