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
  // Find the last entry *before* the current index that has a defined capital
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

// Risk Calculation Placeholders (Adjusted to use 'Closed')
const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
    if (!trades || trades.length === 0) return 0;
    let maxDrawdown = 0;
    let peakCapital = initialCapital;
    let currentCapital = initialCapital;
    trades.forEach(trade => {
      // Only consider 'Closed' trades for capital evolution and drawdown calculation
      if (trade.profit !== undefined && trade.trade === 'Closed') { 
        currentCapital += trade.profit;
        if (currentCapital > peakCapital) peakCapital = currentCapital;
        const drawdown = peakCapital === 0 ? 0 : (peakCapital - currentCapital) / peakCapital;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      } else if (trade.trade === 'Buy' || trade.trade === 'Sell') {
        // For Buy/Sell, update currentCapital to the value shown (which is pre-trade)
        // This ensures drawdown calculation uses the capital *before* the potential loss/gain
        if (trade.capital !== undefined) {
           currentCapital = trade.capital;
           // Also update peak if this pre-trade capital is higher
           if (currentCapital > peakCapital) peakCapital = currentCapital;
        }
      }
    });
    // Final check for drawdown after the loop
    const finalDrawdown = peakCapital === 0 ? 0 : (peakCapital - currentCapital) / peakCapital;
    if (finalDrawdown > maxDrawdown) maxDrawdown = finalDrawdown;

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
    // Ensure totalReturnPercentage is treated as a decimal for calculation
    return (totalReturnPercentage / 100 - riskFreeRate) / volatility; 
};
const calculateSortinoRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02;
    const negativeReturns = trades.filter(t => t.trade === 'Closed' && t.profit !== undefined && t.profit < 0).map(t => t.profit as number); // Use 'Closed'
    if (negativeReturns.length === 0) return Infinity; // Or handle as appropriate, e.g., return a large number or NaN
    const meanNegative = 0; // Target return (usually risk-free rate, simplified here)
    // Calculate downside variance using only returns below the target (0)
    const downsideVariance = negativeReturns.reduce((sum, p) => sum + Math.pow(p - meanNegative, 2), 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);
    if (downsideDeviation === 0) return Infinity; // Or handle as appropriate
    // Ensure totalReturnPercentage is treated as a decimal for calculation
    return (totalReturnPercentage / 100 - riskFreeRate) / downsideDeviation; 
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

  // Função para processar operações mensais - CORRIGIDA v5 (Profit/Capital Logic Re-verified)
  const processMonthlyTrades = (fullHistory: TradeHistoryItem[], params: StockAnalysisParams): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } => {
    if (!fullHistory || fullHistory.length === 0) return { processedHistory: [], tradePairs: [] };

    const finalProcessedHistory: TradeHistoryItem[] = [];
    const finalTradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] = [];
    const sortedHistory = [...fullHistory].sort((a, b) =>
      new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
    );
    
    // Initialize capital tracker with the starting capital
    let capitalBeforeCurrentTrade = params.initialCapital; 
    
    // State variables to track the currently open trade across months
    let activeTradeEntry: TradeHistoryItem | null = null;
    let stopPriceCalculated: number | null = null;

    // Group trades by month for processing
    const tradesByMonth: { [monthKey: string]: TradeHistoryItem[] } = {};
    sortedHistory.forEach(trade => {
      const tradeDate = new Date(trade.date + 'T00:00:00Z');
      if (isNaN(tradeDate.getTime())) { console.warn(`Invalid date: ${trade.date}`); return; }
      const monthKey = getMonthKey(tradeDate);
      if (!tradesByMonth[monthKey]) tradesByMonth[monthKey] = [];
      tradesByMonth[monthKey].push(trade);
    });

    // Process trades month by month
    Object.keys(tradesByMonth).sort().forEach(monthKey => {
      const monthTrades = tradesByMonth[monthKey];
      let entryAttemptMadeThisMonth = false; // Reset flag for each month

      // Iterate through each day's data within the month
      for (let i = 0; i < monthTrades.length; i++) {
        const currentDayData = monthTrades[i];
        const currentDate = new Date(currentDayData.date + 'T00:00:00Z');
        if (isNaN(currentDate.getTime())) continue; // Skip invalid dates

        // --- 1. Attempt Entry --- 
        // Conditions: No active trade, entry not yet attempted this month, and it's the first business day.
        if (!activeTradeEntry && !entryAttemptMadeThisMonth && isFirstBusinessDayOfMonth(currentDate)) {
          entryAttemptMadeThisMonth = true; // Mark entry attempt for this month
          const previousDay = findPreviousDay(sortedHistory, currentDayData.date);

          // Need previous day's data to determine entry price and check conditions
          if (previousDay && previousDay.exitPrice !== undefined) {
            const potentialEntryPrice = previousDay.exitPrice;
            const referencePrice = getReferencePrice(previousDay, params.referencePrice);
            const entryThreshold = referencePrice * (1 + (params.entryPercentage / 100) * (params.operation === 'buy' ? 1 : -1));
            
            // Check if entry condition is met based on operation type (Buy/Sell)
            const shouldEnter = (params.operation === 'buy' && potentialEntryPrice >= entryThreshold) || 
                                (params.operation === 'sell' && potentialEntryPrice <= entryThreshold);

            if (shouldEnter) {
              // Create the entry record
              const entryDayRecord: TradeHistoryItem = {
                ...currentDayData, // Base data from the current day
                trade: (params.operation === 'buy' ? 'Buy' : 'Sell'), // Set trade type
                suggestedEntryPrice: potentialEntryPrice, // Record the price suggestion
                actualPrice: potentialEntryPrice, // Entry price is the previous day's exit
                stopPrice: calculateStopPrice(potentialEntryPrice, params), // Calculate stop loss
                lotSize: capitalBeforeCurrentTrade / potentialEntryPrice, // Calculate lot size based on capital *before* entry
                stop: '-', // Stop status is initially unset
                // *** LOGIC CONFIRMED: Profit is undefined on entry ***
                profit: undefined, 
                // *** LOGIC CONFIRMED: Capital shown on Buy/Sell is the capital *before* this entry ***
                capital: capitalBeforeCurrentTrade 
              };
              
              // Update global state: mark trade as active, store stop price
              activeTradeEntry = entryDayRecord;
              stopPriceCalculated = entryDayRecord.stopPrice;
              
              // Add the entry record to the final processed history
              finalProcessedHistory.push(entryDayRecord);
            }
          }
        }

        // --- 2. Manage Active Trade --- 
        // Conditions: There is an active trade, stop price is calculated, and it's not the same day as entry.
        if (activeTradeEntry && stopPriceCalculated && currentDayData.date !== activeTradeEntry.date) {
          let closedToday = false;
          let exitPrice: number | undefined = undefined;
          let profit = 0;
          let closeRecord: TradeHistoryItem | null = null;

          // Check if stop loss was hit today
          const stopHit = checkStopLoss(currentDayData, stopPriceCalculated, params.operation);
          
          // A. Close due to Stop Loss
          if (stopHit) {
            exitPrice = stopPriceCalculated; // Exit at the stop price
            profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
            
            // Create the closing record
            closeRecord = {
              ...currentDayData, // Base data from the current day
              trade: 'Closed', // Mark trade as Closed
              stop: 'Executed', // Mark stop as Executed
              // *** LOGIC CONFIRMED: Profit calculated and assigned only on close ***
              profit: profit,
              // *** LOGIC CONFIRMED: Capital updated with profit/loss only on close ***
              capital: capitalBeforeCurrentTrade + profit, 
              // Carry over details from the entry record
              suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
              actualPrice: activeTradeEntry.actualPrice, 
              stopPrice: activeTradeEntry.stopPrice,
              lotSize: activeTradeEntry.lotSize, 
              exitPrice: exitPrice // Record the exit price
            };
            closedToday = true;
            // *** LOGIC CONFIRMED: Update capital tracker *after* the close record is finalized ***
            capitalBeforeCurrentTrade += profit; 
            
          // B. Close due to End of Month (if not stopped out)
          } else if (isLastBusinessDayOfMonth(currentDate)) {
            // Use the day's closing price as the exit price
            exitPrice = typeof currentDayData.close === 'number' ? currentDayData.close : undefined;
            
            if (exitPrice !== undefined) {
              profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
              
              // Create the closing record
              closeRecord = {
                ...currentDayData, // Base data from the current day
                trade: 'Closed', // Mark trade as Closed
                stop: '-', // Stop was not executed
                // *** LOGIC CONFIRMED: Profit calculated and assigned only on close ***
                profit: profit,
                // *** LOGIC CONFIRMED: Capital updated with profit/loss only on close ***
                capital: capitalBeforeCurrentTrade + profit, 
                // Carry over details from the entry record
                suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
                actualPrice: activeTradeEntry.actualPrice, 
                stopPrice: activeTradeEntry.stopPrice,
                lotSize: activeTradeEntry.lotSize, 
                exitPrice: exitPrice // Record the exit price
              };
              closedToday = true;
              // *** LOGIC CONFIRMED: Update capital tracker *after* the close record is finalized ***
              capitalBeforeCurrentTrade += profit; 
            } else {
              // Log a warning if the exit price is missing on the last day
              console.warn(`Missing exit price (close) on last business day ${currentDayData.date} for active trade.`);
              // Optionally handle this case, e.g., use the previous day's close or skip the close?
              // For now, it won't close if exitPrice is undefined.
            }
          }

          // If a close occurred (either by stop or end-of-month)
          if (closedToday && closeRecord) {
            // Add the closing record to the history
            finalProcessedHistory.push(closeRecord);
            // Add the entry/exit pair for analysis
            finalTradePairs.push({ open: activeTradeEntry, close: closeRecord });
            
            // Reset global state: no active trade anymore
            activeTradeEntry = null;
            stopPriceCalculated = null;
            
            // Optional: If closed by stop, potentially skip remaining days in the month
            // if (stopHit) { break; }
          }
        }
      } // End of day loop (for loop inside month)
    }); // End of month loop (forEach month)

    // Return the processed history and trade pairs
    return { processedHistory: finalProcessedHistory, tradePairs: finalTradePairs };
  };

  // runAnalysis function (uses corrected v5 processMonthlyTrades)
  const runAnalysis = async (params: StockAnalysisParams) => {
    setIsLoading(true);
    setAnalysisResults([]);
    setAnalysisParams(null); // Clear old params first
    setProgress(0);
    setShowDetailView(false); // Ensure detail view is hidden

    try {
      if (!isValidPeriodForMonthly(params.period)) {
        toast({ variant: "default", title: "Period Selection", description: "For monthly analysis, select a period of 2 months or more." });
        // Consider stopping execution if period is invalid
        // setIsLoading(false); 
        // return; 
      }
      console.info("Running monthly analysis (v5 - profit/capital logic re-verified) with params:", params);
      setProgress(10);
      
      // Determine data table name
      let dataTableName = params.dataTableName || await api.marketData.getDataTableName(params.country, params.stockMarket, params.assetClass);
      if (!dataTableName) throw new Error("Failed to identify data source table name");
      setProgress(20);
      
      const paramsWithTable = { ...params, dataTableName };
      setAnalysisParams(paramsWithTable); // Set the final params used for analysis
      
      // Run the core analysis to get list of assets
      const results = await api.analysis.runAnalysis(paramsWithTable, (p) => setProgress(20 + p * 0.7));
      
      // Process each asset result to calculate detailed metrics
      const processedResults = await Promise.all(
        results.map(async (result) => {
          try {
            // Fetch detailed history for the asset
            const detailedData = await api.analysis.getDetailedAnalysis(result.assetCode, paramsWithTable);
            
            if (detailedData && detailedData.tradeHistory) {
              // *** Use CORRECTED v5 processMonthlyTrades function ***
              const { processedHistory, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
              
              // Filter trade pairs for calculations (only pairs with a defined close profit)
              const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
              const trades = tradePairsFiltered.length;
              
              // --- Recalculate summary metrics based on processed monthly trades --- 
              if (trades === 0) {
                // Return default metrics if no trades were executed
                return { ...result, tradingDays: processedHistory.length, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };
              }
              
              const profitsCount = tradePairsFiltered.filter(pair => pair.close.profit > 0).length;
              const lossesCount = trades - profitsCount;
              const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;
              
              // Determine final capital from the last record in processed history (could be Buy or Closed)
              const lastTradeRecord = processedHistory.length > 0 ? processedHistory[processedHistory.length - 1] : null;
              const finalCapital = lastTradeRecord?.capital ?? params.initialCapital;
              
              const totalProfit = finalCapital - params.initialCapital;
              const profitPercentageTotal = params.initialCapital === 0 ? 0 : (totalProfit / params.initialCapital) * 100;
              
              const gainTrades = tradePairsFiltered.filter(pair => pair.close.profit > 0);
              const lossTrades = tradePairsFiltered.filter(pair => pair.close.profit < 0);
              const totalGain = gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0);
              const totalLoss = lossTrades.reduce((sum, pair) => sum + pair.close.profit, 0); // Note: loss is negative
              
              const averageGain = gainTrades.length > 0 ? totalGain / gainTrades.length : 0;
              const averageLoss = lossTrades.length > 0 ? totalLoss / lossTrades.length : 0; // Average loss will be negative
              
              // Use processedHistory for risk calculations as it contains all relevant capital points
              const maxDrawdown = calculateMaxDrawdown(processedHistory, params.initialCapital);
              const sharpeRatio = calculateSharpeRatio(processedHistory, profitPercentageTotal);
              const sortinoRatio = calculateSortinoRatio(processedHistory, profitPercentageTotal);
              // Calculate recovery factor (Total Profit / Max Drawdown Amount)
              const maxDrawdownAmount = maxDrawdown / 100 * params.initialCapital;
              const recoveryFactor = maxDrawdownAmount !== 0 ? Math.abs(totalProfit / maxDrawdownAmount) : (totalProfit > 0 ? Infinity : 0);
              // --- End Recalculation --- 
              
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
                averageLoss, // This will be negative or zero
                maxDrawdown, 
                sharpeRatio, 
                sortinoRatio, 
                recoveryFactor 
              };
            } else {
              // If no detailed data, return the basic result with default metrics
               return { ...result, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };
            }
          } catch (error) { 
            console.error(`Error processing summary metrics for ${result.assetCode}:`, error); 
            // Return default metrics if an error occurs during processing
            return { ...result, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 }; 
          }
        })
      );
      
      setProgress(95);
      setAnalysisResults(processedResults);
      setProgress(100);
      toast({ title: "Monthly analysis completed", description: "Analysis was completed successfully (v5 logic)." });
      
    } catch (error) { 
      console.error("Monthly analysis run failed", error); 
      toast({ variant: "destructive", title: "Analysis failed", description: error instanceof Error ? error.message : "An unknown error occurred" }); 
      setProgress(0); 
      setAnalysisResults([]); // Clear results on failure
      setAnalysisParams(null); // Clear params on failure
    }
    finally { 
      // Use setTimeout to ensure loading state persists briefly for visual feedback
      setTimeout(() => setIsLoading(false), 300); 
    }
  };

  // viewDetails function (uses corrected v5 processMonthlyTrades)
  const viewDetails = async (assetCode: string) => {
    if (!analysisParams) {
      toast({ variant: "destructive", title: "Error", description: "Analysis parameters are not set. Please run an analysis first." });
      return;
    }
    
    console.log(`Attempting to view details for: ${assetCode}`);
    setIsLoadingDetails(true);
    setSelectedAsset(assetCode);
    setDetailedResult(null); // Clear previous results

    try {
      // Use the analysisParams that were set during the runAnalysis
      const paramsForDetails = analysisParams;
      if (!paramsForDetails.dataTableName) {
        // This case should ideally not happen if runAnalysis completed successfully
        throw new Error("Data table name missing in current analysis parameters.");
      }

      console.log(`Fetching detailed analysis for ${assetCode} using table ${paramsForDetails.dataTableName}`);
      const detailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsForDetails);
      console.log(`Fetched detailed data for ${assetCode}:`, detailedData ? 'Data received' : 'No data');

      if (detailedData && detailedData.tradeHistory && detailedData.tradeHistory.length > 0) {
        console.log(`Processing trade history for ${assetCode}...`);
        // *** Use CORRECTED v5 processMonthlyTrades function ***
        const { processedHistory, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsForDetails);
        
        // Assign the processed history back to the detailed data object
        detailedData.tradeHistory = processedHistory;
        detailedData.tradingDays = processedHistory.length;
        
        // Sort the processed history by date for capital evolution chart
        const sortedProcessedHistory = [...processedHistory].sort((a, b) =>
            new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
        );

        // Recalculate capital evolution based on ALL trades (Buy/Closed) in processed history
        if (sortedProcessedHistory.length > 0) {
          detailedData.capitalEvolution = sortedProcessedHistory
            .filter(trade => trade.capital !== undefined) // Ensure capital is defined
            .map(trade => ({
              date: trade.date,
              capital: trade.capital as number // Assert type after filtering
            }));
            
          // Add initial capital point if the first record isn't the absolute start date
          const fullSortedOriginalHistory = [...fullHistory].sort((a, b) => // Assuming fullHistory is accessible here, might need adjustment
             new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
          );
          const firstOriginalDate = fullSortedOriginalHistory[0]?.date;
          if (firstOriginalDate && (detailedData.capitalEvolution.length === 0 || detailedData.capitalEvolution[0]?.date !== firstOriginalDate)) {
             detailedData.capitalEvolution.unshift({ date: firstOriginalDate, capital: paramsForDetails.initialCapital });
          }
          
          // Recalculate final metrics based on the processed history for consistency
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
           // Handle case with no processed trades but potentially original history
           const firstOriginalDate = [...fullHistory].sort((a, b) => new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime())[0]?.date;
           detailedData.capitalEvolution = [{ date: firstOriginalDate || '', capital: paramsForDetails.initialCapital }];
           detailedData.maxDrawdown = 0; detailedData.sharpeRatio = 0; detailedData.sortinoRatio = 0; detailedData.recoveryFactor = 0;
        }
        
        console.log(`Processing complete for ${assetCode}. Setting state.`);
        setDetailedResult(detailedData); // Set the detailed results
        setShowDetailView(true); // Show the detail view
        console.log(`State set for ${assetCode}. Should show details now.`);

      } else {
        // Handle case where detailedData is null, undefined, or lacks tradeHistory
        console.warn(`No detailed data or trade history found for ${assetCode}.`);
        toast({ variant: "warning", title: "No Details", description: `No detailed trade history could be processed for ${assetCode}.` });
        setDetailedResult(null); 
        setShowDetailView(false); 
        setSelectedAsset(null); // Deselect asset
      }
    } catch (error) {
      console.error(`Failed to fetch or process monthly detailed analysis for ${assetCode}`, error);
      toast({ variant: "destructive", title: "Failed to fetch details", description: error instanceof Error ? error.message : "An unknown error occurred" });
      setDetailedResult(null); 
      setShowDetailView(false); 
      setSelectedAsset(null); // Deselect asset on error
    } finally {
      setTimeout(() => setIsLoadingDetails(false), 300); 
      console.log(`Finished viewDetails attempt for ${assetCode}. Loading state off.`);
    }
  };

  // updateAnalysis function (uses corrected v5 processMonthlyTrades)
  const updateAnalysis = async (updatedParams: StockAnalysisParams) => {
     if (!selectedAsset || !analysisParams) return; 
     console.log(`Updating analysis for ${selectedAsset} with new params:`, updatedParams);
     setIsLoadingDetails(true);
     try {
       // Determine table name, prefer existing one from analysisParams if available
       const tableName = analysisParams.dataTableName || await api.marketData.getDataTableName(updatedParams.country, updatedParams.stockMarket, updatedParams.assetClass);
       if (!tableName) throw new Error("Could not determine data table name for update");
       
       const paramsWithTable = { ...updatedParams, dataTableName: tableName };

       console.log(`Fetching detailed analysis for update on ${selectedAsset}...`);
       const detailedData = await api.analysis.getDetailedAnalysis(selectedAsset, paramsWithTable);
       console.log(`Fetched data for update on ${selectedAsset}:`, detailedData ? 'Data received' : 'No data');

       if (detailedData && detailedData.tradeHistory && detailedData.tradeHistory.length > 0) {
         console.log(`Processing updated trade history for ${selectedAsset}...`);
         // *** Use CORRECTED v5 processMonthlyTrades function ***
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
              .map(trade => ({
                  date: trade.date,
                  capital: trade.capital as number
              }));
              
            const fullSortedOriginalHistory = [...fullHistory].sort((a, b) => // Assuming fullHistory is accessible
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
           const firstOriginalDate = [...fullHistory].sort((a, b) => new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime())[0]?.date;
           detailedData.capitalEvolution = [{ date: firstOriginalDate || '', capital: paramsWithTable.initialCapital }];
           detailedData.maxDrawdown = 0; detailedData.sharpeRatio = 0; detailedData.sortinoRatio = 0; detailedData.recoveryFactor = 0;
         }
         // --- End Recalculation --- 
         console.log(`Processing update complete for ${selectedAsset}. Setting state.`);
         setDetailedResult(detailedData); // Update the detailed results
         setAnalysisParams(paramsWithTable); // Update the analysis params used for this view
         toast({ title: "Analysis Updated", description: "Detailed view updated (monthly v5 logic)." });
         console.log(`State updated for ${selectedAsset}.`);
         
       } else {
         console.warn(`No detailed data or trade history found during update for ${selectedAsset}.`);
         toast({ variant: "warning", title: "Update Warning", description: `Could not retrieve updated details for ${selectedAsset}. Displaying previous data.` });
         // Keep the old detailedResult if update fails to fetch new data
       }
     } catch (error) { 
       console.error(`Failed to update detailed analysis for ${selectedAsset}`, error); 
       toast({ variant: "destructive", title: "Update Failed", description: error instanceof Error ? error.message : "Unknown error" }); 
       // Optionally clear detailedResult or keep the old one
       // setDetailedResult(null);
       // setShowDetailView(false);
     }
     finally { 
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
              onViewDetails={viewDetails} // Pass the viewDetails function
            />
          )}
        </div>
      ) : (
        // View 2: Stock Detail View
        // Render StockDetailView only if detailedResult and analysisParams exist
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

