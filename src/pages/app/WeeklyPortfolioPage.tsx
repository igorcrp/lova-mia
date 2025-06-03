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
  // isSameWeek, // Not strictly needed if grouping by week key
  // getNextBusinessDay // Not strictly needed for this logic
} from "@/utils/dateUtils"; // Assuming dateUtils contains these functions

// Helper function to get week key (e.g., YYYY-WW based on Monday)
function getWeekKey(date: Date): string {
  const startOfWeek = new Date(date);
  startOfWeek.setUTCDate(date.getUTCDate() - date.getUTCDay() + (date.getUTCDay() === 0 ? -6 : 1)); // Adjust to Monday UTC
  startOfWeek.setUTCHours(0, 0, 0, 0);
  const year = startOfWeek.getUTCFullYear();
  // Calculate ISO week number
  const firstDayOfYear = new Date(Date.UTC(year, 0, 1));
  const pastDaysOfYear = (startOfWeek.getTime() - firstDayOfYear.getTime()) / 86400000;
  const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getUTCDay() + 1) / 7);
  return `${year}-W${String(weekNumber).padStart(2, '0')}`;
}

// Helper function to check if it's Monday or the first business day of the week (using UTC dates)
function isMondayOrFirstBusinessDay(date: Date): boolean {
  // Assumes isFirstBusinessDayOfWeek handles business days correctly
  return date.getUTCDay() === 1 || isFirstBusinessDayOfWeek(date);
}

// Helper function to check if it's Friday or last business day of the week (using UTC dates)
function isFridayOrLastBusinessDay(date: Date): boolean {
  // Assumes isLastBusinessDayOfWeek handles business days correctly
  return date.getUTCDay() === 5 || isLastBusinessDayOfWeek(date);
}

// Helper function to find the previous day's data in the sorted history
function findPreviousDay(history: TradeHistoryItem[], currentDateStr: string): TradeHistoryItem | null {
  const currentDateIndex = history.findIndex(item => item.date === currentDateStr);
  if (currentDateIndex > 0) {
    return history[currentDateIndex - 1];
  }
  return null;
}

// Helper function to get the reference price from a day's data
function getReferencePrice(day: TradeHistoryItem, referencePriceKey: string): number {
  const price = day[referencePriceKey as keyof TradeHistoryItem];
  return typeof price === 'number' ? price : 0; 
}

// Helper function to calculate stop price
function calculateStopPrice(entryPrice: number, params: StockAnalysisParams): number {
  const stopPercent = params.stopPercentage ?? 0;
  if (params.operation === 'buy') {
    return entryPrice * (1 - stopPercent / 100);
  } else { // sell
    return entryPrice * (1 + stopPercent / 100);
  }
}

// Helper function to check if stop loss is hit
function checkStopLoss(currentDay: TradeHistoryItem, stopPrice: number, operation: string): boolean {
  if (operation === 'buy') {
    // Ensure low is a number before comparison
    return typeof currentDay.low === 'number' && currentDay.low <= stopPrice;
  } else { // sell
    // Ensure high is a number before comparison
    return typeof currentDay.high === 'number' && currentDay.high >= stopPrice;
  }
}

// Helper function to calculate profit/loss
function calculateProfit(entryPrice: number | undefined, exitPrice: number | undefined, operation: string, lotSize: number | undefined): number {
  if (entryPrice === undefined || exitPrice === undefined || lotSize === undefined || lotSize === 0) return 0;
  // Ensure prices are numbers
  const numEntryPrice = Number(entryPrice);
  const numExitPrice = Number(exitPrice);
  if (isNaN(numEntryPrice) || isNaN(numExitPrice)) return 0;

  if (operation === 'buy') {
    return (numExitPrice - numEntryPrice) * lotSize;
  } else { // sell
    return (numEntryPrice - numExitPrice) * lotSize;
  }
}

