
import { useState } from "react";
import { StockSetupForm } from "@/components/StockSetupForm";
import { ResultsTable } from "@/components/ResultsTable"; // Ensure this component exists and works
import { StockDetailView } from "@/components/StockDetailView";
import { api } from "@/services/api";
import { AnalysisResult, DetailedResult, StockAnalysisParams, TradeHistoryItem } from "@/types";
import { toast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { 
  isFirstBusinessDayOfWeek, 
  isLastBusinessDayOfWeek, 
} from "@/utils/dateUtils";

// --- Helper Functions (Copied from _corrected_final.tsx) ---
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
  return typeof price === 'number' && !isNaN(price) ? price : 0; 
}

function calculateStopPriceValue(entryPrice: number, params: StockAnalysisParams): number {
  const stopPercent = params.stopPercentage ?? 0;
  if (stopPercent <= 0 || isNaN(entryPrice)) return params.operation === 'buy' ? -Infinity : Infinity;
  return entryPrice * (1 + (params.operation === 'buy' ? -1 : 1) * (stopPercent / 100));
}

function checkStopLossHit(currentDay: TradeHistoryItem, stopPrice: number, operation: string): boolean {
  if (stopPrice === -Infinity || stopPrice === Infinity || isNaN(stopPrice)) return false;
  const low = typeof currentDay.low === 'number' && !isNaN(currentDay.low) ? currentDay.low : -Infinity;
  const high = typeof currentDay.high === 'number' && !isNaN(currentDay.high) ? currentDay.high : Infinity;
  if (operation === 'buy') {
      return low <= stopPrice;
  } else if (operation === 'sell') {
      return high >= stopPrice;
  }
  return false;
}

function calculateProfitLoss(entryPrice: number | undefined, exitPrice: number | undefined, operation: string, lotSize: number | undefined): number {
  if (entryPrice === undefined || exitPrice === undefined || lotSize === undefined || lotSize === 0 || isNaN(entryPrice) || isNaN(exitPrice) || isNaN(lotSize)) return 0;
  return (operation === 'buy' ? exitPrice - entryPrice : entryPrice - exitPrice) * lotSize;
}

// --- Risk Calculation Placeholders (Copied from _corrected_final.tsx) --- 
const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
    if (!trades || trades.length === 0 || isNaN(initialCapital)) return 0;
    let maxDrawdown = 0;
    let peakCapital = initialCapital;
    const capitalHistory = trades.map(t => t.currentCapital).filter(c => typeof c === 'number' && !isNaN(c)) as number[];
    if (capitalHistory.length === 0) return 0;
    peakCapital = Math.max(initialCapital, capitalHistory[0]);
    let currentCapital = peakCapital;
    for (let i = 0; i < capitalHistory.length; i++) {
        currentCapital = capitalHistory[i];
        if (currentCapital > peakCapital) peakCapital = currentCapital;
        const drawdown = peakCapital === 0 ? 0 : (peakCapital - currentCapital) / peakCapital;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    return maxDrawdown * 100;
};
const calculateSharpeRatio = (trades: TradeHistoryItem[], initialCapital: number, finalCapital: number, durationInYears: number): number => {
    if (isNaN(initialCapital) || isNaN(finalCapital) || initialCapital === 0 || durationInYears <= 0) return 0;
    const riskFreeRate = 0.02;
    const totalReturn = (finalCapital - initialCapital) / initialCapital;
    const annualizedReturn = totalReturn >= -1 ? Math.pow(1 + totalReturn, 1 / durationInYears) - 1 : -1;
    const dailyReturns: number[] = [];
    let lastCapital = initialCapital;
    trades.forEach(trade => {
        if (typeof trade.currentCapital === 'number' && !isNaN(trade.currentCapital)) {
            if (lastCapital !== 0) dailyReturns.push((trade.currentCapital - lastCapital) / lastCapital);
            lastCapital = trade.currentCapital;
        }
    });
    if (dailyReturns.length < 2) return 0;
    const meanReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (dailyReturns.length - 1);
    const stdDev = Math.sqrt(variance);
    const annualizationFactor = Math.sqrt(52);
    const annualizedStdDev = stdDev * annualizationFactor;
    if (annualizedStdDev === 0) return 0;
    return (annualizedReturn - riskFreeRate) / annualizedStdDev;
};
const calculateSortinoRatio = (trades: TradeHistoryItem[], initialCapital: number, finalCapital: number, durationInYears: number): number => {
    if (isNaN(initialCapital) || isNaN(finalCapital) || initialCapital === 0 || durationInYears <= 0) return 0;
    const riskFreeRate = 0.02;
    const totalReturn = (finalCapital - initialCapital) / initialCapital;
    const annualizedReturn = totalReturn >= -1 ? Math.pow(1 + totalReturn, 1 / durationInYears) - 1 : -1;
    const dailyReturns: number[] = [];
    let lastCapital = initialCapital;
    trades.forEach(trade => {
        if (typeof trade.currentCapital === 'number' && !isNaN(trade.currentCapital)) {
             if (lastCapital !== 0) dailyReturns.push((trade.currentCapital - lastCapital) / lastCapital);
            lastCapital = trade.currentCapital;
        }
    });
    if (dailyReturns.length < 2) return 0;
    const targetReturnRate = riskFreeRate / 52;
    const negativeReturns = dailyReturns.filter(r => r < targetReturnRate);
    if (negativeReturns.length === 0) return Infinity;
    const downsideVariance = negativeReturns.reduce((sum, r) => sum + Math.pow(r - targetReturnRate, 2), 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);
    const annualizationFactor = Math.sqrt(52);
    const annualizedDownsideDeviation = downsideDeviation * annualizationFactor;
    if (annualizedDownsideDeviation === 0) return Infinity;
    return (annualizedReturn - riskFreeRate) / annualizedDownsideDeviation;
};
// --- End Risk Calculation Placeholders ---

