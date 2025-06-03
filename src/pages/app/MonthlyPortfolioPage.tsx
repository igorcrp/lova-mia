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

// Helper function to find the previous day's data with defined capital
function findPreviousDayWithCapital(history: TradeHistoryItem[], currentDateStr: string): TradeHistoryItem | null {
  const currentDateIndex = history.findIndex(item => item.date === currentDateStr);
  for (let i = currentDateIndex - 1; i >= 0; i--) {
    if (history[i]?.capital !== undefined) {
      return history[i];
    }
  }
  return null; // No previous day with capital found
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

// Helper function to calculate profit/loss (only returns number)
function calculateProfit(entryPrice: number | undefined, exitPrice: number | undefined, operation: string, lotSize: number | undefined): number {
  if (entryPrice === undefined || exitPrice === undefined || lotSize === undefined || lotSize === 0) return 0;
  const numEntryPrice = Number(entryPrice);
  const numExitPrice = Number(exitPrice);
  if (isNaN(numEntryPrice) || isNaN(numExitPrice)) return 0;
  return (operation === 'buy' ? numExitPrice - numEntryPrice : numEntryPrice - numExitPrice) * lotSize;
}

// Risk Calculation Functions (Using Processed History)
const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
    if (!trades || trades.length === 0) return 0;
    let maxDrawdown = 0;
    let peakCapital = initialCapital;
    let currentCapital = trades.find(t => t.capital !== undefined)?.capital ?? initialCapital;
    peakCapital = Math.max(peakCapital, currentCapital);

    trades.forEach(trade => {
        if (trade.capital !== undefined) {
            currentCapital = trade.capital;
            if (currentCapital > peakCapital) {
                peakCapital = currentCapital;
            }
            const drawdown = peakCapital === 0 ? 0 : (peakCapital - currentCapital) / peakCapital;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        }
    });
    return maxDrawdown * 100;
};

const calculateVolatility = (trades: TradeHistoryItem[]): number => {
    const profits = trades
        .filter(t => t.trade === 'Closed' && typeof t.profit === 'number')
        .map(t => t.profit as number);
    if (profits.length < 2) return 0;
    const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
    const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (profits.length - 1);
    return Math.sqrt(variance);
};

const calculateSharpeRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02; // Annualized
    const volatility = calculateVolatility(trades);
    if (volatility === 0) return 0;
    return (totalReturnPercentage / 100 - riskFreeRate) / volatility;
};

const calculateSortinoRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02;
    const negativeReturns = trades
        .filter(t => t.trade === 'Closed' && typeof t.profit === 'number' && t.profit < 0)
        .map(t => t.profit as number);
    if (negativeReturns.length === 0) return Infinity;
    const meanNegative = 0; // Target return
    const downsideVariance = negativeReturns.reduce((sum, p) => sum + Math.pow(p - meanNegative, 2), 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);
    if (downsideDeviation === 0) return Infinity;
    return (totalReturnPercentage / 100 - riskFreeRate) / downsideDeviation;
};

// Define a type for the results stored in state, including the full detailed result
type StoredAnalysisResult = AnalysisResult & { 
    fullDetailedResult?: DetailedResult; 
    // Keep calculated summary metrics for the table
    tradingDays?: number;
    trades?: number;
    profits?: number;
    losses?: number;
    stops?: number;
    finalCapital?: number;
    profit?: number;
    successRate?: number;
    averageGain?: number;
    averageLoss?: number;
    maxDrawdown?: number;
    sharpeRatio?: number;
    sortinoRatio?: number;
    recoveryFactor?: number;
};

