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

// Helper function to find the previous day's data
function findPreviousDay(history: TradeHistoryItem[], currentDateStr: string): TradeHistoryItem | null {
  const currentDateIndex = history.findIndex(item => item.date === currentDateStr);
  return currentDateIndex > 0 ? history[currentDateIndex - 1] : null;
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

// Risk Calculation Placeholders (Adjusted to use 'Closed')
const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
    if (!trades || trades.length === 0) return 0;
    let maxDrawdown = 0;
    let peakCapital = initialCapital;
    let currentCapital = initialCapital;
    trades.forEach(trade => {
      if (trade.profit !== undefined && trade.trade === 'Closed') { // Use 'Closed'
        currentCapital += trade.profit;
        if (currentCapital > peakCapital) peakCapital = currentCapital;
        const drawdown = peakCapital === 0 ? 0 : (peakCapital - currentCapital) / peakCapital;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }
    });
    return maxDrawdown * 100; // Percentage
};
const calculateVolatility = (trades: TradeHistoryItem[]): number => {
    const profits = trades.filter(t => t.trade === 'Closed' && t.profit !== undefined).map(t => t.profit as number); // Use 'Closed'
    if (profits.length < 2) return 0;
    const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
    const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (profits.length - 1);
    return Math.sqrt(variance);
};
const calculateSharpeRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02; // Annualized
    const volatility = calculateVolatility(trades); // Uses 'Closed'
    if (volatility === 0) return 0;
    return (totalReturnPercentage / 100 - riskFreeRate) / volatility; // Simplified
};
const calculateSortinoRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02;
    const negativeReturns = trades.filter(t => t.trade === 'Closed' && t.profit !== undefined && t.profit < 0).map(t => t.profit as number); // Use 'Closed'
    if (negativeReturns.length === 0) return Infinity;
    const meanNegative = 0; // Target return
    const downsideVariance = negativeReturns.reduce((sum, p) => sum + Math.pow(p - meanNegative, 2), 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);
    if (downsideDeviation === 0) return Infinity;
    return (totalReturnPercentage / 100 - riskFreeRate) / downsideDeviation; // Simplified
};

