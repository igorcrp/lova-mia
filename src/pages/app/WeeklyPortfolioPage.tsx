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
  const low = typeof currentDay.low === 'number' ? currentDay.low : Infinity; // Use Infinity for comparison if low is missing
  const high = typeof currentDay.high === 'number' ? currentDay.high : -Infinity; // Use -Infinity for comparison if high is missing
  // 5.12.1 Buy: Se “Low” < “Stop Price”
  // 5.12.2 Sell: Se “High” > “Stop Price”
  return operation === 'buy' ? low < stopPrice : high > stopPrice;
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
  // Formula: [(Entry Price - Exit Price) * Lot Size] for Sell
  return (operation === 'buy' ? numExitPrice - numEntryPrice : numEntryPrice - numExitPrice) * lotSize;
}

// Risk Calculation Placeholders (kept from previous version)
const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
    if (!trades || trades.length === 0) return 0;
    let maxDrawdown = 0;
    let peakCapital = initialCapital;
    trades.forEach(trade => {
        const currentCapital = trade.capital;
        if (currentCapital === undefined) return;
        if (currentCapital > peakCapital) peakCapital = currentCapital;
        const drawdown = peakCapital === 0 ? 0 : (peakCapital - currentCapital) / peakCapital;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });
    return maxDrawdown * 100;
};
const calculateVolatility = (trades: TradeHistoryItem[]): number => {
    const profits = trades.map(t => t.profit).filter(p => p !== undefined && p !== 0) as number[];
    if (profits.length < 2) return 0;
    const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
    const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (profits.length - 1);
    return Math.sqrt(variance);
};
const calculateSharpeRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02;
    const volatility = calculateVolatility(trades);
    if (volatility === 0) return 0;
    return (totalReturnPercentage / 100 - riskFreeRate) / volatility;
};
const calculateSortinoRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02;
    const negativeReturns = trades.map(t => t.profit).filter(p => p !== undefined && p < 0) as number[];
    if (negativeReturns.length === 0) return Infinity;
    const meanNegative = 0;
    const downsideVariance = negativeReturns.reduce((sum, p) => sum + Math.pow(p - meanNegative, 2), 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);
    if (downsideDeviation === 0) return Infinity;
    return (totalReturnPercentage / 100 - riskFreeRate) / downsideDeviation;
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

  // --- processWeeklyTrades function - REVISED for v5 --- 
  const processWeeklyTrades = (
    fullHistory: TradeHistoryItem[], 
    params: StockAnalysisParams
  ): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } => {
    
    if (!fullHistory || fullHistory.length === 0) return { processedHistory: [], tradePairs: [] };

    const tradeExecutionHistory: TradeHistoryItem[] = []; // Stores records for days with trade actions (entry or exit)
    const finalTradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] = [];
    const sortedHistory = [...fullHistory].sort((a, b) => new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime());
    let currentCapital = params.initialCapital; // Capital used for Lot Size calculation
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
      let activeTradeEntry: TradeHistoryItem | null = null; // Holds the state *at the time of entry*
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

          if (previousDay && previousDay.close !== undefined) { 
            const refPrice = getReferencePrice(previousDay, params.referencePrice);
            
            // Formula 5.7: Suggested Entry Price
            const suggestedEntryPrice = refPrice * (1 + (params.operation === 'buy' ? -1 : 1) * (params.entryPercentage / 100));
            
            let actualEntryPrice: number | null = null;
            let entryConditionMet = false;

            // Formula 5.9: Check if entry condition is met based on Open/Low (Buy) or Open/High (Sell)
            if (params.operation === 'buy') {
                // 5.9.1 Buy: Se Actual Price <= Suggested Entry ou se low <= Suggested Entry
                // Check if Open or Low reached the suggested price
                if ((currentDayData.open !== undefined && currentDayData.open <= suggestedEntryPrice) || 
                    (currentDayData.low !== undefined && currentDayData.low <= suggestedEntryPrice)) {
                    entryConditionMet = true;
                    // Formula 5.8: Determine Actual Price for Buy
                    // Se o Open <= Suggested Entry, então considera o menor valor (open)
                    if (currentDayData.open !== undefined && currentDayData.open <= suggestedEntryPrice) {
                        actualEntryPrice = currentDayData.open;
                    } else {
                        // If Open didn't trigger but Low did, entry is at Suggested Price
                        actualEntryPrice = suggestedEntryPrice;
                    }
                }
            } else { // Sell Operation
                // 5.9.2 Sell: Se Actual Price >= Suggested Entry ou se High >= Suggested Entry
                // Check if Open or High reached the suggested price
                 if ((currentDayData.open !== undefined && currentDayData.open >= suggestedEntryPrice) || 
                     (currentDayData.high !== undefined && currentDayData.high >= suggestedEntryPrice)) {
                    entryConditionMet = true;
                    // Formula 5.8 (Implied for Sell): Determine Actual Price for Sell
                    // Se o Open >= Suggested Entry, então considera o maior valor (open)
                     if (currentDayData.open !== undefined && currentDayData.open >= suggestedEntryPrice) {
                        actualEntryPrice = currentDayData.open;
                    } else {
                        // If Open didn't trigger but High did, entry is at Suggested Price
                        actualEntryPrice = suggestedEntryPrice;
                    }
                }
            }

            if (entryConditionMet && actualEntryPrice !== null) {
              // Formula 5.10: Lot Size (Based on capital *before* this trade)
              const calculatedLotSize = (currentCapital / actualEntryPrice);
              const lotSize = Math.floor(calculatedLotSize / 10) * 10;
              
              if (lotSize <= 0) { 
                  console.warn(`Skipping entry on ${currentDayData.date}: Lot size is ${lotSize}`);
                  continue; 
              }

              // Formula 5.11: Stop Price
              const calculatedStopPrice = calculateStopPrice(actualEntryPrice, params);
              
              // Create the record for the entry day
              const entryDayRecord: TradeHistoryItem = {
                ...currentDayData, // Include O, H, L, C, V from this day
                trade: (params.operation === 'buy' ? 'Buy' : 'Sell'), // Mark as Buy or Sell
                suggestedEntryPrice: suggestedEntryPrice,
                actualPrice: actualEntryPrice, 
                stopPrice: calculatedStopPrice,
                lotSize: lotSize,
                stop: '-', // Stop not triggered yet
                profit: undefined, // Profit calculated only on close
                capital: undefined // Capital calculated in the final assembly loop
              };
              activeTradeEntry = { ...entryDayRecord }; // Store the state *at the time of entry*
              stopPriceCalculated = entryDayRecord.stopPrice;
              tradeExecutionHistory.push(entryDayRecord); // Record this entry action

              // --- Check for SAME-DAY Stop Loss ---
              if (stopPriceCalculated) {
                 // Formula 5.12: Check Stop Trigger
                 const stopHitToday = checkStopLoss(currentDayData, stopPriceCalculated, params.operation);
                 if (stopHitToday) {
                    const exitPrice = stopPriceCalculated; // Formula 5.13.1 uses Stop Price as Exit
                    // Formula 5.13: Calculate Profit
                    const profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
                    
                    // Update the entry record *already pushed* to reflect the same-day close
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
            
            // Create a new record for the closing day
            const closeRecord: TradeHistoryItem = {
              ...currentDayData, // Include O, H, L, C, V from this day
              trade: 'Closed',
              stop: 'Executed', // Formula 5.12 result
              profit: profit,
              capital: undefined, // Calculated later
              // Carry over entry details for clarity in the record
              suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
              actualPrice: activeTradeEntry.actualPrice, 
              stopPrice: activeTradeEntry.stopPrice,
              lotSize: activeTradeEntry.lotSize,
              exitPrice: exitPrice
            };
            tradeExecutionHistory.push(closeRecord); // Record this Close action
            finalTradePairs.push({ open: { ...activeTradeEntry }, close: { ...closeRecord } });
            activeTradeEntry = null;
            stopPriceCalculated = null;
            closedToday = true;
            stopHitThisWeek = true;
            // Do NOT break here - allow the rest of the week's data to be processed for the final history
          }

          // --- Check Friday/Last Day Close ---
          // Only close on Friday if stop wasn't hit *today*
          if (!closedToday && isFridayOrLastBusinessDay(currentDate)) {
            // Formula 5.13.2 uses Close of the current day as Exit Price
            const exitPrice = typeof currentDayData.close === 'number' ? currentDayData.close : undefined;
            if (exitPrice !== undefined) {
              // Formula 5.13: Calculate Profit
              const profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
              
              // Create a new record for the closing day
              const closeRecord: TradeHistoryItem = {
                ...currentDayData, // Include O, H, L, C, V from this day
                trade: 'Closed',
                stop: '-', // Not closed by stop trigger
                profit: profit,
                capital: undefined, // Calculated later
                 // Carry over entry details for clarity
                suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
                actualPrice: activeTradeEntry.actualPrice,
                stopPrice: activeTradeEntry.stopPrice,
                lotSize: activeTradeEntry.lotSize,
                exitPrice: exitPrice
              };
              tradeExecutionHistory.push(closeRecord); // Record this Close action
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
    let previousDayCapital = params.initialCapital; // Capital at the START of the previous day

    if (sortedHistory.length > 0) {
        const firstDayStr = sortedHistory[0].date;
        const lastDayStr = sortedHistory[sortedHistory.length - 1].date;
        let currentDate = new Date(firstDayStr + 'T00:00:00Z');
        const lastDate = new Date(lastDayStr + 'T00:00:00Z');
        const rawDataMap = new Map(sortedHistory.map(item => [item.date, item]));

        while (currentDate <= lastDate) {
            const currentDateStr = formatDateISO(currentDate);
            const rawDayData = rawDataMap.get(currentDateStr);
            
            if (rawDayData) { 
                const tradeAction = tradeExecutionMap.get(currentDateStr);
                // Profit is ONLY defined in tradeAction if a trade closed on this day
                let dailyProfit = tradeAction?.profit ?? 0; 
                let currentDayEndCapital: number;

                // Formula 5.14: Current Capital Calculation
                if (currentDateStr === firstDayStr) {
                    // First day's capital starts at Initial Capital
                    currentDayEndCapital = params.initialCapital;
                    // If a same-day close happened, add its profit
                    if (tradeAction && (tradeAction.trade === 'Buy/Closed' || tradeAction.trade === 'Sell/Closed')) {
                        currentDayEndCapital += dailyProfit;
                    }
                } else {
                    // Subsequent days start with previous day's *ending* capital
                    currentDayEndCapital = previousDayCapital;
                    // Add profit *if a trade closed today* (Buy/Closed, Sell/Closed, or Closed)
                    if (tradeAction && (tradeAction.trade === 'Buy/Closed' || tradeAction.trade === 'Sell/Closed' || tradeAction.trade === 'Closed')) {
                         currentDayEndCapital += dailyProfit;
                    }
                }
                
                // Build the record to display for this day
                const displayRecord: TradeHistoryItem = {
                    // Start with raw data (includes Open, High, Low, Close, Volume)
                    ...(rawDayData),
                    // Overwrite or add trade action details if they exist for this day
                    date: currentDateStr,
                    trade: tradeAction?.trade ?? '-', // Display 'Buy', 'Sell', 'Closed', 'Buy/Closed', 'Sell/Closed', or '-'
                    suggestedEntryPrice: tradeAction?.suggestedEntryPrice,
                    actualPrice: tradeAction?.actualPrice,
                    lotSize: tradeAction?.lotSize ?? 0,
                    stopPrice: tradeAction?.stopPrice,
                    stop: tradeAction?.stop ?? '-', // Display 'Executed' only if stop triggered the close
                    // Display profit ONLY on the day it occurred (i.e., when tradeAction exists and has profit)
                    profit: tradeAction?.profit, 
                    exitPrice: tradeAction?.exitPrice,
                    capital: currentDayEndCapital, // Capital at the END of this day
                };
                completeHistoryWithCapital.push(displayRecord);
                previousDayCapital = currentDayEndCapital; // Update capital for the next day's calculation
            }
            
            currentDate = addDays(currentDate, 1);
        }
    }

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
      console.info('Running weekly analysis (v5 - Logic Rechecked) with params:', params);
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
              const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
              
              const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
              const trades = tradePairsFiltered.length;
              
              let summaryResult: AnalysisResult = { ...result, tradingDays: processedHistory.length, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };

              if (trades > 0) {
                  const profitsCount = tradePairsFiltered.filter(pair => pair.close.profit > 0).length;
                  const lossesCount = trades - profitsCount;
                  const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;
                  
                  const finalCapital = processedHistory.length > 0 ? processedHistory[processedHistory.length - 1].capital ?? params.initialCapital : params.initialCapital;
                  const totalProfit = finalCapital - params.initialCapital;
                  const profitPercentageTotal = params.initialCapital === 0 ? 0 : (totalProfit / params.initialCapital) * 100;
                  
                  const gainTrades = tradePairsFiltered.filter(pair => pair.close.profit > 0);
                  const lossTrades = tradePairsFiltered.filter(pair => pair.close.profit < 0);
                  const averageGain = gainTrades.length > 0 ? gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0) / gainTrades.length : 0;
                  const averageLoss = lossTrades.length > 0 ? lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close.profit), 0) / lossTrades.length : 0;
                  
                  const closeRecordsForRisk = tradePairsFiltered.map(pair => pair.close);
                  const maxDrawdown = calculateMaxDrawdown(processedHistory, params.initialCapital); 
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
                 summaryResult.finalCapital = params.initialCapital;
                 summaryResult.tradingDays = processedHistory.length;
              }
              return summaryResult;
            }
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
      toast({ title: "Weekly analysis completed", description: "Analysis was completed successfully (v5 logic)." });
    } catch (error) { console.error("Weekly analysis failed", error); toast({ variant: "destructive", title: "Analysis failed", description: error instanceof Error ? error.message : "Unknown error" }); setProgress(0); }
    finally { setTimeout(() => setIsLoading(false), 500); }
  };

  // viewDetails function (uses REVISED processWeeklyTrades)
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
        const { processedHistory, tradePairs } = processWeeklyTrades(rawDetailedData.tradeHistory, paramsWithTable);
        
        rawDetailedData.tradeHistory = processedHistory; 
        rawDetailedData.tradingDays = processedHistory.length; 
        
        const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
        
        if (processedHistory.length > 0) {
            rawDetailedData.capitalEvolution = processedHistory.map(day => ({ 
                date: day.date, 
                capital: day.capital ?? paramsWithTable.initialCapital 
            }));
        } else {
             rawDetailedData.capitalEvolution = [{ date: '', capital: paramsWithTable.initialCapital }];
        }

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

  // updateAnalysis function (uses REVISED processWeeklyTrades via viewDetails)
  const updateAnalysis = async (updatedParams: StockAnalysisParams) => {
     if (!selectedAsset) return;
     console.log("Updating analysis with params:", updatedParams);
     setAnalysisParams(updatedParams); 
     await viewDetails(selectedAsset); 
     toast({ title: "Analysis Updated", description: "Detailed view updated (v5 logic)." });
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
