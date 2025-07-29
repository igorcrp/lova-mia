import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { DetailedResult, StockAnalysisParams } from "@/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Loader2 } from "lucide-react";
import { StockDetailsTable } from "@/components/StockDetailsTable";
import { useIsMobile } from "@/hooks/use-mobile";

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
  const isMobile = useIsMobile();
  
  // Usar valores originais do backend como fonte única da verdade
  const correctedValues = useMemo(() => {
    if (!result?.tradeHistory?.length) return null;
    
    console.info(`[StockDetailView ${result.assetCode}] Using values from result - sync managed by parent`);
    
    // Usar os valores que vêm do result (que devem ser atualizados pelo componente pai)
    return {
      finalCapital: result.finalCapital,
      profit: result.profit || (result.finalCapital - params.initialCapital)
    };
  }, [result, params.initialCapital]);

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
                  {/* Mobile-optimized responsive layout */}
                  <div className="bg-card border p-3 md:p-4 rounded-lg mb-6">
                    <h3 className="text-sm leading-[1.2rem] font-medium mb-4">Performance Metrics</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-10">
                      {/* Coluna 1: Returns */}
                      <div className="space-y-3">
                        <h4 className="text-xs md:text-sm leading-[1.2rem] font-medium mb-2 border-b pb-2 text-primary">Returns</h4>
                        <div className="space-y-1.5 md:space-y-2">
                           <div className="flex justify-between items-center">
                             <span className="text-xs md:text-sm leading-[1.2rem] text-muted-foreground">Final Capital</span>
                             <span className="text-xs md:text-sm leading-[1.2rem] font-medium">${((correctedValues?.finalCapital ?? result.finalCapital) || 0).toLocaleString()}</span>
                           </div>
                           <div className="flex justify-between items-center">
                             <span className="text-xs md:text-sm leading-[1.2rem] text-muted-foreground">Total Profit</span>
                             <span className={`text-xs md:text-sm leading-[1.2rem] font-medium ${((correctedValues?.profit ?? result.profit) || 0) > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                               ${((correctedValues?.profit ?? result.profit) || 0).toLocaleString()}
                             </span>
                           </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs md:text-sm leading-[1.2rem] text-muted-foreground">Success Rate</span>
                            <span className="text-xs md:text-sm leading-[1.2rem] font-medium">{(result.successRate || 0).toFixed(2)}%</span>
                          </div>
                           <div className="flex justify-between items-center">
                             <span className="text-xs md:text-sm leading-[1.2rem] text-muted-foreground">Total Return</span>
                             <span className={`text-xs md:text-sm leading-[1.2rem] font-medium ${((correctedValues?.profit ?? result.profit) || 0) > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                               {((((correctedValues?.profit ?? result.profit) || 0) / (params.initialCapital || 1)) * 100).toFixed(2)}%
                             </span>
                           </div>
                           <div className="flex justify-between items-center">
                             <span className="text-xs md:text-sm leading-[1.2rem] text-muted-foreground">Annualized Return</span>
                             <span className="text-xs md:text-sm leading-[1.2rem] font-medium">
                               {((Math.pow((((correctedValues?.finalCapital ?? result.finalCapital) || 0) / (params.initialCapital || 1)), (252 / (result.tradingDays || 1))) - 1) * 100).toFixed(2)}%
                             </span>
                           </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs md:text-sm leading-[1.2rem] text-muted-foreground">Risk-Free Rate</span>
                            <span className="text-xs md:text-sm leading-[1.2rem] font-medium">2.00%</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Coluna 2: Trade Statistics */}
                      <div className="space-y-3">
                        <h4 className="text-xs md:text-sm leading-[1.2rem] font-medium mb-2 border-b pb-2 text-primary">Trade Statistics</h4>
                        <div className="space-y-1.5 md:space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs md:text-sm leading-[1.2rem] text-muted-foreground">Total Trades</span>
                            <span className="text-xs md:text-sm leading-[1.2rem] font-medium">{result.trades}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs md:text-sm leading-[1.2rem] text-muted-foreground">Profitable</span>
                            <span className="text-xs md:text-sm leading-[1.2rem] font-medium text-green-600 dark:text-green-400">{result.profits || 0} ({(result.profitPercentage || 0).toFixed(2)}%)</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs md:text-sm leading-[1.2rem] text-muted-foreground">Losses</span>
                            <span className="text-xs md:text-sm leading-[1.2rem] font-medium text-red-600 dark:text-red-400">{result.losses || 0} ({(result.lossPercentage || 0).toFixed(2)}%)</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs md:text-sm leading-[1.2rem] text-muted-foreground">Win Rate</span>
                            <span className="text-xs md:text-sm leading-[1.2rem] font-medium">{(result.successRate || 0).toFixed(2)}%</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs md:text-sm leading-[1.2rem] text-muted-foreground">Profit Factor</span>
                            <span className="text-xs md:text-sm leading-[1.2rem] font-medium">
                              {((result.profits || 0) > 0
                                ? ((result.profits || 0) * (result.averageGain || 0)) / ((result.losses || 1) * Math.abs(result.averageLoss || 1))
                                : 0).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs md:text-sm leading-[1.2rem] text-muted-foreground">Average Win/Loss Ratio</span>
                            <span className="text-xs md:text-sm leading-[1.2rem] font-medium">
                              {((result.averageGain || 0) / Math.abs(result.averageLoss || 1)).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Coluna 3: Risk Metrics */}
                      <div className="space-y-3">
                        <h4 className="text-xs md:text-sm leading-[1.2rem] font-medium mb-2 border-b pb-2 text-primary">Risk Metrics</h4>
                        <div className="space-y-1.5 md:space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Volatility</span>
                            <span className="text-sm leading-[1.2rem] font-medium">
                              {(Math.sqrt(252 / (result.tradingDays || 1)) * Math.sqrt((result.tradeHistory || []).reduce((sum, trade) => sum + Math.pow(trade.profitPercentage || 0, 2), 0) / (result.tradingDays || 1))).toFixed(2)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Max Drawdown</span>
                            <span className="text-sm leading-[1.2rem] font-medium">{(result.maxDrawdown || 0).toFixed(2)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Recovery Factor</span>
                            <span className="text-sm leading-[1.2rem] font-medium">{(result.recoveryFactor || 0).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Coluna 4: Risk-Adjusted Returns */}
                      <div className="space-y-3">
                        <h4 className="text-xs md:text-sm leading-[1.2rem] font-medium mb-2 border-b pb-2 text-primary">Risk-Adjusted Returns</h4>
                        <div className="space-y-1.5 md:space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Sharpe Ratio</span>
                            <span className="text-sm leading-[1.2rem] font-medium">{(result.sharpeRatio || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm leading-[1.2rem] text-muted-foreground">Sortino Ratio</span>
                            <span className="text-sm leading-[1.2rem] font-medium">{(result.sortinoRatio || 0).toFixed(2)}</span>
                          </div>
                           <div className="flex justify-between">
                             <span className="text-sm leading-[1.2rem] text-muted-foreground">Calmar Ratio</span>
                             <span className="text-sm leading-[1.2rem] font-medium">
                               {(((((correctedValues?.profit ?? result.profit) || 0) / (params.initialCapital || 1)) * 100) / (result.maxDrawdown || 1)).toFixed(2)}
                             </span>
                           </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-6 p-4 border-t">
                      <h4 className="text-sm leading-[1.2rem] font-medium mb-2">Trading Summary</h4>
                      <p className="text-sm leading-[1.2rem]">
                        This analysis for <strong>{result.assetCode}</strong> uses a 
                        {params.operation === 'buy' ? 'buying' : 'selling'} strategy with 
                        {params.entryPercentage}% entry and {params.stopPercentage}% stop parameters.
                        The analysis covers {result.tradingDays} trading days with an initial capital of 
                        ${(params.initialCapital || 0).toLocaleString()}.
                      </p>
                      <p className="mt-2 text-sm leading-[1.2rem]">
                        The strategy resulted in {result.trades || 0} trades ({(result.tradePercentage || 0).toFixed(2)}% of days), 
                        with {result.profits || 0} profitable trades and {result.losses || 0} losing trades. 
                        Stop-loss was triggered on {result.stops || 0} occasions ({(result.stopPercentage || 0).toFixed(2)}% of trades).
                      </p>
                       <p className="mt-2 text-sm leading-[1.2rem]">
                         The final capital of ${((correctedValues?.finalCapital ?? result.finalCapital) || 0).toLocaleString()} represents a 
                         {((correctedValues?.profit ?? result.profit) || 0) > 0 ? ' profit' : ' loss'} of ${Math.abs((correctedValues?.profit ?? result.profit) || 0).toLocaleString()}.
                         Average gain was ${(result.averageGain || 0).toFixed(2)} and average loss was ${(result.averageLoss || 0).toFixed(2)}.
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
