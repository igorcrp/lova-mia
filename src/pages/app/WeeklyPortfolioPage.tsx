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
  formatDateISO,
  addDays
} from "@/utils/dateUtils"; 

// --- Helper Functions (Formulas Implemented) ---

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

function getReferencePrice(day: TradeHistoryItem | null, referencePriceKey: string): number | undefined {
  if (!day) return undefined;
  const price = day[referencePriceKey as keyof TradeHistoryItem];
  return typeof price === 'number' ? price : undefined;
}

// Formula 5.11: Stop Price Calculation
function calculateStopPrice(entryPrice: number, params: StockAnalysisParams): number {
  const stopPercent = params.stopPercentage ?? 0;
  return entryPrice * (1 + (params.operation === 'buy' ? -1 : 1) * (stopPercent / 100));
}

// Formula 5.12: Check Stop Trigger Condition
function checkStopLoss(currentDay: TradeHistoryItem, stopPrice: number, operation: string): boolean {
  const low = typeof currentDay.low === 'number' ? currentDay.low : Infinity;
  const high = typeof currentDay.high === 'number' ? currentDay.high : -Infinity;
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
  return (operation === 'buy' ? numExitPrice - numEntryPrice : numEntryPrice - numExitPrice) * lotSize;
}

// --- Risk Calculation Placeholders (Keep as is) ---
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

