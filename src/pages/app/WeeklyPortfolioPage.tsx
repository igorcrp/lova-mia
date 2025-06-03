import { useState } from "react";
import { StockSetupForm } from "@/components/StockSetupForm";
import { ResultsTable } from "@/components/ResultsTable";
import { StockDetailView } from "@/components/StockDetailView";
import { api } from "@/services/api";
import { AnalysisResult, DetailedResult, StockAnalysisParams, TradeHistoryItem } from "@/types";
import { toast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { 
  isFirstBusinessDayOfWeek, 
  isLastBusinessDayOfWeek, 
} from "@/utils/dateUtils";

// Helper functions (getWeekKey, isMondayOrFirstBusinessDay, etc. - kept from v2)
function getWeekKey(date: Date): string {
  const startOfWeek = new Date(date);
  startOfWeek.setUTCDate(date.getUTCDate() - date.getUTCDay() + (date.getUTCDay() === 0 ? -6 : 1));
  startOfWeek.setUTCHours(0, 0, 0, 0);
  const year = startOfWeek.getUTCFullYear();
  const firstDayOfYear = new Date(Date.UTC(year, 0, 1));
  const pastDaysOfYear = (startOfWeek.getTime() - firstDayOfYear.getTime()) / 86400000;
  const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getUTCDay() + 1) / 7);
  return `${year}-W${String(weekNumber).padStart(2, '0')}`;
}

function isMondayOrFirstBusinessDay(date: Date): boolean {
  return date.getUTCDay() === 1 || isFirstBusinessDayOfWeek(date);
}

function isFridayOrLastBusinessDay(date: Date): boolean {
  return date.getUTCDay() === 5 || isLastBusinessDayOfWeek(date);
}

function findPreviousDay(history: TradeHistoryItem[], currentDateStr: string): TradeHistoryItem | null {
  const currentDateIndex = history.findIndex(item => item.date === currentDateStr);
  return currentDateIndex > 0 ? history[currentDateIndex - 1] : null;
}

function getReferencePrice(day: TradeHistoryItem, referencePriceKey: string): number {
  const price = day[referencePriceKey as keyof TradeHistoryItem];
  return typeof price === 'number' ? price : 0;
}

function calculateStopPrice(entryPrice: number, params: StockAnalysisParams): number {
  const stopPercent = params.stopPercentage ?? 0;
  return entryPrice * (1 + (params.operation === 'buy' ? -1 : 1) * (stopPercent / 100));
}

function checkStopLoss(currentDay: TradeHistoryItem, stopPrice: number, operation: string): boolean {
  const low = typeof currentDay.low === 'number' ? currentDay.low : -Infinity;
  const high = typeof currentDay.high === 'number' ? currentDay.high : Infinity;
  return operation === 'buy' ? low <= stopPrice : high >= stopPrice;
}

function calculateProfit(entryPrice: number | undefined, exitPrice: number | undefined, operation: string, lotSize: number | undefined): number {
  if (entryPrice === undefined || exitPrice === undefined || lotSize === undefined || lotSize === 0) return 0;
  const numEntryPrice = Number(entryPrice);
  const numExitPrice = Number(exitPrice);
  if (isNaN(numEntryPrice) || isNaN(numExitPrice)) return 0;
  return (operation === 'buy' ? numExitPrice - numEntryPrice : numEntryPrice - numExitPrice) * lotSize;
}

// Risk Calculation Placeholders (kept from v2)
const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
    if (!trades || trades.length === 0) return 0;
    let maxDrawdown = 0;
    let peakCapital = initialCapital;
    let currentCapital = initialCapital;
    trades.forEach(trade => {
      if (trade.profit !== undefined) {
        currentCapital += trade.profit;
        if (currentCapital > peakCapital) peakCapital = currentCapital;
        const drawdown = peakCapital === 0 ? 0 : (peakCapital - currentCapital) / peakCapital;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }
    });
    return maxDrawdown * 100; // Percentage
};
const calculateVolatility = (trades: TradeHistoryItem[]): number => {
    const profits = trades.map(t => t.profit).filter(p => p !== undefined) as number[];
    if (profits.length < 2) return 0;
    const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
    const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (profits.length - 1);
    return Math.sqrt(variance);
};
const calculateSharpeRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02; // Annualized
    const volatility = calculateVolatility(trades);
    if (volatility === 0) return 0;
    return (totalReturnPercentage / 100 - riskFreeRate) / volatility; // Simplified
};
const calculateSortinoRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02;
    const negativeReturns = trades.map(t => t.profit).filter(p => p !== undefined && p < 0) as number[];
    if (negativeReturns.length === 0) return Infinity;
    const meanNegative = 0; // Target return
    const downsideVariance = negativeReturns.reduce((sum, p) => sum + Math.pow(p - meanNegative, 2), 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);
    if (downsideDeviation === 0) return Infinity;
    return (totalReturnPercentage / 100 - riskFreeRate) / downsideDeviation; // Simplified
};

