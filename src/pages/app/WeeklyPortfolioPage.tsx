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
} from "@/utils/dateUtils"; // Keep utils from v2

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

  // processWeeklyTrades function - MODIFIED based on user requirements
  const processWeeklyTrades = (fullHistory: TradeHistoryItem[], params: StockAnalysisParams): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } => {
    if (!fullHistory || fullHistory.length === 0) return { processedHistory: [], tradePairs: [] };

    const finalProcessedHistory: TradeHistoryItem[] = [];
    const finalTradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] = [];
    const sortedHistory = [...fullHistory].sort((a, b) => new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime());
    let currentCapital = params.initialCapital;
    const tradesByWeek: { [weekKey: string]: TradeHistoryItem[] } = {};

    // Group trades by week
    sortedHistory.forEach(trade => {
      const tradeDate = new Date(trade.date + 'T00:00:00Z');
      if (isNaN(tradeDate.getTime())) { console.warn(`Invalid date: ${trade.date}`); return; }
      const weekKey = getWeekKey(tradeDate);
      if (!tradesByWeek[weekKey]) tradesByWeek[weekKey] = [];
      tradesByWeek[weekKey].push(trade);
    });

    // Process each week
    Object.keys(tradesByWeek).sort().forEach(weekKey => {
      const weekTrades = tradesByWeek[weekKey];
      let activeTradeEntry: TradeHistoryItem | null = null;
      let stopPriceCalculated: number | null = null;
      let entryAttemptMadeThisWeek = false;
      let stopHitThisWeek = false; // Flag to prevent new entries after a stop loss in the same week

      for (let i = 0; i < weekTrades.length; i++) {
        const currentDayData = weekTrades[i];
        const currentDate = new Date(currentDayData.date + 'T00:00:00Z');
        if (isNaN(currentDate.getTime())) continue;

        // --- Entry Logic --- (Only on first business day, if no trade active, no entry attempted yet, and no stop hit this week)
        if (!activeTradeEntry && !entryAttemptMadeThisWeek && !stopHitThisWeek && isMondayOrFirstBusinessDay(currentDate)) {
          entryAttemptMadeThisWeek = true;
          const previousDay = findPreviousDay(sortedHistory, currentDayData.date);

          if (previousDay && previousDay.exitPrice !== undefined) {
            const potentialEntryPrice = previousDay.exitPrice;
            const referencePrice = getReferencePrice(previousDay, params.referencePrice);
            const entryThreshold = referencePrice * (1 + (params.entryPercentage / 100) * (params.operation === 'buy' ? 1 : -1));

            // Check entry condition
            if ((params.operation === 'buy' && potentialEntryPrice >= entryThreshold) || (params.operation === 'sell' && potentialEntryPrice <= entryThreshold)) {
              const entryDayRecord: TradeHistoryItem = {
                ...currentDayData,
                trade: (params.operation === 'buy' ? 'Buy' : 'Sell'),
                suggestedEntryPrice: potentialEntryPrice,
                actualPrice: potentialEntryPrice,
                stopPrice: calculateStopPrice(potentialEntryPrice, params),
                lotSize: currentCapital / potentialEntryPrice,
                stop: '-',
                profit: undefined,
                capital: undefined // Capital will be updated on close
              };
              activeTradeEntry = entryDayRecord;
              stopPriceCalculated = entryDayRecord.stopPrice;
              finalProcessedHistory.push(entryDayRecord); // Add entry record

              // --- Check for SAME-DAY Stop Loss --- 
              if (stopPriceCalculated) {
                 const stopHitToday = checkStopLoss(currentDayData, stopPriceCalculated, params.operation);
                 if (stopHitToday) {
                    const exitPrice = stopPriceCalculated;
                    const profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
                    const updatedCapital = currentCapital + profit;

                    // Update the existing entry record in finalProcessedHistory
                    const entryIndex = finalProcessedHistory.findIndex(item => item.date === activeTradeEntry?.date && item.trade === activeTradeEntry?.trade);
                    if (entryIndex > -1) {
                        finalProcessedHistory[entryIndex] = {
                            ...finalProcessedHistory[entryIndex],
                            trade: `${params.operation === 'buy' ? 'Buy' : 'Sell'}/Closed`, // Requirement 2
                            stop: 'Executed',
                            profit: profit,
                            capital: updatedCapital,
                            exitPrice: exitPrice,
                            lotSize: activeTradeEntry.lotSize // Ensure lot size is kept
                        };
                        // Create a 'close' record for tradePairs, mirroring the updated entry record
                        const closeRecordForPair = { ...finalProcessedHistory[entryIndex] }; 
                        finalTradePairs.push({ open: { ...activeTradeEntry }, close: closeRecordForPair });
                    } else {
                        // Fallback: Should not happen if entry was just pushed
                        console.error("Could not find entry record to update for same-day stop loss");
                        // As a fallback, push a new record (less ideal)
                        const closeRecord: TradeHistoryItem = {
                            ...currentDayData,
                            trade: `${params.operation === 'buy' ? 'Buy' : 'Sell'}/Closed`, // Requirement 2
                            stop: 'Executed',
                            profit: profit,
                            capital: updatedCapital,
                            suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
                            actualPrice: activeTradeEntry.actualPrice,
                            stopPrice: activeTradeEntry.stopPrice,
                            lotSize: activeTradeEntry.lotSize,
                            exitPrice: exitPrice
                        };
                        finalProcessedHistory.push(closeRecord);
                        finalTradePairs.push({ open: { ...activeTradeEntry }, close: closeRecord });
                    }

                    currentCapital = updatedCapital;
                    activeTradeEntry = null; // Trade closed
                    stopPriceCalculated = null;
                    stopHitThisWeek = true; // Prevent further entries this week (Requirement 2)
                    // No break here, let the loop finish the week naturally but without new entries
                 }
              }
            }
          }
        }

        // --- Exit Logic (Subsequent Days) --- (Only if a trade is active)
        if (activeTradeEntry && stopPriceCalculated && currentDayData.date !== activeTradeEntry.date) {
          let closedToday = false;

          // --- Check for SUBSEQUENT-DAY Stop Loss --- 
          const stopHit = checkStopLoss(currentDayData, stopPriceCalculated, params.operation);
          if (stopHit) {
            const exitPrice = stopPriceCalculated;
            const profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
            const closeRecord: TradeHistoryItem = {
              ...currentDayData,
              trade: 'Closed', // Requirement 3
              stop: 'Executed',
              profit: profit,
              capital: currentCapital + profit,
              suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
              actualPrice: activeTradeEntry.actualPrice,
              stopPrice: activeTradeEntry.stopPrice,
              lotSize: activeTradeEntry.lotSize,
              exitPrice: exitPrice
            };
            currentCapital = closeRecord.capital ?? currentCapital;
            finalProcessedHistory.push(closeRecord);
            finalTradePairs.push({ open: { ...activeTradeEntry }, close: closeRecord });
            activeTradeEntry = null;
            stopPriceCalculated = null;
            closedToday = true;
            stopHitThisWeek = true; // Prevent further entries this week
            break; // Stop processing this week after stop loss (Requirement 2 & 4)
          }

          // --- Check for FRIDAY / LAST BUSINESS DAY Close --- (Requirement 4)
          if (!closedToday && isFridayOrLastBusinessDay(currentDate)) {
            // Use the 'close' price of the last day as the exit price
            const exitPrice = typeof currentDayData.close === 'number' ? currentDayData.close : undefined;
            if (exitPrice !== undefined) {
              const profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
              const closeRecord: TradeHistoryItem = {
                ...currentDayData,
                trade: 'Closed', // Requirement 3
                stop: '-',
                profit: profit,
                capital: currentCapital + profit,
                suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
                actualPrice: activeTradeEntry.actualPrice,
                stopPrice: activeTradeEntry.stopPrice,
                lotSize: activeTradeEntry.lotSize,
                exitPrice: exitPrice
              };
              currentCapital = closeRecord.capital ?? currentCapital;
              finalProcessedHistory.push(closeRecord);
              finalTradePairs.push({ open: { ...activeTradeEntry }, close: closeRecord });
              activeTradeEntry = null;
              stopPriceCalculated = null;
              closedToday = true;
              // No break needed, it's the end of the week's loop anyway
            } else {
              console.warn(`Missing exit price (close) on last business day ${currentDayData.date}`);
              // Optionally handle this case, e.g., by not closing or using another price
              // For now, we don't close if exit price is missing
            }
          }
        }
      } // End of week's daily loop

      // If a trade was still active at the end of the week's data (but not closed on Friday/last day),
      // it means the data ended mid-week or the Friday close price was missing.
      // We don't add an artificial closing record here. The runAnalysis summary will use tradePairs.

    }); // End of weekly loop

    // Add a final record representing the state after the last processed day, only if history exists
    if (sortedHistory.length > 0) {
        const lastDayOverall = sortedHistory[sortedHistory.length - 1];
        const lastProcessedRecord = finalProcessedHistory.length > 0 ? finalProcessedHistory[finalProcessedHistory.length - 1] : null;

        // If the last processed record exists and has capital, use it, otherwise use initial capital
        const finalCapitalToShow = lastProcessedRecord?.capital ?? currentCapital; // Use currentCapital which reflects last operation

        // Check if the last day in sortedHistory already exists in finalProcessedHistory
        const lastDayAlreadyProcessed = finalProcessedHistory.some(item => item.date === lastDayOverall.date);

        // Add a final state record only if the last day wasn't the one processed
        // or if the history is empty (to show initial capital)
        if (!lastDayAlreadyProcessed || finalProcessedHistory.length === 0) {
             finalProcessedHistory.push({
                ...lastDayOverall,
                trade: '-',
                profit: undefined, // No profit on this placeholder
                stop: '-',
                capital: finalCapitalToShow,
                suggestedEntryPrice: undefined,
                actualPrice: undefined,
                stopPrice: undefined,
                lotSize: 0,
                exitPrice: undefined
            });
        } else if (lastProcessedRecord) {
            // Ensure the very last record reflects the final capital state
            lastProcessedRecord.capital = finalCapitalToShow;
        }
    }

    // Filter out potential duplicate dates introduced during processing (defensive check)
    const uniqueHistory = finalProcessedHistory.reduce((acc, current) => {
        const existingIndex = acc.findIndex(item => item.date === current.date);
        if (existingIndex > -1) {
            // Preference rule: Keep 'Buy/Closed' or 'Sell/Closed' over 'Buy'/'Sell' if dates match
            if ((current.trade?.includes('/Closed') && !acc[existingIndex].trade?.includes('/Closed')) || 
                // Keep 'Closed' over 'Buy'/'Sell' if dates match
                (current.trade === 'Closed' && (acc[existingIndex].trade === 'Buy' || acc[existingIndex].trade === 'Sell')) ||
                // Keep record with profit over record without if dates match
                (current.profit !== undefined && acc[existingIndex].profit === undefined) ||
                // Keep the one that is NOT '-' trade type if dates match
                (current.trade !== '-' && acc[existingIndex].trade === '-')) {
                acc[existingIndex] = current; // Replace existing with more complete/final state
            }
            // Otherwise, keep the first one encountered (acc[existingIndex])
        } else {
            acc.push(current); // Add new date
        }
        return acc;
    }, [] as TradeHistoryItem[]); 


    return { processedHistory: uniqueHistory, tradePairs: finalTradePairs };
  };

  // runAnalysis function (kept from v2 - uses MODIFIED processWeeklyTrades)
  const runAnalysis = async (params: StockAnalysisParams) => {
    try {
      setIsLoading(true);
      setAnalysisResults([]);
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false); // Ensure detail view is closed on new analysis
      console.info('Running weekly analysis (v4 - Corrected) with params:', params);
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
              // *** Use MODIFIED processWeeklyTrades function ***
              const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
              
              // Calculate metrics based on tradePairs (pairs of open/close)
              const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
              const trades = tradePairsFiltered.length;
              
              // Base result structure
              let summaryResult: AnalysisResult = {
                 ...result, 
                 tradingDays: processedHistory.length, 
                 trades: 0, 
                 profits: 0, 
                 losses: 0, 
                 stops: 0, 
                 finalCapital: params.initialCapital, 
                 profit: 0, 
                 successRate: 0, 
                 averageGain: 0, 
                 averageLoss: 0, 
                 maxDrawdown: 0, 
                 sharpeRatio: 0, 
                 sortinoRatio: 0, 
                 recoveryFactor: 0 
              };

              if (trades > 0) {
                  const profitsCount = tradePairsFiltered.filter(pair => pair.close.profit > 0).length;
                  const lossesCount = trades - profitsCount;
                  // Count stops based on the 'close' part of the pair having 'Executed'
                  const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;
                  
                  // Recalculate final capital based *only* on completed trades in tradePairs
                  let finalCapital = params.initialCapital;
                  tradePairsFiltered.forEach(pair => { finalCapital += pair.close.profit; });
                  
                  const totalProfit = finalCapital - params.initialCapital;
                  const profitPercentageTotal = params.initialCapital === 0 ? 0 : (totalProfit / params.initialCapital) * 100;
                  
                  const gainTrades = tradePairsFiltered.filter(pair => pair.close.profit > 0);
                  const lossTrades = tradePairsFiltered.filter(pair => pair.close.profit < 0);
                  
                  const averageGain = gainTrades.length > 0 ? gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0) / gainTrades.length : 0;
                  const averageLoss = lossTrades.length > 0 ? lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close.profit), 0) / lossTrades.length : 0;
                  
                  // Use the 'close' records from pairs for risk calculations
                  const closeRecordsForRisk = tradePairsFiltered.map(pair => pair.close);
                  const maxDrawdown = calculateMaxDrawdown(closeRecordsForRisk, params.initialCapital);
                  const sharpeRatio = calculateSharpeRatio(closeRecordsForRisk, profitPercentageTotal);
                  const sortinoRatio = calculateSortinoRatio(closeRecordsForRisk, profitPercentageTotal);
                  const maxDrawdownValue = (maxDrawdown / 100 * params.initialCapital);
                  const recoveryFactor = maxDrawdownValue !== 0 ? Math.abs(totalProfit / maxDrawdownValue) : (totalProfit > 0 ? Infinity : 0);

                  summaryResult = {
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
                      recoveryFactor
                  };
              } else {
                 // If no trades, ensure final capital is initial capital
                 summaryResult.finalCapital = params.initialCapital;
              }
              return summaryResult;
            }
            // Return base result if no detailed data or history
            return { ...result, tradingDays: 0, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };
          } catch (error) { 
              console.error(`Error processing ${result.assetCode}:`, error); 
              // Return base result structure on error during processing
              return { ...result, tradingDays: 0, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 }; 
          }
        })
      );
      setProgress(95);
      setAnalysisResults(processedResults);
      setProgress(100);
      toast({ title: "Weekly analysis completed", description: "Analysis was completed successfully (Corrected logic)." });
    } catch (error) { console.error("Weekly analysis failed", error); toast({ variant: "destructive", title: "Analysis failed", description: error instanceof Error ? error.message : "Unknown error" }); setProgress(0); }
    finally { setTimeout(() => setIsLoading(false), 500); }
  };

  // viewDetails function - Uses MODIFIED processWeeklyTrades
  const viewDetails = async (assetCode: string) => {
    if (!analysisParams) return;
    
    try {
      setIsLoadingDetails(true);
      setSelectedAsset(assetCode);
      
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
      
      const detailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsWithTable);
      
      // Processa as operações semanais (using MODIFIED logic)
      if (detailedData && detailedData.tradeHistory) {
        // *** Use MODIFIED processWeeklyTrades function ***
        const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
        detailedData.tradeHistory = processedHistory; // Use the unique, corrected history
        detailedData.tradingDays = processedHistory.length;
        
        const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
        
        // Recalcula a evolução do capital based on tradePairs
        if (tradePairsFiltered.length > 0) {
          let currentCapital = paramsWithTable.initialCapital;
          detailedData.capitalEvolution = tradePairsFiltered.map(pair => {
            currentCapital += pair.close.profit;
            return { date: pair.close.date, capital: currentCapital };
          });
          // Add initial capital point
          const firstDate = tradePairsFiltered[0]?.open.date || processedHistory.find(d => d.trade !== '-')?.date || processedHistory[0]?.date || '';
          detailedData.capitalEvolution.unshift({ date: firstDate, capital: paramsWithTable.initialCapital });
          
          // Recalculate risk metrics based on tradePairs
          const finalCapital = currentCapital;
          const totalProfit = finalCapital - paramsWithTable.initialCapital;
          const profitPercentageTotal = paramsWithTable.initialCapital === 0 ? 0 : (totalProfit / paramsWithTable.initialCapital) * 100;
          const closeRecordsForRisk = tradePairsFiltered.map(pair => pair.close);
          detailedData.maxDrawdown = calculateMaxDrawdown(closeRecordsForRisk, paramsWithTable.initialCapital);
          detailedData.sharpeRatio = calculateSharpeRatio(closeRecordsForRisk, profitPercentageTotal);
          detailedData.sortinoRatio = calculateSortinoRatio(closeRecordsForRisk, profitPercentageTotal);
          const maxDrawdownValue = (detailedData.maxDrawdown / 100 * paramsWithTable.initialCapital);
          detailedData.recoveryFactor = maxDrawdownValue !== 0 ? Math.abs(totalProfit / maxDrawdownValue) : (totalProfit > 0 ? Infinity : 0);
        } else {
           // Handle case with no trades
           const firstDate = processedHistory.find(d => d.trade !== '-')?.date || processedHistory[0]?.date || '';
           detailedData.capitalEvolution = [{ date: firstDate, capital: paramsWithTable.initialCapital }];
           detailedData.maxDrawdown = 0; detailedData.sharpeRatio = 0; detailedData.sortinoRatio = 0; detailedData.recoveryFactor = 0;
        }
      } else {
          // Handle case where detailedData or tradeHistory is missing
          detailedData.tradeHistory = [];
          detailedData.tradingDays = 0;
          detailedData.capitalEvolution = [{ date: '', capital: paramsWithTable.initialCapital }];
          detailedData.maxDrawdown = 0; detailedData.sharpeRatio = 0; detailedData.sortinoRatio = 0; detailedData.recoveryFactor = 0;
      }
      
      setDetailedResult(detailedData);
      setShowDetailView(true); 

    } catch (error) {
      console.error("Failed to fetch weekly detailed analysis", error);
      toast({
        variant: "destructive",
        title: "Failed to fetch details",
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
      // Reset state on error
      setShowDetailView(false);
      setDetailedResult(null);
      setSelectedAsset(null);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // updateAnalysis function - Uses MODIFIED processWeeklyTrades
  const updateAnalysis = async (updatedParams: StockAnalysisParams) => {
     if (!selectedAsset || !detailedResult) return; // Ensure selectedAsset and detailedResult exist
     try {
       setIsLoadingDetails(true);
       // Use existing data table name if available
       const currentDataTableName = analysisParams?.dataTableName || detailedResult?.dataTableName;
       let dataTableName = updatedParams.dataTableName || currentDataTableName;
       if (!dataTableName) {
           dataTableName = await api.marketData.getDataTableName(updatedParams.country, updatedParams.stockMarket, updatedParams.assetClass);
       }
       
       if (!dataTableName) throw new Error("Could not determine data table name for update");
       
       const paramsWithTable = { ...updatedParams, dataTableName };

       // Re-fetch or re-use history? Re-fetch for consistency if params change significantly
       // Assuming we need to re-fetch based on potentially new params affecting history needed
       const freshDetailedData = await api.analysis.getDetailedAnalysis(selectedAsset, paramsWithTable);
       
       if (freshDetailedData && freshDetailedData.tradeHistory) {
         // *** Use MODIFIED processWeeklyTrades function ***
         const { processedHistory, tradePairs } = processWeeklyTrades(freshDetailedData.tradeHistory, paramsWithTable);
         freshDetailedData.tradeHistory = processedHistory;
         freshDetailedData.tradingDays = processedHistory.length;
         const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
         
         // Recalculate capital evolution and risk metrics
         if (tradePairsFiltered.length > 0) {
           let currentCapital = paramsWithTable.initialCapital;
           freshDetailedData.capitalEvolution = tradePairsFiltered.map(pair => { currentCapital += pair.close.profit; return { date: pair.close.date, capital: currentCapital }; });
           const firstDate = tradePairsFiltered[0]?.open.date || processedHistory.find(d => d.trade !== '-')?.date || processedHistory[0]?.date || '';
           freshDetailedData.capitalEvolution.unshift({ date: firstDate, capital: paramsWithTable.initialCapital });
           
           const finalCapital = currentCapital;
           const totalProfit = finalCapital - paramsWithTable.initialCapital;
           const profitPercentageTotal = paramsWithTable.initialCapital === 0 ? 0 : (totalProfit / paramsWithTable.initialCapital) * 100;
           const closeRecordsForRisk = tradePairsFiltered.map(pair => pair.close);
           freshDetailedData.maxDrawdown = calculateMaxDrawdown(closeRecordsForRisk, paramsWithTable.initialCapital);
           freshDetailedData.sharpeRatio = calculateSharpeRatio(closeRecordsForRisk, profitPercentageTotal);
           freshDetailedData.sortinoRatio = calculateSortinoRatio(closeRecordsForRisk, profitPercentageTotal);
           const maxDrawdownValue = (freshDetailedData.maxDrawdown / 100 * paramsWithTable.initialCapital);
           freshDetailedData.recoveryFactor = maxDrawdownValue !== 0 ? Math.abs(totalProfit / maxDrawdownValue) : (totalProfit > 0 ? Infinity : 0);
         } else {
           const firstDate = processedHistory.find(d => d.trade !== '-')?.date || processedHistory[0]?.date || '';
           freshDetailedData.capitalEvolution = [{ date: firstDate, capital: paramsWithTable.initialCapital }];
           freshDetailedData.maxDrawdown = 0; freshDetailedData.sharpeRatio = 0; freshDetailedData.sortinoRatio = 0; freshDetailedData.recoveryFactor = 0;
         }
         setDetailedResult(freshDetailedData); // Update result with newly processed data
       } else {
           // Handle case where history is missing after update attempt
           toast({ variant: "destructive", title: "Update Failed", description: "Could not retrieve trade history for update." });
           // Optionally revert to previous detailedResult or clear it
           // setDetailedResult(null); 
       }
       
       setAnalysisParams(paramsWithTable); // Update params state
       toast({ title: "Analysis Updated", description: "Detailed view updated (Corrected logic)." });
     } catch (error) { console.error("Failed to update detailed analysis", error); toast({ variant: "destructive", title: "Update Failed", description: error instanceof Error ? error.message : "Unknown error" }); }
     finally { setIsLoadingDetails(false); }
  };

  // closeDetails function (kept from v2)
  const closeDetails = () => {
    setShowDetailView(false);
    setDetailedResult(null);
    setSelectedAsset(null);
  };

  // --- RETURN JSX - RESTORED from v1 (WeeklyPortfolioPage_corrected.tsx) --- 
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Weekly Portfolio</h1>
      
      {/* Conditional rendering based on showDetailView */} 
      {!showDetailView ? (
        // Main View: Setup Form and Results Table
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
            // Pass analysisResults which now contains corrected summary data
            <ResultsTable results={analysisResults} onViewDetails={viewDetails} />
          )}
        </div>
      ) : (
        // Detail View: Render ONLY if detailedResult and analysisParams exist
        detailedResult && analysisParams && (
          <div className="bg-card p-6 rounded-lg border">
            <StockDetailView
              result={detailedResult} // Pass the validated and re-processed result
              params={analysisParams}
              onClose={closeDetails}
              onUpdateParams={updateAnalysis} // Pass the updated update function
              isLoading={isLoadingDetails} // Pass loading state
            />
          </div>
        )
        // If detailedResult is null or analysisParams is null, this block won't render,
        // effectively showing nothing or the previous view until data is ready.
      )}
    </div>
  );
}