// --- Main Component --- 
export default function WeeklyPortfolioPage() {
  const [analysisParams, setAnalysisParams] = useState<StockAnalysisParams | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);

  // --- processWeeklyTrades function - REVISED v6 --- 
  const processWeeklyTrades = (
    fullHistory: TradeHistoryItem[], 
    params: StockAnalysisParams
  ): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } => {
    
    console.log("Starting processWeeklyTrades v6 with params:", params);
    if (!fullHistory || fullHistory.length === 0) return { processedHistory: [], tradePairs: [] };

    const tradeActions: { [date: string]: Partial<TradeHistoryItem> } = {}; // Store calculated fields for specific dates
    const finalTradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] = [];
    const sortedHistory = [...fullHistory].sort((a, b) => new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime());
    let availableCapital = params.initialCapital; // Capital used for Lot Size calculation, updated after each trade closes
    const tradesByWeek: { [weekKey: string]: TradeHistoryItem[] } = {};

    // Group trades by week
    sortedHistory.forEach(trade => {
      const tradeDate = new Date(trade.date + 'T00:00:00Z');
      if (isNaN(tradeDate.getTime())) { console.warn(`Invalid date: ${trade.date}`); return; }
      const weekKey = getWeekKey(tradeDate);
      if (!tradesByWeek[weekKey]) tradesByWeek[weekKey] = [];
      tradesByWeek[weekKey].push(trade);
    });

    // --- Simulate Trade Execution Week by Week --- 
    Object.keys(tradesByWeek).sort().forEach(weekKey => {
      const weekTrades = tradesByWeek[weekKey];
      let activeTradeEntry: TradeHistoryItem | null = null; // Holds the state *at the time of entry*
      let stopPriceCalculated: number | null = null;
      let entryAttemptMadeThisWeek = false;
      let stopHitThisWeek = false;

      console.log(`Processing ${weekKey}`);

      for (let i = 0; i < weekTrades.length; i++) {
        const currentDayData = weekTrades[i];
        const currentDate = new Date(currentDayData.date + 'T00:00:00Z');
        if (isNaN(currentDate.getTime())) continue;
        const currentDateStr = currentDayData.date;

        console.log(`  Day: ${currentDateStr}, Open: ${currentDayData.open}, High: ${currentDayData.high}, Low: ${currentDayData.low}, Close: ${currentDayData.close}`);

        // --- Entry Logic (Only on First Business Day of the week if no trade active/stopped) ---
        if (!activeTradeEntry && !entryAttemptMadeThisWeek && !stopHitThisWeek && isMondayOrFirstBusinessDay(currentDate)) {
          entryAttemptMadeThisWeek = true;
          console.log(`    Attempting entry on ${currentDateStr}`);
          const previousDay = findPreviousDay(sortedHistory, currentDateStr);
          const refPrice = getReferencePrice(previousDay, params.referencePrice);

          if (previousDay && refPrice !== undefined) { 
            console.log(`    Previous day ${previousDay.date}, Ref Price (${params.referencePrice}): ${refPrice}`);
            
            // Formula 5.7: Suggested Entry Price
            const suggestedEntryPrice = refPrice * (1 + (params.operation === 'buy' ? -1 : 1) * (params.entryPercentage / 100));
            console.log(`    Suggested Entry: ${suggestedEntryPrice.toFixed(4)}`);
            
            let actualEntryPrice: number | null = null;
            let entryConditionMet = false;

            // Formula 5.9: Check Entry Condition
            if (params.operation === 'buy') {
                const openPrice = currentDayData.open;
                const lowPrice = currentDayData.low;
                if ((openPrice !== undefined && openPrice <= suggestedEntryPrice) || 
                    (lowPrice !== undefined && lowPrice <= suggestedEntryPrice)) {
                    entryConditionMet = true;
                    // Formula 5.8: Determine Actual Price for Buy
                    actualEntryPrice = (openPrice !== undefined && openPrice <= suggestedEntryPrice) ? openPrice : suggestedEntryPrice;
                    console.log(`    BUY Entry Condition Met. Open: ${openPrice}, Low: ${lowPrice}. Actual Entry: ${actualEntryPrice.toFixed(4)}`);
                }
            } else { // Sell Operation
                const openPrice = currentDayData.open;
                const highPrice = currentDayData.high;
                 if ((openPrice !== undefined && openPrice >= suggestedEntryPrice) || 
                     (highPrice !== undefined && highPrice >= suggestedEntryPrice)) {
                    entryConditionMet = true;
                    // Formula 5.8 (Implied for Sell): Determine Actual Price for Sell
                    actualEntryPrice = (openPrice !== undefined && openPrice >= suggestedEntryPrice) ? openPrice : suggestedEntryPrice;
                    console.log(`    SELL Entry Condition Met. Open: ${openPrice}, High: ${highPrice}. Actual Entry: ${actualEntryPrice.toFixed(4)}`);
                }
            }

            if (entryConditionMet && actualEntryPrice !== null) {
              // Formula 5.10: Lot Size (Based on *available* capital)
              const calculatedLotSize = (availableCapital / actualEntryPrice);
              const lotSize = Math.floor(calculatedLotSize / 10) * 10;
              console.log(`    Available Capital: ${availableCapital.toFixed(2)}, Calculated Lot Size: ${calculatedLotSize.toFixed(2)}, Final Lot Size: ${lotSize}`);
              
              if (lotSize <= 0) { 
                  console.warn(`    Skipping entry on ${currentDateStr}: Lot size is ${lotSize}`);
                  continue; 
              }

              // Formula 5.11: Stop Price
              const calculatedStopPrice = calculateStopPrice(actualEntryPrice, params);
              console.log(`    Stop Price: ${calculatedStopPrice.toFixed(4)}`);
              
              // Record the entry action
              tradeActions[currentDateStr] = {
                ...tradeActions[currentDateStr], // Keep potential previous parts if any (shouldn't happen here)
                trade: (params.operation === 'buy' ? 'Buy' : 'Sell'),
                suggestedEntryPrice: suggestedEntryPrice,
                actualPrice: actualEntryPrice, 
                stopPrice: calculatedStopPrice,
                lotSize: lotSize,
                stop: '-', 
              };
              
              // Store the state *at the time of entry* for profit calculation later
              activeTradeEntry = { 
                  ...currentDayData, // Base data for the day of entry
                  ...tradeActions[currentDateStr] // Overwrite with calculated entry fields
              } as TradeHistoryItem; 
              stopPriceCalculated = calculatedStopPrice;

              // --- Check for SAME-DAY Stop Loss ---
              if (stopPriceCalculated) {
                 // Formula 5.12: Check Stop Trigger
                 const stopHitToday = checkStopLoss(currentDayData, stopPriceCalculated, params.operation);
                 if (stopHitToday) {
                    console.log(`    SAME-DAY STOP HIT on ${currentDateStr}! Low: ${currentDayData.low}, High: ${currentDayData.high}, Stop: ${stopPriceCalculated}`);
                    const exitPrice = stopPriceCalculated; // Formula 5.13.1 uses Stop Price as Exit
                    // Formula 5.13: Calculate Profit
                    const profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
                    console.log(`    Same-Day Profit: ${profit.toFixed(2)}`);
                    
                    // Update the trade action for this day
                    tradeActions[currentDateStr] = {
                        ...tradeActions[currentDateStr],
                        trade: `${params.operation === 'buy' ? 'Buy' : 'Sell'}/Closed`,
                        stop: 'Executed',
                        profit: profit,
                        exitPrice: exitPrice,
                    };
                    
                    // Create pair for analysis
                    finalTradePairs.push({ 
                        open: { ...activeTradeEntry }, // The state when opened
                        close: { ...currentDayData, ...tradeActions[currentDateStr] } as TradeHistoryItem // State when closed
                    });
                    
                    availableCapital += profit; // Update available capital immediately
                    console.log(`    Capital updated after same-day stop: ${availableCapital.toFixed(2)}`);
                    activeTradeEntry = null; // Trade is closed
                    stopPriceCalculated = null;
                    stopHitThisWeek = true; // Prevent new entries this week
                 }
              }
            } else {
                 console.log(`    Entry condition NOT met for ${currentDateStr}`);
            }
          } else {
              console.log(`    Cannot attempt entry on ${currentDateStr}: No previous day data or ref price.`);
          }
        }

        // --- Exit Logic (Subsequent Days) ---
        if (activeTradeEntry && stopPriceCalculated && currentDateStr !== activeTradeEntry.date) {
          console.log(`    Checking exit for active trade on ${currentDateStr}`);
          let closedToday = false;
          
          // --- Check Stop Loss ---
          // Formula 5.12: Check Stop Trigger
          const stopHit = checkStopLoss(currentDayData, stopPriceCalculated, params.operation);
          if (stopHit) {
            console.log(`    STOP HIT on ${currentDateStr}! Low: ${currentDayData.low}, High: ${currentDayData.high}, Stop: ${stopPriceCalculated}`);
            const exitPrice = stopPriceCalculated; // Formula 5.13.1 uses Stop Price as Exit
            // Formula 5.13: Calculate Profit
            const profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
            console.log(`    Stop Loss Profit: ${profit.toFixed(2)}`);
            
            // Record the close action for this day
            tradeActions[currentDateStr] = {
              trade: 'Closed',
              stop: 'Executed',
              profit: profit,
              // Carry over details from entry for clarity in this record
              suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
              actualPrice: activeTradeEntry.actualPrice, 
              stopPrice: activeTradeEntry.stopPrice,
              lotSize: activeTradeEntry.lotSize,
              exitPrice: exitPrice
            };
            
            finalTradePairs.push({ 
                open: { ...activeTradeEntry }, // State when opened
                close: { ...currentDayData, ...tradeActions[currentDateStr] } as TradeHistoryItem // State when closed
            });
            
            availableCapital += profit; // Update available capital
            console.log(`    Capital updated after stop loss: ${availableCapital.toFixed(2)}`);
            activeTradeEntry = null;
            stopPriceCalculated = null;
            closedToday = true;
            stopHitThisWeek = true;
          }

          // --- Check Friday/Last Day Close ---
          // Only close on Friday if stop wasn't hit *today*
          if (!closedToday && isFridayOrLastBusinessDay(currentDate)) {
            console.log(`    End of week close check on ${currentDateStr}`);
            // Formula 5.13.2 uses Close of the current day as Exit Price
            const exitPrice = typeof currentDayData.close === 'number' ? currentDayData.close : undefined;
            if (exitPrice !== undefined) {
              // Formula 5.13: Calculate Profit
              const profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
              console.log(`    End of Week Profit: ${profit.toFixed(2)}`);
              
              // Record the close action for this day
              tradeActions[currentDateStr] = {
                trade: 'Closed',
                stop: '-', // Not closed by stop trigger
                profit: profit,
                // Carry over details from entry for clarity
                suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
                actualPrice: activeTradeEntry.actualPrice,
                stopPrice: activeTradeEntry.stopPrice,
                lotSize: activeTradeEntry.lotSize,
                exitPrice: exitPrice
              };
              
              finalTradePairs.push({ 
                  open: { ...activeTradeEntry }, // State when opened
                  close: { ...currentDayData, ...tradeActions[currentDateStr] } as TradeHistoryItem // State when closed
              });
              
              availableCapital += profit; // Update available capital
              console.log(`    Capital updated after end-of-week close: ${availableCapital.toFixed(2)}`);
              activeTradeEntry = null;
              stopPriceCalculated = null;
              closedToday = true;
            } else { 
              console.warn(`    Missing exit price (close) on last business day ${currentDateStr}`); 
            }
          }
        } else if (activeTradeEntry && currentDateStr !== activeTradeEntry.date) {
            console.log(`    Trade active from ${activeTradeEntry.date}, but no exit condition met on ${currentDateStr}`);
        }
      } // End of week's daily loop
    }); // End of weekly loop

    // --- Generate Full History with Daily Capital Calculation --- 
    console.log("Generating final history with capital...");
    const completeHistoryWithCapital: TradeHistoryItem[] = [];
    let previousDayEndCapital = params.initialCapital; // Capital at the END of the previous day

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
                const tradeAction = tradeActions[currentDateStr]; // Get calculated actions for this day
                let dailyProfit = tradeAction?.profit ?? 0; 
                let currentDayEndCapital: number;

                // Formula 5.14: Current Capital Calculation
                if (currentDateStr === firstDayStr) {
                    currentDayEndCapital = params.initialCapital;
                    // If a same-day close happened, add its profit
                    if (tradeAction && (tradeAction.trade === 'Buy/Closed' || tradeAction.trade === 'Sell/Closed')) {
                        currentDayEndCapital += dailyProfit;
                    }
                } else {
                    currentDayEndCapital = previousDayEndCapital;
                    // Add profit *if a trade closed today*
                    if (tradeAction && (tradeAction.trade === 'Closed' || tradeAction.trade === 'Buy/Closed' || tradeAction.trade === 'Sell/Closed')) {
                         currentDayEndCapital += dailyProfit;
                    }
                }
                
                // Build the display record for this day
                const displayRecord: TradeHistoryItem = {
                    ...(rawDayData), // Base O, H, L, C, V
                    date: currentDateStr,
                    // --- Fields from tradeAction IF it exists --- 
                    trade: tradeAction?.trade ?? '-',
                    suggestedEntryPrice: tradeAction?.suggestedEntryPrice,
                    actualPrice: tradeAction?.actualPrice,
                    lotSize: tradeAction?.lotSize ?? 0,
                    stopPrice: tradeAction?.stopPrice,
                    stop: tradeAction?.stop ?? '-',
                    // --- Profit ONLY if defined in tradeAction --- 
                    profit: tradeAction?.profit, 
                    exitPrice: tradeAction?.exitPrice,
                    // --- Calculated end-of-day capital --- 
                    capital: currentDayEndCapital,
                };
                completeHistoryWithCapital.push(displayRecord);
                // console.log(`  ${currentDateStr}: Capital Start: ${currentDateStr === firstDayStr ? params.initialCapital.toFixed(2) : previousDayEndCapital.toFixed(2)}, Profit: ${dailyProfit.toFixed(2)}, Capital End: ${currentDayEndCapital.toFixed(2)}, Trade: ${displayRecord.trade}`);
                previousDayEndCapital = currentDayEndCapital; // Update capital for the next day
            }
            
            currentDate = addDays(currentDate, 1);
        }
    }
    console.log("Finished generating final history.");
    return { processedHistory: completeHistoryWithCapital, tradePairs: finalTradePairs };
  };

  // --- runAnalysis, viewDetails, updateAnalysis, closeDetails (Keep as is, they use the revised processWeeklyTrades) ---
  const runAnalysis = async (params: StockAnalysisParams) => {
    try {
      setIsLoading(true);
      setAnalysisResults([]);
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false);
      console.info('Running weekly analysis (v6 - Debugged) with params:', params);
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
                  summaryResult = { ...result, tradingDays: processedHistory.length, trades, profits: profitsCount, losses: lossesCount, stops: stopsCount, finalCapital, profit: totalProfit, successRate: trades > 0 ? (profitsCount / trades) * 100 : 0, averageGain, averageLoss, maxDrawdown, sharpeRatio, sortinoRatio, recoveryFactor };
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
      toast({ title: "Weekly analysis completed", description: "Analysis was completed successfully (v6 logic)." });
    } catch (error) { console.error("Weekly analysis failed", error); toast({ variant: "destructive", title: "Analysis failed", description: error instanceof Error ? error.message : "Unknown error" }); setProgress(0); }
    finally { setTimeout(() => setIsLoading(false), 500); }
  };

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

  const updateAnalysis = async (updatedParams: StockAnalysisParams) => {
     if (!selectedAsset) return;
     console.log("Updating analysis with params:", updatedParams);
     setAnalysisParams(updatedParams); 
     await viewDetails(selectedAsset); 
     toast({ title: "Analysis Updated", description: "Detailed view updated (v6 logic)." });
  };

  const closeDetails = () => {
    setShowDetailView(false);
    setDetailedResult(null);
    setSelectedAsset(null);
  };

  // --- RETURN JSX (Keep as is) --- 
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
const formatDateISO = (date: Date): string => {
    return date.toISOString().split('T')[0];
};

const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
};

