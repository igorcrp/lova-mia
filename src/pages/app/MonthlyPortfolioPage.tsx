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

// Risk Calculation Functions
const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
    const capitalHistory = trades.filter(t => t.capital !== undefined).map(t => t.capital as number);
    if (!capitalHistory || capitalHistory.length === 0) return 0;
    
    let maxDrawdown = 0;
    let peakCapital = initialCapital;
    // Use the full capital evolution including the initial state
    const evolution = [initialCapital, ...capitalHistory]; 

    evolution.forEach(capitalValue => {
        if (capitalValue > peakCapital) {
            peakCapital = capitalValue;
        }
        const drawdown = peakCapital === 0 ? 0 : (peakCapital - capitalValue) / peakCapital;
        if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
        }
    });
    return maxDrawdown * 100; // Return as percentage
};

const calculateVolatility = (tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[]): number => {
    const profits = tradePairs.map(pair => pair.close.profitLoss as number).filter(p => p !== undefined);
    if (profits.length < 2) return 0;
    const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
    const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (profits.length - 1);
    return Math.sqrt(variance);
};

const calculateSharpeRatio = (tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02; // Annualized
    const volatility = calculateVolatility(tradePairs);
    if (volatility === 0) return 0;
    return (totalReturnPercentage / 100 - riskFreeRate) / volatility; 
};

const calculateSortinoRatio = (tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02;
    const negativeReturns = tradePairs.map(pair => pair.close.profitLoss as number).filter(p => p !== undefined && p < 0);
    if (negativeReturns.length === 0) return Infinity; 
    const meanNegative = 0; 
    const downsideVariance = negativeReturns.reduce((sum, p) => sum + Math.pow(p - meanNegative, 2), 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);
    if (downsideDeviation === 0) return Infinity; 
    return (totalReturnPercentage / 100 - riskFreeRate) / downsideDeviation;
};

