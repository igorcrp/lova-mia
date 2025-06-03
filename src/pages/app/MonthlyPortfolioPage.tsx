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
  isValidPeriodForMonthly,
  formatDateToYYYYMMDD // Assuming this utility exists or needs to be created
} from "@/utils/dateUtils";

// Helper function to get month key (e.g., YYYY-MM)
function getMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
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

// Helper function for rounding to avoid floating point issues
function round(value: number, decimals: number): number {
  if (value === undefined || value === null || isNaN(value)) return 0; // Handle undefined/NaN cases
  return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
}

// Risk Calculation Functions
const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
    const capitalHistory = trades.filter(t => t.capital !== undefined).map(t => t.capital as number);
    if (!capitalHistory || capitalHistory.length === 0) return 0;
    
    let maxDrawdown = 0;
    let peakCapital = initialCapital;
    const evolution = [initialCapital, ...capitalHistory]; 

    evolution.forEach(capitalValue => {
        const currentCapital = capitalValue ?? initialCapital; // Handle potential undefined
        if (currentCapital > peakCapital) {
            peakCapital = currentCapital;
        }
        const drawdown = peakCapital === 0 ? 0 : (peakCapital - currentCapital) / peakCapital;
        if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
        }
    });
    return round(maxDrawdown * 100, 2); // Round result
};

const calculateVolatility = (tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[]): number => {
    const profits = tradePairs.map(pair => pair.close.profitLoss as number).filter(p => p !== undefined);
    if (profits.length < 2) return 0;
    const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
    const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (profits.length - 1);
    return round(Math.sqrt(variance), 2); // Round result
};

const calculateSharpeRatio = (tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02; // Annualized
    const volatility = calculateVolatility(tradePairs);
    if (volatility === 0) return 0;
    return round((totalReturnPercentage / 100 - riskFreeRate) / volatility, 2); // Round result
};

const calculateSortinoRatio = (tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02;
    const negativeReturns = tradePairs.map(pair => pair.close.profitLoss as number).filter(p => p !== undefined && p < 0);
    if (negativeReturns.length === 0) return Infinity; 
    const meanNegative = 0; 
    const downsideVariance = negativeReturns.reduce((sum, p) => sum + Math.pow(p - meanNegative, 2), 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);
    if (downsideDeviation === 0) return Infinity; 
    return round((totalReturnPercentage / 100 - riskFreeRate) / downsideDeviation, 2); // Round result
};

