
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

// Helper functions
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

function findPreviousDayData(history: TradeHistoryItem[], currentDateStr: string): TradeHistoryItem | null {
  const currentDateIndex = history.findIndex(item => item.date === currentDateStr);
  return currentDateIndex > 0 ? history[currentDateIndex - 1] : null;
}

function getReferencePriceValue(day: TradeHistoryItem, referencePriceKey: string): number {
  const price = day[referencePriceKey as keyof TradeHistoryItem];
  return typeof price === 'number' ? price : 0;
}

function calculateStopPriceValue(entryPrice: number, params: StockAnalysisParams): number {
  const stopPercent = params.stopPercentage ?? 0;
  if (stopPercent <= 0) return params.operation === 'buy' ? -Infinity : Infinity; // Avoid division by zero or invalid stops
  return entryPrice * (1 + (params.operation === 'buy' ? -1 : 1) * (stopPercent / 100));
}

function checkStopLossHit(currentDay: TradeHistoryItem, stopPrice: number, operation: string): boolean {
  if (stopPrice === -Infinity || stopPrice === Infinity) return false; // No valid stop set
  const low = typeof currentDay.low === 'number' ? currentDay.low : -Infinity;
  const high = typeof currentDay.high === 'number' ? currentDay.high : Infinity;
  return operation === 'buy' ? low <= stopPrice : high >= stopPrice;
}

function calculateProfitLoss(entryPrice: number | undefined, exitPrice: number | undefined, operation: string, lotSize: number | undefined): number {
  if (entryPrice === undefined || exitPrice === undefined || lotSize === undefined || lotSize === 0) return 0;
  const numEntryPrice = Number(entryPrice);
  const numExitPrice = Number(exitPrice);
  if (isNaN(numEntryPrice) || isNaN(numExitPrice)) return 0;
  // Use a small tolerance for floating point comparisons if needed, but direct calculation is usually fine here.
  return (operation === 'buy' ? numExitPrice - numEntryPrice : numEntryPrice - numExitPrice) * lotSize;
}

