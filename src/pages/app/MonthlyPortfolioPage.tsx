import { useState } from "react";
import { StockSetupForm } from "@/components/StockSetupForm";
import { ResultsTable } from "@/components/ResultsTable";
import { StockDetailView } from "@/components/StockDetailView";
import { api } from "@/services/api";
import { AnalysisResult, DetailedResult, StockAnalysisParams, TradeHistoryItem } from "@/types";
import { toast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { 
  isFirstBusinessDayOfMonth, 
  isLastBusinessDayOfMonth, 
  isValidPeriodForMonthly
} from "@/utils/dateUtils";

// Helper function to get month key (e.g., YYYY-MM)
function getMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Helper function to find the previous day's data with defined capital
function findPreviousDayWithCapital(history: TradeHistoryItem[], currentDateStr: string): TradeHistoryItem | null {
  const currentDateIndex = history.findIndex(item => item.date === currentDateStr);
  for (let i = currentDateIndex - 1; i >= 0; i--) {
    if (history[i]?.capital !== undefined) {
      return history[i];
    }
  }
  return null; // No previous day with capital found
}

// Helper function to get the reference price
function getReferencePrice(day: TradeHistoryItem, referencePriceKey: string): number {
  const price = day[referencePriceKey as keyof TradeHistoryItem];
  return typeof price === 'number' ? price : 0;
}

// Helper function to calculate stop price
function calculateStopPrice(entryPrice: number, params: StockAnalysisParams): number {
  const stopPercent = params.stopPercentage ?? 0;
  return entryPrice * (1 + (params.operation === 'buy' ? -1 : 1) * (stopPercent / 100));
}

// Helper function to check if stop loss is hit
function checkStopLoss(currentDay: TradeHistoryItem, stopPrice: number, operation: string): boolean {
  const low = typeof currentDay.low === 'number' ? currentDay.low : -Infinity;
  const high = typeof currentDay.high === 'number' ? currentDay.high : Infinity;
  return operation === 'buy' ? low <= stopPrice : high >= stopPrice;
}

// Helper function to calculate profit/loss
function calculateProfit(entryPrice: number | undefined, exitPrice: number | undefined, operation: string, lotSize: number | undefined): number {
  if (entryPrice === undefined || exitPrice === undefined || lotSize === undefined || lotSize === 0) return 0;
  const numEntryPrice = Number(entryPrice);
  const numExitPrice = Number(exitPrice);
  if (isNaN(numEntryPrice) || isNaN(numExitPrice)) return 0;
  return (operation === 'buy' ? numExitPrice - numEntryPrice : numEntryPrice - numExitPrice) * lotSize;
}

// Risk Calculation Functions (Using Processed History)
const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
    if (!trades || trades.length === 0) return 0;
    let maxDrawdown = 0;
    let peakCapital = initialCapital;
    // Use the capital from the first record if available, otherwise initial
    let currentCapital = trades[0]?.capital ?? initialCapital;
    peakCapital = Math.max(peakCapital, currentCapital); // Initialize peak correctly

    trades.forEach(trade => {
        // Update capital only if it's defined in the record
        if (trade.capital !== undefined) {
            currentCapital = trade.capital;
            // Update peak capital encountered so far
            if (currentCapital > peakCapital) {
                peakCapital = currentCapital;
            }
            // Calculate drawdown from the current peak
            const drawdown = peakCapital === 0 ? 0 : (peakCapital - currentCapital) / peakCapital;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        }
    });
    return maxDrawdown * 100; // Return as percentage
};

const calculateVolatility = (trades: TradeHistoryItem[]): number => {
    const profits = trades.filter(t => t.trade === 'Close' && t.profit !== undefined).map(t => t.profit as number);
    if (profits.length < 2) return 0;
    const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
    const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (profits.length - 1);
    return Math.sqrt(variance);
};

const calculateSharpeRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02; // Annualized
    const volatility = calculateVolatility(trades);
    if (volatility === 0) return 0;
    return (totalReturnPercentage / 100 - riskFreeRate) / volatility;
};

const calculateSortinoRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02;
    const negativeReturns = trades.filter(t => t.trade === 'Close' && t.profit !== undefined && t.profit < 0).map(t => t.profit as number);
    if (negativeReturns.length === 0) return Infinity;
    const meanNegative = 0; // Target return
    const downsideVariance = negativeReturns.reduce((sum, p) => sum + Math.pow(p - meanNegative, 2), 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);
    if (downsideDeviation === 0) return Infinity;
    return (totalReturnPercentage / 100 - riskFreeRate) / downsideDeviation;
};