// --- FINAL REVISED Function: Generate Full Daily History (v4) --- 
const generateFullDailyHistory = (
    originalFullHistory: TradeHistoryItem[], 
    processedTradeEvents: TradeHistoryItem[], // Contains Buy/Closed events with calculated profit/loss on the *closing* day
    initialCapital: number
): TradeHistoryItem[] => {
    if (!originalFullHistory || originalFullHistory.length === 0) return [];

    // Ensure history is sorted by date ascendingly (oldest first)
    const sortedOriginal = [...originalFullHistory].sort((a, b) =>
        new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
    );

    // Map to store profit/loss ONLY for the specific day it occurred (closing day)
    const profitLossMap = new Map<string, number>();
    processedTradeEvents.forEach(event => {
        if (event.trade === 'Closed' && event.profitLoss !== undefined) {
            profitLossMap.set(event.date, Number(event.profitLoss));
        }
    });

    // Map to store other display-related trade details (like Buy/Closed status, lot size etc.)
    const tradeDetailsMap = new Map<string, Partial<TradeHistoryItem>>();
     processedTradeEvents.forEach(event => {
        // Store relevant details from Buy/Closed events for display
        tradeDetailsMap.set(event.date, {
            trade: event.trade,
            suggestedEntryPrice: event.suggestedEntryPrice,
            actualPrice: event.actualPrice,
            lotSize: event.lotSize,
            stopPrice: event.stopPrice,
            stop: event.stop,
            // Include exitPrice here if it's needed for display, but it won't overwrite 'close'
            exitPrice: event.exitPrice 
        });
    });

    const displayHistory: TradeHistoryItem[] = [];
    let previousDayCapital = initialCapital; // Initialize for the loop

    for (let i = 0; i < sortedOriginal.length; i++) {
        const currentDayOriginal = sortedOriginal[i];
        const currentDateStr = currentDayOriginal.date;

        // 1. Get Profit/Loss for *this specific day* from the map (defaults to 0)
        const currentDayProfitLoss = profitLossMap.get(currentDateStr) ?? 0;

        // 2. Calculate Current Capital based *strictly* on the formula, applying rounding
        let currentDayCapital: number;
        if (i === 0) {
            // First day (oldest) uses initial capital (no rounding needed yet)
            currentDayCapital = initialCapital;
        } else {
            // Subsequent days: Previous day's capital + current day's profit/loss
            const validPreviousCapital = typeof previousDayCapital === 'number' && !isNaN(previousDayCapital) ? previousDayCapital : initialCapital;
            currentDayCapital = round(validPreviousCapital + currentDayProfitLoss, 2); // Round to 2 decimal places
        }

        // 3. Get other trade details for display if available
        const tradeDetails = tradeDetailsMap.get(currentDateStr);

        // 4. Construct the final record, ensuring original 'close' is preserved
        const dayRecord: TradeHistoryItem = {
            ...currentDayOriginal, // Start with original data (including OHLCV)
            // Explicitly preserve the original close price from the database record
            close: currentDayOriginal.close, 
            // Overwrite with specific trade details for display where applicable
            trade: tradeDetails?.trade ?? '-',
            suggestedEntryPrice: tradeDetails?.suggestedEntryPrice,
            actualPrice: tradeDetails?.actualPrice,
            lotSize: tradeDetails?.lotSize,
            stopPrice: tradeDetails?.stopPrice,
            stop: tradeDetails?.stop ?? '-',
            exitPrice: tradeDetails?.exitPrice, // Keep exitPrice if needed for other logic/display
            // Assign the strictly calculated profit/loss and capital (already rounded)
            profitLoss: currentDayProfitLoss,
            capital: currentDayCapital,      
        };

        // 5. Update previousDayCapital for the *next* iteration (use the rounded value)
        previousDayCapital = currentDayCapital;

        // 6. Add the constructed record to the history array
        displayHistory.push(dayRecord);
    }

    return displayHistory;
};