export default function WeeklyPortfolioPage() {
  const [analysisParams, setAnalysisParams] = useState<StockAnalysisParams | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);

  // Função para processar operações semanais - REFINADA v2
  const processWeeklyTrades = (fullHistory: TradeHistoryItem[], params: StockAnalysisParams): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } => {
    if (!fullHistory || fullHistory.length === 0) return { processedHistory: [], tradePairs: [] };

    const finalProcessedHistory: TradeHistoryItem[] = [];
    const finalTradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] = [];
    const sortedHistory = [...fullHistory].sort((a, b) =>
      new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
    );
    let currentCapital = params.initialCapital;

    // Group trades by week using the week key
    const tradesByWeek: { [weekKey: string]: TradeHistoryItem[] } = {};
    sortedHistory.forEach(trade => {
      // Ensure date is treated as UTC to avoid timezone issues with getUTCDay etc.
      const tradeDate = new Date(trade.date + 'T00:00:00Z'); 
      if (isNaN(tradeDate.getTime())) {
          console.warn(`Invalid date format found: ${trade.date}`);
          return; // Skip invalid dates
      }
      const weekKey = getWeekKey(tradeDate);
      if (!tradesByWeek[weekKey]) {
        tradesByWeek[weekKey] = [];
      }
      tradesByWeek[weekKey].push(trade);
    });

    // Process each week strictly
    Object.keys(tradesByWeek).sort().forEach(weekKey => {
      const weekTrades = tradesByWeek[weekKey];
      let activeTradeEntry: TradeHistoryItem | null = null;
      let stopPriceCalculated: number | null = null;
      let entryAttemptMadeThisWeek = false; // Flag to ensure only one entry attempt

      for (let i = 0; i < weekTrades.length; i++) {
        const currentDayData = weekTrades[i];
        const currentDate = new Date(currentDayData.date + 'T00:00:00Z');
        if (isNaN(currentDate.getTime())) continue; // Skip if date is invalid

        // --- 1. Attempt Entry ONLY on First Business Day --- 
        if (!activeTradeEntry && !entryAttemptMadeThisWeek && isMondayOrFirstBusinessDay(currentDate)) {
          entryAttemptMadeThisWeek = true; // Mark attempt even if conditions fail
          const previousDay = findPreviousDay(sortedHistory, currentDayData.date);

          if (previousDay && previousDay.exitPrice !== undefined) {
            const potentialEntryPrice = previousDay.exitPrice;
            const referencePrice = getReferencePrice(previousDay, params.referencePrice);
            const entryThreshold = referencePrice * (1 + (params.entryPercentage / 100) * (params.operation === 'buy' ? 1 : -1));

            // Check entry condition
            if ((params.operation === 'buy' && potentialEntryPrice >= entryThreshold) ||
                (params.operation === 'sell' && potentialEntryPrice <= entryThreshold)) {
              
              // --- Open Trade --- 
              const entryDayRecord: TradeHistoryItem = {
                ...currentDayData, // Base data for the day
                trade: (params.operation === 'buy' ? 'Buy' : 'Sell'),
                suggestedEntryPrice: potentialEntryPrice,
                actualPrice: potentialEntryPrice, // Use potential entry as actual for simulation
                stopPrice: calculateStopPrice(potentialEntryPrice, params),
                lotSize: currentCapital / potentialEntryPrice, // Use current capital for lot size
                stop: '-',
                profit: undefined,
                capital: undefined // Capital shown only on close
              };
              
              activeTradeEntry = entryDayRecord; // Store the entry record
              stopPriceCalculated = entryDayRecord.stopPrice;
              
              // Add ONLY the entry day record to history
              finalProcessedHistory.push(entryDayRecord);
            }
          }
        }

        // --- 2. Manage Active Trade (Check Stop or End of Week) --- 
        if (activeTradeEntry && stopPriceCalculated && currentDayData.date !== activeTradeEntry.date) {
          let closedToday = false;

          // Check Stop Loss first
          const stopHit = checkStopLoss(currentDayData, stopPriceCalculated, params.operation);
          if (stopHit) {
            const exitPrice = stopPriceCalculated;
            const closeRecord: TradeHistoryItem = {
              ...currentDayData, // Base data for the closing day
              trade: 'Close',
              stop: 'Executed',
              profit: calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize),
              capital: currentCapital + calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize),
              // Carry over entry details for reference?
              suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
              actualPrice: activeTradeEntry.actualPrice,
              stopPrice: activeTradeEntry.stopPrice,
              lotSize: activeTradeEntry.lotSize,
              exitPrice: exitPrice // Record the exit price
            };
            
            currentCapital = closeRecord.capital ?? currentCapital; // Update capital
            finalProcessedHistory.push(closeRecord); // Add ONLY the close day record
            finalTradePairs.push({ open: activeTradeEntry, close: closeRecord });
            
            activeTradeEntry = null; // Reset active trade
            stopPriceCalculated = null;
            closedToday = true;
            break; // Exit week's loop once closed by stop
          }

          // Check End of Week Closure (if not closed by stop)
          if (!closedToday && isFridayOrLastBusinessDay(currentDate)) {
            // Ensure exitPrice is a number
            const exitPrice = typeof currentDayData.exitPrice === 'number' ? currentDayData.exitPrice : undefined;
            if (exitPrice !== undefined) {
                const closeRecord: TradeHistoryItem = {
                  ...currentDayData, // Base data for the closing day
                  trade: 'Close',
                  stop: '-', // Not closed by stop
                  profit: calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize),
                  capital: currentCapital + calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize),
                  // Carry over entry details for reference?
                  suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
                  actualPrice: activeTradeEntry.actualPrice,
                  stopPrice: activeTradeEntry.stopPrice,
                  lotSize: activeTradeEntry.lotSize,
                  exitPrice: exitPrice // Record the exit price (day's close)
                };
                
                currentCapital = closeRecord.capital ?? currentCapital; // Update capital
                finalProcessedHistory.push(closeRecord); // Add ONLY the close day record
                finalTradePairs.push({ open: activeTradeEntry, close: closeRecord });
                
                activeTradeEntry = null; // Reset active trade
                stopPriceCalculated = null;
                closedToday = true;
                // Don't break here, let loop finish in case data ends before Friday
            } else {
                // Handle case where Friday's close price is missing - maybe skip closing?
                console.warn(`Missing exit price on Friday ${currentDayData.date} for active trade.`);
                // Decide behavior: close with last known price? Or leave open? (Current logic leaves it technically open)
            }
          }
        }
      } // End of day loop for the week
    }); // End of week loop

    // Add a final record showing the last capital state if the history is not empty
    // This helps visualize the final capital even if the last action wasn't a close
    if (finalProcessedHistory.length > 0) {
        const lastRecord = finalProcessedHistory[finalProcessedHistory.length - 1];
        // If the last record wasn't a close, add a status record
        if (lastRecord.trade !== 'Close') {
            // Find the last day in the original sorted history
            const lastOverallDay = sortedHistory[sortedHistory.length - 1];
            if (lastOverallDay) {
                 finalProcessedHistory.push({
                    ...lastOverallDay, // Use data from the actual last day
                    trade: '-', // No trade action
                    profit: undefined,
                    stop: '-',
                    capital: currentCapital, // Show the final capital
                    suggestedEntryPrice: undefined,
                    actualPrice: undefined,
                    stopPrice: undefined,
                    lotSize: 0
                 });
            }
        } else {
             // Ensure the capital on the last close record is correctly shown
             lastRecord.capital = currentCapital;
        }
    } else {
        // If no trades happened at all, add a record showing initial capital
        const lastOverallDay = sortedHistory[sortedHistory.length - 1];
         if (lastOverallDay) {
             finalProcessedHistory.push({
                ...lastOverallDay,
                trade: '-', profit: 0, stop: '-', capital: currentCapital,
                suggestedEntryPrice: undefined, actualPrice: undefined, stopPrice: undefined, lotSize: 0
             });
         }
    }

    return { processedHistory: finalProcessedHistory, tradePairs: finalTradePairs };
  };

  // --- runAnalysis, viewDetails, updateAnalysis --- 
  // These functions remain largely the same, but they will now call the REFINED v2 processWeeklyTrades
  // Ensure they correctly use the outputs (processedHistory, tradePairs) for metric calculations and display.

  const runAnalysis = async (params: StockAnalysisParams) => {
    try {
      setIsLoading(true);
      setAnalysisResults([]);
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false);

      console.info('Running weekly analysis (v2) with params:', params);
      setProgress(10);

      let dataTableName = params.dataTableName;
      if (!dataTableName) {
        dataTableName = await api.marketData.getDataTableName(
          params.country, params.stockMarket, params.assetClass
        );
        if (!dataTableName) throw new Error("Failed to identify data source");
      }
      setProgress(20);

      const paramsWithTable = { ...params, dataTableName };
      setAnalysisParams(paramsWithTable);

      const results = await api.analysis.runAnalysis(paramsWithTable, (p) => setProgress(20 + p * 0.7));

      const processedResults = await Promise.all(
        results.map(async (result) => {
          try {
            const detailedData = await api.analysis.getDetailedAnalysis(result.assetCode, paramsWithTable);
            if (detailedData && detailedData.tradeHistory) {
              // *** Use REFINED v2 function ***
              const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
              const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
              const trades = tradePairsFiltered.length;

              if (trades === 0) {
                 return { ...result, tradingDays: processedHistory.length, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };
              }

              const profitsCount = tradePairsFiltered.filter(pair => pair.close.profit > 0).length;
              const lossesCount = trades - profitsCount;
              const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;

              let finalCapital = params.initialCapital;
              tradePairsFiltered.forEach(pair => { finalCapital += pair.close.profit; });
              const totalProfit = finalCapital - params.initialCapital;
              const profitPercentageTotal = (totalProfit / params.initialCapital) * 100;

              const gainTrades = tradePairsFiltered.filter(pair => pair.close.profit > 0);
              const lossTrades = tradePairsFiltered.filter(pair => pair.close.profit < 0);
              const averageGain = gainTrades.length > 0 ? gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0) / gainTrades.length : 0;
              const averageLoss = lossTrades.length > 0 ? lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close.profit), 0) / lossTrades.length : 0;

              const maxDrawdown = calculateMaxDrawdown(tradePairsFiltered.map(pair => pair.close), params.initialCapital);
              const sharpeRatio = calculateSharpeRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
              const sortinoRatio = calculateSortinoRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
              const recoveryFactor = maxDrawdown !== 0 ? Math.abs(totalProfit / (maxDrawdown / 100 * params.initialCapital)) : (totalProfit > 0 ? Infinity : 0); // Adjust recovery factor calc if needed

              return {
                ...result,
                tradingDays: processedHistory.length, // Now reflects only entry/exit days
                trades: trades,
                tradePercentage: trades > 0 ? 100 : 0,
                profits: profitsCount,
                profitPercentage: trades > 0 ? (profitsCount / trades) * 100 : 0,
                losses: lossesCount,
                lossPercentage: trades > 0 ? (lossesCount / trades) * 100 : 0,
                stops: stopsCount,
                stopPercentage: trades > 0 ? (stopsCount / trades) * 100 : 0,
                finalCapital: finalCapital,
                profit: totalProfit,
                averageGain: averageGain,
                averageLoss: averageLoss,
                maxDrawdown: maxDrawdown, // Percentage
                sharpeRatio: sharpeRatio,
                sortinoRatio: sortinoRatio,
                recoveryFactor: recoveryFactor,
                successRate: trades > 0 ? (profitsCount / trades) * 100 : 0
              };
            }
            return result;
          } catch (error) {
            console.error(`Error processing detailed data for ${result.assetCode}:`, error);
            return result;
          }
        })
      );

      setProgress(95);
      setAnalysisResults(processedResults);
      setProgress(100);
      toast({ title: "Weekly analysis completed", description: "Analysis was completed successfully (v2 logic)." });
    } catch (error) {
      console.error("Weekly analysis failed", error);
      toast({ variant: "destructive", title: "Analysis failed", description: error instanceof Error ? error.message : "An unknown error occurred" });
      setProgress(0);
    } finally {
      setTimeout(() => setIsLoading(false), 500);
    }
  };

  const viewDetails = async (assetCode: string) => {
    if (!analysisParams) return;
    try {
      setIsLoadingDetails(true);
      setSelectedAsset(assetCode);
      const paramsWithTable = analysisParams.dataTableName ? analysisParams : { ...analysisParams, dataTableName: await api.marketData.getDataTableName(analysisParams.country, analysisParams.stockMarket, analysisParams.assetClass) };
      if (!paramsWithTable.dataTableName) throw new Error("Could not determine data table name");

      const detailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsWithTable);
      if (detailedData && detailedData.tradeHistory) {
        // *** Use REFINED v2 function ***
        const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
        detailedData.tradeHistory = processedHistory; // Update history for table display
        detailedData.tradingDays = processedHistory.length;

        const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
        if (tradePairsFiltered.length > 0) {
          let currentCapital = paramsWithTable.initialCapital;
          detailedData.capitalEvolution = tradePairsFiltered.map(pair => {
            currentCapital += pair.close.profit;
            return { date: pair.close.date, capital: currentCapital };
          });
          detailedData.capitalEvolution.unshift({ date: tradePairsFiltered[0]?.open.date || processedHistory[0]?.date || new Date().toISOString().split('T')[0], capital: paramsWithTable.initialCapital });

          const finalCapital = currentCapital;
          const totalProfit = finalCapital - paramsWithTable.initialCapital;
          const profitPercentageTotal = (totalProfit / paramsWithTable.initialCapital) * 100;
          detailedData.maxDrawdown = calculateMaxDrawdown(tradePairsFiltered.map(pair => pair.close), paramsWithTable.initialCapital);
          detailedData.sharpeRatio = calculateSharpeRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
          detailedData.sortinoRatio = calculateSortinoRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
           detailedData.recoveryFactor = maxDrawdown !== 0 ? Math.abs(totalProfit / (maxDrawdown / 100 * params.initialCapital)) : (totalProfit > 0 ? Infinity : 0);
        } else {
          detailedData.capitalEvolution = [{ date: processedHistory[0]?.date || new Date().toISOString().split('T')[0], capital: paramsWithTable.initialCapital }];
          detailedData.maxDrawdown = 0; detailedData.sharpeRatio = 0; detailedData.sortinoRatio = 0; detailedData.recoveryFactor = 0;
        }
      }
      setDetailedResult(detailedData);
      setShowDetailView(true);
    } catch (error) {
      console.error("Failed to fetch weekly detailed analysis", error);
      toast({ variant: "destructive", title: "Failed to fetch details", description: error instanceof Error ? error.message : "An unknown error occurred" });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const updateAnalysis = async (updatedParams: StockAnalysisParams) => {
     if (!selectedAsset) return;
     try {
       setIsLoadingDetails(true);
       const paramsWithTable = updatedParams.dataTableName ? updatedParams : { ...updatedParams, dataTableName: await api.marketData.getDataTableName(updatedParams.country, updatedParams.stockMarket, updatedParams.assetClass) };
       if (!paramsWithTable.dataTableName) throw new Error("Could not determine data table name for update");

       const detailedData = await api.analysis.getDetailedAnalysis(selectedAsset, paramsWithTable);
       if (detailedData && detailedData.tradeHistory) {
         // *** Use REFINED v2 function ***
         const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
         detailedData.tradeHistory = processedHistory;
         detailedData.tradingDays = processedHistory.length;
         const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);

         if (tradePairsFiltered.length > 0) {
           let currentCapital = paramsWithTable.initialCapital;
           detailedData.capitalEvolution = tradePairsFiltered.map(pair => { currentCapital += pair.close.profit; return { date: pair.close.date, capital: currentCapital }; });
           detailedData.capitalEvolution.unshift({ date: tradePairsFiltered[0]?.open.date || processedHistory[0]?.date || new Date().toISOString().split('T')[0], capital: paramsWithTable.initialCapital });
           const finalCapital = currentCapital;
           const totalProfit = finalCapital - paramsWithTable.initialCapital;
           const profitPercentageTotal = (totalProfit / paramsWithTable.initialCapital) * 100;
           detailedData.maxDrawdown = calculateMaxDrawdown(tradePairsFiltered.map(pair => pair.close), paramsWithTable.initialCapital);
           detailedData.sharpeRatio = calculateSharpeRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
           detailedData.sortinoRatio = calculateSortinoRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
           detailedData.recoveryFactor = maxDrawdown !== 0 ? Math.abs(totalProfit / (maxDrawdown / 100 * params.initialCapital)) : (totalProfit > 0 ? Infinity : 0);
         } else {
           detailedData.capitalEvolution = [{ date: processedHistory[0]?.date || new Date().toISOString().split('T')[0], capital: paramsWithTable.initialCapital }];
           detailedData.maxDrawdown = 0; detailedData.sharpeRatio = 0; detailedData.sortinoRatio = 0; detailedData.recoveryFactor = 0;
         }
       }
       setDetailedResult(detailedData);
       setAnalysisParams(paramsWithTable); // Update main params state
       toast({ title: "Analysis Updated", description: "Detailed view updated with new parameters (v2 logic)." });
     } catch (error) {
       console.error("Failed to update detailed analysis", error);
       toast({ variant: "destructive", title: "Update Failed", description: error instanceof Error ? error.message : "An unknown error occurred during update." });
     } finally {
       setIsLoadingDetails(false);
     }
  };

  const closeDetails = () => {
    setShowDetailView(false);
    setDetailedResult(null);
    setSelectedAsset(null);
  };

  // --- Risk Calculation Functions (Keep previous placeholders or implement accurately) ---
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
    // Needs proper annualization based on trade frequency/period
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
    // Needs proper annualization
    return (totalReturnPercentage / 100 - riskFreeRate) / downsideDeviation; // Simplified
  };
  // --- End Risk Calculation Functions ---

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Weekly Portfolio</h1>
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

