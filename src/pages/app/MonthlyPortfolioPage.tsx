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

// Helper function to find the previous day's data
function findPreviousDay(history: TradeHistoryItem[], currentDateStr: string): TradeHistoryItem | null {
  const currentDateIndex = history.findIndex(item => item.date === currentDateStr);
  return currentDateIndex > 0 ? history[currentDateIndex - 1] : null;
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

// Risk Calculation Placeholders (Adjusted to use 'Closed')
const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
    if (!trades || trades.length === 0) return 0;
    let maxDrawdown = 0;
    let peakCapital = initialCapital;
    let currentCapital = initialCapital;
    trades.forEach(trade => {
      // Only consider 'Closed' trades for capital evolution and drawdown
      if (trade.profit !== undefined && trade.trade === 'Closed') { 
        currentCapital += trade.profit;
        if (currentCapital > peakCapital) peakCapital = currentCapital;
        const drawdown = peakCapital === 0 ? 0 : (peakCapital - currentCapital) / peakCapital;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }
    });
    return maxDrawdown * 100; // Percentage
};
const calculateVolatility = (trades: TradeHistoryItem[]): number => {
    const profits = trades.filter(t => t.trade === 'Closed' && t.profit !== undefined).map(t => t.profit as number); // Use 'Closed'
    if (profits.length < 2) return 0;
    const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
    const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (profits.length - 1);
    return Math.sqrt(variance);
};
const calculateSharpeRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02; // Annualized
    const volatility = calculateVolatility(trades); // Uses 'Closed'
    if (volatility === 0) return 0;
    return (totalReturnPercentage / 100 - riskFreeRate) / volatility; // Simplified
};
const calculateSortinoRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02;
    const negativeReturns = trades.filter(t => t.trade === 'Closed' && t.profit !== undefined && t.profit < 0).map(t => t.profit as number); // Use 'Closed'
    if (negativeReturns.length === 0) return Infinity;
    const meanNegative = 0; // Target return
    const downsideVariance = negativeReturns.reduce((sum, p) => sum + Math.pow(p - meanNegative, 2), 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);
    if (downsideDeviation === 0) return Infinity;
    return (totalReturnPercentage / 100 - riskFreeRate) / downsideDeviation; // Simplified
};