// --- REWRITTEN Function: Generate Full Daily History --- 
const generateFullDailyHistory = (
    originalFullHistory: TradeHistoryItem[], 
    processedTradeEvents: TradeHistoryItem[], // Contains Buy/Closed events with calculated profit/loss on the *closing* day
    initialCapital: number
): TradeHistoryItem[] => {
    if (!originalFullHistory || originalFullHistory.length === 0) return [];

    const sortedOriginal = [...originalFullHistory].sort((a, b) =>
        new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
    );

    // Create a map for quick lookup of *closing* trade events by date and their profit/loss
    const profitLossMap = new Map<string, number>();
    processedTradeEvents.forEach(event => {
        // Only consider profit/loss on the day the trade is marked as 'Closed'
        if (event.trade === 'Closed' && event.profitLoss !== undefined) {
            profitLossMap.set(event.date, Number(event.profitLoss));
        }
        // We ignore 'Buy' events for profit/loss calculation on that day
    });

    // Create a map for other trade details (like Buy/Closed status, lot size etc.) for display
    const tradeDetailsMap = new Map<string, Partial<TradeHistoryItem>>();
     processedTradeEvents.forEach(event => {
        // Store details from both Buy and Closed events for display purposes
        tradeDetailsMap.set(event.date, {
            trade: event.trade,
            suggestedEntryPrice: event.suggestedEntryPrice,
            actualPrice: event.actualPrice,
            lotSize: event.lotSize,
            stopPrice: event.stopPrice,
            stop: event.stop,
            exitPrice: event.exitPrice
        });
    });


    const displayHistory: TradeHistoryItem[] = [];
    let previousDayCapital = initialCapital; // Initialize for the loop

    for (let i = 0; i < sortedOriginal.length; i++) {
        const currentDayOriginal = sortedOriginal[i];
        const currentDateStr = currentDayOriginal.date;

        // 1. Determine Profit/Loss for *this specific day* using the map
        const currentDayProfitLoss = profitLossMap.get(currentDateStr) ?? 0;

        // 2. Calculate Current Capital based *only* on the formula
        let currentDayCapital: number;
        if (i === 0) {
            // First day (oldest) uses initial capital
            currentDayCapital = initialCapital;
        } else {
            // Subsequent days: Use the capital calculated in the *previous iteration* of this loop
            // Ensure previousDayCapital is a valid number before adding
            const validPreviousCapital = typeof previousDayCapital === 'number' && !isNaN(previousDayCapital) ? previousDayCapital : initialCapital; // Fallback just in case
            currentDayCapital = validPreviousCapital + currentDayProfitLoss;
        }

        // 3. Get other trade details for display if available from the map
        const tradeDetails = tradeDetailsMap.get(currentDateStr);

        // 4. Construct the final record for the day
        const dayRecord: TradeHistoryItem = {
            ...currentDayOriginal, // Start with basic OHLCV from original history
            // Overwrite with trade details if they exist for this date
            trade: tradeDetails?.trade ?? '-',
            suggestedEntryPrice: tradeDetails?.suggestedEntryPrice,
            actualPrice: tradeDetails?.actualPrice,
            lotSize: tradeDetails?.lotSize,
            stopPrice: tradeDetails?.stopPrice,
            stop: tradeDetails?.stop ?? '-',
            exitPrice: tradeDetails?.exitPrice,
            // Assign the strictly calculated profit/loss and capital
            profitLoss: currentDayProfitLoss, // Use the value determined in step 1
            capital: currentDayCapital,      // Use the value calculated in step 2
        };

        // 5. Update previousDayCapital for the *next* iteration's calculation
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
                ...currentDayData, // Base data for the day
                trade: (params.operation === 'buy' ? 'Buy' : 'Sell'),
                suggestedEntryPrice: potentialEntryPrice,
                actualPrice: potentialEntryPrice,
                stopPrice: stopPrice,
                lotSize: lotSize,
                stop: '-',
                profitLoss: 0, // Profit/Loss is 0 on entry day
                capital: capitalBeforeCurrentTrade // Capital *before* this trade
              };
              activeTradeEntry = entryDayRecord;
              stopPriceCalculated = entryDayRecord.stopPrice;
              tradeActionHistory.push(entryDayRecord); // Add to action history
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
              ...currentDayData, // Base data for the day
              trade: 'Closed',
              stop: 'Executed',
              profitLoss: profit,
              capital: capitalAfterClose,
              // Carry over details from the entry record for clarity
              suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
              actualPrice: activeTradeEntry.actualPrice,
              stopPrice: activeTradeEntry.stopPrice,
              lotSize: activeTradeEntry.lotSize,
              exitPrice: exitPrice
            };
            closedToday = true;
            capitalBeforeCurrentTrade = capitalAfterClose; // Update capital for next potential trade

          } else if (isLastBusinessDayOfMonth(currentDate)) {
            exitPrice = typeof currentDayData.exitPrice === 'number' ? currentDayData.exitPrice : undefined; // Use the day's exit price (often close)
            if (exitPrice !== undefined) {
              profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
              const capitalAfterClose = capitalBeforeCurrentTrade + profit;
              closeRecord = {
                ...currentDayData, // Base data for the day
                trade: 'Closed',
                stop: '-',
                profitLoss: profit,
                capital: capitalAfterClose,
                 // Carry over details from the entry record for clarity
                suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
                actualPrice: activeTradeEntry.actualPrice,
                stopPrice: activeTradeEntry.stopPrice,
                lotSize: activeTradeEntry.lotSize,
                exitPrice: exitPrice
              };
              closedToday = true;
              capitalBeforeCurrentTrade = capitalAfterClose; // Update capital for next potential trade
            } else {
              console.warn(`Missing exit price (close) on last business day ${currentDayData.date} for active trade.`);
              // Decide how to handle this - close anyway? Carry over? For now, it doesn't close.
            }
          }

          if (closedToday && closeRecord) {
            tradeActionHistory.push(closeRecord); // Add to action history
            finalTradePairs.push({ open: activeTradeEntry, close: closeRecord });
            activeTradeEntry = null;
            stopPriceCalculated = null; // Reset stop price
          }
        }
      } // End of day loop
    }); // End of month loop

    // Return only the days with trade actions and the pairs
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
      console.info("Running monthly analysis (v8 - Strict Capital Calc) with params:", params);
      setProgress(10);
      
      let dataTableName = params.dataTableName || await api.marketData.getDataTableName(params.country, params.stockMarket, params.assetClass);
      if (!dataTableName) throw new Error("Failed to identify data source table name");
      setProgress(20);
      
      const paramsWithTable = { ...params, dataTableName };
      setAnalysisParams(paramsWithTable); // Set final params used
      
      // Fetch results for all assets
      const results = await api.analysis.runAnalysis(paramsWithTable, (p) => setProgress(20 + p * 0.7));
      
      // Process summary metrics for the results table (still based on trade pairs)
      const processedResults = await Promise.all(
        results.map(async (result) => {
          try {
            // Fetch detailed history just to get trade pairs for summary calculation
            const detailedData = await api.analysis.getDetailedAnalysis(result.assetCode, paramsWithTable);
            
            if (detailedData && detailedData.tradeHistory) {
              // Get trade actions and pairs using the existing logic
              const { processedHistory: tradeActions, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
              
              // Filter pairs for valid profit/loss for calculations
              const tradePairsFiltered = tradePairs.filter(pair => pair.close.profitLoss !== undefined);
              const trades = tradePairsFiltered.length;
              
              if (trades === 0) {
                // If no trades, return default metrics
                return { ...result, tradingDays: detailedData.tradeHistory.length, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };
              }
              
              // Calculate summary metrics based *only* on completed trade pairs
              const profitsCount = tradePairsFiltered.filter(pair => pair.close.profitLoss! > 0).length;
              const lossesCount = trades - profitsCount;
              const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;
              
              // **IMPORTANT**: Final capital for summary should come from the *last day* of the generated full history, not just the last trade action.
              // We need to generate the full history here too for accurate final capital.
              const displayHistoryForSummary = generateFullDailyHistory(
                  detailedData.tradeHistory, 
                  tradeActions, 
                  params.initialCapital
              );
              const finalCapital = displayHistoryForSummary.length > 0 ? displayHistoryForSummary[displayHistoryForSummary.length - 1].capital : params.initialCapital;
              
              const totalProfit = finalCapital - params.initialCapital;
              const profitPercentageTotal = params.initialCapital === 0 ? 0 : (totalProfit / params.initialCapital) * 100;
              
              const gainTrades = tradePairsFiltered.filter(pair => pair.close.profitLoss! > 0);
              const lossTrades = tradePairsFiltered.filter(pair => pair.close.profitLoss! < 0);
              const totalGain = gainTrades.reduce((sum, pair) => sum + pair.close.profitLoss!, 0);
              const totalLoss = lossTrades.reduce((sum, pair) => sum + pair.close.profitLoss!, 0);
              const averageGain = gainTrades.length > 0 ? totalGain / gainTrades.length : 0;
              const averageLoss = lossTrades.length > 0 ? totalLoss / lossTrades.length : 0;
              
              // Use the full display history for Max Drawdown calculation in summary as well
              const maxDrawdown = calculateMaxDrawdown(displayHistoryForSummary, params.initialCapital);
              const sharpeRatio = calculateSharpeRatio(tradePairsFiltered, profitPercentageTotal);
              const sortinoRatio = calculateSortinoRatio(tradePairsFiltered, profitPercentageTotal);
              const maxDrawdownAmount = maxDrawdown / 100 * params.initialCapital;
              const recoveryFactor = maxDrawdownAmount !== 0 ? Math.abs(totalProfit / maxDrawdownAmount) : (totalProfit > 0 ? Infinity : 0);
              
              return { 
                  ...result, 
                  tradingDays: displayHistoryForSummary.length, // Use count from full history
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
                  recoveryFactor 
              };
            } else {
               // No history data for the asset
               return { ...result, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };
            }
          } catch (error) { 
            console.error(`Error processing summary metrics for ${result.assetCode}:`, error); 
            // Return default metrics on error
            return { ...result, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 }; 
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

  // --- View Details Function (Applies Full History Generation) --- 
  const viewDetails = async (assetCode: string) => {
    if (!analysisParams) {
      toast({ variant: "destructive", title: "Error", description: "Analysis parameters not available. Please run analysis first." });
      return;
    }

    console.log(`[v8] Attempting to view details for: ${assetCode}`);
    setIsLoadingDetails(true); 
    setSelectedAsset(assetCode); 
    setDetailedResult(null); 

    try {
      let paramsForDetails = analysisParams;
      if (!paramsForDetails.dataTableName) {
        console.log(`[v8] Data table name missing, fetching...`);
        const tableName = await api.marketData.getDataTableName(paramsForDetails.country, paramsForDetails.stockMarket, paramsForDetails.assetClass);
        if (!tableName) throw new Error("Could not determine data table name for details view");
        paramsForDetails = { ...paramsForDetails, dataTableName: tableName };
      }

      console.log(`[v8] Fetching detailed analysis for ${assetCode} with params:`, paramsForDetails);
      const detailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsForDetails);
      console.log(`[v8] Fetched detailed data for ${assetCode}:`, detailedData ? 'Data received' : 'No data');

      if (detailedData && detailedData.tradeHistory && detailedData.tradeHistory.length > 0) {
        console.log(`[v8] Processing trade history for ${assetCode}...`);
        
        // Step 1: Get the trade actions (Buy/Closed) and pairs using the original logic
        const { processedHistory: tradeActions, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsForDetails);
        
        // Step 2: Generate the full daily history for display using the REWRITTEN function
        const displayHistory = generateFullDailyHistory(
            detailedData.tradeHistory, // Original full history from API
            tradeActions,             // Only Buy/Closed events
            paramsForDetails.initialCapital
        );

        // Step 3: Update the detailedData object for the view
        detailedData.tradeHistory = displayHistory; // Use the full history for the table
        detailedData.tradingDays = displayHistory.length; // Count all days shown

        // Step 4: Recalculate metrics based on the appropriate data
        // Capital evolution uses the full display history
        detailedData.capitalEvolution = displayHistory
             .filter(trade => trade.capital !== undefined) // Filter out any potential undefined capital
             .map(trade => ({ date: trade.date, capital: trade.capital as number }));
        
        // Other metrics (Drawdown, Sharpe, Sortino, Recovery) should ideally be calculated 
        // based on the *trade pairs* or *trade actions* for consistency with the summary table.
        // Recalculate them here using the tradePairs/tradeActions obtained in Step 1.
        const tradePairsFiltered = tradePairs.filter(pair => pair.close.profitLoss !== undefined);
        const tradesCount = tradePairsFiltered.length;
        
        // Use the final capital from the generated displayHistory
        const finalCapitalFromHistory = displayHistory.length > 0 ? displayHistory[displayHistory.length - 1].capital : paramsForDetails.initialCapital;
        const totalProfitFromHistory = finalCapitalFromHistory - paramsForDetails.initialCapital;
        const profitPercentageTotal = paramsForDetails.initialCapital === 0 ? 0 : (totalProfitFromHistory / paramsForDetails.initialCapital) * 100;

        // Use displayHistory for Drawdown calc in detail view for a smoother curve.
        detailedData.maxDrawdown = calculateMaxDrawdown(displayHistory, paramsForDetails.initialCapital);
        
        // Use tradePairs for ratio calculations (as they represent completed trades)
        detailedData.sharpeRatio = calculateSharpeRatio(tradePairsFiltered, profitPercentageTotal);
        detailedData.sortinoRatio = calculateSortinoRatio(tradePairsFiltered, profitPercentageTotal);
        
        const maxDrawdownAmount = detailedData.maxDrawdown / 100 * paramsForDetails.initialCapital;
        detailedData.recoveryFactor = maxDrawdownAmount !== 0 ? Math.abs(totalProfitFromHistory / maxDrawdownAmount) : (totalProfitFromHistory > 0 ? Infinity : 0);
        
        // Assign other summary metrics calculated from trades/history
        detailedData.trades = tradesCount;
        detailedData.profit = totalProfitFromHistory; // Use profit based on full history capital
        // ... assign other relevant metrics if needed in the detail view ...

        // 5. Set state to display results
        console.log(`[v8] Processing complete for ${assetCode}. Setting state.`);
        setDetailedResult(detailedData); 
        setShowDetailView(true); 
        console.log(`[v8] State set for ${assetCode}. Should show details now.`);

      } else {
        console.warn(`[v8] No detailed data or trade history found for ${assetCode}.`);
        toast({ variant: "default", title: "No Details", description: `No detailed trade history could be processed for ${assetCode}.` });
        setDetailedResult(null);
        setShowDetailView(false); 
        setSelectedAsset(null); 
      }

    } catch (error) {
      console.error(`[v8] Failed to fetch or process details for ${assetCode}`, error);
      toast({ variant: "destructive", title: "Failed to fetch details", description: error instanceof Error ? error.message : "An unknown error occurred" });
      setDetailedResult(null); 
      setShowDetailView(false); 
      setSelectedAsset(null); 
    } finally {
      setTimeout(() => setIsLoadingDetails(false), 300); 
      console.log(`[v8] Finished viewDetails attempt for ${assetCode}. Loading state off.`);
    }
  };

  // --- Update Analysis Function (Needs similar full history logic) --- 
  const updateAnalysis = async (updatedParams: StockAnalysisParams) => {
     if (!selectedAsset || !analysisParams) return; 
     console.log(`[v8] Updating analysis for ${selectedAsset} with new params:`, updatedParams);
     setIsLoadingDetails(true);
     try {
       // Ensure data table name is available
       const tableName = analysisParams.dataTableName || await api.marketData.getDataTableName(updatedParams.country, updatedParams.stockMarket, updatedParams.assetClass);
       if (!tableName) throw new Error("Could not determine data table name for update");
       
       const paramsWithTable = { ...updatedParams, dataTableName: tableName };

       console.log(`[v8] Fetching detailed analysis for update on ${selectedAsset}...`);
       const detailedData = await api.analysis.getDetailedAnalysis(selectedAsset, paramsWithTable);
       console.log(`[v8] Fetched data for update on ${selectedAsset}:`, detailedData ? 'Data received' : 'No data');

       if (detailedData && detailedData.tradeHistory && detailedData.tradeHistory.length > 0) {
         console.log(`[v8] Processing updated trade history for ${selectedAsset}...`);
         
         // Step 1: Get trade actions and pairs
         const { processedHistory: tradeActions, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
         
         // Step 2: Generate full display history using REWRITTEN function
         const displayHistory = generateFullDailyHistory(
            detailedData.tradeHistory, 
            tradeActions, 
            paramsWithTable.initialCapital
         );

         // Step 3: Update detailedData object
         detailedData.tradeHistory = displayHistory;
         detailedData.tradingDays = displayHistory.length;
         
         // Step 4: Recalculate metrics (similar to viewDetails)
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
         detailedData.recoveryFactor = maxDrawdownAmount !== 0 ? Math.abs(totalProfitFromHistory / maxDrawdownAmount) : (totalProfitFromHistory > 0 ? Infinity : 0);
         detailedData.trades = tradesCount;
         detailedData.profit = totalProfitFromHistory;
         // ... assign other relevant metrics ...

         // 5. Set state
         console.log(`[v8] Update processing complete for ${selectedAsset}. Setting state.`);
         setDetailedResult(detailedData);
         setAnalysisParams(paramsWithTable); // Update the main params state as well
         setShowDetailView(true); // Ensure detail view remains visible

       } else {
         console.warn(`[v8] No detailed data found for update on ${selectedAsset}.`);
         toast({ variant: "default", title: "No Details", description: `No detailed trade history found for ${selectedAsset} to update.` });
         // Decide if we should clear the view or keep the old data
       }

     } catch (error) {
       console.error(`[v8] Failed to update analysis for ${selectedAsset}`, error);
       toast({ variant: "destructive", title: "Failed to update details", description: error instanceof Error ? error.message : "An unknown error occurred" });
       // Decide if we should clear the view or keep the old data
     } finally {
       setTimeout(() => setIsLoadingDetails(false), 300);
       console.log(`[v8] Finished updateAnalysis attempt for ${selectedAsset}. Loading state off.`);
     }
  };

  // --- Render Logic --- 
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Monthly Portfolio Analysis (v8 - Strict Capital Calc)</h1>
      
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