export default function WeeklyPortfolioPage() {
  const [analysisParams, setAnalysisParams] = useState<StockAnalysisParams | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]); // State for summary results
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(null); // State for detailed view data
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false); // Loading state for main analysis
  const [isLoadingDetails, setIsLoadingDetails] = useState(false); // Loading state for details view
  const [progress, setProgress] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false); // Controls visibility of detail view
  const [analysisRunAttempted, setAnalysisRunAttempted] = useState(false); // Track if analysis was run

  // --- processWeeklyTrades_v5 (Keep the existing corrected logic) ---
  const processWeeklyTrades_v5 = (fullHistory: TradeHistoryItem[], params: StockAnalysisParams): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem | null }[] } => {
    // (Existing v5 logic from WeeklyPortfolioPage_corrected_final.tsx remains here)
    // ... (ensure this logic is copied correctly) ...
    if (!fullHistory || fullHistory.length === 0 || !params || isNaN(params.initialCapital)) {
        console.error("Invalid input for processWeeklyTrades_v5", { fullHistory, params });
        return { processedHistory: [], tradePairs: [] };
    }
    const processedHistory: TradeHistoryItem[] = [];
    const tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem | null }[] = [];
    const sortedHistory = [...fullHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let currentCapital = params.initialCapital;
    let activeTrade: TradeHistoryItem | null = null;
    let stopPriceCalculated: number | null = null;
    let entryPriceForProfitCalc: number | undefined = undefined;
    let lotSizeForProfitCalc: number | undefined = undefined;
    let operationForProfitCalc: 'buy' | 'sell' | undefined = undefined;
    let lastCapitalValue = params.initialCapital;
    for (let i = 0; i < sortedHistory.length; i++) {
      const currentDayData = sortedHistory[i];
      const currentDate = new Date(currentDayData.date);
      const previousDayProcessed = processedHistory.length > 0 ? processedHistory[processedHistory.length - 1] : null;
      const currentDay: TradeHistoryItem = {
        ...currentDayData,
        trade: '-', profitLoss: 0,
        currentCapital: previousDayProcessed?.currentCapital ?? params.initialCapital,
        stopPrice: '-', stopTrigger: '-',
        suggestedEntryPrice: undefined, actualPrice: undefined, lotSize: undefined
      };
      if (i === 0) currentDay.currentCapital = params.initialCapital;
      lastCapitalValue = typeof currentDay.currentCapital === 'number' && !isNaN(currentDay.currentCapital) ? currentDay.currentCapital : params.initialCapital;
      const isStartOfWeek = isMondayOrFirstBusinessDay(currentDate);
      const isEndOfWeek = isFridayOrLastBusinessDay(currentDate);
      let tradeClosedThisDay = false;
      if (activeTrade && stopPriceCalculated !== null && operationForProfitCalc) {
        currentDay.stopPrice = stopPriceCalculated;
        currentDay.lotSize = lotSizeForProfitCalc;
        currentDay.trade = operationForProfitCalc === 'buy' ? 'Buy' : 'Sell';
        const stopHit = checkStopLossHit(currentDayData, stopPriceCalculated, operationForProfitCalc);
        if (stopHit) {
          const exitPrice = stopPriceCalculated;
          const profit = calculateProfitLoss(entryPriceForProfitCalc, exitPrice, operationForProfitCalc, lotSizeForProfitCalc);
          currentDay.profitLoss = profit;
          currentDay.currentCapital = lastCapitalValue + profit;
          currentDay.trade = operationForProfitCalc === 'buy' ? 'Buy/Closed' : 'Sell/Closed';
          currentDay.stopTrigger = 'Executed';
          currentDay.actualPrice = exitPrice;
          const pairIndex = tradePairs.findIndex(p => p.open.date === activeTrade!.date);
          if (pairIndex !== -1) tradePairs[pairIndex].close = { ...currentDay };
          activeTrade = null; stopPriceCalculated = null; entryPriceForProfitCalc = undefined; lotSizeForProfitCalc = undefined; operationForProfitCalc = undefined;
          tradeClosedThisDay = true;
        } else if (isEndOfWeek) {
          const exitPrice = typeof currentDayData.exitPrice === 'number' && !isNaN(currentDayData.exitPrice) ? currentDayData.exitPrice : (typeof currentDayData.close === 'number' && !isNaN(currentDayData.close) ? currentDayData.close : undefined);
          if (exitPrice !== undefined) {
              const profit = calculateProfitLoss(entryPriceForProfitCalc, exitPrice, operationForProfitCalc, lotSizeForProfitCalc);
              currentDay.profitLoss = profit;
              currentDay.currentCapital = lastCapitalValue + profit;
              currentDay.trade = 'Closed';
              currentDay.actualPrice = exitPrice;
          } else {
              console.warn(`Could not determine valid exit price for ${currentDayData.date}, closing trade with 0 profit.`);
              currentDay.profitLoss = 0; currentDay.currentCapital = lastCapitalValue;
              currentDay.trade = 'Closed (Error)'; currentDay.actualPrice = undefined;
          }
          currentDay.stopTrigger = '-';
          const pairIndex = tradePairs.findIndex(p => p.open.date === activeTrade!.date);
          if (pairIndex !== -1) tradePairs[pairIndex].close = { ...currentDay };
          activeTrade = null; stopPriceCalculated = null; entryPriceForProfitCalc = undefined; lotSizeForProfitCalc = undefined; operationForProfitCalc = undefined;
          tradeClosedThisDay = true;
        } else {
             currentDay.profitLoss = 0; currentDay.currentCapital = lastCapitalValue; currentDay.stopTrigger = '-';
        }
      }
      if (!activeTrade && isStartOfWeek && !tradeClosedThisDay) {
        const prevDayHistData = findPreviousDayData(sortedHistory, currentDayData.date);
        if (prevDayHistData && typeof prevDayHistData.exitPrice === 'number' && !isNaN(prevDayHistData.exitPrice)) {
          const potentialEntryPrice = prevDayHistData.exitPrice;
          const referencePrice = getReferencePriceValue(prevDayHistData, params.referencePrice);
          if (referencePrice > 0) {
              const entryThreshold = referencePrice * (1 + (params.entryPercentage / 100) * (params.operation === 'buy' ? 1 : -1));
              const meetsEntryCondition = (params.operation === 'buy' && potentialEntryPrice >= entryThreshold) || (params.operation === 'sell' && potentialEntryPrice <= entryThreshold);
              if (meetsEntryCondition) {
                activeTrade = { ...currentDayData };
                stopPriceCalculated = calculateStopPriceValue(potentialEntryPrice, params);
                entryPriceForProfitCalc = potentialEntryPrice;
                const riskAmountPerUnit = Math.abs(potentialEntryPrice - stopPriceCalculated);
                const currentCapitalValid = typeof currentDay.currentCapital === 'number' && !isNaN(currentDay.currentCapital) ? currentDay.currentCapital : params.initialCapital;
                const capitalToRisk = currentCapitalValid * 0.01;
                lotSizeForProfitCalc = riskAmountPerUnit > 0 ? Math.floor(capitalToRisk / riskAmountPerUnit) : 0;
                if (lotSizeForProfitCalc <= 0) lotSizeForProfitCalc = 1;
                operationForProfitCalc = params.operation;
                currentDay.trade = params.operation === 'buy' ? 'Buy' : 'Sell';
                currentDay.suggestedEntryPrice = potentialEntryPrice; currentDay.actualPrice = potentialEntryPrice;
                currentDay.stopPrice = stopPriceCalculated; currentDay.lotSize = lotSizeForProfitCalc;
                currentDay.profitLoss = 0; currentDay.currentCapital = lastCapitalValue; currentDay.stopTrigger = '-';
                tradePairs.push({ open: { ...currentDay }, close: null });
                const stopHitSameDay = checkStopLossHit(currentDayData, stopPriceCalculated, operationForProfitCalc);
                if (stopHitSameDay) {
                  const exitPrice = stopPriceCalculated;
                  const profit = calculateProfitLoss(entryPriceForProfitCalc, exitPrice, operationForProfitCalc, lotSizeForProfitCalc);
                  currentDay.profitLoss = profit; currentDay.currentCapital = lastCapitalValue + profit;
                  currentDay.trade = operationForProfitCalc === 'buy' ? 'Buy/Closed' : 'Sell/Closed';
                  currentDay.stopTrigger = 'Executed'; currentDay.actualPrice = exitPrice;
                  tradePairs[tradePairs.length - 1].close = { ...currentDay };
                  activeTrade = null; stopPriceCalculated = null; entryPriceForProfitCalc = undefined; lotSizeForProfitCalc = undefined; operationForProfitCalc = undefined;
                  tradeClosedThisDay = true;
                }
              } else { currentDay.profitLoss = 0; currentDay.currentCapital = lastCapitalValue; currentDay.trade = '-'; }
          } else { currentDay.profitLoss = 0; currentDay.currentCapital = lastCapitalValue; currentDay.trade = '-'; }
        } else { currentDay.profitLoss = 0; currentDay.currentCapital = lastCapitalValue; currentDay.trade = '-'; }
      }
      if (!activeTrade && !tradeClosedThisDay && currentDay.trade === '-') {
          currentDay.profitLoss = 0; currentDay.currentCapital = lastCapitalValue;
      }
      if (typeof currentDay.currentCapital !== 'number' || isNaN(currentDay.currentCapital)) {
          console.warn(`Invalid capital calculated for ${currentDay.date}, using last valid value: ${lastCapitalValue}`);
          currentDay.currentCapital = lastCapitalValue;
      }
      processedHistory.push(currentDay);
      lastCapitalValue = currentDay.currentCapital;
    }
    for (let i = 1; i < processedHistory.length; i++) {
        if (typeof processedHistory[i].currentCapital !== 'number' || isNaN(processedHistory[i].currentCapital)) {
            if (typeof processedHistory[i-1].currentCapital === 'number' && !isNaN(processedHistory[i-1].currentCapital)) {
                processedHistory[i].currentCapital = processedHistory[i-1].currentCapital;
            } else {
                 processedHistory[i].currentCapital = params.initialCapital;
            }
        }
    }
    return { processedHistory, tradePairs };
  };
  // --- End processWeeklyTrades_v5 ---

  // --- runAnalysis (Modified for Button Flow) ---
  const runAnalysis = async (params: StockAnalysisParams) => {
    if (!params || !params.assetCode || !params.country || !params.stockMarket || !params.assetClass || !params.referencePrice || !params.operation || params.initialCapital === null || params.initialCapital === undefined || isNaN(params.initialCapital)) {
        toast({ variant: "destructive", title: "Invalid Parameters", description: "Please ensure all setup fields are correctly filled." });
        return;
    }
    
    setAnalysisRunAttempted(true); // Mark that analysis was attempted
    setIsLoading(true);
    setAnalysisResults([]); // Clear previous summary results
    setDetailedResult(null); // Clear previous detailed results
    setShowDetailView(false); // Hide detail view initially
    setAnalysisParams(params);
    setProgress(0);
    console.info('Running weekly analysis (v5.2 - Button Fix) with params:', params);

    try {
      setProgress(10);
      let dataTableName = params.dataTableName;
      if (!dataTableName) {
          dataTableName = await api.marketData.getDataTableName(params.country, params.stockMarket, params.assetClass);
          if (!dataTableName) throw new Error("Failed to identify data source table name.");
      }
      setProgress(20);
      const paramsWithTable = { ...params, dataTableName };
      setAnalysisParams(paramsWithTable); // Update state with table name
      
      const rawDetailedData = await api.analysis.getDetailedAnalysis(params.assetCode, paramsWithTable);
      if (!rawDetailedData || !rawDetailedData.tradeHistory || rawDetailedData.tradeHistory.length === 0) {
          throw new Error(`No historical data found for ${params.assetCode}.`);
      }
      setProgress(30);

      const { processedHistory, tradePairs } = processWeeklyTrades_v5(rawDetailedData.tradeHistory, paramsWithTable);
      setProgress(80);
      
      if (processedHistory.length === 0) {
          throw new Error("Processing historical data resulted in an empty history.");
      }

      // Calculate overall results
      const closedTrades = tradePairs.filter(pair => pair.close !== null);
      const tradesCount = closedTrades.length;
      let finalCapital = processedHistory[processedHistory.length - 1].currentCapital;
      if (typeof finalCapital !== 'number' || isNaN(finalCapital)) finalCapital = params.initialCapital;
      const initialCapital = params.initialCapital;
      const totalProfit = finalCapital - initialCapital;
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
          const timeDiff = endDate.getTime() - startDate.getTime();
          if (timeDiff > 0) durationInYears = timeDiff / (1000 * 60 * 60 * 24 * 365.25);
          else durationInYears = 1 / 52;
      }
      const maxDrawdown = calculateMaxDrawdown(processedHistory, initialCapital);
      const sharpeRatio = calculateSharpeRatio(processedHistory, initialCapital, finalCapital, durationInYears);
      const sortinoRatio = calculateSortinoRatio(processedHistory, initialCapital, finalCapital, durationInYears);
      const recoveryFactor = maxDrawdown !== 0 && initialCapital !== 0 ? Math.abs(totalProfit / (maxDrawdown / 100 * initialCapital)) : (totalProfit > 0 ? Infinity : 0);

      // Prepare the detailed result object
      const detailedResultPayload: DetailedResult = {
          assetCode: params.assetCode,
          tradeHistory: processedHistory,
          capitalEvolution: processedHistory
              .map(item => ({ date: item.date, capital: item.currentCapital }))
              .filter(item => typeof item.capital === 'number' && !isNaN(item.capital)),
          summary: { 
              assetCode: params.assetCode, tradingDays: processedHistory.length, trades: tradesCount,
              profits: profitsCount, losses: lossesCount, stops: stopsCount,
              initialCapital: initialCapital, finalCapital: finalCapital, profit: totalProfit,
              successRate: tradesCount > 0 ? (profitsCount / tradesCount) * 100 : 0,
              averageGain: averageGain, averageLoss: averageLoss, maxDrawdown: maxDrawdown,
              sharpeRatio: sharpeRatio, sortinoRatio: sortinoRatio, recoveryFactor: recoveryFactor,
          }
      };
      
      // Set BOTH detailed and summary results state
      setDetailedResult(detailedResultPayload);
      // Assuming ResultsTable uses analysisResults, populate it
      if (detailedResultPayload.summary) {
          setAnalysisResults([detailedResultPayload.summary]); 
      }
      
      // *** IMPORTANT: DO NOT automatically show detail view here ***
      // setShowDetailView(true); // REMOVED - Let user click viewDetails

      setProgress(95);
      setProgress(100);
      toast({ title: "Weekly analysis completed", description: "Results are ready below." }); // Updated message

    } catch (error) {
      console.error("Weekly analysis failed", error);
      toast({ variant: "destructive", title: "Analysis failed", description: error instanceof Error ? error.message : "An unknown error occurred." });
      setDetailedResult(null); 
      setAnalysisResults([]); 
    } finally {
      setIsLoading(false); // Stop loading indicator
      // Do not reset analysisRunAttempted here
      setTimeout(() => setIsLoadingDetails(false), 300); // Reset detail loading just in case
    }
  };
  // --- End runAnalysis ---

  // --- viewDetails (Modified to handle potential lack of detailedResult) ---
  const viewDetails = async (assetCode: string) => {
    // If detailedResult is already loaded and matches the asset, just show it
    if (detailedResult && detailedResult.assetCode === assetCode) {
        setShowDetailView(true);
        return;
    }

    // If detailedResult is not ready, try to run analysis again for this specific asset
    // This requires analysisParams to be set from the initial run
    if (analysisParams) {
        console.log(`viewDetails called for ${assetCode}, detailed data not ready. Re-running analysis.`);
        setIsLoadingDetails(true); // Show loading specifically for details
        const assetSpecificParams = { ...analysisParams, assetCode: assetCode }; 
        try {
            // Re-run the core logic of runAnalysis but only set detailedResult and show view
            let dataTableName = assetSpecificParams.dataTableName;
            if (!dataTableName) {
                dataTableName = await api.marketData.getDataTableName(assetSpecificParams.country, assetSpecificParams.stockMarket, assetSpecificParams.assetClass);
                if (!dataTableName) throw new Error("Failed to identify data source table name for details.");
            }
            const paramsWithTable = { ...assetSpecificParams, dataTableName };
            const rawDetailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsWithTable);
            if (!rawDetailedData || !rawDetailedData.tradeHistory || rawDetailedData.tradeHistory.length === 0) {
                throw new Error(`No detailed historical data found for ${assetCode}.`);
            }
            const { processedHistory, tradePairs } = processWeeklyTrades_v5(rawDetailedData.tradeHistory, paramsWithTable);
            if (processedHistory.length === 0) {
                throw new Error("Processing detailed data resulted in an empty history.");
            }
            // Re-calculate summary just for this detailed view if needed, or rely on passed summary
            // For simplicity, we assume the summary is part of the detailed data structure
            // Find the corresponding summary from analysisResults if available
            const summary = analysisResults.find(r => r.assetCode === assetCode);
            const detailedResultPayload: DetailedResult = {
                assetCode: assetCode,
                tradeHistory: processedHistory,
                capitalEvolution: processedHistory
                    .map(item => ({ date: item.date, capital: item.currentCapital }))
                    .filter(item => typeof item.capital === 'number' && !isNaN(item.capital)),
                summary: summary // Attach summary if found
            };
            setDetailedResult(detailedResultPayload);
            setShowDetailView(true); // Now show the view
        } catch (error) {
            console.error(`Error fetching details for ${assetCode}:`, error);
            toast({ variant: "destructive", title: "Failed to load details", description: error instanceof Error ? error.message : "Unknown error" });
            setDetailedResult(null);
            setShowDetailView(false);
        } finally {
            setIsLoadingDetails(false);
        }
    } else {
        toast({ variant: "destructive", title: "Error", description: "Cannot view details without initial analysis context." });
    }
  };
  // --- End viewDetails ---

  // --- handleUpdateParamsFromDetail (Keep existing logic) ---
  const handleUpdateParamsFromDetail = (newParams: StockAnalysisParams) => {
      if (analysisParams) {
          const updatedFullParams: StockAnalysisParams = { 
              ...analysisParams, 
              referencePrice: newParams.referencePrice,
              entryPercentage: newParams.entryPercentage,
              stopPercentage: newParams.stopPercentage,
              initialCapital: newParams.initialCapital,
              assetCode: analysisParams.assetCode, 
              dataTableName: analysisParams.dataTableName 
          };
          runAnalysis(updatedFullParams); // Re-run analysis
      } else {
          toast({ variant: "destructive", title: "Error", description: "Cannot update parameters." });
      }
  };
  // --- End handleUpdateParamsFromDetail ---

  // --- JSX Structure (Restored Layout & Corrected Conditional Rendering) --- 
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
      
      {/* Show ResultsTable OR StockDetailView OR No Results Message */} 
      {!isLoading && analysisRunAttempted && (
          <> {/* Fragment to group conditional outputs */} 
              {showDetailView && detailedResult && analysisParams ? (
                  // Show Detail View when requested and data is ready
                  <StockDetailView 
                      result={detailedResult} 
                      params={{...analysisParams, interval: 'weekly'}}
                      onUpdateParams={handleUpdateParamsFromDetail} 
                      onClose={() => setShowDetailView(false)} // Allow closing detail view
                      isLoading={isLoadingDetails} 
                  />
              ) : analysisResults.length > 0 ? (
                  // Show Summary Results Table if details are not shown and results exist
                  <ResultsTable results={analysisResults} onViewDetails={viewDetails} />
              ) : (
                  // Show No Results Message if analysis ran but yielded no results
                  <p className="text-center text-muted-foreground mt-6">No results found for the specified criteria.</p>
              )}
          </>
      )}
      
      {/* Initial state message (before analysis is run) */}
      {!isLoading && !analysisRunAttempted && (
          <p className="text-center text-muted-foreground mt-6">Enter analysis parameters and click "Show Results".</p>
      )}
    </div>
  );
}