// --- Main Component --- 
export default function MonthlyPortfolioPage() {
  const [analysisParams, setAnalysisParams] = useState<StockAnalysisParams | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);

  // Function to process trades according to monthly logic (v5 - Profit/Capital logic verified)
  const processMonthlyTrades = (fullHistory: TradeHistoryItem[], params: StockAnalysisParams): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } => {
    if (!fullHistory || fullHistory.length === 0) return { processedHistory: [], tradePairs: [] };

    const finalProcessedHistory: TradeHistoryItem[] = [];
    const finalTradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] = [];
    const sortedHistory = [...fullHistory].sort((a, b) =>
      new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
    );
    
    let capitalBeforeCurrentTrade = params.initialCapital;
    let activeTradeEntry: TradeHistoryItem | null = null;
    let stopPriceCalculated: number | null = null;

    const tradesByMonth: { [monthKey: string]: TradeHistoryItem[] } = {};
    sortedHistory.forEach(trade => {
      const tradeDate = new Date(trade.date + 'T00:00:00Z');
      if (isNaN(tradeDate.getTime())) { console.warn(`Invalid date: ${trade.date}`); return; }
      const monthKey = getMonthKey(tradeDate);
      if (!tradesByMonth[monthKey]) tradesByMonth[monthKey] = [];
      tradesByMonth[monthKey].push(trade);
    });

    Object.keys(tradesByMonth).sort().forEach(monthKey => {
      const monthTrades = tradesByMonth[monthKey];
      let entryAttemptMadeThisMonth = false;

      for (let i = 0; i < monthTrades.length; i++) {
        const currentDayData = monthTrades[i];
        const currentDate = new Date(currentDayData.date + 'T00:00:00Z');
        if (isNaN(currentDate.getTime())) continue;

        // --- 1. Attempt Entry ---
        if (!activeTradeEntry && !entryAttemptMadeThisMonth && isFirstBusinessDayOfMonth(currentDate)) {
          entryAttemptMadeThisMonth = true;
          // Find previous day in the *full sorted history* to get exit price
          const previousDayOriginal = sortedHistory.find((_, idx, arr) => arr[idx+1]?.date === currentDayData.date);

          if (previousDayOriginal && previousDayOriginal.exitPrice !== undefined) {
            const potentialEntryPrice = previousDayOriginal.exitPrice;
            const referencePrice = getReferencePrice(previousDayOriginal, params.referencePrice);
            const entryThreshold = referencePrice * (1 + (params.entryPercentage / 100) * (params.operation === 'buy' ? 1 : -1));
            const shouldEnter = (params.operation === 'buy' && potentialEntryPrice >= entryThreshold) || (params.operation === 'sell' && potentialEntryPrice <= entryThreshold);

            if (shouldEnter) {
              const entryDayRecord: TradeHistoryItem = {
                ...currentDayData,
                trade: (params.operation === 'buy' ? 'Buy' : 'Sell'),
                suggestedEntryPrice: potentialEntryPrice,
                actualPrice: potentialEntryPrice,
                stopPrice: calculateStopPrice(potentialEntryPrice, params),
                lotSize: capitalBeforeCurrentTrade / potentialEntryPrice,
                stop: '-',
                profit: undefined, // Profit undefined on entry
                capital: capitalBeforeCurrentTrade // Capital is pre-entry value
              };
              activeTradeEntry = entryDayRecord;
              stopPriceCalculated = entryDayRecord.stopPrice;
              finalProcessedHistory.push(entryDayRecord);
            }
          }
        }

        // --- 2. Manage Active Trade ---
        if (activeTradeEntry && stopPriceCalculated && currentDayData.date !== activeTradeEntry.date) {
          let closedToday = false;
          let exitPrice: number | undefined = undefined;
          let profit = 0;
          let closeRecord: TradeHistoryItem | null = null;
          const stopHit = checkStopLoss(currentDayData, stopPriceCalculated, params.operation);

          if (stopHit) {
            exitPrice = stopPriceCalculated;
            profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
            closeRecord = {
              ...currentDayData,
              trade: 'Close',
              stop: 'Executed',
              profit: profit, // Profit calculated on close
              capital: capitalBeforeCurrentTrade + profit, // Capital updated on close
              suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
              actualPrice: activeTradeEntry.actualPrice,
              stopPrice: activeTradeEntry.stopPrice,
              lotSize: activeTradeEntry.lotSize,
              exitPrice: exitPrice
            };
            closedToday = true;
            capitalBeforeCurrentTrade += profit; // Update tracker for next potential trade

          } else if (isLastBusinessDayOfMonth(currentDate)) {
            exitPrice = typeof currentDayData.exitPrice === 'number' ? currentDayData.exitPrice : undefined;
            if (exitPrice !== undefined) {
              profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
              closeRecord = {
                ...currentDayData,
                trade: 'Close',
                stop: '-',
                profit: profit, // Profit calculated on close
                capital: capitalBeforeCurrentTrade + profit, // Capital updated on close
                suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
                actualPrice: activeTradeEntry.actualPrice,
                stopPrice: activeTradeEntry.stopPrice,
                lotSize: activeTradeEntry.lotSize,
                exitPrice: exitPrice
              };
              closedToday = true;
              capitalBeforeCurrentTrade += profit; // Update tracker for next potential trade
            } else {
              console.warn(`Missing exit price (close) on last business day ${currentDayData.date} for active trade.`);
            }
          }

          if (closedToday && closeRecord) {
            finalProcessedHistory.push(closeRecord);
            finalTradePairs.push({ open: activeTradeEntry, close: closeRecord });
            activeTradeEntry = null;
            stopPriceCalculated = null;
            // if (stopHit) { break; } // Optional: Stop further actions in month after stop hit
          }
        }
      } // End of day loop
    }); // End of month loop

    return { processedHistory: finalProcessedHistory, tradePairs: finalTradePairs };
  };

  // --- Analysis Execution --- 
  const runAnalysis = async (params: StockAnalysisParams) => {
    setIsLoading(true);
    setAnalysisResults([]);
    setAnalysisParams(null); 
    setProgress(0);
    setShowDetailView(false);

    try {
      if (!isValidPeriodForMonthly(params.period)) {
        toast({ variant: "default", title: "Period Selection", description: "For monthly analysis, select a period of 2 months or more." });
      }
      console.info("Running monthly analysis (v6 - viewDetails reverted) with params:", params);
      setProgress(10);
      
      let dataTableName = params.dataTableName || await api.marketData.getDataTableName(params.country, params.stockMarket, params.assetClass);
      if (!dataTableName) throw new Error("Failed to identify data source table name");
      setProgress(20);
      
      const paramsWithTable = { ...params, dataTableName };
      setAnalysisParams(paramsWithTable); // Set final params used
      
      const results = await api.analysis.runAnalysis(paramsWithTable, (p) => setProgress(20 + p * 0.7));
      
      const processedResults = await Promise.all(
        results.map(async (result) => {
          try {
            const detailedData = await api.analysis.getDetailedAnalysisResult(paramsWithTable, result.assetCode); // Corrected call
            
            if (detailedData && detailedData.tradeHistory) {
              // Use the verified processMonthlyTrades (v5 logic)
              const { processedHistory, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
              const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
              const trades = tradePairsFiltered.length;
              
              if (trades === 0) {
                return { ...result, tradingDays: processedHistory.length, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };
              }
              
              const profitsCount = tradePairsFiltered.filter(pair => pair.close.profit > 0).length;
              const lossesCount = trades - profitsCount;
              const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;
              
              const lastTradeRecord = processedHistory.length > 0 ? processedHistory[processedHistory.length - 1] : null;
              const finalCapital = lastTradeRecord?.capital ?? params.initialCapital;
              const totalProfit = finalCapital - params.initialCapital;
              const profitPercentageTotal = params.initialCapital === 0 ? 0 : (totalProfit / params.initialCapital) * 100;
              
              const gainTrades = tradePairsFiltered.filter(pair => pair.close.profit > 0);
              const lossTrades = tradePairsFiltered.filter(pair => pair.close.profit < 0);
              const totalGain = gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0);
              const totalLoss = lossTrades.reduce((sum, pair) => sum + pair.close.profit, 0);
              const averageGain = gainTrades.length > 0 ? totalGain / gainTrades.length : 0;
              const averageLoss = lossTrades.length > 0 ? totalLoss / lossTrades.length : 0;
              
              const maxDrawdown = calculateMaxDrawdown(processedHistory, params.initialCapital);
              const sharpeRatio = calculateSharpeRatio(processedHistory, profitPercentageTotal);
              const sortinoRatio = calculateSortinoRatio(processedHistory, profitPercentageTotal);
              
              // Recovery Factor: (Final Capital - Initial Capital) / Max Drawdown Amount
              const maxDrawdownAmount = maxDrawdown / 100 * params.initialCapital; // Convert percentage to amount
              const recoveryFactor = maxDrawdownAmount === 0 ? Infinity : totalProfit / maxDrawdownAmount;

              return {
                ...result,
                tradingDays: processedHistory.length,
                trades,
                profits: profitsCount,
                losses: lossesCount,
                stops: stopsCount,
                finalCapital,
                profit: totalProfit,
                successRate: trades > 0 ? (profitsCount / trades) * 100 : 0,
                averageGain,
                averageLoss,
                maxDrawdown,
                sharpeRatio,
                sortinoRatio,
                recoveryFactor,
                detailedHistory: processedHistory, // Add processed history here
              };
            }
          } catch (detailError) {
            console.error(`Failed to get detailed analysis for ${result.assetCode}:`, detailError);
          }
          return result; // Return original result if detailed processing fails
        })
      );
      
      setAnalysisResults(processedResults.filter(Boolean) as AnalysisResult[]); // Filter out any nulls
      
      setProgress(95);
      setProgress(100);
      
      toast({
        title: "Analysis completed",
        description: "Monthly analysis was completed successfully",
      });
    } catch (error) {
      console.error("Monthly analysis failed", error);
      toast({
        variant: "destructive",
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
      setProgress(0);
    } finally {
      setTimeout(() => {
        setIsLoading(false);
      }, 500);
    }
  };
  
  const viewDetails = async (assetCode: string) => {
    if (!analysisParams) return;
    
    try {
      setIsLoadingDetails(true);
      setSelectedAsset(assetCode);
      
      // Find the detailed history from the already processed analysisResults
      const foundResult = analysisResults.find(r => r.assetCode === assetCode);
      
      if (foundResult && foundResult.detailedHistory) {
        // Construct a DetailedResult from the found data
        const detailedData: DetailedResult = {
          assetCode: foundResult.assetCode,
          capitalEvolution: foundResult.detailedHistory.map(item => ({ date: item.date, capital: item.capital ?? 0 })).filter(item => item.capital !== 0),
          tradeHistory: foundResult.detailedHistory,
          tradingDays: foundResult.tradingDays ?? 0,
          // Add other properties of DetailedResult if they exist in AnalysisResult
        };
        setDetailedResult(detailedData);
        setShowDetailView(true);
      } else {
        // Fallback to fetching if detailedHistory is not found (should not happen if processing is correct)
        const paramsWithTable = analysisParams.dataTableName
          ? analysisParams
          : {
              ...analysisParams,
              dataTableName: await api.marketData.getDataTableName(
                analysisParams.country,
                analysisParams.stockMarket,
                analysisParams.assetClass
              )
            };
        
        if (!paramsWithTable.dataTableName) {
          throw new Error("Could not determine data table name");
        }
        
        const detailedData = await api.analysis.getDetailedAnalysisResult(paramsWithTable, assetCode);
        if (detailedData) {
          const { processedHistory } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
          setDetailedResult({ ...detailedData, tradeHistory: processedHistory });
          setShowDetailView(true);
        } else {
          toast({
            variant: "destructive",
            title: "Failed to fetch details",
            description: "Detailed history not found for this asset.",
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch detailed analysis", error);
      toast({
        variant: "destructive",
        title: "Failed to fetch details",
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };
  
  const closeDetails = () => {
    setShowDetailView(false);
    setDetailedResult(null);
    setSelectedAsset(null);
  };
  
  const updateAnalysis = async (params: StockAnalysisParams) => {
    if (!selectedAsset) return;
    
    try {
      setIsLoadingDetails(true);
      
      // Ensure we have the data table name
      const dataTableName = params.dataTableName || await api.marketData.getDataTableName(
        params.country,
        params.stockMarket,
        params.assetClass
      );
      
      if (!dataTableName) {
        throw new Error("Failed to identify data source");
      }
      
      const paramsWithTable = {
        ...params,
        dataTableName
      };
      
      setAnalysisParams(paramsWithTable);
      
      // Update both the main results and the detailed result
      const results = await api.analysis.runAnalysis(paramsWithTable);
      
      const processedResults = await Promise.all(
        results.map(async (result) => {
          try {
            const detailedData = await api.analysis.getDetailedAnalysisResult(paramsWithTable, result.assetCode); // Corrected call
            
            if (detailedData && detailedData.tradeHistory) {
              const { processedHistory, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
              const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
              const trades = tradePairsFiltered.length;
              
              if (trades === 0) {
                return { ...result, tradingDays: processedHistory.length, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };
              }
              
              const profitsCount = tradePairsFiltered.filter(pair => pair.close.profit > 0).length;
              const lossesCount = trades - profitsCount;
              const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;
              
              const lastTradeRecord = processedHistory.length > 0 ? processedHistory[processedHistory.length - 1] : null;
              const finalCapital = lastTradeRecord?.capital ?? params.initialCapital;
              const totalProfit = finalCapital - params.initialCapital;
              const profitPercentageTotal = params.initialCapital === 0 ? 0 : (totalProfit / params.initialCapital) * 100;
              
              const gainTrades = tradePairsFiltered.filter(pair => pair.close.profit > 0);
              const lossTrades = tradePairsFiltered.filter(pair => pair.close.profit < 0);
              const totalGain = gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0);
              const totalLoss = lossTrades.reduce((sum, pair) => sum + pair.close.profit, 0);
              const averageGain = gainTrades.length > 0 ? totalGain / gainTrades.length : 0;
              const averageLoss = lossTrades.length > 0 ? totalLoss / lossTrades.length : 0;
              
              const maxDrawdown = calculateMaxDrawdown(processedHistory, params.initialCapital);
              const sharpeRatio = calculateSharpeRatio(processedHistory, profitPercentageTotal);
              const sortinoRatio = calculateSortinoRatio(processedHistory, profitPercentageTotal);
              
              const maxDrawdownAmount = maxDrawdown / 100 * params.initialCapital; 
              const recoveryFactor = maxDrawdownAmount === 0 ? Infinity : totalProfit / maxDrawdownAmount;

              return {
                ...result,
                tradingDays: processedHistory.length,
                trades,
                profits: profitsCount,
                losses: lossesCount,
                stops: stopsCount,
                finalCapital,
                profit: totalProfit,
                successRate: trades > 0 ? (profitsCount / trades) * 100 : 0,
                averageGain,
                averageLoss,
                maxDrawdown,
                sharpeRatio,
                sortinoRatio,
                recoveryFactor,
                detailedHistory: processedHistory, // Add processed history here
              };
            }
          } catch (detailError) {
            console.error(`Failed to get detailed analysis for ${result.assetCode}:`, detailError);
          }
          return result; // Return original result if detailed processing fails
        })
      );
      
      setAnalysisResults(processedResults.filter(Boolean) as AnalysisResult[]);
      
      // Fetch detailed analysis for the selected asset again to update the view
      const detailedData = await api.analysis.getDetailedAnalysisResult(paramsWithTable, selectedAsset);
      if (detailedData) {
        const { processedHistory } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
        setDetailedResult({ ...detailedData, tradeHistory: processedHistory });
      }
      
      toast({
        title: "Analysis updated",
        description: "Analysis was updated successfully",
      });
    } catch (error) {
      console.error("Analysis update failed", error);
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Monthly Portfolio Analysis</h1>
      
      {!showDetailView ? (
        <div className="bg-card p-6 rounded-lg border">
          <StockSetupForm onSubmit={runAnalysis} isLoading={isLoading} />
          
          {isLoading && (
            <div className="mt-6">
              <div className="flex justify-between text-sm mb-2">
                <span>Processing analysis...</span>
                <span>{progress.toFixed(0)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
          
          {analysisResults.length > 0 && !isLoading && (
            <ResultsTable 
              results={analysisResults} 
              onViewDetails={viewDetails} 
              isLoading={isLoading} // Pass isLoading prop
            />
          )}
        </div>
      ) : (
        detailedResult && analysisParams && (
          <div className="bg-card p-6 rounded-lg border">
            <StockDetailView
              result={detailedResult}
              params={analysisParams}
              onClose={closeDetails}
              onUpdateParams={updateAnalysis}
              isLoading={isLoadingDetails}
            />
          </div>
        )
      )}
    </div>
  );
}


