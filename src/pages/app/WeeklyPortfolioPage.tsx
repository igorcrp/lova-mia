import { useState } from "react";
import { StockSetupForm } from "@/components/StockSetupForm";
import { ResultsTable } from "@/components/ResultsTable";
import { StockDetailView } from "@/components/StockDetailView"; // Assuming this component handles styled trade text
import { api } from "@/services/api";
import { AnalysisResult, DetailedResult, StockAnalysisParams, TradeHistoryItem } from "@/types";
import { toast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { 
  isFirstBusinessDayOfWeek, 
  isLastBusinessDayOfWeek, 
  formatDateISO, // Helper to format date consistently
  addDays // Helper to iterate through dates
} from "@/utils/dateUtils"; 

// Helper functions (getWeekKey, etc. - kept from previous version)
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

// Formula 5.11: Stop Price Calculation
function calculateStopPrice(entryPrice: number, params: StockAnalysisParams): number {
  const stopPercent = params.stopPercentage ?? 0;
  // 5.11.1 Buy: Actual Price – (Actual Price * % Stop)
  // 5.11.2 Sell: Actual Price + (Actual Price * % Stop)
  return entryPrice * (1 + (params.operation === 'buy' ? -1 : 1) * (stopPercent / 100));
}

// Formula 5.12: Check Stop Trigger Condition
function checkStopLoss(currentDay: TradeHistoryItem, stopPrice: number, operation: string): boolean {
  const low = typeof currentDay.low === 'number' ? currentDay.low : -Infinity;
  const high = typeof currentDay.high === 'number' ? currentDay.high : Infinity;
  // 5.12.1 Buy: Se “Low” < “Stop Price” (Using <= for safety)
  // 5.12.2 Sell: Se “High” > “Stop Price” (Using >= for safety)
  return operation === 'buy' ? low <= stopPrice : high >= stopPrice;
}

// Formula 5.13: Profit/Loss Calculation
function calculateProfit(
    entryPrice: number | undefined, 
    exitPrice: number | undefined, 
    operation: string, 
    lotSize: number | undefined
): number {
  if (entryPrice === undefined || exitPrice === undefined || lotSize === undefined || lotSize === 0) return 0;
  const numEntryPrice = Number(entryPrice);
  const numExitPrice = Number(exitPrice);
  if (isNaN(numEntryPrice) || isNaN(numExitPrice)) return 0;
  
  // Formula: [(Exit Price – Entry Price) * Lot Size] for Buy
  // Formula: [(Entry Price - Exit Price) * Lot Size] for Sell (implicitly handled by the subtraction order)
  // Note: Formula 5.13.1 uses Stop Price as Exit Price, 5.13.2 uses Close as Exit Price.
  // The exitPrice parameter passed to this function should be the correct one (Stop or Close).
  return (operation === 'buy' ? numExitPrice - numEntryPrice : numEntryPrice - numExitPrice) * lotSize;
}

// Risk Calculation Placeholders (kept from previous version)
const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
    // Operates on the complete history with capital calculated for each day
    if (!trades || trades.length === 0) return 0;
    let maxDrawdown = 0;
    let peakCapital = initialCapital;
    
    trades.forEach(trade => {
        const currentCapital = trade.capital; // Use the capital calculated per day
        if (currentCapital === undefined) return; // Skip days where capital couldn't be determined

        if (currentCapital > peakCapital) {
            peakCapital = currentCapital;
        }
        const drawdown = peakCapital === 0 ? 0 : (peakCapital - currentCapital) / peakCapital;
        if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
        }
    });
    return maxDrawdown * 100; // Percentage
};
const calculateVolatility = (trades: TradeHistoryItem[]): number => {
    // Uses profit from actual closed trades (tradePairs)
    const profits = trades.map(t => t.profit).filter(p => p !== undefined && p !== 0) as number[]; // Filter out undefined and zero profits
    if (profits.length < 2) return 0;
    const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
    const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (profits.length - 1);
    return Math.sqrt(variance);
};
const calculateSharpeRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02; // Annualized
    const volatility = calculateVolatility(trades); // Volatility of actual trade profits
    if (volatility === 0) return 0;
    // Use overall portfolio return percentage
    return (totalReturnPercentage / 100 - riskFreeRate) / volatility; // Simplified
};
const calculateSortinoRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02;
    // Use only negative profits from actual trades
    const negativeReturns = trades.map(t => t.profit).filter(p => p !== undefined && p < 0) as number[];
    if (negativeReturns.length === 0) return Infinity; // Or 0, depending on convention
    const meanNegative = 0; // Target return (usually risk-free rate, simplified here)
    // Calculate downside deviation only on negative returns
    const downsideVariance = negativeReturns.reduce((sum, p) => sum + Math.pow(p - meanNegative, 2), 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);
    if (downsideDeviation === 0) return Infinity; // Or 0
    // Use overall portfolio return percentage
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

  // --- processWeeklyTrades function - REVISED for v4 --- 
  const processWeeklyTrades = (
    fullHistory: TradeHistoryItem[], 
    params: StockAnalysisParams
  ): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } => {
    
    if (!fullHistory || fullHistory.length === 0) return { processedHistory: [], tradePairs: [] };

    const tradeExecutionHistory: TradeHistoryItem[] = []; // Stores only actual trade actions
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

    // --- Simulate Trade Execution --- 
    Object.keys(tradesByWeek).sort().forEach(weekKey => {
      const weekTrades = tradesByWeek[weekKey];
      let activeTradeEntry: TradeHistoryItem | null = null;
      let stopPriceCalculated: number | null = null;
      let entryAttemptMadeThisWeek = false;
      let stopHitThisWeek = false;

      for (let i = 0; i < weekTrades.length; i++) {
        const currentDayData = weekTrades[i];
        const currentDate = new Date(currentDayData.date + 'T00:00:00Z');
        if (isNaN(currentDate.getTime())) continue;

        // --- Entry Logic (First Business Day) ---
        if (!activeTradeEntry && !entryAttemptMadeThisWeek && !stopHitThisWeek && isMondayOrFirstBusinessDay(currentDate)) {
          entryAttemptMadeThisWeek = true;
          const previousDay = findPreviousDay(sortedHistory, currentDayData.date);

          if (previousDay && previousDay.close !== undefined) { // Use previous day's close as reference price basis
            const refPrice = getReferencePrice(previousDay, params.referencePrice); // Get the actual reference price (e.g., 'close')
            
            // Formula 5.7: Suggested Entry Price
            const suggestedEntryPrice = refPrice * (1 + (params.operation === 'buy' ? -1 : 1) * (params.entryPercentage / 100));
            
            // Formula 5.8: Actual Price (Simplified: using suggested price for now, as rule is unclear for Sell)
            // User rule: "Se o Open <= Suggested Entry, então considera o menor valor (open)" - applies to Buy.
            // For Sell, the equivalent might be "If Open >= Suggested Entry, use Open".
            // Let's use the suggestedEntryPrice as the potential entry for condition check, and refine actual price later if needed.
            const potentialEntryPrice = suggestedEntryPrice; // Using suggested as the trigger point
            let actualEntryPrice = potentialEntryPrice; // Default actual price
            let entryConditionMet = false;

            // Formula 5.9: Trade Execution Condition
            if (params.operation === 'buy') {
                // 5.9.1 Buy: Se Actual Price <= Suggested Entry ou se low <= Suggested Entry
                // Let's check Open and Low against Suggested Entry
                if ((currentDayData.open && currentDayData.open <= suggestedEntryPrice) || (currentDayData.low && currentDayData.low <= suggestedEntryPrice)) {
                    entryConditionMet = true;
                    // Rule 5.8 refinement: If Open <= Suggested, use Open if it's lower
                    if (currentDayData.open && currentDayData.open <= suggestedEntryPrice) {
                        actualEntryPrice = currentDayData.open; // Use Open as actual entry price
                    } else {
                        actualEntryPrice = suggestedEntryPrice; // Otherwise, assume entry at suggested (or low, but using suggested is simpler)
                    }
                }
            } else { // Sell Operation
                // 5.9.2 Sell: Se Actual Price >= Suggested Entry ou se High >= Suggested Entry
                // Let's check Open and High against Suggested Entry
                 if ((currentDayData.open && currentDayData.open >= suggestedEntryPrice) || (currentDayData.high && currentDayData.high >= suggestedEntryPrice)) {
                    entryConditionMet = true;
                    // Equivalent of Rule 5.8 for Sell: If Open >= Suggested, use Open
                     if (currentDayData.open && currentDayData.open >= suggestedEntryPrice) {
                        actualEntryPrice = currentDayData.open; // Use Open as actual entry price
                    } else {
                        actualEntryPrice = suggestedEntryPrice; // Otherwise, assume entry at suggested
                    }
                }
            }

            if (entryConditionMet) {
              // Formula 5.10: Lot Size (Round down to nearest 10)
              const calculatedLotSize = (currentCapital / actualEntryPrice);
              const lotSize = Math.floor(calculatedLotSize / 10) * 10;
              
              if (lotSize <= 0) { // Cannot enter trade if lot size is zero or less
                  console.warn(`Skipping entry on ${currentDayData.date}: Lot size is ${lotSize}`);
                  activeTradeEntry = null; // Ensure no trade is considered active
                  continue; // Skip to next day
              }

              // Formula 5.11: Stop Price
              const calculatedStopPrice = calculateStopPrice(actualEntryPrice, params);
              
              const entryDayRecord: TradeHistoryItem = {
                ...currentDayData, 
                trade: (params.operation === 'buy' ? 'Buy' : 'Sell'), // Set trade type
                suggestedEntryPrice: suggestedEntryPrice,
                actualPrice: actualEntryPrice, // Use determined actual entry price
                stopPrice: calculatedStopPrice,
                lotSize: lotSize,
                stop: '-', // Initial stop status
                profit: undefined, 
                capital: undefined 
              };
              activeTradeEntry = { ...entryDayRecord }; // Store the state when trade was opened
              stopPriceCalculated = entryDayRecord.stopPrice;
              tradeExecutionHistory.push(entryDayRecord); // Record the Buy/Sell action

              // --- Check for SAME-DAY Stop Loss ---
              if (stopPriceCalculated) {
                 // Formula 5.12: Check Stop Trigger
                 const stopHitToday = checkStopLoss(currentDayData, stopPriceCalculated, params.operation);
                 if (stopHitToday) {
                    const exitPrice = stopPriceCalculated; // Formula 5.13.1 uses Stop Price as Exit
                    // Formula 5.13: Calculate Profit
                    const profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
                    
                    // Update the previously pushed entry record for this day
                    const entryIndex = tradeExecutionHistory.length - 1;
                    if (tradeExecutionHistory[entryIndex]?.date === currentDayData.date) {
                        tradeExecutionHistory[entryIndex] = {
                            ...tradeExecutionHistory[entryIndex],
                            trade: `${params.operation === 'buy' ? 'Buy' : 'Sell'}/Closed`, // Mark as Buy/Closed or Sell/Closed
                            stop: 'Executed', // Formula 5.12 result
                            profit: profit, // Record profit for this day
                            exitPrice: exitPrice,
                        };
                         // Create pair for analysis
                        finalTradePairs.push({ open: { ...activeTradeEntry }, close: { ...tradeExecutionHistory[entryIndex] } });
                    } else {
                         console.error("Logic error: Could not find entry record to update for same-day stop.");
                    }
                    activeTradeEntry = null; // Trade is closed
                    stopPriceCalculated = null;
                    stopHitThisWeek = true; // Prevent new entries this week
                 }
              }
            }
          }
        }

        // --- Exit Logic (Subsequent Days) ---
        if (activeTradeEntry && stopPriceCalculated && currentDayData.date !== activeTradeEntry.date) {
          let closedToday = false;
          // --- Check Stop Loss ---
          // Formula 5.12: Check Stop Trigger
          const stopHit = checkStopLoss(currentDayData, stopPriceCalculated, params.operation);
          if (stopHit) {
            const exitPrice = stopPriceCalculated; // Formula 5.13.1 uses Stop Price as Exit
            // Formula 5.13: Calculate Profit
            const profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
            const closeRecord: TradeHistoryItem = {
              ...currentDayData, 
              trade: 'Closed',
              stop: 'Executed', // Formula 5.12 result
              profit: profit,
              capital: undefined, 
              suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
              actualPrice: activeTradeEntry.actualPrice,
              stopPrice: activeTradeEntry.stopPrice,
              lotSize: activeTradeEntry.lotSize,
              exitPrice: exitPrice
            };
            tradeExecutionHistory.push(closeRecord); // Record Close action
            finalTradePairs.push({ open: { ...activeTradeEntry }, close: { ...closeRecord } });
            activeTradeEntry = null;
            stopPriceCalculated = null;
            closedToday = true;
            stopHitThisWeek = true;
            break; // Stop processing week
          }

          // --- Check Friday/Last Day Close ---
          if (!closedToday && isFridayOrLastBusinessDay(currentDate)) {
            // Formula 5.13.2 uses Close of the current day as Exit Price
            const exitPrice = typeof currentDayData.close === 'number' ? currentDayData.close : undefined;
            if (exitPrice !== undefined) {
              // Formula 5.13: Calculate Profit
              const profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
              const closeRecord: TradeHistoryItem = {
                ...currentDayData, 
                trade: 'Closed',
                stop: '-', // Not closed by stop trigger
                profit: profit,
                capital: undefined, 
                suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
                actualPrice: activeTradeEntry.actualPrice,
                stopPrice: activeTradeEntry.stopPrice,
                lotSize: activeTradeEntry.lotSize,
                exitPrice: exitPrice
              };
              tradeExecutionHistory.push(closeRecord); // Record Close action
              finalTradePairs.push({ open: { ...activeTradeEntry }, close: { ...closeRecord } });
              activeTradeEntry = null;
              stopPriceCalculated = null;
              closedToday = true;
            } else { 
              console.warn(`Missing exit price (close) on last business day ${currentDayData.date}`); 
            }
          }
        }
      } // End of week's daily loop
    }); // End of weekly loop

    // --- Generate Full History with Capital Calculation --- 
    const completeHistoryWithCapital: TradeHistoryItem[] = [];
    const tradeExecutionMap = new Map(tradeExecutionHistory.map(item => [item.date, item]));
    let previousDayCapital = params.initialCapital; // Initialize with initial capital

    if (sortedHistory.length > 0) {
        const firstDayStr = sortedHistory[0].date;
        const lastDayStr = sortedHistory[sortedHistory.length - 1].date;
        let currentDate = new Date(firstDayStr + 'T00:00:00Z');
        const lastDate = new Date(lastDayStr + 'T00:00:00Z');
        const rawDataMap = new Map(sortedHistory.map(item => [item.date, item]));

        while (currentDate <= lastDate) {
            const currentDateStr = formatDateISO(currentDate); // Use YYYY-MM-DD format
            const rawDayData = rawDataMap.get(currentDateStr);
            
            // Skip weekends or days not in raw data (e.g., holidays)
            if (rawDayData) { 
                const tradeAction = tradeExecutionMap.get(currentDateStr);
                // Profit is ONLY defined in tradeAction if a trade closed on this day
                let dailyProfit = tradeAction?.profit ?? 0; 
                let currentDayCapital: number;

                // Formula 5.14: Current Capital Calculation
                if (currentDateStr === firstDayStr) {
                    // First day starts with initial capital
                    currentDayCapital = params.initialCapital;
                    // If a same-day close happened, add its profit to the first day's capital
                    if (tradeAction && (tradeAction.trade === 'Buy/Closed' || tradeAction.trade === 'Sell/Closed')) {
                        currentDayCapital += dailyProfit;
                    }
                } else {
                    // Subsequent days start with previous day's capital
                    currentDayCapital = previousDayCapital;
                    // Add profit *if a trade closed today* (Buy/Closed, Sell/Closed, or Closed)
                    if (tradeAction && (tradeAction.trade === 'Buy/Closed' || tradeAction.trade === 'Sell/Closed' || tradeAction.trade === 'Closed')) {
                         currentDayCapital += dailyProfit;
                    }
                }
                
                const displayRecord: TradeHistoryItem = {
                    // Start with raw data (includes Open, High, Low, Close, Volume)
                    ...(rawDayData),
                    // Overwrite with trade action details if they exist for this day
                    date: currentDateStr,
                    trade: tradeAction?.trade ?? '-', // Use the direct trade action string
                    suggestedEntryPrice: tradeAction?.suggestedEntryPrice,
                    actualPrice: tradeAction?.actualPrice,
                    lotSize: tradeAction?.lotSize ?? 0,
                    stopPrice: tradeAction?.stopPrice,
                    stop: tradeAction?.stop ?? '-', // Show 'Executed' only if stop triggered the close
                    // IMPORTANT: Assign profit ONLY if it was calculated for this day's trade action
                    profit: tradeAction?.profit, // Will be undefined if no trade closed today
                    exitPrice: tradeAction?.exitPrice,
                    capital: currentDayCapital, // Calculated capital for the end of this day
                    // Ensure 'close' from rawData is preserved (it's already included via ...rawDayData)
                };
                completeHistoryWithCapital.push(displayRecord);
                previousDayCapital = currentDayCapital; // Update capital for the next day's calculation
            }
            
            // Move to the next day
            currentDate = addDays(currentDate, 1);
        }
    }

    // Use the generated complete history for display
    return { processedHistory: completeHistoryWithCapital, tradePairs: finalTradePairs };
  };

  // runAnalysis function (uses REVISED processWeeklyTrades)
  const runAnalysis = async (params: StockAnalysisParams) => {
    try {
      setIsLoading(true);
      setAnalysisResults([]);
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false);
      console.info('Running weekly analysis (v4 - Sell Logic Corrected) with params:', params);
      setProgress(10);
      let dataTableName = params.dataTableName || await api.marketData.getDataTableName(params.country, params.stockMarket, params.assetClass);
      if (!dataTableName) throw new Error("Failed to identify data source");
      setProgress(20);
      const paramsWithTable = { ...params, dataTableName };
      setAnalysisParams(paramsWithTable);
      const results = await api.analysis.runAnalysis(paramsWithTable, (p) => setProgress(20 + p * 0.7));
      
      // Process results to calculate summary statistics based on tradePairs
      const processedResults = await Promise.all(
        results.map(async (result) => {
          try {
            const detailedData = await api.analysis.getDetailedAnalysis(result.assetCode, paramsWithTable);
            if (detailedData && detailedData.tradeHistory) {
              // Get trade pairs and the full processed history (for drawdown)
              const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
              
              const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
              const trades = tradePairsFiltered.length;
              
              let summaryResult: AnalysisResult = { ...result, tradingDays: processedHistory.length, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };

              if (trades > 0) {
                  const profitsCount = tradePairsFiltered.filter(pair => pair.close.profit > 0).length;
                  const lossesCount = trades - profitsCount;
                  const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;
                  
                  // Final capital based on the last day of the processed history
                  const finalCapital = processedHistory.length > 0 ? processedHistory[processedHistory.length - 1].capital ?? params.initialCapital : params.initialCapital;
                                    
                  const totalProfit = finalCapital - params.initialCapital;
                  const profitPercentageTotal = params.initialCapital === 0 ? 0 : (totalProfit / params.initialCapital) * 100;
                  
                  const gainTrades = tradePairsFiltered.filter(pair => pair.close.profit > 0);
                  const lossTrades = tradePairsFiltered.filter(pair => pair.close.profit < 0);
                  const averageGain = gainTrades.length > 0 ? gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0) / gainTrades.length : 0;
                  const averageLoss = lossTrades.length > 0 ? lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close.profit), 0) / lossTrades.length : 0;
                  
                  // Use close records from pairs for risk calculations (except drawdown)
                  const closeRecordsForRisk = tradePairsFiltered.map(pair => pair.close);
                  // Use the full daily history for drawdown calculation
                  const maxDrawdown = calculateMaxDrawdown(processedHistory, params.initialCapital); 
                  const sharpeRatio = calculateSharpeRatio(closeRecordsForRisk, profitPercentageTotal);
                  const sortinoRatio = calculateSortinoRatio(closeRecordsForRisk, profitPercentageTotal);
                  const maxDrawdownValue = (maxDrawdown / 100 * params.initialCapital);
                  const recoveryFactor = maxDrawdownValue !== 0 ? Math.abs(totalProfit / maxDrawdownValue) : (totalProfit > 0 ? Infinity : 0);

                  summaryResult = {
                      ...result,
                      tradingDays: processedHistory.length, // Total days in processed history
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
                 // If no trades, final capital is initial capital, use length of processed history
                 summaryResult.finalCapital = params.initialCapital;
                 summaryResult.tradingDays = processedHistory.length;
              }
              return summaryResult;
            }
            // Return default if no detailed data
            return { ...result, tradingDays: 0, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };
          } catch (error) { 
              console.error(`Error processing summary for ${result.assetCode}:`, error); 
              return { ...result, tradingDays: 0, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 }; 
          }
        })
      );
      setProgress(95);
      setAnalysisResults(processedResults);
      setProgress(100);
      toast({ title: "Weekly analysis completed", description: "Analysis was completed successfully (v4 logic)." });
    } catch (error) { console.error("Weekly analysis failed", error); toast({ variant: "destructive", title: "Analysis failed", description: error instanceof Error ? error.message : "Unknown error" }); setProgress(0); }
    finally { setTimeout(() => setIsLoading(false), 500); }
  };

  // viewDetails function - Uses REVISED processWeeklyTrades
  const viewDetails = async (assetCode: string) => {
    if (!analysisParams) return;
    
    try {
      setIsLoadingDetails(true);
      setSelectedAsset(assetCode);
      
      const paramsWithTable = analysisParams.dataTableName
        ? analysisParams
        : { ...analysisParams, dataTableName: await api.marketData.getDataTableName(analysisParams.country, analysisParams.stockMarket, analysisParams.assetClass) };
      
      if (!paramsWithTable.dataTableName) throw new Error("Could not determine data table name");
      
      const rawDetailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsWithTable);
      
      if (rawDetailedData && rawDetailedData.tradeHistory) {
        // *** Use REVISED processWeeklyTrades function ***
        const { processedHistory, tradePairs } = processWeeklyTrades(rawDetailedData.tradeHistory, paramsWithTable);
        
        // The processedHistory IS the final history to display
        rawDetailedData.tradeHistory = processedHistory; 
        rawDetailedData.tradingDays = processedHistory.length; 
        
        const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
        
        // Recalculate capital evolution based on the daily capital in processedHistory
        if (processedHistory.length > 0) {
            rawDetailedData.capitalEvolution = processedHistory.map(day => ({ 
                date: day.date, 
                capital: day.capital ?? paramsWithTable.initialCapital 
            }));
        } else {
             rawDetailedData.capitalEvolution = [{ date: '', capital: paramsWithTable.initialCapital }];
        }

        // Calculate risk metrics based on tradePairs and processedHistory (for drawdown)
        if (tradePairsFiltered.length > 0) {
          let finalCapitalFromTrades = paramsWithTable.initialCapital;
          tradePairsFiltered.forEach(pair => { finalCapitalFromTrades += pair.close.profit; });
          const totalProfit = finalCapitalFromTrades - paramsWithTable.initialCapital;
          const profitPercentageTotal = paramsWithTable.initialCapital === 0 ? 0 : (totalProfit / paramsWithTable.initialCapital) * 100;
          const closeRecordsForRisk = tradePairsFiltered.map(pair => pair.close);
          
          rawDetailedData.maxDrawdown = calculateMaxDrawdown(processedHistory, paramsWithTable.initialCapital);
          rawDetailedData.sharpeRatio = calculateSharpeRatio(closeRecordsForRisk, profitPercentageTotal);
          rawDetailedData.sortinoRatio = calculateSortinoRatio(closeRecordsForRisk, profitPercentageTotal);
          const maxDrawdownValue = (rawDetailedData.maxDrawdown / 100 * paramsWithTable.initialCapital);
          rawDetailedData.recoveryFactor = maxDrawdownValue !== 0 ? Math.abs(totalProfit / maxDrawdownValue) : (totalProfit > 0 ? Infinity : 0);
        } else {
           rawDetailedData.maxDrawdown = 0; rawDetailedData.sharpeRatio = 0; rawDetailedData.sortinoRatio = 0; rawDetailedData.recoveryFactor = 0;
        }
        
        setDetailedResult(rawDetailedData); 
        setShowDetailView(true); 

      } else {
          toast({ variant: "destructive", title: "Failed to fetch details", description: "No trade history data found." });
          setDetailedResult(null);
          setShowDetailView(false);
      }

    } catch (error) {
      console.error("Failed to fetch/process weekly detailed analysis", error);
      toast({ variant: "destructive", title: "Failed to fetch details", description: error instanceof Error ? error.message : "An unknown error occurred" });
      setShowDetailView(false);
      setDetailedResult(null);
      setSelectedAsset(null);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // updateAnalysis function - Uses REVISED processWeeklyTrades via viewDetails
  const updateAnalysis = async (updatedParams: StockAnalysisParams) => {
     if (!selectedAsset) return;
     console.log("Updating analysis with params:", updatedParams);
     // Update the main analysis params state first
     setAnalysisParams(updatedParams); 
     // Re-run the detail view logic with new params
     await viewDetails(selectedAsset); // Re-use viewDetails to fetch and process with updated params
     toast({ title: "Analysis Updated", description: "Detailed view updated (v4 logic)." });
  };

  // closeDetails function (kept from v2)
  const closeDetails = () => {
    setShowDetailView(false);
    setDetailedResult(null);
    setSelectedAsset(null);
  };

  // --- RETURN JSX --- 
  // IMPORTANT: The StockDetailView component needs to be modified to apply colors
  // to the 'Trade' column based on its string content.
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

// --- Mock date utils if not available ---
// Ensure these are properly imported or defined
const formatDateISO = (date: Date): string => {
    return date.toISOString().split('T')[0];
};

const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
};