// --- Main Component --- 
export default function MonthlyPortfolioPage() {
  const [analysisParams, setAnalysisParams] = useState<StockAnalysisParams | null>(null);
  // *** CORRECTION v8: Update state type ***
  const [analysisResults, setAnalysisResults] = useState<StoredAnalysisResult[]>([]); 
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);

  // Function to process trades according to monthly logic (v7 - Profit/Loss display fix)
  const processMonthlyTrades = (fullHistory: TradeHistoryItem[], params: StockAnalysisParams): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } => {
    if (!fullHistory || fullHistory.length === 0) return { processedHistory: [], tradePairs: [] };

    const finalProcessedHistory: TradeHistoryItem[] = [];
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
              const entryDayRecord: TradeHistoryItem = {
                ...currentDayData,
                trade: (params.operation === 'buy' ? 'Buy' : 'Sell'),
                suggestedEntryPrice: potentialEntryPrice,
                actualPrice: potentialEntryPrice,
                stopPrice: calculateStopPrice(potentialEntryPrice, params),
                lotSize: capitalBeforeCurrentTrade / potentialEntryPrice,
                stop: '-',
                profit: '-', // Profit is '-' on entry
                capital: capitalBeforeCurrentTrade // Capital is pre-entry value
              };
              activeTradeEntry = entryDayRecord;
              stopPriceCalculated = entryDayRecord.stopPrice;
              finalProcessedHistory.push(entryDayRecord);
            }
          }
        }

        // --- 2. Manage Active Trade ---
        if (activeTradeEntry && stopPriceCalculated && currentDayData.date !== activeTradeEntry.date) {
          let closedToday = false;
          let exitPrice: number | undefined = undefined;
          let profit: number | string = 0; 
          let closeRecord: TradeHistoryItem | null = null;
          const stopHit = checkStopLoss(currentDayData, stopPriceCalculated, params.operation);

          if (stopHit) {
            exitPrice = stopPriceCalculated;
            profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
            closeRecord = {
              ...currentDayData,
              trade: 'Closed',
              stop: 'Executed',
              profit: profit, // Assign calculated number
              capital: capitalBeforeCurrentTrade + (typeof profit === 'number' ? profit : 0),
              suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
              actualPrice: activeTradeEntry.actualPrice,
              stopPrice: activeTradeEntry.stopPrice,
              lotSize: activeTradeEntry.lotSize,
              exitPrice: exitPrice
            };
            closedToday = true;
            capitalBeforeCurrentTrade += (typeof profit === 'number' ? profit : 0);

          } else if (isLastBusinessDayOfMonth(currentDate)) {
            exitPrice = typeof currentDayData.close === 'number' ? currentDayData.close : undefined;
            if (exitPrice !== undefined) {
              profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
              closeRecord = {
                ...currentDayData,
                trade: 'Closed',
                stop: '-',
                profit: profit, // Assign calculated number
                capital: capitalBeforeCurrentTrade + (typeof profit === 'number' ? profit : 0),
                suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
                actualPrice: activeTradeEntry.actualPrice,
                stopPrice: activeTradeEntry.stopPrice,
                lotSize: activeTradeEntry.lotSize,
                exitPrice: exitPrice
              };
              closedToday = true;
              capitalBeforeCurrentTrade += (typeof profit === 'number' ? profit : 0);
            } else {
              console.warn(`Missing exit price (close) on last business day ${currentDayData.date} for active trade.`);
            }
          }

          if (closedToday && closeRecord) {
            finalProcessedHistory.push(closeRecord);
            finalTradePairs.push({ open: activeTradeEntry, close: closeRecord });
            activeTradeEntry = null;
            stopPriceCalculated = null;
          }
        }
      } // End of day loop
    }); // End of month loop

    return { processedHistory: finalProcessedHistory, tradePairs: finalTradePairs };
  };

  // --- Analysis Execution --- 
  const runAnalysis = async (params: StockAnalysisParams) => {
    setIsLoading(true);
    setAnalysisResults([]);
    setAnalysisParams(null); 
    setProgress(0);
    setShowDetailView(false); // Ensure detail view is hidden on new analysis
    setDetailedResult(null); // Clear previous detail result

    try {
      if (!isValidPeriodForMonthly(params.period)) {
        toast({ variant: "default", title: "Period Selection", description: "For monthly analysis, select a period of 2 months or more." });
        setIsLoading(false);
        return;
      }
      console.info("Running monthly analysis (v8 - viewDetails fix) with params:", params);
      setProgress(10);
      
      let dataTableName = params.dataTableName || await api.marketData.getDataTableName(params.country, params.stockMarket, params.assetClass);
      if (!dataTableName) throw new Error("Failed to identify data source table name");
      setProgress(20);
      
      const paramsWithTable = { ...params, dataTableName };
      setAnalysisParams(paramsWithTable); // Set final params used
      
      const results = await api.analysis.runAnalysis(paramsWithTable, (p) => setProgress(20 + p * 0.7));
      
      // Process each asset result to calculate detailed metrics AND store full detailed result
      const processedResults = await Promise.all(
        results.map(async (result): Promise<StoredAnalysisResult> => {
          // Default structure in case of errors or no data
          const defaultMetrics = { tradingDays: 0, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0, fullDetailedResult: undefined };

          try {
            const detailedData = await api.analysis.getDetailedAnalysis(result.assetCode, paramsWithTable);
            
            if (detailedData && detailedData.tradeHistory) {
              const { processedHistory, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
              
              const tradePairsFiltered = tradePairs.filter(pair => typeof pair.close.profit === 'number');
              const trades = tradePairsFiltered.length;
              
              if (trades === 0) {
                // Still create a basic DetailedResult for consistency if needed
                const fullDetailedResult: DetailedResult = {
                    ...detailedData, // Base info
                    ...defaultMetrics, // Zeroed metrics
                    tradeHistory: processedHistory, // Include processed history (might be empty)
                    capitalEvolution: [{ date: sortedHistory[0]?.date || '', capital: params.initialCapital }], // Initial capital point
                };
                return { ...result, ...defaultMetrics, fullDetailedResult };
              }
              
              // Calculate summary metrics
              const profitsCount = tradePairsFiltered.filter(pair => (pair.close.profit as number) > 0).length;
              const lossesCount = trades - profitsCount;
              const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;
              
              const lastTradeRecord = processedHistory.length > 0 ? processedHistory[processedHistory.length - 1] : null;
              const finalCapital = lastTradeRecord?.capital ?? params.initialCapital;
              const totalProfit = finalCapital - params.initialCapital;
              const profitPercentageTotal = params.initialCapital === 0 ? 0 : (totalProfit / params.initialCapital) * 100;
              
              const gainTrades = tradePairsFiltered.filter(pair => (pair.close.profit as number) > 0);
              const lossTrades = tradePairsFiltered.filter(pair => (pair.close.profit as number) < 0);
              const totalGain = gainTrades.reduce((sum, pair) => sum + (pair.close.profit as number), 0);
              const totalLoss = lossTrades.reduce((sum, pair) => sum + (pair.close.profit as number), 0);
              const averageGain = gainTrades.length > 0 ? totalGain / gainTrades.length : 0;
              const averageLoss = lossTrades.length > 0 ? totalLoss / lossTrades.length : 0;
              
              const maxDrawdown = calculateMaxDrawdown(processedHistory, params.initialCapital);
              const sharpeRatio = calculateSharpeRatio(processedHistory, profitPercentageTotal);
              const sortinoRatio = calculateSortinoRatio(processedHistory, profitPercentageTotal);
              const maxDrawdownAmount = maxDrawdown / 100 * params.initialCapital;
              const recoveryFactor = maxDrawdownAmount !== 0 ? Math.abs(totalProfit / maxDrawdownAmount) : (totalProfit > 0 ? Infinity : 0);

              // Calculate Capital Evolution
              const sortedProcessedHistory = [...processedHistory].sort((a, b) =>
                  new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
              );
              let capitalEvolution: { date: string; capital: number }[] = [];
              if (sortedProcessedHistory.length > 0) {
                  capitalEvolution = sortedProcessedHistory
                      .filter(trade => trade.capital !== undefined)
                      .map(trade => ({ date: trade.date, capital: trade.capital as number }));
                  // Add initial capital point correctly
                  const firstOriginalDate = sortedHistory[0]?.date; // Get the very first date from original sorted history
                  if (firstOriginalDate && (capitalEvolution.length === 0 || capitalEvolution[0].date !== firstOriginalDate || capitalEvolution[0].capital !== params.initialCapital)) {
                     // Add initial point if not already present as the first point
                     capitalEvolution.unshift({ date: firstOriginalDate, capital: params.initialCapital });
                  }
              } else {
                  const firstOriginalDate = sortedHistory[0]?.date;
                  capitalEvolution = [{ date: firstOriginalDate || '', capital: params.initialCapital }];
              }
              
              // *** CORRECTION v8: Construct the full DetailedResult object here ***
              const fullDetailedResult: DetailedResult = {
                  assetCode: result.assetCode,
                  assetName: result.assetName,
                  country: paramsWithTable.country,
                  stockMarket: paramsWithTable.stockMarket,
                  assetClass: paramsWithTable.assetClass,
                  tradingDays: processedHistory.length,
                  trades: trades,
                  profits: profitsCount,
                  losses: lossesCount,
                  stops: stopsCount,
                  successRate: trades > 0 ? (profitsCount / trades) * 100 : 0,
                  averageGain: averageGain,
                  averageLoss: averageLoss,
                  maxDrawdown: maxDrawdown,
                  sharpeRatio: sharpeRatio,
                  sortinoRatio: sortinoRatio,
                  profit: totalProfit,
                  finalCapital: finalCapital,
                  recoveryFactor: recoveryFactor,
                  tradeHistory: processedHistory, // The processed history with '-' for profit
                  capitalEvolution: capitalEvolution
              };

              // Return the summary metrics AND the full detailed result
              return { 
                  ...result, // Base AnalysisResult fields
                  // Summary metrics for the table
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
                  recoveryFactor,
                  // Full detailed result for the details view
                  fullDetailedResult: fullDetailedResult 
              };
            } else {
               // No detailed data found
               console.warn(`No detailed data found for ${result.assetCode} during runAnalysis.`);
               return { ...result, ...defaultMetrics };
            }
          } catch (error) { 
            console.error(`Error processing metrics for ${result.assetCode}:`, error); 
            return { ...result, ...defaultMetrics }; 
          }
        })
      );
      
      setProgress(95);
      setAnalysisResults(processedResults);
      setProgress(100);
      toast({ title: "Monthly analysis completed", description: "Analysis was completed successfully (v8 logic)." });
      
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

  // --- View Details Function (CORRECTED v8) --- 
  const viewDetails = (assetCode: string) => {
    console.log(`[v8] Attempting to view details for: ${assetCode}`);
    // 1. Find the result data from the state which should contain the pre-calculated fullDetailedResult
    const resultData = analysisResults.find(r => r.assetCode === assetCode);

    // 2. Check if the result and the detailed data exist
    if (!resultData) {
      console.error(`[v8] No analysis result found for asset code: ${assetCode}`);
      toast({ variant: "destructive", title: "Error", description: `Analysis data for ${assetCode} not found.` });
      return;
    }
    
    if (!resultData.fullDetailedResult) {
        console.error(`[v8] Pre-calculated detailed result missing for asset code: ${assetCode}. This might indicate an error during analysis run.`);
        toast({ variant: "warning", title: "Details Missing", description: `Detailed data for ${assetCode} could not be prepared. Please try running the analysis again.` });
        // Optionally, you could try fetching/processing on the fly here as a fallback
        // await fetchAndProcessDetails(assetCode); // Example fallback
        return; 
    }

    // 3. Set the state to display the details view
    console.log(`[v8] Found pre-calculated details for ${assetCode}. Setting state to display.`);
    setSelectedAsset(assetCode); 
    setDetailedResult(resultData.fullDetailedResult); // Use the stored detailed result object
    setShowDetailView(true); // Set flag to show the view
    console.log(`[v8] State set for ${assetCode}. Detail view should render.`);
    
    // No need for setIsLoadingDetails here as we are using pre-calculated data
    // If you add a fallback fetch, you would need the loading state.
  };

  // --- Update Analysis Function (from Detail View) --- 
  // This function should ideally re-run the specific asset's processing part of runAnalysis
  // and update both analysisResults and detailedResult state.
  // For simplicity, keeping the previous logic but noting it might need refinement
  // to align perfectly with the new structure (e.g., updating fullDetailedResult in analysisResults).
  const updateAnalysis = async (updatedParams: StockAnalysisParams) => {
     if (!selectedAsset || !analysisParams) return; 
     console.log(`[v8] Updating analysis for ${selectedAsset} with new params:`, updatedParams);
     setIsLoadingDetails(true);
     try {
       // Use the original analysisParams for context if needed, merge with updatedParams
       const baseParams = analysisResults.find(r => r.assetCode === selectedAsset);
       const paramsForUpdate = { 
           ...analysisParams, // Original context like country, market, class
           ...updatedParams, // New settings like percentages, initial capital
           dataTableName: analysisParams.dataTableName // Ensure table name is carried over
       };

       if (!paramsForUpdate.dataTableName) {
           const tableName = await api.marketData.getDataTableName(paramsForUpdate.country, paramsForUpdate.stockMarket, paramsForUpdate.assetClass);
           if (!tableName) throw new Error("Could not determine data table name for update");
           paramsForUpdate.dataTableName = tableName;
       }

       console.log(`[v8] Fetching detailed analysis for update on ${selectedAsset}...`);
       const rawDetailedData = await api.analysis.getDetailedAnalysis(selectedAsset, paramsForUpdate);
       
       if (rawDetailedData && rawDetailedData.tradeHistory && rawDetailedData.tradeHistory.length > 0) {
         console.log(`[v8] Processing updated trade history for ${selectedAsset}...`);
         // *** Use the CORRECTED processMonthlyTrades (v7 logic) ***
         const { processedHistory, tradePairs } = processMonthlyTrades(rawDetailedData.tradeHistory, paramsForUpdate);
         
         // *** Reconstruct the full DetailedResult object after update ***
         const tradePairsFiltered = tradePairs.filter(pair => typeof pair.close.profit === 'number');
         const trades = tradePairsFiltered.length;
         let updatedDetailedResultData: DetailedResult;

         if (trades === 0) {
             const sortedHistory = [...rawDetailedData.tradeHistory].sort((a, b) => new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime());
             updatedDetailedResultData = {
                 assetCode: selectedAsset,
                 assetName: baseParams?.assetName || '',
                 country: paramsForUpdate.country,
                 stockMarket: paramsForUpdate.stockMarket,
                 assetClass: paramsForUpdate.assetClass,
                 tradingDays: processedHistory.length, trades: 0, profits: 0, losses: 0, stops: 0, successRate: 0, averageGain: 0, averageLoss: 0,
                 maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, profit: 0, finalCapital: paramsForUpdate.initialCapital, recoveryFactor: 0,
                 tradeHistory: processedHistory,
                 capitalEvolution: [{ date: sortedHistory[0]?.date || '', capital: paramsForUpdate.initialCapital }]
             };
         } else {
             const profitsCount = tradePairsFiltered.filter(pair => (pair.close.profit as number) > 0).length;
             const lossesCount = trades - profitsCount;
             const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;
             const lastTradeRecord = processedHistory.length > 0 ? processedHistory[processedHistory.length - 1] : null;
             const finalCapital = lastTradeRecord?.capital ?? paramsForUpdate.initialCapital;
             const totalProfit = finalCapital - paramsForUpdate.initialCapital;
             const profitPercentageTotal = paramsForUpdate.initialCapital === 0 ? 0 : (totalProfit / paramsForUpdate.initialCapital) * 100;
             const gainTrades = tradePairsFiltered.filter(pair => (pair.close.profit as number) > 0);
             const lossTrades = tradePairsFiltered.filter(pair => (pair.close.profit as number) < 0);
             const totalGain = gainTrades.reduce((sum, pair) => sum + (pair.close.profit as number), 0);
             const totalLoss = lossTrades.reduce((sum, pair) => sum + (pair.close.profit as number), 0);
             const averageGain = gainTrades.length > 0 ? totalGain / gainTrades.length : 0;
             const averageLoss = lossTrades.length > 0 ? totalLoss / lossTrades.length : 0;
             const maxDrawdown = calculateMaxDrawdown(processedHistory, paramsForUpdate.initialCapital);
             const sharpeRatio = calculateSharpeRatio(processedHistory, profitPercentageTotal);
             const sortinoRatio = calculateSortinoRatio(processedHistory, profitPercentageTotal);
             const maxDrawdownAmount = maxDrawdown / 100 * paramsForUpdate.initialCapital;
             const recoveryFactor = maxDrawdownAmount !== 0 ? Math.abs(totalProfit / maxDrawdownAmount) : (totalProfit > 0 ? Infinity : 0);
             const sortedProcessedHistory = [...processedHistory].sort((a, b) => new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime());
             let capitalEvolution: { date: string; capital: number }[] = [];
             if (sortedProcessedHistory.length > 0) {
                 capitalEvolution = sortedProcessedHistory.filter(trade => trade.capital !== undefined).map(trade => ({ date: trade.date, capital: trade.capital as number }));
                 const firstOriginalDate = [...rawDetailedData.tradeHistory].sort((a, b) => new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime())[0]?.date;
                 if (firstOriginalDate && (capitalEvolution.length === 0 || capitalEvolution[0].date !== firstOriginalDate || capitalEvolution[0].capital !== paramsForUpdate.initialCapital)) {
                    capitalEvolution.unshift({ date: firstOriginalDate, capital: paramsForUpdate.initialCapital });
                 }
             } else {
                 const firstOriginalDate = [...rawDetailedData.tradeHistory].sort((a, b) => new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime())[0]?.date;
                 capitalEvolution = [{ date: firstOriginalDate || '', capital: paramsForUpdate.initialCapital }];
             }

             updatedDetailedResultData = {
                 assetCode: selectedAsset,
                 assetName: baseParams?.assetName || '',
                 country: paramsForUpdate.country,
                 stockMarket: paramsForUpdate.stockMarket,
                 assetClass: paramsForUpdate.assetClass,
                 tradingDays: processedHistory.length, trades, profits: profitsCount, losses: lossesCount, stops: stopsCount,
                 successRate: trades > 0 ? (profitsCount / trades) * 100 : 0,
                 averageGain, averageLoss, maxDrawdown, sharpeRatio, sortinoRatio, profit: totalProfit, finalCapital, recoveryFactor,
                 tradeHistory: processedHistory,
                 capitalEvolution: capitalEvolution
             };
         }

         console.log(`[v8] Processing update complete for ${selectedAsset}. Setting state.`);
         setDetailedResult(updatedDetailedResultData); // Update the detailed results view
         setAnalysisParams(paramsForUpdate); // Update the analysis params used for this view
         
         // Also update the main analysisResults state for this asset
         setAnalysisResults(prevResults => prevResults.map(res => 
             res.assetCode === selectedAsset 
             ? { ...res, ...updatedDetailedResultData, fullDetailedResult: updatedDetailedResultData } // Update summary and detailed
             : res
         ));

         toast({ title: "Analysis Updated", description: "Detailed view updated (monthly v8 logic)." });
         console.log(`[v8] State updated for ${selectedAsset}.`);
         
       } else {
         console.warn(`[v8] No detailed data or trade history found during update for ${selectedAsset}.`);
         toast({ variant: "warning", title: "Update Warning", description: `Could not retrieve updated details for ${selectedAsset}. Displaying previous data.` });
       }
     } catch (error) { 
       console.error(`[v8] Failed to update detailed analysis for ${selectedAsset}`, error); 
       toast({ variant: "destructive", title: "Update Failed", description: error instanceof Error ? error.message : "Unknown error" }); 
     }
     finally { 
       setTimeout(() => setIsLoadingDetails(false), 300); 
       console.log(`[v8] Finished update attempt for ${selectedAsset}. Loading state off.`);
     }
  };

  // --- Close Details Function --- 
  const closeDetails = () => {
    console.log("[v8] Closing details view.");
    setShowDetailView(false);
    setDetailedResult(null);
    setSelectedAsset(null);
  };

  // --- RETURN JSX --- 
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Monthly Portfolio</h1>
      {/* Conditional Rendering based on showDetailView state */}
      {!showDetailView ? (
        // View 1: Setup Form and Results Table
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
          {!isLoading && analysisResults.length > 0 && (
            <ResultsTable 
              results={analysisResults} // Pass the results containing summary metrics
              onViewDetails={viewDetails} // Pass the corrected viewDetails function
            />
          )}
        </div>
      ) : (
        // View 2: Stock Detail View
        // Render StockDetailView only if detailedResult and analysisParams exist
        detailedResult && analysisParams && (
          <div className="bg-card p-6 rounded-lg border">
            <StockDetailView
              result={detailedResult} // Pass the full DetailedResult object
              params={analysisParams} // Pass the current analysis parameters
              onClose={closeDetails} 
              onUpdateParams={updateAnalysis} // Pass the update function
              isLoading={isLoadingDetails} // Pass loading state for updates
            />
          </div>
        )
      )}
    </div>
  );
}

