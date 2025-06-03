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
    // Find the most recent prior record that has a capital value defined.
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
    let currentCapital = trades[0]?.capital ?? initialCapital;
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
    // Filter out non-numeric profits before calculation
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
    const volatility = calculateVolatility(trades); // Uses filtered numeric profits
    if (volatility === 0) return 0;
    return (totalReturnPercentage / 100 - riskFreeRate) / volatility;
};

const calculateSortinoRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02;
    // Filter out non-numeric profits and select negative ones
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
                // *** CORRECTION v7: Set profit explicitly to '-' string for Buy/Sell rows ***
                profit: '-', 
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
          let profit: number | string = 0; // Profit can now be number or string '-'
          let closeRecord: TradeHistoryItem | null = null;
          const stopHit = checkStopLoss(currentDayData, stopPriceCalculated, params.operation);

          if (stopHit) {
            exitPrice = stopPriceCalculated;
            // *** CORRECTION v7: Ensure profit calculation returns a number ***
            profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
            closeRecord = {
              ...currentDayData,
              trade: 'Closed',
              stop: 'Executed',
              profit: profit, // Assign calculated number
              // *** CORRECTION v7: Ensure capital update uses numeric profit ***
              capital: capitalBeforeCurrentTrade + (typeof profit === 'number' ? profit : 0),
              suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
              actualPrice: activeTradeEntry.actualPrice,
              stopPrice: activeTradeEntry.stopPrice,
              lotSize: activeTradeEntry.lotSize,
              exitPrice: exitPrice
            };
            closedToday = true;
            // *** CORRECTION v7: Update capital tracker using numeric profit ***
            capitalBeforeCurrentTrade += (typeof profit === 'number' ? profit : 0);

          } else if (isLastBusinessDayOfMonth(currentDate)) {
            exitPrice = typeof currentDayData.close === 'number' ? currentDayData.close : undefined;
            if (exitPrice !== undefined) {
              // *** CORRECTION v7: Ensure profit calculation returns a number ***
              profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
              closeRecord = {
                ...currentDayData,
                trade: 'Closed',
                stop: '-',
                profit: profit, // Assign calculated number
                 // *** CORRECTION v7: Ensure capital update uses numeric profit ***
                capital: capitalBeforeCurrentTrade + (typeof profit === 'number' ? profit : 0),
                suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
                actualPrice: activeTradeEntry.actualPrice,
                stopPrice: activeTradeEntry.stopPrice,
                lotSize: activeTradeEntry.lotSize,
                exitPrice: exitPrice
              };
              closedToday = true;
              // *** CORRECTION v7: Update capital tracker using numeric profit ***
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

    // Ensure the type is consistent if needed later, although '-' is for display
    // We might need to adjust how profit is used in calculations later if it expects only numbers
    return { processedHistory: finalProcessedHistory, tradePairs: finalTradePairs };
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
      }
      console.info("Running monthly analysis (v7 - profit display fix) with params:", params);
      setProgress(10);
      
      let dataTableName = params.dataTableName || await api.marketData.getDataTableName(params.country, params.stockMarket, params.assetClass);
      if (!dataTableName) throw new Error("Failed to identify data source table name");
      setProgress(20);
      
      const paramsWithTable = { ...params, dataTableName };
      setAnalysisParams(paramsWithTable); // Set final params used
      
      const results = await api.analysis.runAnalysis(paramsWithTable, (p) => setProgress(20 + p * 0.7));
      
      // Process each asset result to calculate detailed metrics
      const processedResults = await Promise.all(
        results.map(async (result) => {
          let detailedHistoryForSummary: TradeHistoryItem[] = []; // Store history for summary calcs
          try {
            const detailedData = await api.analysis.getDetailedAnalysis(result.assetCode, paramsWithTable);
            
            if (detailedData && detailedData.tradeHistory) {
              // Use the corrected processMonthlyTrades (v7 logic)
              const { processedHistory, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
              detailedHistoryForSummary = processedHistory; // Use this for summary
              
              // Filter trade pairs for calculations (only pairs with a numeric close profit)
              const tradePairsFiltered = tradePairs.filter(pair => typeof pair.close.profit === 'number');
              const trades = tradePairsFiltered.length;
              
              if (trades === 0) {
                return { ...result, tradingDays: processedHistory.length, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };
              }
              
              // Calculate counts based on numeric profits
              const profitsCount = tradePairsFiltered.filter(pair => (pair.close.profit as number) > 0).length;
              const lossesCount = trades - profitsCount;
              const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;
              
              const lastTradeRecord = processedHistory.length > 0 ? processedHistory[processedHistory.length - 1] : null;
              const finalCapital = lastTradeRecord?.capital ?? params.initialCapital;
              const totalProfit = finalCapital - params.initialCapital;
              const profitPercentageTotal = params.initialCapital === 0 ? 0 : (totalProfit / params.initialCapital) * 100;
              
              // Filter for numeric profits for gain/loss calculations
              const gainTrades = tradePairsFiltered.filter(pair => (pair.close.profit as number) > 0);
              const lossTrades = tradePairsFiltered.filter(pair => (pair.close.profit as number) < 0);
              const totalGain = gainTrades.reduce((sum, pair) => sum + (pair.close.profit as number), 0);
              const totalLoss = lossTrades.reduce((sum, pair) => sum + (pair.close.profit as number), 0); // Loss is negative
              
              const averageGain = gainTrades.length > 0 ? totalGain / gainTrades.length : 0;
              const averageLoss = lossTrades.length > 0 ? totalLoss / lossTrades.length : 0; // Avg loss is negative
              
              // Risk calculations need the history (which now might have '-' for profit)
              // The risk functions (calculateMaxDrawdown, etc.) were updated to handle this
              const maxDrawdown = calculateMaxDrawdown(processedHistory, params.initialCapital);
              const sharpeRatio = calculateSharpeRatio(processedHistory, profitPercentageTotal);
              const sortinoRatio = calculateSortinoRatio(processedHistory, profitPercentageTotal);
              const maxDrawdownAmount = maxDrawdown / 100 * params.initialCapital;
              const recoveryFactor = maxDrawdownAmount !== 0 ? Math.abs(totalProfit / maxDrawdownAmount) : (totalProfit > 0 ? Infinity : 0);
              
              return { 
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
                  recoveryFactor,
                  // Store processed history for potential use in viewDetails without reprocessing
                  detailedHistory: processedHistory 
              };
            } else {
               // No detailed data found
               return { ...result, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0, detailedHistory: [] };
            }
          } catch (error) { 
            console.error(`Error processing summary metrics for ${result.assetCode}:`, error); 
            // Return default metrics on error
            return { ...result, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0, detailedHistory: [] }; 
          }
        })
      );
      
      setProgress(95);
      setAnalysisResults(processedResults);
      setProgress(100);
      toast({ title: "Monthly analysis completed", description: "Analysis was completed successfully (v7 logic)." });
      
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

  // --- View Details Function (v6 logic - should work with v7 data) --- 
  const viewDetails = async (assetCode: string) => {
    if (!analysisParams) {
      toast({ variant: "destructive", title: "Error", description: "Analysis parameters not available." });
      return;
    }
    // Find the result from the analysis run which should contain the pre-processed history
    const resultData = analysisResults.find(r => r.assetCode === assetCode);
    if (!resultData || !resultData.detailedHistory) {
        toast({ variant: "warning", title: "No Details", description: `Detailed history for ${assetCode} not found or not processed.` });
        // Optionally try fetching fresh data if resultData.detailedHistory is missing
        // For now, just return
        return;
    }

    console.log(`[v7] Displaying pre-processed details for: ${assetCode}`);
    setIsLoadingDetails(true); 
    setSelectedAsset(assetCode); 
    setDetailedResult(null); // Clear previous result

    try {
        // Create the DetailedResult object using the pre-processed history
        const detailedDataForView: DetailedResult = {
            assetCode: resultData.assetCode,
            assetName: resultData.assetName,
            country: analysisParams.country,
            stockMarket: analysisParams.stockMarket,
            assetClass: analysisParams.assetClass,
            tradingDays: resultData.tradingDays ?? resultData.detailedHistory.length,
            trades: resultData.trades ?? 0,
            profits: resultData.profits ?? 0,
            losses: resultData.losses ?? 0,
            stops: resultData.stops ?? 0,
            successRate: resultData.successRate ?? 0,
            averageGain: resultData.averageGain ?? 0,
            averageLoss: resultData.averageLoss ?? 0,
            maxDrawdown: resultData.maxDrawdown ?? 0,
            sharpeRatio: resultData.sharpeRatio ?? 0,
            sortinoRatio: resultData.sortinoRatio ?? 0,
            profit: resultData.profit ?? 0,
            finalCapital: resultData.finalCapital ?? analysisParams.initialCapital,
            recoveryFactor: resultData.recoveryFactor ?? 0,
            tradeHistory: resultData.detailedHistory, // Use the processed history
            capitalEvolution: [], // Initialize, will be calculated below
        };

        // Recalculate capital evolution for the chart using the processed history
        const sortedProcessedHistory = [...detailedDataForView.tradeHistory].sort((a, b) =>
            new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
        );

        if (sortedProcessedHistory.length > 0) {
           detailedDataForView.capitalEvolution = sortedProcessedHistory
             .filter(trade => trade.capital !== undefined) // Capital should always be defined now
             .map(trade => ({ date: trade.date, capital: trade.capital as number }));
           
           // Add initial capital point if needed
           const firstHistoryDate = sortedProcessedHistory[0]?.date;
           // We need a reliable way to get the *very first date* of the original data range
           // Assuming the original history might be needed if not stored
           // For simplicity, let's assume the first point in processed history is sufficient for now
           // or that the initial capital point is implicitly handled by charting libraries.
           // Let's add it explicitly if the first processed date isn't the start.
           // This requires knowing the actual start date, which isn't easily available here.
           // Safest bet: Add the initial capital point based on the first trade's date.
           if (detailedDataForView.capitalEvolution.length > 0) {
               detailedDataForView.capitalEvolution.unshift({ date: sortedProcessedHistory[0].date, capital: analysisParams.initialCapital });
               // Remove duplicates if the first trade happened on day 1 with initial capital
               if (detailedDataForView.capitalEvolution.length > 1 && detailedDataForView.capitalEvolution[0].date === detailedDataForView.capitalEvolution[1].date) {
                   detailedDataForView.capitalEvolution.shift();
               }
           } else {
               // No trades, just initial capital point (find start date?)
               // detailedDataForView.capitalEvolution = [{ date: ???, capital: analysisParams.initialCapital }];
           }

        } else {
           // No trades processed, show initial capital
           // detailedDataForView.capitalEvolution = [{ date: ???, capital: analysisParams.initialCapital }];
        }

        console.log(`[v7] Setting detailed result state for ${assetCode}.`);
        setDetailedResult(detailedDataForView);
        setShowDetailView(true); // Show the detail view

    } catch (error) {
      console.error(`[v7] Error preparing details view for ${assetCode}`, error);
      toast({ variant: "destructive", title: "Error Displaying Details", description: error instanceof Error ? error.message : "An unknown error occurred" });
      setDetailedResult(null);
      setShowDetailView(false);
      setSelectedAsset(null);
    } finally {
      setTimeout(() => setIsLoadingDetails(false), 300);
      console.log(`[v7] Finished viewDetails display attempt for ${assetCode}.`);
    }
  };

  // --- Update Analysis Function (from Detail View) --- 
  // Needs review to ensure it uses v7 processing if it re-fetches/re-processes
  const updateAnalysis = async (updatedParams: StockAnalysisParams) => {
     if (!selectedAsset || !analysisParams) return; 
     console.log(`[v7] Updating analysis for ${selectedAsset} with new params:`, updatedParams);
     setIsLoadingDetails(true);
     try {
       const tableName = analysisParams.dataTableName || await api.marketData.getDataTableName(updatedParams.country, updatedParams.stockMarket, updatedParams.assetClass);
       if (!tableName) throw new Error("Could not determine data table name for update");
       
       const paramsWithTable = { ...updatedParams, dataTableName: tableName };

       console.log(`[v7] Fetching detailed analysis for update on ${selectedAsset}...`);
       const detailedData = await api.analysis.getDetailedAnalysis(selectedAsset, paramsWithTable);
       
       if (detailedData && detailedData.tradeHistory && detailedData.tradeHistory.length > 0) {
         console.log(`[v7] Processing updated trade history for ${selectedAsset}...`);
         // *** Use the CORRECTED processMonthlyTrades (v7 logic) ***
         const { processedHistory, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
         
         // Create a new DetailedResult object based on the updated processed history
         const updatedDetailedResult: DetailedResult = {
             assetCode: detailedData.assetCode,
             assetName: detailedData.assetName,
             country: paramsWithTable.country,
             stockMarket: paramsWithTable.stockMarket,
             assetClass: paramsWithTable.assetClass,
             tradeHistory: processedHistory,
             tradingDays: processedHistory.length,
             // Recalculate summary metrics based on the new processedHistory
             trades: 0, profits: 0, losses: 0, stops: 0, successRate: 0, averageGain: 0, averageLoss: 0,
             maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, profit: 0, finalCapital: paramsWithTable.initialCapital, recoveryFactor: 0,
             capitalEvolution: []
         };

         const tradePairsFiltered = tradePairs.filter(pair => typeof pair.close.profit === 'number');
         updatedDetailedResult.trades = tradePairsFiltered.length;

         if (updatedDetailedResult.trades > 0) {
             updatedDetailedResult.profits = tradePairsFiltered.filter(pair => (pair.close.profit as number) > 0).length;
             updatedDetailedResult.losses = updatedDetailedResult.trades - updatedDetailedResult.profits;
             updatedDetailedResult.stops = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;

             const lastTradeRecord = processedHistory.length > 0 ? processedHistory[processedHistory.length - 1] : null;
             updatedDetailedResult.finalCapital = lastTradeRecord?.capital ?? paramsWithTable.initialCapital;
             updatedDetailedResult.profit = updatedDetailedResult.finalCapital - paramsWithTable.initialCapital;
             const profitPercentageTotal = paramsWithTable.initialCapital === 0 ? 0 : (updatedDetailedResult.profit / paramsWithTable.initialCapital) * 100;

             const gainTrades = tradePairsFiltered.filter(pair => (pair.close.profit as number) > 0);
             const lossTrades = tradePairsFiltered.filter(pair => (pair.close.profit as number) < 0);
             const totalGain = gainTrades.reduce((sum, pair) => sum + (pair.close.profit as number), 0);
             const totalLoss = lossTrades.reduce((sum, pair) => sum + (pair.close.profit as number), 0);
             updatedDetailedResult.averageGain = gainTrades.length > 0 ? totalGain / gainTrades.length : 0;
             updatedDetailedResult.averageLoss = lossTrades.length > 0 ? totalLoss / lossTrades.length : 0;
             updatedDetailedResult.successRate = updatedDetailedResult.trades > 0 ? (updatedDetailedResult.profits / updatedDetailedResult.trades) * 100 : 0;

             updatedDetailedResult.maxDrawdown = calculateMaxDrawdown(processedHistory, paramsWithTable.initialCapital);
             updatedDetailedResult.sharpeRatio = calculateSharpeRatio(processedHistory, profitPercentageTotal);
             updatedDetailedResult.sortinoRatio = calculateSortinoRatio(processedHistory, profitPercentageTotal);
             const maxDrawdownAmount = updatedDetailedResult.maxDrawdown / 100 * paramsWithTable.initialCapital;
             updatedDetailedResult.recoveryFactor = maxDrawdownAmount !== 0 ? Math.abs(updatedDetailedResult.profit / maxDrawdownAmount) : (updatedDetailedResult.profit > 0 ? Infinity : 0);

             // Recalculate capital evolution
             const sortedProcessedHistory = [...processedHistory].sort((a, b) =>
                 new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
             );
             updatedDetailedResult.capitalEvolution = sortedProcessedHistory
                 .filter(trade => trade.capital !== undefined)
                 .map(trade => ({ date: trade.date, capital: trade.capital as number }));
             // Add initial capital point if needed (logic might need refinement)
             if (updatedDetailedResult.capitalEvolution.length > 0) {
                 updatedDetailedResult.capitalEvolution.unshift({ date: sortedProcessedHistory[0].date, capital: paramsWithTable.initialCapital });
                 if (updatedDetailedResult.capitalEvolution.length > 1 && updatedDetailedResult.capitalEvolution[0].date === updatedDetailedResult.capitalEvolution[1].date) {
                    updatedDetailedResult.capitalEvolution.shift();
                 }
             }
         }

         console.log(`[v7] Processing update complete for ${selectedAsset}. Setting state.`);
         setDetailedResult(updatedDetailedResult); // Update the detailed results
         setAnalysisParams(paramsWithTable); // Update the analysis params used for this view
         toast({ title: "Analysis Updated", description: "Detailed view updated (monthly v7 logic)." });
         console.log(`[v7] State updated for ${selectedAsset}.`);
         
       } else {
         console.warn(`[v7] No detailed data or trade history found during update for ${selectedAsset}.`);
         toast({ variant: "warning", title: "Update Warning", description: `Could not retrieve updated details for ${selectedAsset}. Displaying previous data.` });
       }
     } catch (error) { 
       console.error(`[v7] Failed to update detailed analysis for ${selectedAsset}`, error); 
       toast({ variant: "destructive", title: "Update Failed", description: error instanceof Error ? error.message : "Unknown error" }); 
     }
     finally { 
       setTimeout(() => setIsLoadingDetails(false), 300); 
       console.log(`[v7] Finished update attempt for ${selectedAsset}. Loading state off.`);
     }
  };

  // --- Close Details Function --- 
  const closeDetails = () => {
    console.log("[v7] Closing details view.");
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
              results={analysisResults} 
              onViewDetails={viewDetails} // Pass the viewDetails function
            />
          )}
        </div>
      ) : (
        // View 2: Stock Detail View
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