export default function WeeklyPortfolioPage() {
  const [analysisParams, setAnalysisParams] = useState<StockAnalysisParams | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);

  // processWeeklyTrades function (kept from v2 - refined logic)
  const processWeeklyTrades = (fullHistory: TradeHistoryItem[], params: StockAnalysisParams): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } => {
    if (!fullHistory || fullHistory.length === 0) return { processedHistory: [], tradePairs: [] };

    const finalProcessedHistory: TradeHistoryItem[] = [];
    const finalTradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] = [];
    const sortedHistory = [...fullHistory].sort((a, b) =>
      new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
    );
    let currentCapital = params.initialCapital;

    const tradesByWeek: { [weekKey: string]: TradeHistoryItem[] } = {};
    sortedHistory.forEach(trade => {
      const tradeDate = new Date(trade.date + 'T00:00:00Z');
      if (isNaN(tradeDate.getTime())) { console.warn(`Invalid date: ${trade.date}`); return; }
      const weekKey = getWeekKey(tradeDate);
      if (!tradesByWeek[weekKey]) tradesByWeek[weekKey] = [];
      tradesByWeek[weekKey].push(trade);
    });

    Object.keys(tradesByWeek).sort().forEach(weekKey => {
      const weekTrades = tradesByWeek[weekKey];
      let activeTradeEntry: TradeHistoryItem | null = null;
      let stopPriceCalculated: number | null = null;
      let entryAttemptMadeThisWeek = false;

      for (let i = 0; i < weekTrades.length; i++) {
        const currentDayData = weekTrades[i];
        const currentDate = new Date(currentDayData.date + 'T00:00:00Z');
        if (isNaN(currentDate.getTime())) continue;

        if (!activeTradeEntry && !entryAttemptMadeThisWeek && isMondayOrFirstBusinessDay(currentDate)) {
          entryAttemptMadeThisWeek = true;
          const previousDay = findPreviousDay(sortedHistory, currentDayData.date);
          if (previousDay && previousDay.exitPrice !== undefined) {
            const potentialEntryPrice = previousDay.exitPrice;
            const referencePrice = getReferencePrice(previousDay, params.referencePrice);
            const entryThreshold = referencePrice * (1 + (params.entryPercentage / 100) * (params.operation === 'buy' ? 1 : -1));
            if ((params.operation === 'buy' && potentialEntryPrice >= entryThreshold) || (params.operation === 'sell' && potentialEntryPrice <= entryThreshold)) {
              const entryDayRecord: TradeHistoryItem = {
                ...currentDayData,
                trade: (params.operation === 'buy' ? 'Buy' : 'Sell'),
                suggestedEntryPrice: potentialEntryPrice,
                actualPrice: potentialEntryPrice,
                stopPrice: calculateStopPrice(potentialEntryPrice, params),
                lotSize: currentCapital / potentialEntryPrice,
                stop: '-', profit: undefined, capital: undefined
              };
              activeTradeEntry = entryDayRecord;
              stopPriceCalculated = entryDayRecord.stopPrice;
              finalProcessedHistory.push(entryDayRecord);
            }
          }
        }

        if (activeTradeEntry && stopPriceCalculated && currentDayData.date !== activeTradeEntry.date) {
          let closedToday = false;
          const stopHit = checkStopLoss(currentDayData, stopPriceCalculated, params.operation);
          if (stopHit) {
            const exitPrice = stopPriceCalculated;
            const profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
            const closeRecord: TradeHistoryItem = {
              ...currentDayData, trade: 'Close', stop: 'Executed', profit: profit,
              capital: currentCapital + profit, suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
              actualPrice: activeTradeEntry.actualPrice, stopPrice: activeTradeEntry.stopPrice,
              lotSize: activeTradeEntry.lotSize, exitPrice: exitPrice
            };
            currentCapital = closeRecord.capital ?? currentCapital;
            finalProcessedHistory.push(closeRecord);
            finalTradePairs.push({ open: activeTradeEntry, close: closeRecord });
            activeTradeEntry = null; stopPriceCalculated = null; closedToday = true;
            break;
          }

          if (!closedToday && isFridayOrLastBusinessDay(currentDate)) {
            const exitPrice = typeof currentDayData.exitPrice === 'number' ? currentDayData.exitPrice : undefined;
            if (exitPrice !== undefined) {
              const profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
              const closeRecord: TradeHistoryItem = {
                ...currentDayData, trade: 'Close', stop: '-', profit: profit,
                capital: currentCapital + profit, suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
                actualPrice: activeTradeEntry.actualPrice, stopPrice: activeTradeEntry.stopPrice,
                lotSize: activeTradeEntry.lotSize, exitPrice: exitPrice
              };
              currentCapital = closeRecord.capital ?? currentCapital;
              finalProcessedHistory.push(closeRecord);
              finalTradePairs.push({ open: activeTradeEntry, close: closeRecord });
              activeTradeEntry = null; stopPriceCalculated = null; closedToday = true;
            } else {
              console.warn(`Missing exit price on Friday ${currentDayData.date}`);
            }
          }
        }
      }
    });

    // Add final capital record logic (kept from v2)
    if (finalProcessedHistory.length > 0) {
        const lastRecord = finalProcessedHistory[finalProcessedHistory.length - 1];
        if (lastRecord.trade !== 'Close') {
            const lastOverallDay = sortedHistory[sortedHistory.length - 1];
            if (lastOverallDay) {
                 finalProcessedHistory.push({ ...lastOverallDay, trade: '-', profit: undefined, stop: '-', capital: currentCapital, suggestedEntryPrice: undefined, actualPrice: undefined, stopPrice: undefined, lotSize: 0 });
            }
        } else {
             lastRecord.capital = currentCapital;
        }
    } else {
        const lastOverallDay = sortedHistory[sortedHistory.length - 1];
         if (lastOverallDay) {
             finalProcessedHistory.push({ ...lastOverallDay, trade: '-', profit: 0, stop: '-', capital: currentCapital, suggestedEntryPrice: undefined, actualPrice: undefined, stopPrice: undefined, lotSize: 0 });
         }
    }

    return { processedHistory: finalProcessedHistory, tradePairs: finalTradePairs };
  };

  // runAnalysis function (kept from v2 - uses refined processWeeklyTrades)
  const runAnalysis = async (params: StockAnalysisParams) => {
    try {
      setIsLoading(true);
      setAnalysisResults([]);
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false); // Ensure detail view is closed on new analysis
      console.info('Running weekly analysis (v3) with params:', params);
      setProgress(10);
      let dataTableName = params.dataTableName || await api.marketData.getDataTableName(params.country, params.stockMarket, params.assetClass);
      if (!dataTableName) throw new Error("Failed to identify data source");
      setProgress(20);
      const paramsWithTable = { ...params, dataTableName };
      setAnalysisParams(paramsWithTable);
      const results = await api.analysis.runAnalysis(paramsWithTable, (p) => setProgress(20 + p * 0.7));
      const processedResults = await Promise.all(
        results.map(async (result) => {
          try {
            const detailedData = await api.analysis.getDetailedAnalysis(result.assetCode, paramsWithTable);
            if (detailedData && detailedData.tradeHistory) {
              const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
              const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
              const trades = tradePairsFiltered.length;
              if (trades === 0) return { ...result, tradingDays: processedHistory.length, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };
              const profitsCount = tradePairsFiltered.filter(pair => pair.close.profit > 0).length;
              const lossesCount = trades - profitsCount;
              const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;
              let finalCapital = params.initialCapital; tradePairsFiltered.forEach(pair => { finalCapital += pair.close.profit; });
              const totalProfit = finalCapital - params.initialCapital;
              const profitPercentageTotal = (totalProfit / params.initialCapital) * 100;
              const gainTrades = tradePairsFiltered.filter(pair => pair.close.profit > 0);
              const lossTrades = tradePairsFiltered.filter(pair => pair.close.profit < 0);
              const averageGain = gainTrades.length > 0 ? gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0) / gainTrades.length : 0;
              const averageLoss = lossTrades.length > 0 ? lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close.profit), 0) / lossTrades.length : 0;
              const maxDrawdown = calculateMaxDrawdown(tradePairsFiltered.map(pair => pair.close), params.initialCapital);
              const sharpeRatio = calculateSharpeRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
              const sortinoRatio = calculateSortinoRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
              const recoveryFactor = maxDrawdown !== 0 ? Math.abs(totalProfit / (maxDrawdown / 100 * params.initialCapital)) : (totalProfit > 0 ? Infinity : 0);
              return { ...result, tradingDays: processedHistory.length, trades, profits: profitsCount, losses: lossesCount, stops: stopsCount, finalCapital, profit: totalProfit, successRate: trades > 0 ? (profitsCount / trades) * 100 : 0, averageGain, averageLoss, maxDrawdown, sharpeRatio, sortinoRatio, recoveryFactor };
            }
            return result;
          } catch (error) { console.error(`Error processing ${result.assetCode}:`, error); return result; }
        })
      );
      setProgress(95);
      setAnalysisResults(processedResults);
      setProgress(100);
      toast({ title: "Weekly analysis completed", description: "Analysis was completed successfully (v3 logic)." });
    } catch (error) { console.error("Weekly analysis failed", error); toast({ variant: "destructive", title: "Analysis failed", description: error instanceof Error ? error.message : "Unknown error" }); setProgress(0); }
    finally { setTimeout(() => setIsLoading(false), 500); }
  };

  // viewDetails function - CORRECTED v3
  const viewDetails = async (assetCode: string) => {
    if (!analysisParams) {
        toast({ variant: "destructive", title: "Error", description: "Analysis parameters not set." });
        return;
    }
    setIsLoadingDetails(true);
    setSelectedAsset(assetCode);
    // *** CORRECTION: Set showDetailView true immediately to switch view ***
    setShowDetailView(true); 
    setDetailedResult(null); // Reset previous details while loading new ones

    try {
      // Ensure dataTableName is available (same as v2)
      const paramsWithTable = analysisParams.dataTableName ? analysisParams : { ...analysisParams, dataTableName: await api.marketData.getDataTableName(analysisParams.country, analysisParams.stockMarket, analysisParams.assetClass) };
      if (!paramsWithTable.dataTableName) throw new Error("Could not determine data table name");

      // Fetch detailed data (same as v2)
      const detailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsWithTable);

      // Process data ONLY if it exists
      if (detailedData && detailedData.tradeHistory) {
        const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
        detailedData.tradeHistory = processedHistory;
        detailedData.tradingDays = processedHistory.length;
        const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);

        // Calculate metrics ONLY if trades exist (same as v2)
        if (tradePairsFiltered.length > 0) {
          let currentCapital = paramsWithTable.initialCapital;
          detailedData.capitalEvolution = tradePairsFiltered.map(pair => { currentCapital += pair.close.profit; return { date: pair.close.date, capital: currentCapital }; });
          detailedData.capitalEvolution.unshift({ date: tradePairsFiltered[0]?.open.date || processedHistory[0]?.date || '', capital: paramsWithTable.initialCapital });
          const finalCapital = currentCapital;
          const totalProfit = finalCapital - paramsWithTable.initialCapital;
          const profitPercentageTotal = (totalProfit / paramsWithTable.initialCapital) * 100;
          detailedData.maxDrawdown = calculateMaxDrawdown(tradePairsFiltered.map(pair => pair.close), paramsWithTable.initialCapital);
          detailedData.sharpeRatio = calculateSharpeRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
          detailedData.sortinoRatio = calculateSortinoRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
          detailedData.recoveryFactor = detailedData.maxDrawdown !== 0 ? Math.abs(totalProfit / (detailedData.maxDrawdown / 100 * paramsWithTable.initialCapital)) : (totalProfit > 0 ? Infinity : 0);
        } else {
          // Set defaults if no trades (same as v2)
          detailedData.capitalEvolution = [{ date: processedHistory[0]?.date || '', capital: paramsWithTable.initialCapital }];
          detailedData.maxDrawdown = 0; detailedData.sharpeRatio = 0; detailedData.sortinoRatio = 0; detailedData.recoveryFactor = 0;
        }
        // *** CORRECTION: Set detailedResult only after successful processing ***
        setDetailedResult(detailedData); 
      } else {
        // Handle case where API returns no data or no history
        setDetailedResult(null); // Ensure result is null if no data
        toast({ title: "No Details", description: `No detailed trade history found for ${assetCode}.` });
      }
    } catch (error) {
      console.error("Failed to fetch weekly detailed analysis", error);
      setDetailedResult(null); // Ensure result is null on error
      toast({ variant: "destructive", title: "Failed to fetch details", description: error instanceof Error ? error.message : "Unknown error" });
      // Keep showDetailView true, StockDetailView should handle the null result
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // updateAnalysis function (kept from v2 - uses refined processWeeklyTrades)
  const updateAnalysis = async (updatedParams: StockAnalysisParams) => {
     if (!selectedAsset) return;
     try {
       setIsLoadingDetails(true);
       const paramsWithTable = updatedParams.dataTableName ? updatedParams : { ...updatedParams, dataTableName: await api.marketData.getDataTableName(updatedParams.country, updatedParams.stockMarket, updatedParams.assetClass) };
       if (!paramsWithTable.dataTableName) throw new Error("Could not determine data table name for update");
       const detailedData = await api.analysis.getDetailedAnalysis(selectedAsset, paramsWithTable);
       if (detailedData && detailedData.tradeHistory) {
         const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
         detailedData.tradeHistory = processedHistory;
         detailedData.tradingDays = processedHistory.length;
         const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
         if (tradePairsFiltered.length > 0) {
           let currentCapital = paramsWithTable.initialCapital;
           detailedData.capitalEvolution = tradePairsFiltered.map(pair => { currentCapital += pair.close.profit; return { date: pair.close.date, capital: currentCapital }; });
           detailedData.capitalEvolution.unshift({ date: tradePairsFiltered[0]?.open.date || processedHistory[0]?.date || '', capital: paramsWithTable.initialCapital });
           const finalCapital = currentCapital;
           const totalProfit = finalCapital - paramsWithTable.initialCapital;
           const profitPercentageTotal = (totalProfit / paramsWithTable.initialCapital) * 100;
           detailedData.maxDrawdown = calculateMaxDrawdown(tradePairsFiltered.map(pair => pair.close), paramsWithTable.initialCapital);
           detailedData.sharpeRatio = calculateSharpeRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
           detailedData.sortinoRatio = calculateSortinoRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
           detailedData.recoveryFactor = detailedData.maxDrawdown !== 0 ? Math.abs(totalProfit / (detailedData.maxDrawdown / 100 * paramsWithTable.initialCapital)) : (totalProfit > 0 ? Infinity : 0);
         } else {
           detailedData.capitalEvolution = [{ date: processedHistory[0]?.date || '', capital: paramsWithTable.initialCapital }];
           detailedData.maxDrawdown = 0; detailedData.sharpeRatio = 0; detailedData.sortinoRatio = 0; detailedData.recoveryFactor = 0;
         }
       }
       setDetailedResult(detailedData); // Update result
       setAnalysisParams(paramsWithTable); // Update params
       toast({ title: "Analysis Updated", description: "Detailed view updated (v3 logic)." });
     } catch (error) { console.error("Failed to update detailed analysis", error); toast({ variant: "destructive", title: "Update Failed", description: error instanceof Error ? error.message : "Unknown error" }); }
     finally { setIsLoadingDetails(false); }
  };

  // closeDetails function (kept from v2)
  const closeDetails = () => {
    setShowDetailView(false);
    setDetailedResult(null);
    setSelectedAsset(null);
  };

  // --- RETURN JSX --- 
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Weekly Portfolio</h1>
      
      {/* --- Main View (Form & Results Table) --- */} 
      {!showDetailView ? (
        <div className="bg-card p-6 rounded-lg border">
          <StockSetupForm onSubmit={runAnalysis} isLoading={isLoading} />
          {isLoading && (
            <div className="mt-6">
              <div className="flex justify-between text-sm mb-2">
                <span>Processing weekly analysis...</span>
                <span>{progress.toFixed(0)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
          {analysisResults.length > 0 && !isLoading && (
            <ResultsTable results={analysisResults} onViewDetails={viewDetails} />
          )}
        </div>
      ) : (
        /* --- Detail View --- */
        // *** CORRECTION: Render container always when showDetailView is true ***
        //    Let StockDetailView handle null/loading/error states internally
        <div className="bg-card p-6 rounded-lg border">
          {analysisParams ? (
            <StockDetailView
              result={detailedResult} // Pass result (can be null)
              params={analysisParams}
              onClose={closeDetails}
              onUpdateParams={updateAnalysis}
              isLoading={isLoadingDetails} // Pass loading state
            />
          ) : (
            // Fallback if params somehow become null (unlikely in this flow)
            <p className="text-red-500">Error: Analysis parameters are missing.</p>
          )}
        </div>
      )}
    </div>
  );
}