// --- Risk Calculation Placeholders (Keep as is) --- 
const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
    if (!trades || trades.length === 0) return 0;
    let maxDrawdown = 0;
    let peakCapital = initialCapital;
    let currentCapital = initialCapital;
    // Ensure we only consider days with actual capital figures for drawdown
    const capitalHistory = trades.map(t => t.currentCapital).filter(c => c !== undefined && c !== null) as number[];
    if (capitalHistory.length === 0) return 0;
    
    peakCapital = Math.max(initialCapital, capitalHistory[0]);
    currentCapital = capitalHistory[0];

    for (let i = 0; i < capitalHistory.length; i++) {
        currentCapital = capitalHistory[i];
        if (currentCapital > peakCapital) {
            peakCapital = currentCapital;
        }
        const drawdown = peakCapital === 0 ? 0 : (peakCapital - currentCapital) / peakCapital;
        if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
        }
    }
    return maxDrawdown * 100; // Percentage
};
const calculateVolatility = (trades: TradeHistoryItem[]): number => {
    // Calculate volatility based on *realized* profits/losses from closed trades
    const profits = trades.map(t => t.profitLoss).filter(p => p !== undefined && p !== null && p !== 0) as number[];
    if (profits.length < 2) return 0;
    const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
    const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (profits.length - 1);
    return Math.sqrt(variance);
};
const calculateSharpeRatio = (trades: TradeHistoryItem[], initialCapital: number, finalCapital: number, durationInYears: number): number => {
    const riskFreeRate = 0.02; // Annualized
    const totalReturn = (finalCapital - initialCapital) / initialCapital;
    const annualizedReturn = Math.pow(1 + totalReturn, 1 / durationInYears) - 1;
    
    // Calculate volatility of daily/weekly returns if possible, otherwise use profit volatility
    const dailyReturns: number[] = [];
    let lastCapital = initialCapital;
    trades.forEach(trade => {
        if (trade.currentCapital !== undefined && trade.currentCapital !== null) {
            if (lastCapital !== 0) { // Avoid division by zero
                dailyReturns.push((trade.currentCapital - lastCapital) / lastCapital);
            }
            lastCapital = trade.currentCapital;
        }
    });

    if (dailyReturns.length < 2) return 0; // Not enough data for volatility

    const meanReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (dailyReturns.length - 1);
    const stdDev = Math.sqrt(variance);
    
    // Annualize standard deviation (approx. sqrt(trading_days_per_year))
    // Assuming ~252 trading days/year, ~52 weeks/year
    const annualizationFactor = Math.sqrt(52); // For weekly data
    const annualizedStdDev = stdDev * annualizationFactor;

    if (annualizedStdDev === 0) return 0;
    return (annualizedReturn - riskFreeRate) / annualizedStdDev;
};
const calculateSortinoRatio = (trades: TradeHistoryItem[], initialCapital: number, finalCapital: number, durationInYears: number): number => {
    const riskFreeRate = 0.02; // Annualized target return (can be adjusted)
    const totalReturn = (finalCapital - initialCapital) / initialCapital;
    const annualizedReturn = Math.pow(1 + totalReturn, 1 / durationInYears) - 1;

    const dailyReturns: number[] = [];
    let lastCapital = initialCapital;
    trades.forEach(trade => {
        if (trade.currentCapital !== undefined && trade.currentCapital !== null) {
             if (lastCapital !== 0) { // Avoid division by zero
                dailyReturns.push((trade.currentCapital - lastCapital) / lastCapital);
            }
            lastCapital = trade.currentCapital;
        }
    });

    if (dailyReturns.length < 2) return 0;

    const targetReturnRate = riskFreeRate / 52; // Weekly target return
    const negativeReturns = dailyReturns.filter(r => r < targetReturnRate);
    if (negativeReturns.length === 0) return Infinity; // No downside deviation

    const downsideVariance = negativeReturns.reduce((sum, r) => sum + Math.pow(r - targetReturnRate, 2), 0) / dailyReturns.length; // Use dailyReturns.length for sample
    const downsideDeviation = Math.sqrt(downsideVariance);
    
    // Annualize downside deviation
    const annualizationFactor = Math.sqrt(52); // For weekly data
    const annualizedDownsideDeviation = downsideDeviation * annualizationFactor;

    if (annualizedDownsideDeviation === 0) return Infinity;
    return (annualizedReturn - riskFreeRate) / annualizedDownsideDeviation;
};
// --- End Risk Calculation Placeholders ---