export default function MonthlyPortfolioPage() {
  const [analysisParams, setAnalysisParams] = useState<StockAnalysisParams | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);

  // Função para processar operações mensais - CORRIGIDA v3 (Profit/Capital on Closed only, Text 'Closed')
  const processMonthlyTrades = (fullHistory: TradeHistoryItem[], params: StockAnalysisParams): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } => {
    if (!fullHistory || fullHistory.length === 0) return { processedHistory: [], tradePairs: [] };

    const finalProcessedHistory: TradeHistoryItem[] = [];
    const finalTradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] = [];
    const sortedHistory = [...fullHistory].sort((a, b) =>
      new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
    );
    let capitalBeforeCurrentTrade = params.initialCapital; // Tracks capital *before* each trade entry

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
      let activeTradeEntry: TradeHistoryItem | null = null;
      let stopPriceCalculated: number | null = null;
      let entryAttemptMadeThisMonth = false;

      for (let i = 0; i < monthTrades.length; i++) {
        const currentDayData = monthTrades[i];
        const currentDate = new Date(currentDayData.date + 'T00:00:00Z');
        if (isNaN(currentDate.getTime())) continue;

        // --- 1. Attempt Entry ONLY on First Business Day --- 
        if (!activeTradeEntry && !entryAttemptMadeThisMonth && isFirstBusinessDayOfMonth(currentDate)) {
          entryAttemptMadeThisMonth = true;
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
                // *** CORRECTION v3: Calculate Lot Size based on capital *before* entry ***
                lotSize: capitalBeforeCurrentTrade / potentialEntryPrice, 
                stop: '-', 
                // *** CORRECTION v3: Profit and Capital are UNDEFINED on entry ***
                profit: undefined, 
                capital: undefined 
              };
              activeTradeEntry = entryDayRecord;
              stopPriceCalculated = entryDayRecord.stopPrice;
              finalProcessedHistory.push(entryDayRecord);
            }
          }
        }

        // --- 2. Manage Active Trade (Check Stop or End of Month) --- 
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
              // *** CORRECTION v3: Use 'Closed' text ***
              trade: 'Closed', 
              stop: 'Executed', 
              // *** CORRECTION v3: Profit and Capital calculated ONLY on close ***
              profit: profit,
              capital: capitalBeforeCurrentTrade + profit, 
              suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
              actualPrice: activeTradeEntry.actualPrice, 
              stopPrice: activeTradeEntry.stopPrice,
              lotSize: activeTradeEntry.lotSize, 
              exitPrice: exitPrice
            };
            closedToday = true;
            // Update capital tracker *after* recording the closing state
            capitalBeforeCurrentTrade += profit; 
            
          } else if (isLastBusinessDayOfMonth(currentDate)) {
            exitPrice = typeof currentDayData.exitPrice === 'number' ? currentDayData.exitPrice : undefined;
            if (exitPrice !== undefined) {
              profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
              closeRecord = {
                ...currentDayData,
                // *** CORRECTION v3: Use 'Closed' text ***
                trade: 'Closed', 
                stop: '-', 
                // *** CORRECTION v3: Profit and Capital calculated ONLY on close ***
                profit: profit,
                capital: capitalBeforeCurrentTrade + profit, 
                suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
                actualPrice: activeTradeEntry.actualPrice, 
                stopPrice: activeTradeEntry.stopPrice,
                lotSize: activeTradeEntry.lotSize, 
                exitPrice: exitPrice
              };
              closedToday = true;
              // Update capital tracker *after* recording the closing state
              capitalBeforeCurrentTrade += profit; 
            } else {
              console.warn(`Missing exit price on last business day ${currentDayData.date}`);
            }
          }

          // If a close happened today, record it and reset
          if (closedToday && closeRecord) {
            finalProcessedHistory.push(closeRecord);
            finalTradePairs.push({ open: activeTradeEntry, close: closeRecord });
            activeTradeEntry = null;
            stopPriceCalculated = null;
            if (stopHit) {
              break; // Exit month's loop if closed by stop
            }
          }
        }
      } // End of day loop
    }); // End of month loop

    return { processedHistory: finalProcessedHistory, tradePairs: finalTradePairs };
  };

  // runAnalysis function (uses corrected v3 processMonthlyTrades)
  const runAnalysis = async (params: StockAnalysisParams) => {
    try {
      setIsLoading(true);
      setAnalysisResults([]);
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false);
      if (!isValidPeriodForMonthly(params.period)) {
        toast({ variant: "default", title: "Period Selection", description: "For monthly analysis, select a period of 2 months or more." });
      }
      console.info("Running monthly analysis (v3 - final corrections) with params:", params);
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
              // *** Use CORRECTED v3 processMonthlyTrades function ***
              const { processedHistory, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
              const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
              const trades = tradePairsFiltered.length;
              // --- Recalculate metrics based on monthly trade pairs --- 
              if (trades === 0) return { ...result, tradingDays: processedHistory.length, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };
              const profitsCount = tradePairsFiltered.filter(pair => pair.close.profit > 0).length;
              const lossesCount = trades - profitsCount;
              const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;
              const finalCapital = tradePairsFiltered.length > 0 ? tradePairsFiltered[tradePairsFiltered.length - 1].close.capital ?? params.initialCapital : params.initialCapital;
              const totalProfit = finalCapital - params.initialCapital;
              const profitPercentageTotal = (totalProfit / params.initialCapital) * 100;
              const gainTrades = tradePairsFiltered.filter(pair => pair.close.profit > 0);
              const lossTrades = tradePairsFiltered.filter(pair => pair.close.profit < 0);
              const averageGain = gainTrades.length > 0 ? gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0) / gainTrades.length : 0;
              const averageLoss = lossTrades.length > 0 ? lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close.profit), 0) / lossTrades.length : 0;
              // Use processedHistory (only 'Closed' trades have profit) for risk calcs
              const maxDrawdown = calculateMaxDrawdown(processedHistory, params.initialCapital);
              const sharpeRatio = calculateSharpeRatio(processedHistory, profitPercentageTotal);
              const sortinoRatio = calculateSortinoRatio(processedHistory, profitPercentageTotal);
              const recoveryFactor = maxDrawdown !== 0 ? Math.abs(totalProfit / (maxDrawdown / 100 * params.initialCapital)) : (totalProfit > 0 ? Infinity : 0);
              // --- End Recalculation --- 
              return { ...result, tradingDays: processedHistory.length, trades, profits: profitsCount, losses: lossesCount, stops: stopsCount, finalCapital, profit: totalProfit, successRate: trades > 0 ? (profitsCount / trades) * 100 : 0, averageGain, averageLoss, maxDrawdown, sharpeRatio, sortinoRatio, recoveryFactor };
            }
            return result;
          } catch (error) { console.error(`Error processing ${result.assetCode}:`, error); return result; }
        })
      );
      setProgress(95);
      setAnalysisResults(processedResults);
      setProgress(100);
      toast({ title: "Monthly analysis completed", description: "Analysis was completed successfully (v3 logic)." });
    } catch (error) { console.error("Monthly analysis failed", error); toast({ variant: "destructive", title: "Analysis failed", description: error instanceof Error ? error.message : "Unknown error" }); setProgress(0); }
    finally { setTimeout(() => setIsLoading(false), 500); }
  };

  // viewDetails function (uses corrected v3 processMonthlyTrades)
  const viewDetails = async (assetCode: string) => {
    if (!analysisParams) return;
    try {
      setIsLoadingDetails(true);
      setSelectedAsset(assetCode);
      const paramsWithTable = analysisParams.dataTableName ? analysisParams : { ...analysisParams, dataTableName: await api.marketData.getDataTableName(analysisParams.country, analysisParams.stockMarket, analysisParams.assetClass) };
      if (!paramsWithTable.dataTableName) throw new Error("Could not determine data table name");
      const detailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsWithTable);
      if (detailedData && detailedData.tradeHistory) {
        // *** Use CORRECTED v3 processMonthlyTrades function ***
        const { processedHistory, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
        detailedData.tradeHistory = processedHistory; 
        detailedData.tradingDays = processedHistory.length;
        const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
        // Recalculate capital evolution based on 'Closed' trades
        if (tradePairsFiltered.length > 0) {
          detailedData.capitalEvolution = tradePairsFiltered.map(pair => ({
            date: pair.close.date,
            capital: pair.close.capital ?? paramsWithTable.initialCapital 
          }));
          detailedData.capitalEvolution.unshift({ date: tradePairsFiltered[0]?.open.date || processedHistory[0]?.date || '', capital: paramsWithTable.initialCapital });
          const finalCapital = detailedData.capitalEvolution[detailedData.capitalEvolution.length - 1]?.capital ?? paramsWithTable.initialCapital;
          const totalProfit = finalCapital - paramsWithTable.initialCapital;
          const profitPercentageTotal = (totalProfit / paramsWithTable.initialCapital) * 100;
          detailedData.maxDrawdown = calculateMaxDrawdown(processedHistory, paramsWithTable.initialCapital);
          detailedData.sharpeRatio = calculateSharpeRatio(processedHistory, profitPercentageTotal);
          detailedData.sortinoRatio = calculateSortinoRatio(processedHistory, profitPercentageTotal);
          detailedData.recoveryFactor = detailedData.maxDrawdown !== 0 ? Math.abs(totalProfit / (detailedData.maxDrawdown / 100 * paramsWithTable.initialCapital)) : (totalProfit > 0 ? Infinity : 0);
        } else {
           detailedData.capitalEvolution = [{ date: processedHistory[0]?.date || '', capital: paramsWithTable.initialCapital }];
           detailedData.maxDrawdown = 0; detailedData.sharpeRatio = 0; detailedData.sortinoRatio = 0; detailedData.recoveryFactor = 0;
        }
      }
      setDetailedResult(detailedData);
      setShowDetailView(true); 
    } catch (error) {
      console.error("Failed to fetch monthly detailed analysis", error);
      toast({ variant: "destructive", title: "Failed to fetch details", description: error instanceof Error ? error.message : "An unknown error occurred" });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // updateAnalysis function (uses corrected v3 processMonthlyTrades)
  const updateAnalysis = async (updatedParams: StockAnalysisParams) => {
     if (!selectedAsset) return;
     try {
       setIsLoadingDetails(true);
       const paramsWithTable = updatedParams.dataTableName ? updatedParams : { ...updatedParams, dataTableName: await api.marketData.getDataTableName(updatedParams.country, updatedParams.stockMarket, updatedParams.assetClass) };
       if (!paramsWithTable.dataTableName) throw new Error("Could not determine data table name for update");
       const detailedData = await api.analysis.getDetailedAnalysis(selectedAsset, paramsWithTable);
       if (detailedData && detailedData.tradeHistory) {
         // *** Use CORRECTED v3 processMonthlyTrades function ***
         const { processedHistory, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
         detailedData.tradeHistory = processedHistory;
         detailedData.tradingDays = processedHistory.length;
         const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
         // --- Recalculate metrics --- 
         if (tradePairsFiltered.length > 0) {
            detailedData.capitalEvolution = tradePairsFiltered.map(pair => ({
                date: pair.close.date,
                capital: pair.close.capital ?? paramsWithTable.initialCapital
            }));
            detailedData.capitalEvolution.unshift({ date: tradePairsFiltered[0]?.open.date || processedHistory[0]?.date || '', capital: paramsWithTable.initialCapital });
            const finalCapital = detailedData.capitalEvolution[detailedData.capitalEvolution.length - 1]?.capital ?? paramsWithTable.initialCapital;
            const totalProfit = finalCapital - paramsWithTable.initialCapital;
            const profitPercentageTotal = (totalProfit / paramsWithTable.initialCapital) * 100;
            detailedData.maxDrawdown = calculateMaxDrawdown(processedHistory, paramsWithTable.initialCapital);
            detailedData.sharpeRatio = calculateSharpeRatio(processedHistory, profitPercentageTotal);
            detailedData.sortinoRatio = calculateSortinoRatio(processedHistory, profitPercentageTotal);
            detailedData.recoveryFactor = detailedData.maxDrawdown !== 0 ? Math.abs(totalProfit / (detailedData.maxDrawdown / 100 * paramsWithTable.initialCapital)) : (totalProfit > 0 ? Infinity : 0);
         } else {
           detailedData.capitalEvolution = [{ date: processedHistory[0]?.date || '', capital: paramsWithTable.initialCapital }];
           detailedData.maxDrawdown = 0; detailedData.sharpeRatio = 0; detailedData.sortinoRatio = 0; detailedData.recoveryFactor = 0;
         }
         // --- End Recalculation --- 
       }
       setDetailedResult(detailedData);
       setAnalysisParams(paramsWithTable);
       toast({ title: "Analysis Updated", description: "Detailed view updated (monthly v3 logic)." });
     } catch (error) { console.error("Failed to update detailed analysis", error); toast({ variant: "destructive", title: "Update Failed", description: error instanceof Error ? error.message : "Unknown error" }); }
     finally { setIsLoadingDetails(false); }
  };

  // closeDetails function (kept from weekly v4)
  const closeDetails = () => {
    setShowDetailView(false);
    setDetailedResult(null);
    setSelectedAsset(null);
  };

  // --- RETURN JSX (kept from weekly v4) --- 
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Monthly Portfolio</h1>
      {!showDetailView ? (
        <div className="bg-card p-6 rounded-lg border">
          <StockSetupForm onSubmit={runAnalysis} isLoading={isLoading} />
          {isLoading && (
            <div className="mt-6">
              <div className="flex justify-between text-sm mb-2">
                <span>Processing monthly analysis...</span>
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

