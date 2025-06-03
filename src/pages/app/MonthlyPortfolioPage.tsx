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

// Helper function to calculate profit/loss
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
    // Use the capital from the first record if available, otherwise initial
    let currentCapital = trades[0]?.capital ?? initialCapital;
    peakCapital = Math.max(peakCapital, currentCapital); // Initialize peak correctly

    trades.forEach(trade => {
        // Update capital only if it's defined in the record
        if (trade.capital !== undefined) {
            currentCapital = trade.capital;
            // Update peak capital encountered so far
            if (currentCapital > peakCapital) {
                peakCapital = currentCapital;
            }
            // Calculate drawdown from the current peak
            const drawdown = peakCapital === 0 ? 0 : (peakCapital - currentCapital) / peakCapital;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        }
    });
    return maxDrawdown * 100; // Return as percentage
};

const calculateVolatility = (trades: TradeHistoryItem[]): number => {
    const profits = trades.filter(t => t.trade === 'Closed' && t.profit !== undefined).map(t => t.profit as number);
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
    const negativeReturns = trades.filter(t => t.trade === 'Closed' && t.profit !== undefined && t.profit < 0).map(t => t.profit as number);
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

  // Function to process trades according to monthly logic (Corrected Profit/Loss logic)
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
          // Find previous day in the *full sorted history* to get exit price
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
                profitLoss: undefined, // CORREÇÃO: ProfitLoss undefined nos dias de entrada
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
              profitLoss: profit, // CORREÇÃO: ProfitLoss calculado apenas em 'Closed'
              capital: capitalBeforeCurrentTrade + profit,
              suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
              actualPrice: activeTradeEntry.actualPrice,
              stopPrice: activeTradeEntry.stopPrice,
              lotSize: activeTradeEntry.lotSize,
              exitPrice: exitPrice
            };
            closedToday = true;
            capitalBeforeCurrentTrade += profit;

          } else if (isLastBusinessDayOfMonth(currentDate)) {
            exitPrice = typeof currentDayData.exitPrice === 'number' ? currentDayData.exitPrice : undefined;
            if (exitPrice !== undefined) {
              profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
              closeRecord = {
                ...currentDayData,
                trade: 'Closed',
                stop: '-',
                profitLoss: profit, // CORREÇÃO: ProfitLoss calculado apenas em 'Closed'
                capital: capitalBeforeCurrentTrade + profit,
                suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
                actualPrice: activeTradeEntry.actualPrice,
                stopPrice: activeTradeEntry.stopPrice,
                lotSize: activeTradeEntry.lotSize,
                exitPrice: exitPrice
              };
              closedToday = true;
              capitalBeforeCurrentTrade += profit;
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
    setShowDetailView(false);

    try {
      if (!isValidPeriodForMonthly(params.period)) {
        toast({ variant: "default", title: "Period Selection", description: "For monthly analysis, select a period of 2 months or more." });
      }
      console.info("Running monthly analysis (v6 - viewDetails reverted) with params:", params);
      setProgress(10);
      
      let dataTableName = params.dataTableName || await api.marketData.getDataTableName(params.country, params.stockMarket, params.assetClass);
      if (!dataTableName) throw new Error("Failed to identify data source table name");
      setProgress(20);
      
      const paramsWithTable = { ...params, dataTableName };
      setAnalysisParams(paramsWithTable); // Set final params used
      
      const results = await api.analysis.runAnalysis(paramsWithTable, (p) => setProgress(20 + p * 0.7));
      
      const processedResults = await Promise.all(
        results.map(async (result) => {
          try {
            const detailedData = await api.analysis.getDetailedAnalysis(result.assetCode, paramsWithTable);
            
            if (detailedData && detailedData.tradeHistory) {
              // Use the corrected processMonthlyTrades
              const { processedHistory, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
              const tradePairsFiltered = tradePairs.filter(pair => pair.close.profitLoss !== undefined);
              const trades = tradePairsFiltered.length;
              
              if (trades === 0) {
                return { ...result, tradingDays: processedHistory.length, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };
              }
              
              const profitsCount = tradePairsFiltered.filter(pair => pair.close.profitLoss && pair.close.profitLoss > 0).length;
              const lossesCount = trades - profitsCount;
              const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;
              
              const lastTradeRecord = processedHistory.length > 0 ? processedHistory[processedHistory.length - 1] : null;
              const finalCapital = lastTradeRecord?.capital ?? params.initialCapital;
              const totalProfit = finalCapital - params.initialCapital;
              const profitPercentageTotal = params.initialCapital === 0 ? 0 : (totalProfit / params.initialCapital) * 100;
              
              const gainTrades = tradePairsFiltered.filter(pair => pair.close.profitLoss && pair.close.profitLoss > 0);
              const lossTrades = tradePairsFiltered.filter(pair => pair.close.profitLoss && pair.close.profitLoss < 0);
              const totalGain = gainTrades.reduce((sum, pair) => sum + (pair.close.profitLoss || 0), 0);
              const totalLoss = lossTrades.reduce((sum, pair) => sum + (pair.close.profitLoss || 0), 0);
              const averageGain = gainTrades.length > 0 ? totalGain / gainTrades.length : 0;
              const averageLoss = lossTrades.length > 0 ? totalLoss / lossTrades.length : 0;
              
              const maxDrawdown = calculateMaxDrawdown(processedHistory, params.initialCapital);
              const sharpeRatio = calculateSharpeRatio(processedHistory, profitPercentageTotal);
              const sortinoRatio = calculateSortinoRatio(processedHistory, profitPercentageTotal);
              const maxDrawdownAmount = maxDrawdown / 100 * params.initialCapital;
              const recoveryFactor = maxDrawdownAmount !== 0 ? Math.abs(totalProfit / maxDrawdownAmount) : (totalProfit > 0 ? Infinity : 0);
              
              return { ...result, tradingDays: processedHistory.length, trades, profits: profitsCount, losses: lossesCount, stops: stopsCount, finalCapital, profit: totalProfit, successRate: trades > 0 ? (profitsCount / trades) * 100 : 0, averageGain, averageLoss, maxDrawdown, sharpeRatio, sortinoRatio, recoveryFactor };
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
      toast({ title: "Monthly analysis completed", description: "Analysis was completed successfully (v6 logic)." });
      
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

  // --- View Details Function (Reverted Flow Logic - v6) --- 
  const viewDetails = async (assetCode: string) => {
    // 1. Check for analysis parameters
    if (!analysisParams) {
      toast({ variant: "destructive", title: "Error", description: "Analysis parameters not available. Please run analysis first." });
      return;
    }

    console.log(`[v6] Attempting to view details for: ${assetCode}`);
    setIsLoadingDetails(true); 
    setSelectedAsset(assetCode); 
    setDetailedResult(null); // Clear previous result

    try {
      // 2. Ensure data table name is available
      let paramsForDetails = analysisParams;
      if (!paramsForDetails.dataTableName) {
        console.log(`[v6] Data table name missing, fetching...`);
        const tableName = await api.marketData.getDataTableName(paramsForDetails.country, paramsForDetails.stockMarket, paramsForDetails.assetClass);
        if (!tableName) throw new Error("Could not determine data table name for details view");
        paramsForDetails = { ...paramsForDetails, dataTableName: tableName };
      }

      // 3. Fetch detailed analysis data
      console.log(`[v6] Fetching detailed analysis for ${assetCode} with params:`, paramsForDetails);
      const detailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsForDetails);
      console.log(`[v6] Fetched detailed data for ${assetCode}:`, detailedData ? 'Data received' : 'No data');

      // 4. Process data if received successfully
      if (detailedData && detailedData.tradeHistory && detailedData.tradeHistory.length > 0) {
        console.log(`[v6] Processing trade history for ${assetCode}...`);
        // *** Use the CORRECTED processMonthlyTrades ***
        const { processedHistory, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsForDetails);

        // Assign processed history back
        detailedData.tradeHistory = processedHistory;
        detailedData.tradingDays = processedHistory.length;

        // Sort processed history for capital evolution chart
        const sortedProcessedHistory = [...processedHistory].sort((a, b) =>
            new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
        );

        // Recalculate capital evolution and metrics based on processed history
        if (sortedProcessedHistory.length > 0) {
           detailedData.capitalEvolution = sortedProcessedHistory
             .filter(trade => trade.capital !== undefined)
             .map(trade => ({ date: trade.date, capital: trade.capital as number }));
           
           // Add initial capital point logic
           // Need original full history for the very first date point
           const originalHistoryForAsset = detailedData.tradeHistory || []; // Use processed history
           const fullSortedOriginalHistory = [...originalHistoryForAsset].sort((a, b) => 
              new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
           );
           const firstOriginalDate = fullSortedOriginalHistory[0]?.date;
           if (firstOriginalDate && (detailedData.capitalEvolution.length === 0 || detailedData.capitalEvolution[0]?.date !== firstOriginalDate)) {
              detailedData.capitalEvolution.unshift({ date: firstOriginalDate, capital: paramsForDetails.initialCapital });
           }

           const lastTradeRecord = sortedProcessedHistory[sortedProcessedHistory.length - 1];
           const finalCapital = lastTradeRecord?.capital ?? paramsForDetails.initialCapital;
           const totalProfit = finalCapital - paramsForDetails.initialCapital;
           const profitPercentageTotal = paramsForDetails.initialCapital === 0 ? 0 : (totalProfit / paramsForDetails.initialCapital) * 100;

           detailedData.maxDrawdown = calculateMaxDrawdown(sortedProcessedHistory, paramsForDetails.initialCapital);
           detailedData.sharpeRatio = calculateSharpeRatio(sortedProcessedHistory, profitPercentageTotal);
           detailedData.sortinoRatio = calculateSortinoRatio(sortedProcessedHistory, profitPercentageTotal);
           const maxDrawdownAmount = detailedData.maxDrawdown / 100 * paramsForDetails.initialCapital;
           detailedData.recoveryFactor = maxDrawdownAmount !== 0 ? Math.abs(totalProfit / maxDrawdownAmount) : (totalProfit > 0 ? Infinity : 0);

        } else {
           // Handle case with no processed trades
           const originalHistoryForAsset = detailedData.tradeHistory || [];
           const firstOriginalDate = [...originalHistoryForAsset].sort((a, b) => new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime())[0]?.date;
           detailedData.capitalEvolution = [{ date: firstOriginalDate || '', capital: paramsForDetails.initialCapital }];
           detailedData.maxDrawdown = 0; detailedData.sharpeRatio = 0; detailedData.sortinoRatio = 0; detailedData.recoveryFactor = 0;
        }

        // 5. Set state to display results
        console.log(`[v6] Processing complete for ${assetCode}. Setting state.`);
        setDetailedResult(detailedData); // Set the processed data
        setShowDetailView(true); // *** Show the detail view ***
        console.log(`[v6] State set for ${assetCode}. Should show details now.`);

      } else {
        // Handle case where no detailed data/history is found
        console.warn(`[v6] No detailed data or trade history found for ${assetCode}.`);
        toast({ variant: "default", title: "No Details", description: `No detailed trade history could be processed for ${assetCode}.` });
        setDetailedResult(null);
        setShowDetailView(false); // Ensure view is hidden
        setSelectedAsset(null); // Deselect asset
      }

    } catch (error) {
      // 6. Handle errors during fetch or processing
      console.error(`[v6] Failed to fetch or process details for ${assetCode}`, error);
      toast({ variant: "destructive", title: "Failed to fetch details", description: error instanceof Error ? error.message : "An unknown error occurred" });
      setDetailedResult(null); // Clear results on error
      setShowDetailView(false); // Hide view on error
      setSelectedAsset(null); // Deselect asset on error
    } finally {
      // 7. Stop loading indicator
      setTimeout(() => setIsLoadingDetails(false), 300);
      console.log(`[v6] Finished viewDetails attempt for ${assetCode}. Loading state off.`);
    }
  };

  // --- Update Analysis Function (from Detail View) --- 
  // This function likely needs the same corrected trade processing logic if it recalculates
  const updateAnalysis = async (updatedParams: StockAnalysisParams) => {
     if (!selectedAsset || !analysisParams) return; 
     console.log(`[v6] Updating analysis for ${selectedAsset} with new params:`, updatedParams);
     setIsLoadingDetails(true);
     try {
       const tableName = analysisParams.dataTableName || await api.marketData.getDataTableName(updatedParams.country, updatedParams.stockMarket, updatedParams.assetClass);
       if (!tableName) throw new Error("Could not determine data table name for update");
       
       const paramsWithTable = { ...updatedParams, dataTableName: tableName };

       console.log(`[v6] Fetching detailed analysis for update on ${selectedAsset}...`);
       const detailedData = await api.analysis.getDetailedAnalysis(selectedAsset, paramsWithTable);
       console.log(`[v6] Fetched data for update on ${selectedAsset}:`, detailedData ? 'Data received' : 'No data');

       if (detailedData && detailedData.tradeHistory && detailedData.tradeHistory.length > 0) {
         console.log(`[v6] Processing updated trade history for ${selectedAsset}...`);
         // *** Use the CORRECTED processMonthlyTrades ***
         const { processedHistory, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
         detailedData.tradeHistory = processedHistory;
         detailedData.tradingDays = processedHistory.length;
         
         const sortedProcessedHistory = [...processedHistory].sort((a, b) =>
            new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
         );

         // --- Recalculate metrics --- 
         if (sortedProcessedHistory.length > 0) {
            detailedData.capitalEvolution = sortedProcessedHistory
              .filter(trade => trade.capital !== undefined)
              .map(trade => ({ date: trade.date, capital: trade.capital as number }));
              
            // Add initial capital point logic (needs original history)
            const originalHistoryForAsset = detailedData.tradeHistory || [];
            const fullSortedOriginalHistory = [...originalHistoryForAsset].sort((a, b) => 
               new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
            );
            const firstOriginalDate = fullSortedOriginalHistory[0]?.date;
            if (firstOriginalDate && (detailedData.capitalEvolution.length === 0 || detailedData.capitalEvolution[0]?.date !== firstOriginalDate)) {
               detailedData.capitalEvolution.unshift({ date: firstOriginalDate, capital: paramsWithTable.initialCapital });
            }
            
            const lastTradeRecord = sortedProcessedHistory[sortedProcessedHistory.length - 1];
            const finalCapital = lastTradeRecord?.capital ?? paramsWithTable.initialCapital;
            const totalProfit = finalCapital - paramsWithTable.initialCapital;
            const profitPercentageTotal = paramsWithTable.initialCapital === 0 ? 0 : (totalProfit / paramsWithTable.initialCapital) * 100;
            
            detailedData.maxDrawdown = calculateMaxDrawdown(sortedProcessedHistory, paramsWithTable.initialCapital);
            detailedData.sharpeRatio = calculateSharpeRatio(sortedProcessedHistory, profitPercentageTotal);
            detailedData.sortinoRatio = calculateSortinoRatio(sortedProcessedHistory, profitPercentageTotal);
            const maxDrawdownAmount = detailedData.maxDrawdown / 100 * paramsWithTable.initialCapital;
            detailedData.recoveryFactor = maxDrawdownAmount !== 0 ? Math.abs(totalProfit / maxDrawdownAmount) : (totalProfit > 0 ? Infinity : 0);
            
         } else {
           const originalHistoryForAsset = detailedData.tradeHistory || [];
           const firstOriginalDate = [...originalHistoryForAsset].sort((a, b) => new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime())[0]?.date;
           detailedData.capitalEvolution = [{ date: firstOriginalDate || '', capital: paramsWithTable.initialCapital }];
           detailedData.maxDrawdown = 0; detailedData.sharpeRatio = 0; detailedData.sortinoRatio = 0; detailedData.recoveryFactor = 0;
         }
         // --- End Recalculation --- 
         console.log(`[v6] Processing update complete for ${selectedAsset}. Setting state.`);
         setDetailedResult(detailedData); // Update the detailed results
         setAnalysisParams(paramsWithTable); // Update the analysis params used for this view
         toast({ title: "Analysis Updated", description: "Detailed view updated (monthly v6 logic)." });
         console.log(`[v6] State updated for ${selectedAsset}.`);
         
       } else {
         console.warn(`[v6] No detailed data or trade history found during update for ${selectedAsset}.`);
         toast({ variant: "default", title: "Update Warning", description: `Could not retrieve updated details for ${selectedAsset}. Displaying previous data.` });
       }
     } catch (error) { 
       console.error(`[v6] Failed to update detailed analysis for ${selectedAsset}`, error); 
       toast({ variant: "destructive", title: "Update Failed", description: error instanceof Error ? error.message : "Unknown error" }); 
     }
     finally { 
       setTimeout(() => setIsLoadingDetails(false), 300); 
       console.log(`[v6] Finished update attempt for ${selectedAsset}. Loading state off.`);
     }
  };

  // --- Close Details Function --- 
  const closeDetails = () => {
    console.log("[v6] Closing details view.");
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
        // Render StockDetailView only if detailedResult and analysisParams exist
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