export default function MonthlyPortfolioPage() {
  const [analysisParams, setAnalysisParams] = useState<StockAnalysisParams | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);

  // Função para processar operações mensais - CORRIGIDA v4 (State across months, Capital on Buy)
  const processMonthlyTrades = (fullHistory: TradeHistoryItem[], params: StockAnalysisParams): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } => {
    if (!fullHistory || fullHistory.length === 0) return { processedHistory: [], tradePairs: [] };

    const finalProcessedHistory: TradeHistoryItem[] = [];
    const finalTradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] = [];
    const sortedHistory = [...fullHistory].sort((a, b) =>
      new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
    );
    
    let capitalBeforeCurrentTrade = params.initialCapital; // Tracks capital *before* each trade entry
    // *** CORRECTION v4: State variables moved outside month loop ***
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
      // *** CORRECTION v4: Removed state variable declarations from here ***
      let entryAttemptMadeThisMonth = false; // Still needed for first-day-only entry logic

      for (let i = 0; i < monthTrades.length; i++) {
        const currentDayData = monthTrades[i];
        const currentDate = new Date(currentDayData.date + 'T00:00:00Z');
        if (isNaN(currentDate.getTime())) continue;

        // --- 1. Attempt Entry ONLY on First Business Day (if no active trade) --- 
        // *** CORRECTION v4: Check global activeTradeEntry state ***
        if (!activeTradeEntry && !entryAttemptMadeThisMonth && isFirstBusinessDayOfMonth(currentDate)) {
          entryAttemptMadeThisMonth = true;
          const previousDay = findPreviousDay(sortedHistory, currentDayData.date);
          if (previousDay && previousDay.exitPrice !== undefined) {
            const potentialEntryPrice = previousDay.exitPrice;
            const referencePrice = getReferencePrice(previousDay, params.referencePrice);
            const entryThreshold = referencePrice * (1 + (params.entryPercentage / 100) * (params.operation === 'buy' ? 1 : -1));
            
            if ((params.operation === 'buy' && potentialEntryPrice >= entryThreshold) || (params.operation === 'sell' && potentialEntryPrice <= entryThreshold)) {
              const entryDayRecord: TradeHistoryItem = {
                ...currentDayData,
                trade: (params.operation === 'buy' ? 'Buy' : 'Sell'),
                suggestedEntryPrice: potentialEntryPrice,
                actualPrice: potentialEntryPrice,
                stopPrice: calculateStopPrice(potentialEntryPrice, params),
                lotSize: capitalBeforeCurrentTrade / potentialEntryPrice, 
                stop: '-', 
                profit: undefined, // Profit is undefined on entry
                // *** CORRECTION v4: Set capital to the value *before* this trade entry ***
                capital: capitalBeforeCurrentTrade 
              };
              // *** CORRECTION v4: Update global state ***
              activeTradeEntry = entryDayRecord;
              stopPriceCalculated = entryDayRecord.stopPrice;
              finalProcessedHistory.push(entryDayRecord);
            }
          }
        }

        // --- 2. Manage Active Trade (Check Stop or End of Month) --- 
        // *** CORRECTION v4: Check global activeTradeEntry state ***
        if (activeTradeEntry && stopPriceCalculated && currentDayData.date !== activeTradeEntry.date) {
          let closedToday = false;
          let exitPrice: number | undefined = undefined;
          let profit = 0;
          let closeRecord: TradeHistoryItem | null = null;

          const stopHit = checkStopLoss(currentDayData, stopPriceCalculated, params.operation);
          
          if (stopHit) {
            exitPrice = stopPriceCalculated;
            profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
            closeRecord = {
              ...currentDayData,
              trade: 'Closed', 
              stop: 'Executed', 
              profit: profit,
              // Capital on close = Capital before entry + profit from this trade
              capital: capitalBeforeCurrentTrade + profit, 
              suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
              actualPrice: activeTradeEntry.actualPrice, 
              stopPrice: activeTradeEntry.stopPrice,
              lotSize: activeTradeEntry.lotSize, 
              exitPrice: exitPrice
            };
            closedToday = true;
            // Update capital tracker *after* recording the closing state for the next trade
            capitalBeforeCurrentTrade += profit; 
            
          } else if (isLastBusinessDayOfMonth(currentDate)) {
            exitPrice = typeof currentDayData.exitPrice === 'number' ? currentDayData.exitPrice : undefined;
            if (exitPrice !== undefined) {
              profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
              closeRecord = {
                ...currentDayData,
                trade: 'Closed', 
                stop: '-', 
                profit: profit,
                // Capital on close = Capital before entry + profit from this trade
                capital: capitalBeforeCurrentTrade + profit, 
                suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
                actualPrice: activeTradeEntry.actualPrice, 
                stopPrice: activeTradeEntry.stopPrice,
                lotSize: activeTradeEntry.lotSize, 
                exitPrice: exitPrice
              };
              closedToday = true;
              // Update capital tracker *after* recording the closing state for the next trade
              capitalBeforeCurrentTrade += profit; 
            } else {
              console.warn(`Missing exit price on last business day ${currentDayData.date}`);
            }
          }

          // If a close happened today, record it and reset global state
          if (closedToday && closeRecord) {
            finalProcessedHistory.push(closeRecord);
            finalTradePairs.push({ open: activeTradeEntry, close: closeRecord });
            // *** CORRECTION v4: Reset global state ***
            activeTradeEntry = null;
            stopPriceCalculated = null;
            if (stopHit) {
              // Optional: If stop is hit, maybe break the inner loop for the rest of the month?
              // break; // Uncomment if a stop should prevent further actions in the same month
            }
          }
        }
      } // End of day loop
    }); // End of month loop

    return { processedHistory: finalProcessedHistory, tradePairs: finalTradePairs };
  };

  // runAnalysis function (uses corrected v4 processMonthlyTrades)
  const runAnalysis = async (params: StockAnalysisParams) => {
    try {
      setIsLoading(true);
      setAnalysisResults([]);
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false); // Ensure detail view is hidden when new analysis runs
      if (!isValidPeriodForMonthly(params.period)) {
        toast({ variant: "default", title: "Period Selection", description: "For monthly analysis, select a period of 2 months or more." });
        // Optionally return or throw error here if invalid period should stop execution
      }
      console.info("Running monthly analysis (v4 - state across months) with params:", params);
      setProgress(10);
      let dataTableName = params.dataTableName || await api.marketData.getDataTableName(params.country, params.stockMarket, params.assetClass);
      if (!dataTableName) throw new Error("Failed to identify data source");
      setProgress(20);
      const paramsWithTable = { ...params, dataTableName };
      setAnalysisParams(paramsWithTable); // Set params including table name
      const results = await api.analysis.runAnalysis(paramsWithTable, (p) => setProgress(20 + p * 0.7));
      const processedResults = await Promise.all(
        results.map(async (result) => {
          try {
            const detailedData = await api.analysis.getDetailedAnalysis(result.assetCode, paramsWithTable);
            if (detailedData && detailedData.tradeHistory) {
              // *** Use CORRECTED v4 processMonthlyTrades function ***
              const { processedHistory, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
              const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
              const trades = tradePairsFiltered.length;
              // --- Recalculate metrics based on monthly trade pairs --- 
              if (trades === 0) return { ...result, tradingDays: processedHistory.length, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };
              const profitsCount = tradePairsFiltered.filter(pair => pair.close.profit > 0).length;
              const lossesCount = trades - profitsCount;
              const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;
              // Use the capital from the last 'Closed' record in processedHistory if available
              const lastClosedTrade = processedHistory.slice().reverse().find(t => t.trade === 'Closed');
              const finalCapital = lastClosedTrade?.capital ?? params.initialCapital;
              const totalProfit = finalCapital - params.initialCapital;
              const profitPercentageTotal = (totalProfit / params.initialCapital) * 100;
              const gainTrades = tradePairsFiltered.filter(pair => pair.close.profit > 0);
              const lossTrades = tradePairsFiltered.filter(pair => pair.close.profit < 0);
              const averageGain = gainTrades.length > 0 ? gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0) / gainTrades.length : 0;
              const averageLoss = lossTrades.length > 0 ? lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close.profit), 0) / lossTrades.length : 0;
              // Use processedHistory for risk calcs (includes Buy rows with capital now)
              const maxDrawdown = calculateMaxDrawdown(processedHistory, params.initialCapital);
              const sharpeRatio = calculateSharpeRatio(processedHistory, profitPercentageTotal);
              const sortinoRatio = calculateSortinoRatio(processedHistory, profitPercentageTotal);
              const recoveryFactor = maxDrawdown !== 0 ? Math.abs(totalProfit / (maxDrawdown / 100 * params.initialCapital)) : (totalProfit > 0 ? Infinity : 0);
              // --- End Recalculation --- 
              return { ...result, tradingDays: processedHistory.length, trades, profits: profitsCount, losses: lossesCount, stops: stopsCount, finalCapital, profit: totalProfit, successRate: trades > 0 ? (profitsCount / trades) * 100 : 0, averageGain, averageLoss, maxDrawdown, sharpeRatio, sortinoRatio, recoveryFactor };
            }
            return result; // Return original result if no detailed data
          } catch (error) { 
            console.error(`Error processing summary for ${result.assetCode}:`, error); 
            // Return result without calculated metrics if processing fails
            return { ...result, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 }; 
          }
        })
      );
      setProgress(95);
      setAnalysisResults(processedResults);
      setProgress(100);
      toast({ title: "Monthly analysis completed", description: "Analysis was completed successfully (v4 logic)." });
    } catch (error) { 
      console.error("Monthly analysis failed", error); 
      toast({ variant: "destructive", title: "Analysis failed", description: error instanceof Error ? error.message : "Unknown error" }); 
      setProgress(0); 
      setAnalysisResults([]); // Clear results on failure
    }
    finally { 
      // Use setTimeout to ensure loading state persists briefly for visual feedback
      setTimeout(() => setIsLoading(false), 300); 
    }
  };

  // viewDetails function - CORRIGIDA v5 (Button Click Logic)
  const viewDetails = async (assetCode: string) => {
    // Ensure analysisParams is available before proceeding
    if (!analysisParams) {
      toast({ variant: "destructive", title: "Error", description: "Analysis parameters are not set. Please run an analysis first." });
      return;
    }
    
    console.log(`Attempting to view details for: ${assetCode}`); // Log initiation
    setIsLoadingDetails(true);
    setSelectedAsset(assetCode);
    setDetailedResult(null); // Clear previous results immediately
    // setShowDetailView(false); // Keep current view until data is ready

    try {
      // Ensure dataTableName is available in analysisParams
      const paramsWithTable = analysisParams.dataTableName 
          ? analysisParams 
          : { ...analysisParams, dataTableName: await api.marketData.getDataTableName(analysisParams.country, analysisParams.stockMarket, analysisParams.assetClass) };
      
      if (!paramsWithTable.dataTableName) {
        throw new Error("Could not determine data table name for details view");
      }
      
      // Update analysisParams state if a new table name was fetched
      if (!analysisParams.dataTableName) {
          setAnalysisParams(paramsWithTable);
      }

      console.log(`Fetching detailed analysis for ${assetCode} with params:`, paramsWithTable);
      const detailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsWithTable);
      console.log(`Fetched detailed data for ${assetCode}:`, detailedData ? 'Data received' : 'No data');

      if (detailedData && detailedData.tradeHistory) {
        console.log(`Processing trade history for ${assetCode}...`);
        // *** Use CORRECTED v4 processMonthlyTrades function ***
        const { processedHistory, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
        detailedData.tradeHistory = processedHistory; 
        detailedData.tradingDays = processedHistory.length;
        const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
        
        // Sort history again just to be sure for capital evolution calculation
        const sortedProcessedHistory = [...processedHistory].sort((a, b) =>
            new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
        );

        // Recalculate capital evolution based on ALL trades (Buy/Closed)
        if (sortedProcessedHistory.length > 0) {
          detailedData.capitalEvolution = sortedProcessedHistory
            .filter(trade => trade.capital !== undefined) // Filter out any potential undefined capital
            .map(trade => ({
              date: trade.date,
              capital: trade.capital as number // Assert as number after filtering
            }));
            
          // Ensure the initial capital point exists if the first trade isn't the very start
          const fullSortedOriginalHistory = [...fullHistory].sort((a, b) =>
             new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
          );
          if (detailedData.capitalEvolution.length === 0 || (fullSortedOriginalHistory.length > 0 && detailedData.capitalEvolution[0]?.date !== fullSortedOriginalHistory[0]?.date)) {
             detailedData.capitalEvolution.unshift({ date: fullSortedOriginalHistory[0]?.date || '', capital: paramsWithTable.initialCapital });
          }
          
          // Use the capital from the last record in sortedProcessedHistory
          const finalCapital = sortedProcessedHistory[sortedProcessedHistory.length - 1]?.capital ?? paramsWithTable.initialCapital;
          const totalProfit = finalCapital - paramsWithTable.initialCapital;
          const profitPercentageTotal = (totalProfit / paramsWithTable.initialCapital) * 100;
          detailedData.maxDrawdown = calculateMaxDrawdown(sortedProcessedHistory, paramsWithTable.initialCapital);
          detailedData.sharpeRatio = calculateSharpeRatio(sortedProcessedHistory, profitPercentageTotal);
          detailedData.sortinoRatio = calculateSortinoRatio(sortedProcessedHistory, profitPercentageTotal);
          detailedData.recoveryFactor = detailedData.maxDrawdown !== 0 ? Math.abs(totalProfit / (detailedData.maxDrawdown / 100 * paramsWithTable.initialCapital)) : (totalProfit > 0 ? Infinity : 0);
        } else {
           detailedData.capitalEvolution = [{ date: sortedHistory[0]?.date || '', capital: paramsWithTable.initialCapital }];
           detailedData.maxDrawdown = 0; detailedData.sharpeRatio = 0; detailedData.sortinoRatio = 0; detailedData.recoveryFactor = 0;
        }
        console.log(`Processing complete for ${assetCode}. Setting state.`);
        setDetailedResult(detailedData); // Set the detailed results
        setShowDetailView(true); // <-- Set state to show the detail view
        console.log(`State set for ${assetCode}. Should show details now.`);

      } else {
        // Handle case where detailedData is null/undefined or lacks tradeHistory
        console.warn(`No detailed data or trade history found for ${assetCode}.`);
        toast({ variant: "destructive", title: "Failed to fetch details", description: `No detailed trade history found for ${assetCode}.` });
        setDetailedResult(null); // Ensure result is null
        setShowDetailView(false); // Ensure detail view is hidden
        setSelectedAsset(null); // Deselect asset
      }
    } catch (error) {
      console.error(`Failed to fetch or process monthly detailed analysis for ${assetCode}`, error);
      toast({ variant: "destructive", title: "Failed to fetch details", description: error instanceof Error ? error.message : "An unknown error occurred" });
      setDetailedResult(null); // Clear result on error
      setShowDetailView(false); // Hide detail view on error
      setSelectedAsset(null); // Deselect asset on error
    } finally {
      // Use setTimeout to ensure loading state persists briefly for visual feedback
      setTimeout(() => setIsLoadingDetails(false), 300);
      console.log(`Finished viewDetails attempt for ${assetCode}. Loading state off.`);
    }
  };

  // updateAnalysis function (uses corrected v4 processMonthlyTrades)
  const updateAnalysis = async (updatedParams: StockAnalysisParams) => {
     if (!selectedAsset || !analysisParams) return; // Ensure selectedAsset and analysisParams exist
     console.log(`Updating analysis for ${selectedAsset} with new params:`, updatedParams);
     setIsLoadingDetails(true);
     try {
       // Use existing table name if available, otherwise fetch it
       const paramsWithTable = updatedParams.dataTableName 
           ? updatedParams 
           : { ...updatedParams, dataTableName: await api.marketData.getDataTableName(updatedParams.country, updatedParams.stockMarket, updatedParams.assetClass) };
       
       if (!paramsWithTable.dataTableName) {
         throw new Error("Could not determine data table name for update");
       }
       
       console.log(`Fetching detailed analysis for update on ${selectedAsset}...`);
       const detailedData = await api.analysis.getDetailedAnalysis(selectedAsset, paramsWithTable);
       console.log(`Fetched data for update on ${selectedAsset}:`, detailedData ? 'Data received' : 'No data');

       if (detailedData && detailedData.tradeHistory) {
         console.log(`Processing updated trade history for ${selectedAsset}...`);
         // *** Use CORRECTED v4 processMonthlyTrades function ***
         const { processedHistory, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
         detailedData.tradeHistory = processedHistory;
         detailedData.tradingDays = processedHistory.length;
         const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
         
         // Sort history again for capital evolution
         const sortedProcessedHistory = [...processedHistory].sort((a, b) =>
            new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
         );

         // --- Recalculate metrics --- 
         if (sortedProcessedHistory.length > 0) {
            detailedData.capitalEvolution = sortedProcessedHistory
              .filter(trade => trade.capital !== undefined)
              .map(trade => ({
                  date: trade.date,
                  capital: trade.capital as number
              }));
              
            const fullSortedOriginalHistory = [...fullHistory].sort((a, b) =>
               new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
            );
            if (detailedData.capitalEvolution.length === 0 || (fullSortedOriginalHistory.length > 0 && detailedData.capitalEvolution[0]?.date !== fullSortedOriginalHistory[0]?.date)) {
               detailedData.capitalEvolution.unshift({ date: fullSortedOriginalHistory[0]?.date || '', capital: paramsWithTable.initialCapital });
            }
            
            const finalCapital = sortedProcessedHistory[sortedProcessedHistory.length - 1]?.capital ?? paramsWithTable.initialCapital;
            const totalProfit = finalCapital - paramsWithTable.initialCapital;
            const profitPercentageTotal = (totalProfit / paramsWithTable.initialCapital) * 100;
            detailedData.maxDrawdown = calculateMaxDrawdown(sortedProcessedHistory, paramsWithTable.initialCapital);
            detailedData.sharpeRatio = calculateSharpeRatio(sortedProcessedHistory, profitPercentageTotal);
            detailedData.sortinoRatio = calculateSortinoRatio(sortedProcessedHistory, profitPercentageTotal);
            detailedData.recoveryFactor = detailedData.maxDrawdown !== 0 ? Math.abs(totalProfit / (detailedData.maxDrawdown / 100 * paramsWithTable.initialCapital)) : (totalProfit > 0 ? Infinity : 0);
         } else {
           detailedData.capitalEvolution = [{ date: sortedHistory[0]?.date || '', capital: paramsWithTable.initialCapital }];
           detailedData.maxDrawdown = 0; detailedData.sharpeRatio = 0; detailedData.sortinoRatio = 0; detailedData.recoveryFactor = 0;
         }
         // --- End Recalculation --- 
         console.log(`Processing update complete for ${selectedAsset}. Setting state.`);
         setDetailedResult(detailedData); // Update the detailed results
         setAnalysisParams(paramsWithTable); // Update the analysis params used for this view
         toast({ title: "Analysis Updated", description: "Detailed view updated (monthly v4 logic)." });
         console.log(`State updated for ${selectedAsset}.`);
       } else {
         console.warn(`No detailed data or trade history found during update for ${selectedAsset}.`);
         toast({ variant: "warning", title: "Update Warning", description: `Could not retrieve updated details for ${selectedAsset}.` });
       }
     } catch (error) { 
       console.error(`Failed to update detailed analysis for ${selectedAsset}`, error); 
       toast({ variant: "destructive", title: "Update Failed", description: error instanceof Error ? error.message : "Unknown error" }); 
     }
     finally { 
       // Use setTimeout for visual feedback
       setTimeout(() => setIsLoadingDetails(false), 300); 
       console.log(`Finished update attempt for ${selectedAsset}. Loading state off.`);
     }
  };

  // closeDetails function
  const closeDetails = () => {
    console.log("Closing details view.");
    setShowDetailView(false);
    setDetailedResult(null);
    setSelectedAsset(null);
  };

  // --- RETURN JSX --- 
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Monthly Portfolio</h1>
      {/* Conditional Rendering: Show ResultsTable OR StockDetailView */}
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
          {/* Render ResultsTable only if not loading AND results exist */}
          {!isLoading && analysisResults.length > 0 && (
            <ResultsTable 
              results={analysisResults} 
              onViewDetails={viewDetails} // Pass the corrected viewDetails function
            />
          )}
        </div>
      ) : (
        // View 2: Stock Detail View
        // Render StockDetailView only if not loading details AND detailedResult/analysisParams exist
        detailedResult && analysisParams && (
          <div className="bg-card p-6 rounded-lg border">
            <StockDetailView
              result={detailedResult} // Pass the fetched detailed result
              params={analysisParams} // Pass the current analysis parameters
              onClose={closeDetails} // Pass the function to close the detail view
              onUpdateParams={updateAnalysis} // Pass the function to update params from detail view
              isLoading={isLoadingDetails} // Pass the loading state for the detail view
            />
          </div>
        )
      )}
    </div>
  );
}