export default function WeeklyPortfolioPage() {
  const [analysisParams, setAnalysisParams] = useState<StockAnalysisParams | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);

  // Função REFINADA para processar operações semanais (v5 - User Logic)
  const processWeeklyTrades_v5 = (fullHistory: TradeHistoryItem[], params: StockAnalysisParams): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem | null }[] } => {
    if (!fullHistory || fullHistory.length === 0) return { processedHistory: [], tradePairs: [] };

    const processedHistory: TradeHistoryItem[] = [];
    const tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem | null }[] = []; // Close can be null if trade is still open
    
    // 1. Sort history by date ASCENDING
    const sortedHistory = [...fullHistory].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let currentCapital = params.initialCapital;
    let activeTrade: TradeHistoryItem | null = null;
    let stopPriceCalculated: number | null = null;
    let entryPriceForProfitCalc: number | undefined = undefined;
    let lotSizeForProfitCalc: number | undefined = undefined;
    let operationForProfitCalc: 'buy' | 'sell' | undefined = undefined;
    let lastCapitalValue = params.initialCapital; // Track the last known capital

    // 2. Iterate through EACH day in the sorted history
    for (let i = 0; i < sortedHistory.length; i++) {
      const currentDayData = sortedHistory[i];
      const currentDate = new Date(currentDayData.date);
      const previousDayData = i > 0 ? processedHistory[i - 1] : null; // Use processed history for previous day's capital

      // Initialize current day's state based on previous day or initial state
      const currentDay: TradeHistoryItem = {
        ...currentDayData,
        trade: '-', // Default trade status
        profitLoss: 0, // Default profit/loss to 0
        currentCapital: previousDayData?.currentCapital ?? params.initialCapital, // Start with previous day's capital or initial
        stopPrice: '-', // Default stop price display
        stopTrigger: '-', // Default stop trigger display
        suggestedEntryPrice: undefined, // Default suggested entry
        actualPrice: undefined, // Default actual price
        lotSize: undefined // Default lot size
      };
      
      // Set initial capital for the very first day
      if (i === 0) {
          currentDay.currentCapital = params.initialCapital;
      }
      lastCapitalValue = currentDay.currentCapital; // Update last known capital for the start of the day

      const isStartOfWeek = isMondayOrFirstBusinessDay(currentDate);
      const isEndOfWeek = isFridayOrLastBusinessDay(currentDate);
      let tradeClosedThisDay = false;

      // --- Logic for Active Trade --- 
      if (activeTrade && stopPriceCalculated !== null) {
        currentDay.stopPrice = stopPriceCalculated; // Display stop price while trade is active
        currentDay.lotSize = lotSizeForProfitCalc; // Display lot size while trade is active
        currentDay.trade = activeTrade.trade; // Display Buy/Sell while active but not closed
        
        // A. Check for Stop Loss Hit (on days AFTER entry)
        const stopHit = checkStopLossHit(currentDayData, stopPriceCalculated, operationForProfitCalc!);
        if (stopHit) {
          const exitPrice = stopPriceCalculated;
          const profit = calculateProfitLoss(entryPriceForProfitCalc, exitPrice, operationForProfitCalc!, lotSizeForProfitCalc);
          
          currentDay.profitLoss = profit;
          currentDay.currentCapital = lastCapitalValue + profit; // Update capital based on profit
          currentDay.trade = activeTrade.trade === 'Buy' ? 'Buy/Closed' : 'Sell/Closed'; // Mark as closed due to stop
          currentDay.stopTrigger = 'Executed';
          currentDay.actualPrice = exitPrice; // Record the exit price

          // Update the corresponding trade pair
          const pairIndex = tradePairs.findIndex(p => p.open.date === activeTrade!.date);
          if (pairIndex !== -1) tradePairs[pairIndex].close = { ...currentDay };
          
          activeTrade = null; // Reset active trade state
          stopPriceCalculated = null;
          entryPriceForProfitCalc = undefined;
          lotSizeForProfitCalc = undefined;
          operationForProfitCalc = undefined;
          tradeClosedThisDay = true;
        }
        // B. Check for End of Week Closure (if not stopped out)
        else if (isEndOfWeek && !tradeClosedThisDay) {
          const exitPrice = currentDayData.exitPrice; // Close at the day's closing price
          const profit = calculateProfitLoss(entryPriceForProfitCalc, exitPrice, operationForProfitCalc!, lotSizeForProfitCalc);
          
          currentDay.profitLoss = profit;
          currentDay.currentCapital = lastCapitalValue + profit; // Update capital based on profit
          currentDay.trade = 'Closed'; // Mark as closed at end of week
          currentDay.stopTrigger = '-';
          currentDay.actualPrice = exitPrice; // Record the exit price

          // Update the corresponding trade pair
          const pairIndex = tradePairs.findIndex(p => p.open.date === activeTrade!.date);
          if (pairIndex !== -1) tradePairs[pairIndex].close = { ...currentDay };

          activeTrade = null; // Reset active trade state
          stopPriceCalculated = null;
          entryPriceForProfitCalc = undefined;
          lotSizeForProfitCalc = undefined;
          operationForProfitCalc = undefined;
          tradeClosedThisDay = true;
        }
        // C. Trade remains open (not stopped, not end of week)
        else if (!tradeClosedThisDay) {
             currentDay.profitLoss = 0; // No profit/loss realized yet
             currentDay.currentCapital = lastCapitalValue; // Capital remains unchanged from start of day / previous day
             // Keep trade as 'Buy' or 'Sell' (already set above)
             currentDay.stopTrigger = '-'; // Stop not triggered yet
        }
      }

      // --- Logic for Potentially Starting a New Trade --- 
      // Can only start a new trade if no trade is active AND it's the start of the week
      if (!activeTrade && isStartOfWeek && !tradeClosedThisDay) {
        const prevDayHistData = findPreviousDayData(sortedHistory, currentDayData.date);
        if (prevDayHistData && prevDayHistData.exitPrice !== undefined) {
          const potentialEntryPrice = prevDayHistData.exitPrice; // Entry based on previous day's close
          const referencePrice = getReferencePriceValue(prevDayHistData, params.referencePrice);
          const entryThreshold = referencePrice * (1 + (params.entryPercentage / 100) * (params.operation === 'buy' ? 1 : -1));
          const meetsEntryCondition = (params.operation === 'buy' && potentialEntryPrice >= entryThreshold) || 
                                    (params.operation === 'sell' && potentialEntryPrice <= entryThreshold);

          if (meetsEntryCondition) {
            // --- Initiate Trade --- 
            activeTrade = { ...currentDayData }; // Store the original data for the entry day
            stopPriceCalculated = calculateStopPriceValue(potentialEntryPrice, params);
            entryPriceForProfitCalc = potentialEntryPrice;
            // Calculate Lot Size (example: fixed fraction of capital)
            const riskPerTrade = (params.stopPercentage / 100) * potentialEntryPrice;
            const capitalToRisk = currentDay.currentCapital * 0.01; // Example: Risk 1% of capital
            lotSizeForProfitCalc = riskPerTrade > 0 ? Math.floor(capitalToRisk / riskPerTrade) : 0;
            if (lotSizeForProfitCalc <= 0) lotSizeForProfitCalc = 1; // Minimum lot size
            
            operationForProfitCalc = params.operation;

            // Update currentDay state for display
            currentDay.trade = params.operation === 'buy' ? 'Buy' : 'Sell';
            currentDay.suggestedEntryPrice = potentialEntryPrice;
            currentDay.actualPrice = potentialEntryPrice; // Assuming entry at suggested price for this model
            currentDay.stopPrice = stopPriceCalculated;
            currentDay.lotSize = lotSizeForProfitCalc;
            currentDay.profitLoss = 0; // Profit/Loss is 0 on entry day unless stopped same day
            currentDay.currentCapital = lastCapitalValue; // Capital doesn't change on entry day itself
            currentDay.stopTrigger = '-';

            // Add to trade pairs
            tradePairs.push({ open: { ...currentDay }, close: null }); // Add open trade

            // --- Check for SAME DAY Stop Loss --- 
            const stopHitSameDay = checkStopLossHit(currentDayData, stopPriceCalculated, operationForProfitCalc!);
            if (stopHitSameDay) {
              const exitPrice = stopPriceCalculated;
              const profit = calculateProfitLoss(entryPriceForProfitCalc, exitPrice, operationForProfitCalc!, lotSizeForProfitCalc);
              
              currentDay.profitLoss = profit;
              currentDay.currentCapital = lastCapitalValue + profit; // Update capital
              currentDay.trade = activeTrade.trade === 'Buy' ? 'Buy/Closed' : 'Sell/Closed';
              currentDay.stopTrigger = 'Executed';
              currentDay.actualPrice = exitPrice;

              // Update the just added trade pair
              tradePairs[tradePairs.length - 1].close = { ...currentDay };

              activeTrade = null; // Reset active trade state immediately
              stopPriceCalculated = null;
              entryPriceForProfitCalc = undefined;
              lotSizeForProfitCalc = undefined;
              operationForProfitCalc = undefined;
              tradeClosedThisDay = true;
            }
          } else {
             // Conditions not met, no trade initiated
             currentDay.profitLoss = 0;
             currentDay.currentCapital = lastCapitalValue;
             currentDay.trade = '-';
          }
        } else {
             // No previous day data, cannot determine entry
             currentDay.profitLoss = 0;
             currentDay.currentCapital = lastCapitalValue;
             currentDay.trade = '-';
        }
      }
      
      // --- If no trade was active and none was started/closed this day --- 
      if (!activeTrade && !tradeClosedThisDay && currentDay.trade === '-') {
          currentDay.profitLoss = 0;
          currentDay.currentCapital = lastCapitalValue; // Capital remains unchanged
      }

      // Add the processed day to the history
      processedHistory.push(currentDay);
      lastCapitalValue = currentDay.currentCapital; // Update last capital for the next iteration
    }
    
    // Final check: Ensure the very first day has the initial capital if it wasn't set
    if (processedHistory.length > 0 && processedHistory[0].currentCapital === undefined) {
        processedHistory[0].currentCapital = params.initialCapital;
    }
    // Ensure subsequent days without trades carry forward the capital correctly
    for (let i = 1; i < processedHistory.length; i++) {
        if (processedHistory[i].currentCapital === undefined) {
            processedHistory[i].currentCapital = processedHistory[i-1].currentCapital;
        }
    }

    return { processedHistory, tradePairs };
  };

  // runAnalysis function (MODIFIED to use processWeeklyTrades_v5)
  const runAnalysis = async (params: StockAnalysisParams) => {
    try {
      setIsLoading(true);
      setAnalysisResults([]);
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false); 
      console.info('Running weekly analysis (v5 - User Logic) with params:', params);
      setProgress(10);
      let dataTableName = params.dataTableName || await api.marketData.getDataTableName(params.country, params.stockMarket, params.assetClass);
      if (!dataTableName) throw new Error("Failed to identify data source");
      setProgress(20);
      const paramsWithTable = { ...params, dataTableName };
      setAnalysisParams(paramsWithTable);
      
      // Fetch raw historical data first
      const rawDetailedData = await api.analysis.getDetailedAnalysis(params.assetCode, paramsWithTable); // Assuming assetCode is in params for single run
      if (!rawDetailedData || !rawDetailedData.tradeHistory) {
          throw new Error(`No historical data found for ${params.assetCode}`);
      }
      setProgress(30);

      // *** Use REFINED v5 processWeeklyTrades function ***
      const { processedHistory, tradePairs } = processWeeklyTrades_v5(rawDetailedData.tradeHistory, paramsWithTable);
      setProgress(80);

      // --- Calculate overall results based on processedHistory and tradePairs ---
      const closedTrades = tradePairs.filter(pair => pair.close !== null);
      const tradesCount = closedTrades.length;
      let finalCapital = processedHistory.length > 0 ? processedHistory[processedHistory.length - 1].currentCapital : params.initialCapital;
      if (finalCapital === undefined || finalCapital === null) finalCapital = params.initialCapital; // Fallback
      
      const initialCapital = params.initialCapital;
      const totalProfit = finalCapital - initialCapital;
      const profitPercentageTotal = initialCapital !== 0 ? (totalProfit / initialCapital) * 100 : 0;
      
      const profitsCount = closedTrades.filter(pair => pair.close!.profitLoss > 0).length;
      const lossesCount = tradesCount - profitsCount;
      const stopsCount = closedTrades.filter(pair => pair.close!.stopTrigger === 'Executed').length;
      
      const gainTrades = closedTrades.filter(pair => pair.close!.profitLoss > 0);
      const lossTrades = closedTrades.filter(pair => pair.close!.profitLoss < 0);
      const averageGain = gainTrades.length > 0 ? gainTrades.reduce((sum, pair) => sum + pair.close!.profitLoss, 0) / gainTrades.length : 0;
      const averageLoss = lossTrades.length > 0 ? lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close!.profitLoss), 0) / lossTrades.length : 0;
      
      // Duration calculation
      let durationInYears = 1;
      if (processedHistory.length > 1) {
          const startDate = new Date(processedHistory[0].date);
          const endDate = new Date(processedHistory[processedHistory.length - 1].date);
          durationInYears = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
          if (durationInYears <= 0) durationInYears = 1; // Avoid division by zero or negative duration
      }

      // Use processedHistory for risk calculations
      const maxDrawdown = calculateMaxDrawdown(processedHistory, initialCapital);
      const sharpeRatio = calculateSharpeRatio(processedHistory, initialCapital, finalCapital, durationInYears);
      const sortinoRatio = calculateSortinoRatio(processedHistory, initialCapital, finalCapital, durationInYears);
      const recoveryFactor = maxDrawdown !== 0 && initialCapital !== 0 ? Math.abs(totalProfit / (maxDrawdown / 100 * initialCapital)) : (totalProfit > 0 ? Infinity : 0);

      const overallResult: AnalysisResult = {
        assetCode: params.assetCode,
        tradingDays: processedHistory.length,
        trades: tradesCount,
        profits: profitsCount,
        losses: lossesCount,
        stops: stopsCount,
        initialCapital: initialCapital,
        finalCapital: finalCapital,
        profit: totalProfit,
        successRate: tradesCount > 0 ? (profitsCount / tradesCount) * 100 : 0,
        averageGain: averageGain,
        averageLoss: averageLoss,
        maxDrawdown: maxDrawdown,
        sharpeRatio: sharpeRatio,
        sortinoRatio: sortinoRatio,
        recoveryFactor: recoveryFactor,
        // Add other fields if needed, ensuring they are calculated correctly
      };
      
      // Update state - Assuming only one asset is analyzed here
      setAnalysisResults([overallResult]); 
      // Prepare detailed result for the table/view
      setDetailedResult({
          assetCode: params.assetCode,
          tradeHistory: processedHistory, // Use the processed history!
          capitalEvolution: processedHistory.map(item => ({ date: item.date, capital: item.currentCapital ?? initialCapital })).filter(item => item.capital !== undefined),
          summary: overallResult // Include summary in detailed view if needed
      });
      setShowDetailView(true); // Show details after processing

      setProgress(95);
      setProgress(100);
      toast({ title: "Weekly analysis completed", description: "Analysis was completed successfully (v5 logic)." });
    } catch (error) {
      console.error("Weekly analysis failed", error);
      toast({ variant: "destructive", title: "Analysis failed", description: error instanceof Error ? error.message : "Unknown error" });
      setProgress(0);
      setDetailedResult(null); // Clear details on error
      setAnalysisResults([]); // Clear results on error
    } finally {
      setTimeout(() => {
          setIsLoading(false);
          setIsLoadingDetails(false); // Ensure details loading is also false
      }, 500);
    }
  };

  // viewDetails function (MODIFIED to use processWeeklyTrades_v5)
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
        throw new Error("Could not determine data table name.");
      }

      // Re-fetch or use cached raw data if available, then re-process
      // For simplicity, let's re-fetch and re-process here
      const detailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsWithTable);
      if (!detailedData || !detailedData.tradeHistory) {
        throw new Error(`No detailed data found for ${assetCode}`);
      }

      // *** Use REFINED v5 processWeeklyTrades function ***
      const { processedHistory, tradePairs } = processWeeklyTrades_v5(detailedData.tradeHistory, paramsWithTable);
      
      // Calculate summary metrics again for consistency (optional, could pass from main results)
      const closedTrades = tradePairs.filter(pair => pair.close !== null);
      const tradesCount = closedTrades.length;
      let finalCapital = processedHistory.length > 0 ? processedHistory[processedHistory.length - 1].currentCapital : params.initialCapital;
      if (finalCapital === undefined || finalCapital === null) finalCapital = params.initialCapital;
      const initialCapital = params.initialCapital;
      const totalProfit = finalCapital - initialCapital;
      const profitPercentageTotal = initialCapital !== 0 ? (totalProfit / initialCapital) * 100 : 0;
      const profitsCount = closedTrades.filter(pair => pair.close!.profitLoss > 0).length;
      const lossesCount = tradesCount - profitsCount;
      const stopsCount = closedTrades.filter(pair => pair.close!.stopTrigger === 'Executed').length;
      const gainTrades = closedTrades.filter(pair => pair.close!.profitLoss > 0);
      const lossTrades = closedTrades.filter(pair => pair.close!.profitLoss < 0);
      const averageGain = gainTrades.length > 0 ? gainTrades.reduce((sum, pair) => sum + pair.close!.profitLoss, 0) / gainTrades.length : 0;
      const averageLoss = lossTrades.length > 0 ? lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close!.profitLoss), 0) / lossTrades.length : 0;
      let durationInYears = 1;
      if (processedHistory.length > 1) {
          const startDate = new Date(processedHistory[0].date);
          const endDate = new Date(processedHistory[processedHistory.length - 1].date);
          durationInYears = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
          if (durationInYears <= 0) durationInYears = 1;
      }
      const maxDrawdown = calculateMaxDrawdown(processedHistory, initialCapital);
      const sharpeRatio = calculateSharpeRatio(processedHistory, initialCapital, finalCapital, durationInYears);
      const sortinoRatio = calculateSortinoRatio(processedHistory, initialCapital, finalCapital, durationInYears);
      const recoveryFactor = maxDrawdown !== 0 && initialCapital !== 0 ? Math.abs(totalProfit / (maxDrawdown / 100 * initialCapital)) : (totalProfit > 0 ? Infinity : 0);

      const summary: AnalysisResult = {
          assetCode: assetCode,
          tradingDays: processedHistory.length,
          trades: tradesCount,
          profits: profitsCount,
          losses: lossesCount,
          stops: stopsCount,
          initialCapital: initialCapital,
          finalCapital: finalCapital,
          profit: totalProfit,
          successRate: tradesCount > 0 ? (profitsCount / tradesCount) * 100 : 0,
          averageGain: averageGain,
          averageLoss: averageLoss,
          maxDrawdown: maxDrawdown,
          sharpeRatio: sharpeRatio,
          sortinoRatio: sortinoRatio,
          recoveryFactor: recoveryFactor,
      };

      setDetailedResult({
        assetCode: assetCode,
        tradeHistory: processedHistory, // Use the processed history
        capitalEvolution: processedHistory.map(item => ({ date: item.date, capital: item.currentCapital ?? initialCapital })).filter(item => item.capital !== undefined),
        summary: summary // Attach summary
      });
      setShowDetailView(true);

    } catch (error) {
      console.error(`Error fetching details for ${assetCode}:`, error);
      toast({ variant: "destructive", title: "Failed to load details", description: error instanceof Error ? error.message : "Unknown error" });
      setDetailedResult(null);
      setShowDetailView(false);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Function to handle parameter updates from StockDetailsTable
  const handleUpdateParamsFromDetail = (newParams: StockAnalysisParams) => {
      // Re-run analysis with updated parameters from the detail view
      // We need the full params object, including assetCode etc.
      // Assuming the detail view only modifies specific fields like percentages/capital
      if (analysisParams) {
          const updatedFullParams = { 
              ...analysisParams, // Keep original country, market, asset, dates etc.
              ...newParams // Overwrite with changes from detail view
          };
          runAnalysis(updatedFullParams);
      } else {
          toast({ variant: "destructive", title: "Error", description: "Cannot update parameters without initial analysis context." });
      }
  };

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <h1 className="text-3xl font-bold mb-6">Weekly Portfolio Analysis</h1>
      
      <StockSetupForm onSubmit={runAnalysis} isLoading={isLoading} interval="weekly" />
      
      {isLoading && (
        <div className="my-6">
          <Progress value={progress} className="w-full" />
          <p className="text-center text-sm text-muted-foreground mt-2">Analyzing... {progress}%</p>
        </div>
      )}
      
      {!isLoading && analysisResults.length > 0 && !showDetailView && (
        <ResultsTable results={analysisResults} onViewDetails={viewDetails} />
      )}
      
      {showDetailView && detailedResult && analysisParams && (
        <StockDetailView 
          result={detailedResult} 
          params={{...analysisParams, interval: 'weekly'}} // Pass interval explicitly
          onUpdateParams={handleUpdateParamsFromDetail} // Use the new handler
          onClose={() => setShowDetailView(false)} 
          isLoading={isLoadingDetails} // Pass loading state for detail view updates
        />
      )}
      
      {!isLoading && analysisResults.length === 0 && analysisParams && (
         <p className="text-center text-muted-foreground mt-6">No results found for the specified criteria.</p>
      )}
    </div>
  );
}

