
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

// --- Helper Functions (Copied from _modified.tsx for v5 logic) ---
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
  // Find based on the original sorted history, not processedHistory during iteration
  const currentDateIndex = history.findIndex(item => item.date === currentDateStr);
  return currentDateIndex > 0 ? history[currentDateIndex - 1] : null;
}

function getReferencePriceValue(day: TradeHistoryItem, referencePriceKey: string): number {
  const price = day[referencePriceKey as keyof TradeHistoryItem];
  // Ensure the price is a valid number, otherwise return 0 or handle appropriately
  return typeof price === 'number' && !isNaN(price) ? price : 0; 
}

function calculateStopPriceValue(entryPrice: number, params: StockAnalysisParams): number {
  const stopPercent = params.stopPercentage ?? 0;
  if (stopPercent <= 0 || isNaN(entryPrice)) return params.operation === 'buy' ? -Infinity : Infinity; // Handle invalid inputs
  return entryPrice * (1 + (params.operation === 'buy' ? -1 : 1) * (stopPercent / 100));
}

function checkStopLossHit(currentDay: TradeHistoryItem, stopPrice: number, operation: string): boolean {
  if (stopPrice === -Infinity || stopPrice === Infinity || isNaN(stopPrice)) return false; // No valid stop set
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

// --- Risk Calculation Placeholders (Copied from _modified.tsx) --- 
const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
    if (!trades || trades.length === 0 || isNaN(initialCapital)) return 0;
    let maxDrawdown = 0;
    let peakCapital = initialCapital;
    // Ensure we only consider days with actual capital figures for drawdown
    const capitalHistory = trades.map(t => t.currentCapital).filter(c => typeof c === 'number' && !isNaN(c)) as number[];
    if (capitalHistory.length === 0) return 0;
    
    peakCapital = Math.max(initialCapital, capitalHistory[0]);
    let currentCapital = peakCapital;

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

const calculateSharpeRatio = (trades: TradeHistoryItem[], initialCapital: number, finalCapital: number, durationInYears: number): number => {
    if (isNaN(initialCapital) || isNaN(finalCapital) || initialCapital === 0 || durationInYears <= 0) return 0;
    const riskFreeRate = 0.02; // Annualized
    const totalReturn = (finalCapital - initialCapital) / initialCapital;
    // Avoid issues with negative bases in Math.pow for fractional exponents
    const annualizedReturn = totalReturn >= -1 ? Math.pow(1 + totalReturn, 1 / durationInYears) - 1 : -1; // Cap loss at -100%
    
    const dailyReturns: number[] = [];
    let lastCapital = initialCapital;
    trades.forEach(trade => {
        if (typeof trade.currentCapital === 'number' && !isNaN(trade.currentCapital)) {
            if (lastCapital !== 0) { 
                dailyReturns.push((trade.currentCapital - lastCapital) / lastCapital);
            }
            lastCapital = trade.currentCapital;
        }
    });

    if (dailyReturns.length < 2) return 0; 

    const meanReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (dailyReturns.length - 1);
    const stdDev = Math.sqrt(variance);
    
    const annualizationFactor = Math.sqrt(52); // For weekly data
    const annualizedStdDev = stdDev * annualizationFactor;

    if (annualizedStdDev === 0) return 0;
    return (annualizedReturn - riskFreeRate) / annualizedStdDev;
};

const calculateSortinoRatio = (trades: TradeHistoryItem[], initialCapital: number, finalCapital: number, durationInYears: number): number => {
    if (isNaN(initialCapital) || isNaN(finalCapital) || initialCapital === 0 || durationInYears <= 0) return 0;
    const riskFreeRate = 0.02; // Annualized
    const totalReturn = (finalCapital - initialCapital) / initialCapital;
    const annualizedReturn = totalReturn >= -1 ? Math.pow(1 + totalReturn, 1 / durationInYears) - 1 : -1;

    const dailyReturns: number[] = [];
    let lastCapital = initialCapital;
    trades.forEach(trade => {
        if (typeof trade.currentCapital === 'number' && !isNaN(trade.currentCapital)) {
             if (lastCapital !== 0) { 
                dailyReturns.push((trade.currentCapital - lastCapital) / lastCapital);
            }
            lastCapital = trade.currentCapital;
        }
    });

    if (dailyReturns.length < 2) return 0;

    const targetReturnRate = riskFreeRate / 52; // Weekly target return
    const negativeReturns = dailyReturns.filter(r => r < targetReturnRate);
    if (negativeReturns.length === 0) return Infinity; 

    const downsideVariance = negativeReturns.reduce((sum, r) => sum + Math.pow(r - targetReturnRate, 2), 0) / negativeReturns.length; 
    const downsideDeviation = Math.sqrt(downsideVariance);
    
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
    if (!fullHistory || fullHistory.length === 0 || !params || isNaN(params.initialCapital)) {
        console.error("Invalid input for processWeeklyTrades_v5", { fullHistory, params });
        return { processedHistory: [], tradePairs: [] };
    }

    const processedHistory: TradeHistoryItem[] = [];
    const tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem | null }[] = [];
    
    const sortedHistory = [...fullHistory].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

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
      // Use the *last entry* in processedHistory for previous day's capital
      const previousDayProcessed = processedHistory.length > 0 ? processedHistory[processedHistory.length - 1] : null; 

      const currentDay: TradeHistoryItem = {
        ...currentDayData,
        trade: '-',
        profitLoss: 0,
        // Crucially, inherit capital from the *last processed day*, not just index i-1
        currentCapital: previousDayProcessed?.currentCapital ?? params.initialCapital, 
        stopPrice: '-',
        stopTrigger: '-',
        suggestedEntryPrice: undefined,
        actualPrice: undefined,
        lotSize: undefined
      };
      
      if (i === 0) {
          currentDay.currentCapital = params.initialCapital;
      }
      // Ensure lastCapitalValue always holds a valid number
      lastCapitalValue = typeof currentDay.currentCapital === 'number' && !isNaN(currentDay.currentCapital) 
                         ? currentDay.currentCapital 
                         : params.initialCapital; 

      const isStartOfWeek = isMondayOrFirstBusinessDay(currentDate);
      const isEndOfWeek = isFridayOrLastBusinessDay(currentDate);
      let tradeClosedThisDay = false;

      // --- Logic for Active Trade --- 
      if (activeTrade && stopPriceCalculated !== null && operationForProfitCalc) {
        currentDay.stopPrice = stopPriceCalculated;
        currentDay.lotSize = lotSizeForProfitCalc;
        currentDay.trade = operationForProfitCalc === 'buy' ? 'Buy' : 'Sell'; // Show Buy/Sell while active
        
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
          
          activeTrade = null;
          stopPriceCalculated = null;
          entryPriceForProfitCalc = undefined;
          lotSizeForProfitCalc = undefined;
          operationForProfitCalc = undefined;
          tradeClosedThisDay = true;
        }
        else if (isEndOfWeek) {
          // Ensure exitPrice is a valid number before calculating profit
          const exitPrice = typeof currentDayData.exitPrice === 'number' && !isNaN(currentDayData.exitPrice) 
                            ? currentDayData.exitPrice 
                            : (typeof currentDayData.close === 'number' && !isNaN(currentDayData.close) ? currentDayData.close : undefined); // Fallback to close price
                            
          if (exitPrice !== undefined) {
              const profit = calculateProfitLoss(entryPriceForProfitCalc, exitPrice, operationForProfitCalc, lotSizeForProfitCalc);
              currentDay.profitLoss = profit;
              currentDay.currentCapital = lastCapitalValue + profit;
              currentDay.trade = 'Closed';
              currentDay.actualPrice = exitPrice;
          } else {
              // Handle case where exit price is invalid - close trade without profit calc? Or log error?
              console.warn(`Could not determine valid exit price for ${currentDayData.date}, closing trade with 0 profit.`);
              currentDay.profitLoss = 0; // Cannot calculate profit
              currentDay.currentCapital = lastCapitalValue; // Capital remains unchanged
              currentDay.trade = 'Closed (Error)'; // Indicate issue
              currentDay.actualPrice = undefined;
          }
          currentDay.stopTrigger = '-';

          const pairIndex = tradePairs.findIndex(p => p.open.date === activeTrade!.date);
          if (pairIndex !== -1) tradePairs[pairIndex].close = { ...currentDay };

          activeTrade = null;
          stopPriceCalculated = null;
          entryPriceForProfitCalc = undefined;
          lotSizeForProfitCalc = undefined;
          operationForProfitCalc = undefined;
          tradeClosedThisDay = true;
        }
        else {
             currentDay.profitLoss = 0;
             currentDay.currentCapital = lastCapitalValue;
             currentDay.stopTrigger = '-';
        }
      }

      // --- Logic for Potentially Starting a New Trade --- 
      if (!activeTrade && isStartOfWeek && !tradeClosedThisDay) {
        // Use original sorted history to find the actual previous day's data
        const prevDayHistData = findPreviousDayData(sortedHistory, currentDayData.date); 
        
        if (prevDayHistData && typeof prevDayHistData.exitPrice === 'number' && !isNaN(prevDayHistData.exitPrice)) {
          const potentialEntryPrice = prevDayHistData.exitPrice;
          const referencePrice = getReferencePriceValue(prevDayHistData, params.referencePrice);
          
          // Ensure referencePrice is valid before calculating threshold
          if (referencePrice > 0) { 
              const entryThreshold = referencePrice * (1 + (params.entryPercentage / 100) * (params.operation === 'buy' ? 1 : -1));
              const meetsEntryCondition = (params.operation === 'buy' && potentialEntryPrice >= entryThreshold) || 
                                        (params.operation === 'sell' && potentialEntryPrice <= entryThreshold);

              if (meetsEntryCondition) {
                activeTrade = { ...currentDayData }; 
                stopPriceCalculated = calculateStopPriceValue(potentialEntryPrice, params);
                entryPriceForProfitCalc = potentialEntryPrice;
                
                // Recalculate Lot Size based on current capital and risk
                const riskAmountPerUnit = Math.abs(potentialEntryPrice - stopPriceCalculated); // Use calculated stop
                // Ensure currentDay.currentCapital is valid before calculating lot size
                const currentCapitalValid = typeof currentDay.currentCapital === 'number' && !isNaN(currentDay.currentCapital) ? currentDay.currentCapital : params.initialCapital;
                const capitalToRisk = currentCapitalValid * 0.01; // Example: Risk 1% of current capital
                lotSizeForProfitCalc = riskAmountPerUnit > 0 ? Math.floor(capitalToRisk / riskAmountPerUnit) : 0;
                if (lotSizeForProfitCalc <= 0) lotSizeForProfitCalc = 1; // Ensure minimum lot size
                
                operationForProfitCalc = params.operation;

                currentDay.trade = params.operation === 'buy' ? 'Buy' : 'Sell';
                currentDay.suggestedEntryPrice = potentialEntryPrice;
                currentDay.actualPrice = potentialEntryPrice;
                currentDay.stopPrice = stopPriceCalculated;
                currentDay.lotSize = lotSizeForProfitCalc;
                currentDay.profitLoss = 0;
                currentDay.currentCapital = lastCapitalValue;
                currentDay.stopTrigger = '-';

                tradePairs.push({ open: { ...currentDay }, close: null });

                const stopHitSameDay = checkStopLossHit(currentDayData, stopPriceCalculated, operationForProfitCalc);
                if (stopHitSameDay) {
                  const exitPrice = stopPriceCalculated;
                  const profit = calculateProfitLoss(entryPriceForProfitCalc, exitPrice, operationForProfitCalc, lotSizeForProfitCalc);
                  
                  currentDay.profitLoss = profit;
                  currentDay.currentCapital = lastCapitalValue + profit;
                  currentDay.trade = operationForProfitCalc === 'buy' ? 'Buy/Closed' : 'Sell/Closed';
                  currentDay.stopTrigger = 'Executed';
                  currentDay.actualPrice = exitPrice;

                  tradePairs[tradePairs.length - 1].close = { ...currentDay };

                  activeTrade = null;
                  stopPriceCalculated = null;
                  entryPriceForProfitCalc = undefined;
                  lotSizeForProfitCalc = undefined;
                  operationForProfitCalc = undefined;
                  tradeClosedThisDay = true;
                }
              } else {
                 currentDay.profitLoss = 0;
                 currentDay.currentCapital = lastCapitalValue;
                 currentDay.trade = '-';
              }
          } else {
              // Invalid reference price, cannot calculate entry threshold
              currentDay.profitLoss = 0;
              currentDay.currentCapital = lastCapitalValue;
              currentDay.trade = '-';
          }
        } else {
             currentDay.profitLoss = 0;
             currentDay.currentCapital = lastCapitalValue;
             currentDay.trade = '-';
        }
      }
      
      if (!activeTrade && !tradeClosedThisDay && currentDay.trade === '-') {
          currentDay.profitLoss = 0;
          currentDay.currentCapital = lastCapitalValue; 
      }

      // Ensure currentCapital is always a number before pushing
      if (typeof currentDay.currentCapital !== 'number' || isNaN(currentDay.currentCapital)) {
          console.warn(`Invalid capital calculated for ${currentDay.date}, using last valid value: ${lastCapitalValue}`);
          currentDay.currentCapital = lastCapitalValue; 
      }
      
      processedHistory.push(currentDay);
      // Update lastCapitalValue *after* pushing the potentially updated currentDay.currentCapital
      lastCapitalValue = currentDay.currentCapital; 
    }
    
    // Final pass to ensure capital continuity if needed (though the logic above should handle it)
    for (let i = 1; i < processedHistory.length; i++) {
        if (typeof processedHistory[i].currentCapital !== 'number' || isNaN(processedHistory[i].currentCapital)) {
            if (typeof processedHistory[i-1].currentCapital === 'number' && !isNaN(processedHistory[i-1].currentCapital)) {
                processedHistory[i].currentCapital = processedHistory[i-1].currentCapital;
            } else {
                 processedHistory[i].currentCapital = params.initialCapital; // Fallback
            }
        }
    }

    return { processedHistory, tradePairs };
  };

  // runAnalysis function (MODIFIED to use processWeeklyTrades_v5)
  const runAnalysis = async (params: StockAnalysisParams) => {
    // Basic validation of params before starting
    if (!params || !params.assetCode || !params.country || !params.stockMarket || !params.assetClass || !params.referencePrice || !params.operation || params.initialCapital === null || params.initialCapital === undefined || isNaN(params.initialCapital)) {
        toast({ variant: "destructive", title: "Invalid Parameters", description: "Please ensure all setup fields are correctly filled." });
        return;
    }
    
    try {
      setIsLoading(true);
      setAnalysisResults([]); // Clear previous summary results
      setDetailedResult(null); // Clear previous detailed results
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false); 
      console.info('Running weekly analysis (v5.1 - Fixes) with params:', params);
      setProgress(10);
      
      // Ensure dataTableName is fetched correctly
      let dataTableName = params.dataTableName;
      if (!dataTableName) {
          dataTableName = await api.marketData.getDataTableName(params.country, params.stockMarket, params.assetClass);
          if (!dataTableName) throw new Error("Failed to identify data source table name.");
      }
      setProgress(20);
      
      const paramsWithTable = { ...params, dataTableName };
      setAnalysisParams(paramsWithTable); // Update state with table name included
      
      // Fetch raw historical data
      // Assuming runAnalysis is for ONE asset specified in the form
      const rawDetailedData = await api.analysis.getDetailedAnalysis(params.assetCode, paramsWithTable);
      if (!rawDetailedData || !rawDetailedData.tradeHistory || rawDetailedData.tradeHistory.length === 0) {
          throw new Error(`No historical data found for ${params.assetCode}. Please check the asset code and selected period.`);
      }
      setProgress(30);

      // Process trades using the corrected v5 logic
      const { processedHistory, tradePairs } = processWeeklyTrades_v5(rawDetailedData.tradeHistory, paramsWithTable);
      setProgress(80);
      
      if (processedHistory.length === 0) {
          throw new Error("Processing historical data resulted in an empty history. Check processing logic.");
      }

      // Calculate overall results based on processedHistory
      const closedTrades = tradePairs.filter(pair => pair.close !== null);
      const tradesCount = closedTrades.length;
      
      // Ensure finalCapital is derived correctly from the last day's processed history
      let finalCapital = processedHistory[processedHistory.length - 1].currentCapital;
      // Fallback if the last day's capital is somehow invalid
      if (typeof finalCapital !== 'number' || isNaN(finalCapital)) {
          console.warn("Last day's capital is invalid, using initial capital as fallback for summary.");
          finalCapital = params.initialCapital;
      }
      
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
          const timeDiff = endDate.getTime() - startDate.getTime();
          if (timeDiff > 0) {
              durationInYears = timeDiff / (1000 * 60 * 60 * 24 * 365.25);
          } else {
              durationInYears = 1 / 52; // Assume at least one week if dates are same or invalid
          }
      }

      const maxDrawdown = calculateMaxDrawdown(processedHistory, initialCapital);
      const sharpeRatio = calculateSharpeRatio(processedHistory, initialCapital, finalCapital, durationInYears);
      const sortinoRatio = calculateSortinoRatio(processedHistory, initialCapital, finalCapital, durationInYears);
      const recoveryFactor = maxDrawdown !== 0 && initialCapital !== 0 ? Math.abs(totalProfit / (maxDrawdown / 100 * initialCapital)) : (totalProfit > 0 ? Infinity : 0);

      // Prepare the detailed result object FIRST
      const detailedResultPayload: DetailedResult = {
          assetCode: params.assetCode,
          tradeHistory: processedHistory, 
          // Ensure capital evolution data is clean
          capitalEvolution: processedHistory
              .map(item => ({ date: item.date, capital: item.currentCapital }))
              .filter(item => typeof item.capital === 'number' && !isNaN(item.capital)),
          summary: { // Populate summary within detailed result if needed by StockDetailView
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
          }
      };
      setDetailedResult(detailedResultPayload);
      
      // Set summary results (can be derived from detailedResultPayload.summary)
      // Assuming ResultsTable only needs a summary, create it here
      const overallResult: AnalysisResult = detailedResultPayload.summary!;
      setAnalysisResults([overallResult]); // Update summary results state

      setShowDetailView(true); // Show the detailed view containing the table

      setProgress(95);
      setProgress(100);
      toast({ title: "Weekly analysis completed", description: "Analysis successful (v5.1 logic)." });
    } catch (error) {
      console.error("Weekly analysis failed", error);
      toast({ variant: "destructive", title: "Analysis failed", description: error instanceof Error ? error.message : "An unknown error occurred during analysis." });
      setProgress(0);
      setDetailedResult(null); 
      setAnalysisResults([]); 
      setShowDetailView(false); // Hide view on error
    } finally {
      // Ensure loading states are reset regardless of success or failure
      setTimeout(() => {
          setIsLoading(false);
          setIsLoadingDetails(false); 
      }, 300); // Shorter delay
    }
  };

  // viewDetails function (Should ideally just show the already processed data)
  // If ResultsTable is used first, this might need to re-fetch/re-process
  const viewDetails = async (assetCode: string) => {
    // If detailedResult is already available for the selected asset, just show it
    if (detailedResult && detailedResult.assetCode === assetCode) {
        setShowDetailView(true);
        return;
    }
    
    // Otherwise, re-run the analysis specifically for this asset
    // This assumes the main runAnalysis might have processed multiple assets (if applicable)
    // Or if the user clicks from a summary table without a full runAnalysis beforehand.
    if (analysisParams) {
        console.log(`viewDetails called for ${assetCode}, re-running analysis.`);
        // Create params specific to this asset if needed, or use existing analysisParams if it's for a single asset run
        const assetSpecificParams = { ...analysisParams, assetCode: assetCode }; 
        await runAnalysis(assetSpecificParams); // Re-run analysis which will set detailedResult and show view
    } else {
        toast({ variant: "destructive", title: "Error", description: "Cannot view details without analysis parameters." });
    }
  };

  // Function to handle parameter updates from StockDetailsTable
  const handleUpdateParamsFromDetail = (newParams: StockAnalysisParams) => {
      if (analysisParams) {
          // Ensure assetCode and other essential identifiers are preserved from the original run
          const updatedFullParams: StockAnalysisParams = { 
              ...analysisParams, // Keep original country, market, asset, dates etc.
              // Overwrite only the parameters that can be changed in the detail view
              referencePrice: newParams.referencePrice,
              entryPercentage: newParams.entryPercentage,
              stopPercentage: newParams.stopPercentage,
              initialCapital: newParams.initialCapital,
              // Preserve the original assetCode and potentially dataTableName
              assetCode: analysisParams.assetCode, 
              dataTableName: analysisParams.dataTableName 
          };
          // Re-run the analysis with the updated parameters
          runAnalysis(updatedFullParams);
      } else {
          toast({ variant: "destructive", title: "Error", description: "Cannot update parameters without initial analysis context." });
      }
  };

  // --- JSX Structure (Restored to Original Layout) --- 
  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <h1 className="text-3xl font-bold mb-6">Weekly Portfolio Analysis</h1>
      
      {/* Use StockSetupForm - Assuming this component contains the original layout */}
      {/* Pass interval='weekly' to ensure correct behavior if form adapts */}
      <StockSetupForm onSubmit={runAnalysis} isLoading={isLoading} interval="weekly" />
      
      {isLoading && (
        <div className="my-6">
          <Progress value={progress} className="w-full" />
          <p className="text-center text-sm text-muted-foreground mt-2">Analyzing... {progress}%</p>
        </div>
      )}
      
      {/* Conditionally display ResultsTable OR StockDetailView */}
      {/* Show ResultsTable ONLY if NOT loading, have results, and detail view is HIDDEN */}
      {/* {!isLoading && analysisResults.length > 0 && !showDetailView && (
        <ResultsTable results={analysisResults} onViewDetails={viewDetails} />
      )} */}
      {/* Hide ResultsTable for now as runAnalysis directly shows StockDetailView */} 
      
      {/* Show StockDetailView if NOT loading details, have detailed result, and view is SHOWN */}
      {!isLoadingDetails && detailedResult && analysisParams && showDetailView && (
        <StockDetailView 
          result={detailedResult} 
          params={{...analysisParams, interval: 'weekly'}} // Pass interval explicitly
          onUpdateParams={handleUpdateParamsFromDetail} 
          onClose={() => setShowDetailView(false)} 
          isLoading={isLoadingDetails} 
        />
      )}
      
      {/* Message when no results are found after a run */}
      {!isLoading && !detailedResult && analysisParams && (
         <p className="text-center text-muted-foreground mt-6">No results found or analysis failed for the specified criteria.</p>
      )}
    </div>
  );
}