// --- Main Component --- 
export default function MonthlyPortfolioPage() {
  const [analysisParams, setAnalysisParams] = useState<StockAnalysisParams | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);

  // Function to process trades according to monthly logic (Focuses on identifying trade actions)
  const processMonthlyTrades = (fullHistory: TradeHistoryItem[], params: StockAnalysisParams): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } => {
    // --- This function remains largely the same as v3 --- 
    // It identifies Buy/Sell/Closed events and calculates profit on close.
    // Its output (tradeActionHistory) is used to populate maps in generateFullDailyHistory.
    if (!fullHistory || fullHistory.length === 0) return { processedHistory: [], tradePairs: [] };

    const tradeActionHistory: TradeHistoryItem[] = []; // Stores only Buy/Closed events
    const finalTradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] = [];
    const sortedHistory = [...fullHistory].sort((a, b) =>
      new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
    );
    
    let capitalBeforeCurrentTrade = params.initialCapital;
    let activeTradeEntry: TradeHistoryItem | null = null;
    let stopPriceCalculated: number | null = null;

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
      let entryAttemptMadeThisMonth = false;

      for (let i = 0; i < monthTrades.length; i++) {
        const currentDayData = monthTrades[i];
        const currentDate = new Date(currentDayData.date + 'T00:00:00Z');
        if (isNaN(currentDate.getTime())) continue;

        // --- 1. Attempt Entry ---
        if (!activeTradeEntry && !entryAttemptMadeThisMonth && isFirstBusinessDayOfMonth(currentDate)) {
          entryAttemptMadeThisMonth = true;
          const previousDayOriginal = sortedHistory.find((_, idx, arr) => arr[idx+1]?.date === currentDayData.date);

          if (previousDayOriginal && previousDayOriginal.exitPrice !== undefined) {
            const potentialEntryPrice = previousDayOriginal.exitPrice;
            const referencePrice = getReferencePrice(previousDayOriginal, params.referencePrice);
            const entryThreshold = referencePrice * (1 + (params.entryPercentage / 100) * (params.operation === 'buy' ? 1 : -1));
            const shouldEnter = (params.operation === 'buy' && potentialEntryPrice >= entryThreshold) || (params.operation === 'sell' && potentialEntryPrice <= entryThreshold);

            if (shouldEnter) {
              const lotSize = capitalBeforeCurrentTrade / potentialEntryPrice;
              const stopPrice = calculateStopPrice(potentialEntryPrice, params);
              const entryDayRecord: TradeHistoryItem = {
                ...currentDayData, 
                trade: (params.operation === 'buy' ? 'Buy' : 'Sell'),
                suggestedEntryPrice: potentialEntryPrice,
                actualPrice: potentialEntryPrice,
                stopPrice: stopPrice,
                lotSize: lotSize,
                stop: '-',
                profitLoss: 0, 
                capital: capitalBeforeCurrentTrade 
              };
              activeTradeEntry = entryDayRecord;
              stopPriceCalculated = entryDayRecord.stopPrice;
              tradeActionHistory.push(entryDayRecord); 
            }
          }
        }

        // --- 2. Manage Active Trade ---
        if (activeTradeEntry && stopPriceCalculated && currentDayData.date !== activeTradeEntry.date) {
          let closedToday = false;
          let exitPrice: number | undefined = undefined;
          let profit = 0;
          let closeRecord: TradeHistoryItem | null = null;
          const stopHit = checkStopLoss(currentDayData, stopPriceCalculated, params.operation);

          if (stopHit) {
            exitPrice = stopPriceCalculated;
            profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
            const capitalAfterClose = capitalBeforeCurrentTrade + profit;
            closeRecord = {
              ...currentDayData, 
              trade: 'Closed',
              stop: 'Executed',
              profitLoss: round(profit, 2), // Round profit here
              capital: round(capitalAfterClose, 2), // Round capital here
              suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
              actualPrice: activeTradeEntry.actualPrice,
              stopPrice: activeTradeEntry.stopPrice,
              lotSize: activeTradeEntry.lotSize,
              exitPrice: exitPrice
            };
            closedToday = true;
            capitalBeforeCurrentTrade = capitalAfterClose; // Use unrounded for next calc within this func? Or rounded? Let's use rounded.
            capitalBeforeCurrentTrade = round(capitalAfterClose, 2);

          } else if (isLastBusinessDayOfMonth(currentDate)) {
            exitPrice = typeof currentDayData.exitPrice === 'number' ? currentDayData.exitPrice : undefined; 
            if (exitPrice !== undefined) {
              profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
              const capitalAfterClose = capitalBeforeCurrentTrade + profit;
              closeRecord = {
                ...currentDayData, 
                trade: 'Closed',
                stop: '-',
                profitLoss: round(profit, 2), // Round profit here
                capital: round(capitalAfterClose, 2), // Round capital here
                suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
                actualPrice: activeTradeEntry.actualPrice,
                stopPrice: activeTradeEntry.stopPrice,
                lotSize: activeTradeEntry.lotSize,
                exitPrice: exitPrice
              };
              closedToday = true;
              capitalBeforeCurrentTrade = round(capitalAfterClose, 2); // Use rounded value
            } else {
              console.warn(`Missing exit price (close) on last business day ${currentDayData.date} for active trade.`);
            }
          }

          if (closedToday && closeRecord) {
            tradeActionHistory.push(closeRecord); 
            finalTradePairs.push({ open: activeTradeEntry, close: closeRecord });
            activeTradeEntry = null;
            stopPriceCalculated = null; 
          }
        }
      } // End of day loop
    }); // End of month loop

    return { processedHistory: tradeActionHistory, tradePairs: finalTradePairs }; 
  };

  // --- Analysis Execution --- 
  const runAnalysis = async (params: StockAnalysisParams) => {
    setIsLoading(true);
    setAnalysisResults([]);
    setAnalysisParams(null); 
    setProgress(0);
    setShowDetailView(false);

    try {
      if (!isValidPeriodForMonthly(params.period)) {
        toast({ variant: "default", title: "Period Selection", description: "For monthly analysis, select a period of 2 months or more." });
        // return;
      }
      console.info("Running monthly analysis (v8.1 - Final Fix) with params:", params);
      setProgress(10);
      
      let dataTableName = params.dataTableName || await api.marketData.getDataTableName(params.country, params.stockMarket, params.assetClass);
      if (!dataTableName) throw new Error("Failed to identify data source table name");
      setProgress(20);
      
      const paramsWithTable = { ...params, dataTableName };
      setAnalysisParams(paramsWithTable); 
      
      const results = await api.analysis.runAnalysis(paramsWithTable, (p) => setProgress(20 + p * 0.7));
      
      const processedResults = await Promise.all(
        results.map(async (result) => {
          try {
            const detailedData = await api.analysis.getDetailedAnalysis(result.assetCode, paramsWithTable);
            
            if (detailedData && detailedData.tradeHistory) {
              const { processedHistory: tradeActions, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
              const tradePairsFiltered = tradePairs.filter(pair => pair.close.profitLoss !== undefined);
              const trades = tradePairsFiltered.length;
              
              // Generate full history for accurate final capital and drawdown
              const displayHistoryForSummary = generateFullDailyHistory(
                  detailedData.tradeHistory, 
                  tradeActions, 
                  params.initialCapital
              );
              const finalCapital = displayHistoryForSummary.length > 0 ? displayHistoryForSummary[displayHistoryForSummary.length - 1].capital : params.initialCapital;

              if (trades === 0 && displayHistoryForSummary.length === 0) {
                 // Handle case with no history at all
                 return { ...result, tradingDays: 0, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };
              } else if (trades === 0) {
                 // Handle case with history but no trades
                 return { ...result, tradingDays: displayHistoryForSummary.length, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: finalCapital, profit: finalCapital - params.initialCapital, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: calculateMaxDrawdown(displayHistoryForSummary, params.initialCapital), sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };
              }
              
              // Calculate metrics based on trades and full history
              const profitsCount = tradePairsFiltered.filter(pair => pair.close.profitLoss! > 0).length;
              const lossesCount = trades - profitsCount;
              const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;
              const totalProfit = finalCapital - params.initialCapital;
              const profitPercentageTotal = params.initialCapital === 0 ? 0 : (totalProfit / params.initialCapital) * 100;
              const gainTrades = tradePairsFiltered.filter(pair => pair.close.profitLoss! > 0);
              const lossTrades = tradePairsFiltered.filter(pair => pair.close.profitLoss! < 0);
              const totalGain = gainTrades.reduce((sum, pair) => sum + pair.close.profitLoss!, 0);
              const totalLoss = lossTrades.reduce((sum, pair) => sum + pair.close.profitLoss!, 0);
              const averageGain = gainTrades.length > 0 ? round(totalGain / gainTrades.length, 2) : 0;
              const averageLoss = lossTrades.length > 0 ? round(totalLoss / lossTrades.length, 2) : 0;
              const maxDrawdown = calculateMaxDrawdown(displayHistoryForSummary, params.initialCapital);
              const sharpeRatio = calculateSharpeRatio(tradePairsFiltered, profitPercentageTotal);
              const sortinoRatio = calculateSortinoRatio(tradePairsFiltered, profitPercentageTotal);
              const maxDrawdownAmount = maxDrawdown / 100 * params.initialCapital;
              const recoveryFactor = maxDrawdownAmount !== 0 ? round(Math.abs(totalProfit / maxDrawdownAmount), 2) : (totalProfit > 0 ? Infinity : 0);
              
              return { 
                  ...result, 
                  tradingDays: displayHistoryForSummary.length, 
                  trades, 
                  profits: profitsCount, 
                  losses: lossesCount, 
                  stops: stopsCount, 
                  finalCapital: round(finalCapital, 2), 
                  profit: round(totalProfit, 2), 
                  successRate: trades > 0 ? round((profitsCount / trades) * 100, 2) : 0, 
                  averageGain, 
                  averageLoss, 
                  maxDrawdown, 
                  sharpeRatio, 
                  sortinoRatio, 
                  recoveryFactor 
              };
            } else {
               return { ...result, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };
            }
          } catch (error) { 
            console.error(`Error processing summary metrics for ${result.assetCode}:`, error); 
            return { ...result, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 }; 
          }
        })
      );
      
      setProgress(95);
      setAnalysisResults(processedResults);
      setProgress(100);
      toast({ title: "Monthly analysis completed", description: "Analysis was completed successfully (v8.1 logic)." });
      
    } catch (error) { 
      console.error("Monthly analysis run failed", error); 
      toast({ variant: "destructive", title: "Analysis failed", description: error instanceof Error ? error.message : "An unknown error occurred" }); 
      setProgress(0); 
      setAnalysisResults([]); 
      setAnalysisParams(null); 
    }
    finally { 
      setTimeout(() => setIsLoading(false), 300); 
    }
  };

  // --- View Details Function (Applies Full History Generation) --- 
  const viewDetails = async (assetCode: string) => {
    if (!analysisParams) {
      toast({ variant: "destructive", title: "Error", description: "Analysis parameters not available. Please run analysis first." });
      return;
    }

    console.log(`[v8.1] Attempting to view details for: ${assetCode}`);
    setIsLoadingDetails(true); 
    setSelectedAsset(assetCode); 
    setDetailedResult(null); 

    try {
      let paramsForDetails = analysisParams;
      if (!paramsForDetails.dataTableName) {
        const tableName = await api.marketData.getDataTableName(paramsForDetails.country, paramsForDetails.stockMarket, paramsForDetails.assetClass);
        if (!tableName) throw new Error("Could not determine data table name for details view");
        paramsForDetails = { ...paramsForDetails, dataTableName: tableName };
      }

      const detailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsForDetails);

      if (detailedData && detailedData.tradeHistory && detailedData.tradeHistory.length > 0) {
        const { processedHistory: tradeActions, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsForDetails);
        const displayHistory = generateFullDailyHistory(
            detailedData.tradeHistory, 
            tradeActions, 
            paramsForDetails.initialCapital
        );

        detailedData.tradeHistory = displayHistory;
        detailedData.tradingDays = displayHistory.length;
        detailedData.capitalEvolution = displayHistory
             .filter(trade => trade.capital !== undefined)
             .map(trade => ({ date: trade.date, capital: trade.capital as number }));
        
        const tradePairsFiltered = tradePairs.filter(pair => pair.close.profitLoss !== undefined);
        const tradesCount = tradePairsFiltered.length;
        const finalCapitalFromHistory = displayHistory.length > 0 ? displayHistory[displayHistory.length - 1].capital : paramsForDetails.initialCapital;
        const totalProfitFromHistory = finalCapitalFromHistory - paramsForDetails.initialCapital;
        const profitPercentageTotal = paramsForDetails.initialCapital === 0 ? 0 : (totalProfitFromHistory / paramsForDetails.initialCapital) * 100;

        detailedData.maxDrawdown = calculateMaxDrawdown(displayHistory, paramsForDetails.initialCapital);
        detailedData.sharpeRatio = calculateSharpeRatio(tradePairsFiltered, profitPercentageTotal);
        detailedData.sortinoRatio = calculateSortinoRatio(tradePairsFiltered, profitPercentageTotal);
        const maxDrawdownAmount = detailedData.maxDrawdown / 100 * paramsForDetails.initialCapital;
        detailedData.recoveryFactor = maxDrawdownAmount !== 0 ? round(Math.abs(totalProfitFromHistory / maxDrawdownAmount), 2) : (totalProfitFromHistory > 0 ? Infinity : 0);
        detailedData.trades = tradesCount;
        detailedData.profit = round(totalProfitFromHistory, 2);

        setDetailedResult(detailedData); 
        setShowDetailView(true); 

      } else {
        toast({ variant: "default", title: "No Details", description: `No detailed trade history could be processed for ${assetCode}.` });
        setDetailedResult(null);
        setShowDetailView(false); 
        setSelectedAsset(null); 
      }

    } catch (error) {
      console.error(`[v8.1] Failed to fetch or process details for ${assetCode}`, error);
      toast({ variant: "destructive", title: "Failed to fetch details", description: error instanceof Error ? error.message : "An unknown error occurred" });
      setDetailedResult(null); 
      setShowDetailView(false); 
      setSelectedAsset(null); 
    } finally {
      setTimeout(() => setIsLoadingDetails(false), 300); 
    }
  };

  // --- Update Analysis Function (Needs similar full history logic) --- 
  const updateAnalysis = async (updatedParams: StockAnalysisParams) => {
     if (!selectedAsset || !analysisParams) return; 
     console.log(`[v8.1] Updating analysis for ${selectedAsset} with new params:`, updatedParams);
     setIsLoadingDetails(true);
     try {
       const tableName = analysisParams.dataTableName || await api.marketData.getDataTableName(updatedParams.country, updatedParams.stockMarket, updatedParams.assetClass);
       if (!tableName) throw new Error("Could not determine data table name for update");
       
       const paramsWithTable = { ...updatedParams, dataTableName: tableName };
       const detailedData = await api.analysis.getDetailedAnalysis(selectedAsset, paramsWithTable);

       if (detailedData && detailedData.tradeHistory && detailedData.tradeHistory.length > 0) {
         const { processedHistory: tradeActions, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
         const displayHistory = generateFullDailyHistory(
            detailedData.tradeHistory, 
            tradeActions, 
            paramsWithTable.initialCapital
         );

         detailedData.tradeHistory = displayHistory;
         detailedData.tradingDays = displayHistory.length;
         detailedData.capitalEvolution = displayHistory
              .filter(trade => trade.capital !== undefined)
              .map(trade => ({ date: trade.date, capital: trade.capital as number }));

         const tradePairsFiltered = tradePairs.filter(pair => pair.close.profitLoss !== undefined);
         const tradesCount = tradePairsFiltered.length;
         const finalCapitalFromHistory = displayHistory.length > 0 ? displayHistory[displayHistory.length - 1].capital : paramsWithTable.initialCapital;
         const totalProfitFromHistory = finalCapitalFromHistory - paramsWithTable.initialCapital;
         const profitPercentageTotal = paramsWithTable.initialCapital === 0 ? 0 : (totalProfitFromHistory / paramsWithTable.initialCapital) * 100;

         detailedData.maxDrawdown = calculateMaxDrawdown(displayHistory, paramsWithTable.initialCapital);
         detailedData.sharpeRatio = calculateSharpeRatio(tradePairsFiltered, profitPercentageTotal);
         detailedData.sortinoRatio = calculateSortinoRatio(tradePairsFiltered, profitPercentageTotal);
         const maxDrawdownAmount = detailedData.maxDrawdown / 100 * paramsWithTable.initialCapital;
         detailedData.recoveryFactor = maxDrawdownAmount !== 0 ? round(Math.abs(totalProfitFromHistory / maxDrawdownAmount), 2) : (totalProfitFromHistory > 0 ? Infinity : 0);
         detailedData.trades = tradesCount;
         detailedData.profit = round(totalProfitFromHistory, 2);

         setDetailedResult(detailedData);
         setAnalysisParams(paramsWithTable); 
         setShowDetailView(true); 

       } else {
         toast({ variant: "default", title: "No Details", description: `No detailed trade history found for ${selectedAsset} to update.` });
       }

     } catch (error) {
       console.error(`[v8.1] Failed to update analysis for ${selectedAsset}`, error);
       toast({ variant: "destructive", title: "Failed to update details", description: error instanceof Error ? error.message : "An unknown error occurred" });
     } finally {
       setTimeout(() => setIsLoadingDetails(false), 300);
     }
  };

  // --- Render Logic --- 
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Monthly Portfolio Analysis (v8.1 - Final Fix)</h1>
      
      {!showDetailView ? (
        <>
          <StockSetupForm onSubmit={runAnalysis} isLoading={isLoading} />
          {isLoading && <Progress value={progress} className="w-full mt-4" />}
          {analysisResults.length > 0 && !isLoading && (
            <ResultsTable 
              results={analysisResults} 
              onViewDetails={viewDetails} 
              isLoadingDetails={isLoadingDetails} 
              selectedAsset={selectedAsset} 
            />
          )}
        </>
      ) : (
        detailedResult && analysisParams && (
          <StockDetailView 
            result={detailedResult} 
            params={analysisParams} 
            onBack={() => { setShowDetailView(false); setSelectedAsset(null); setDetailedResult(null); }} 
            onUpdateParams={updateAnalysis} 
            isLoading={isLoadingDetails} 
          />
        )
      )}
    </div>
  );
}

