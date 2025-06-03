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
  isSameWeek,
  getNextBusinessDay
} from "@/utils/dateUtils"; // Assuming dateUtils contains these functions

// Helper function to get week key (e.g., YYYY-WW)
function getWeekKey(date: Date): string {
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - date.getDay() + (date.getDay() === 0 ? -6 : 1)); // Adjust to Monday
  const year = startOfWeek.getFullYear();
  const month = String(startOfWeek.getMonth() + 1).padStart(2, '0');
  const day = String(startOfWeek.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`; // Use YYYY-MM-DD of the week's Monday as key
}

// Helper function to check if it's Monday or the first business day of the week
function isMondayOrFirstBusinessDay(date: Date): boolean {
  return date.getDay() === 1 || isFirstBusinessDayOfWeek(date);
}

// Helper function to find the previous day's data in the sorted history
function findPreviousDay(history: TradeHistoryItem[], currentDateStr: string): TradeHistoryItem | null {
  const currentDateIndex = history.findIndex(item => item.date === currentDateStr);
  if (currentDateIndex > 0) {
    return history[currentDateIndex - 1];
  }
  return null;
}

// Helper function to get the reference price from a day's data
function getReferencePrice(day: TradeHistoryItem, referencePriceKey: string): number {
  // Ensure the key exists and the value is a number
  const price = day[referencePriceKey as keyof TradeHistoryItem];
  return typeof price === 'number' ? price : 0; // Return 0 or handle error appropriately
}

// Helper function to calculate stop price
function calculateStopPrice(entryPrice: number, params: StockAnalysisParams): number {
  const stopPercent = params.stopPercentage ?? 0;
  if (params.operation === 'buy') {
    return entryPrice * (1 - stopPercent / 100);
  } else { // sell
    return entryPrice * (1 + stopPercent / 100);
  }
}

// Helper function to check if stop loss is hit
function checkStopLoss(currentDay: TradeHistoryItem, stopPrice: number, operation: string): boolean {
  if (operation === 'buy') {
    return currentDay.low <= stopPrice;
  } else { // sell
    return currentDay.high >= stopPrice;
  }
}

// Helper function to calculate profit/loss
function calculateProfit(entryPrice: number | undefined, exitPrice: number | undefined, operation: string, volume: number | undefined): number {
  if (entryPrice === undefined || exitPrice === undefined || volume === undefined) return 0;
  if (operation === 'buy') {
    return (exitPrice - entryPrice) * volume;
  } else { // sell
    return (entryPrice - exitPrice) * volume;
  }
}

export default function WeeklyPortfolioPage() {
  const [analysisParams, setAnalysisParams] = useState<StockAnalysisParams | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);

  // Helper function to check if it's Friday or last business day of the week
  const isFridayOrLastBusinessDay = (date: Date): boolean => {
    return date.getDay() === 5 || isLastBusinessDayOfWeek(date);
  };

  // Função para processar operações semanais - CORRIGIDA
  const processWeeklyTrades = (fullHistory: TradeHistoryItem[], params: StockAnalysisParams): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } => {
    if (!fullHistory || fullHistory.length === 0) return { processedHistory: [], tradePairs: [] };

    const processedHistory: TradeHistoryItem[] = [];
    const tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] = [];
    const sortedHistory = [...fullHistory].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    let currentCapital = params.initialCapital;

    // Group trades by week using the Monday of the week as the key
    const tradesByWeek: { [weekKey: string]: TradeHistoryItem[] } = {};
    sortedHistory.forEach(trade => {
      const tradeDate = new Date(trade.date + 'T00:00:00Z'); // Ensure date is parsed correctly, assuming UTC dates
      const weekKey = getWeekKey(tradeDate);
      if (!tradesByWeek[weekKey]) {
        tradesByWeek[weekKey] = [];
      }
      tradesByWeek[weekKey].push(trade);
    });

    // Process each week
    Object.keys(tradesByWeek).sort().forEach(weekKey => {
      const weekTrades = tradesByWeek[weekKey];
      let activeTrade: TradeHistoryItem | null = null;
      let stopPriceCalculated: number | null = null;
      let entryDayFoundInWeek = false; // Track if entry happened this week

      for (let i = 0; i < weekTrades.length; i++) {
        const currentDayData = weekTrades[i];
        // Initialize currentDay with default values
        const currentDay: TradeHistoryItem = {
           ...currentDayData,
           trade: '-', // Default trade status
           profit: undefined,
           capital: undefined,
           stop: '-', // Default stop status
           suggestedEntryPrice: undefined,
           stopPrice: undefined,
           lotSize: 0, // Initialize lotSize
           actualPrice: undefined // Initialize actualPrice
        };
        const currentDate = new Date(currentDay.date + 'T00:00:00Z');

        // --- Logic for Opening a Trade ---
        if (!activeTrade && !entryDayFoundInWeek && isMondayOrFirstBusinessDay(currentDate)) {
          const previousDay = findPreviousDay(sortedHistory, currentDay.date);

          if (previousDay && previousDay.exitPrice !== undefined) {
            const entryPrice = previousDay.exitPrice; // Use previous day's close as potential entry
            const referencePrice = getReferencePrice(previousDay, params.referencePrice);
            const entryThreshold = referencePrice * (1 + (params.entryPercentage / 100) * (params.operation === 'buy' ? 1 : -1));

            // Check entry condition
            if ((params.operation === 'buy' && entryPrice >= entryThreshold) ||
                (params.operation === 'sell' && entryPrice <= entryThreshold)) {

              // --- Open Trade --- 
              activeTrade = { ...currentDay }; // Copy current day data for the active trade
              activeTrade.trade = (params.operation === 'buy' ? 'Buy' : 'Sell');
              activeTrade.suggestedEntryPrice = entryPrice; // Suggested entry based on previous close
              activeTrade.actualPrice = entryPrice; // Actual entry price for this simulation
              stopPriceCalculated = calculateStopPrice(entryPrice, params);
              activeTrade.stopPrice = stopPriceCalculated;
              activeTrade.lotSize = params.initialCapital / entryPrice; // Example lot size calculation

              // Update currentDay status for the history
              currentDay.trade = activeTrade.trade;
              currentDay.suggestedEntryPrice = activeTrade.suggestedEntryPrice;
              currentDay.actualPrice = activeTrade.actualPrice;
              currentDay.stopPrice = activeTrade.stopPrice;
              currentDay.lotSize = activeTrade.lotSize;

              entryDayFoundInWeek = true; // Mark that an entry attempt was made this week
            } else {
              // Entry condition not met, do nothing, wait for next Monday
            }
          } else {
             // No previous day data or exit price, cannot determine entry
          }
        }

        // --- Logic for Active Trade --- 
        if (activeTrade && stopPriceCalculated) {
           // *** CORRECTION START: Ensure 'Trade' column shows active status ***
           // If trade is active but not closed today, show 'Buy' or 'Sell'
           if (currentDay.trade === '-') { // Only update if not already set (e.g., to 'Close')
             currentDay.trade = activeTrade.trade;
           }
           // Also copy relevant active trade details if not the entry day
           if (currentDay.date !== activeTrade.date) {
               currentDay.suggestedEntryPrice = activeTrade.suggestedEntryPrice;
               currentDay.actualPrice = activeTrade.actualPrice; // Keep showing entry price for reference
               currentDay.stopPrice = activeTrade.stopPrice;
               currentDay.lotSize = activeTrade.lotSize;
           }
           // *** CORRECTION END ***

          let closedToday = false;

          // Check Stop Loss
          const stopHit = checkStopLoss(currentDay, stopPriceCalculated, params.operation);
          if (stopHit) {
            const exitPrice = stopPriceCalculated; // Exit at stop price
            currentDay.trade = 'Close';
            currentDay.stop = 'Executed';
            currentDay.profit = calculateProfit(activeTrade.actualPrice, exitPrice, params.operation, activeTrade.lotSize);
            currentCapital += currentDay.profit;
            currentDay.capital = currentCapital;
            tradePairs.push({ open: activeTrade, close: { ...currentDay, exitPrice: exitPrice } });
            activeTrade = null; // Close trade
            stopPriceCalculated = null;
            closedToday = true;
          }

          // Check End of Week Closure (only if not closed by stop loss)
          if (!closedToday && isFridayOrLastBusinessDay(currentDate)) {
            const exitPrice = currentDay.exitPrice; // Exit at Friday's close price
            currentDay.trade = 'Close';
            currentDay.profit = calculateProfit(activeTrade.actualPrice, exitPrice, params.operation, activeTrade.lotSize);
            currentCapital += currentDay.profit;
            currentDay.capital = currentCapital;
            tradePairs.push({ open: activeTrade, close: { ...currentDay } });
            activeTrade = null; // Close trade
            stopPriceCalculated = null;
            closedToday = true;
          }
        }

        // Add current day to processed history
        // Update capital display logic: Show capital only on close or if no trade is active
        if (currentDay.trade !== 'Close' && activeTrade) {
            currentDay.capital = undefined; // Hide capital while trade is active
        } else if (!activeTrade) {
            currentDay.capital = currentCapital; // Show current capital if no trade is active
        }
        // If trade closed today, capital is already set

        processedHistory.push(currentDay);
      }

      // If trade was still active at the end of the week's data (e.g., data ends mid-week)
      // This part might need adjustment based on desired behavior for incomplete weeks
      // For now, we assume trades are closed by Friday or stop loss within the week's data.

    });

    return { processedHistory, tradePairs };
  };

  const runAnalysis = async (params: StockAnalysisParams) => {
    try {
      setIsLoading(true);
      setAnalysisResults([]);
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false);

      console.info('Running weekly analysis with params:', params);
      setProgress(10);

      let dataTableName = params.dataTableName;
      if (!dataTableName) {
        // Assuming api.marketData.getDataTableName exists and works as intended
        dataTableName = await api.marketData.getDataTableName(
          params.country,
          params.stockMarket,
          params.assetClass
        );

        if (!dataTableName) {
          throw new Error("Failed to identify data source");
        }
      }

      setProgress(20);

      const paramsWithTable = {
        ...params,
        dataTableName
      };
      setAnalysisParams(paramsWithTable);

      // Assuming api.analysis.runAnalysis exists and works
      const results = await api.analysis.runAnalysis(paramsWithTable, (currentProgress) => {
        setProgress(20 + currentProgress * 0.7);
      });

      // Process results to apply weekly logic and recalculate metrics
      const processedResults = await Promise.all(
        results.map(async (result) => {
          try {
            // Assuming api.analysis.getDetailedAnalysis exists
            const detailedData = await api.analysis.getDetailedAnalysis(result.assetCode, paramsWithTable);

            if (detailedData && detailedData.tradeHistory) {
              // Process trades using the corrected weekly logic
              const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);

              // Filter pairs that actually completed (have profit calculated)
              const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);

              // Recalculate metrics based ONLY on completed trade pairs
              const trades = tradePairsFiltered.length;
              if (trades === 0) {
                 // Return result with zeroed metrics if no trades completed
                 return {
                   ...result,
                   tradingDays: processedHistory.length, // Still show processed days
                   trades: 0, tradePercentage: 0, profits: 0, profitPercentage: 0,
                   losses: 0, lossPercentage: 0, stops: 0, stopPercentage: 0,
                   finalCapital: params.initialCapital, profit: 0, averageGain: 0,
                   averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0,
                   recoveryFactor: 0, successRate: 0
                 };
              }

              const profitsCount = tradePairsFiltered.filter(pair => pair.close.profit > 0).length;
              const lossesCount = tradePairsFiltered.filter(pair => pair.close.profit < 0).length;
              // Assuming stop is marked correctly in processWeeklyTrades
              const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;

              // Calculate final capital based on completed trades
              let finalCapital = params.initialCapital;
              tradePairsFiltered.forEach(pair => {
                finalCapital += pair.close.profit;
              });

              const totalProfit = finalCapital - params.initialCapital;
              const profitPercentageTotal = (totalProfit / params.initialCapital) * 100;

              const gainTrades = tradePairsFiltered.filter(pair => pair.close.profit > 0);
              const lossTrades = tradePairsFiltered.filter(pair => pair.close.profit < 0);
              const averageGain = gainTrades.length > 0
                ? gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0) / gainTrades.length
                : 0;
              const averageLoss = lossTrades.length > 0
                ? lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close.profit), 0) / lossTrades.length
                : 0;

              // Assuming risk calculation functions exist and work correctly
              const maxDrawdown = calculateMaxDrawdown(tradePairsFiltered.map(pair => pair.close), params.initialCapital);
              // const volatility = calculateVolatility(tradePairsFiltered.map(pair => pair.close)); // Volatility might not be needed for summary
              const sharpeRatio = calculateSharpeRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
              const sortinoRatio = calculateSortinoRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
              const recoveryFactor = maxDrawdown !== 0 ? Math.abs(totalProfit / maxDrawdown) : 0; // Use absolute drawdown value

              // Update the result object with recalculated metrics
              return {
                ...result, // Keep original assetCode etc.
                tradingDays: processedHistory.length, // Total days processed
                trades: trades, // Number of completed trades
                tradePercentage: trades > 0 ? 100 : 0, // Or adjust if needed
                profits: profitsCount,
                profitPercentage: trades > 0 ? (profitsCount / trades) * 100 : 0,
                losses: lossesCount,
                lossPercentage: trades > 0 ? (lossesCount / trades) * 100 : 0,
                stops: stopsCount,
                stopPercentage: trades > 0 ? (stopsCount / trades) * 100 : 0,
                finalCapital: finalCapital,
                profit: totalProfit,
                averageGain: averageGain,
                averageLoss: averageLoss,
                maxDrawdown: maxDrawdown,
                sharpeRatio: sharpeRatio,
                sortinoRatio: sortinoRatio,
                recoveryFactor: recoveryFactor,
                successRate: trades > 0 ? (profitsCount / trades) * 100 : 0
              };
            }

            return result; // Return original result if no trade history
          } catch (error) {
            console.error(`Error processing detailed data for ${result.assetCode}:`, error);
            return result; // Return original result on error
          }
        })
      );

      setProgress(95);
      setAnalysisResults(processedResults);
      setProgress(100);

      toast({
        title: "Weekly analysis completed",
        description: "Analysis was completed successfully",
      });
    } catch (error) {
      console.error("Weekly analysis failed", error);
      toast({
        variant: "destructive",
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
      setProgress(0);
    } finally {
      setTimeout(() => {
        setIsLoading(false);
      }, 500); // Delay to show 100% progress
    }
  };

  const viewDetails = async (assetCode: string) => {
    if (!analysisParams) return;

    try {
      setIsLoadingDetails(true);
      setSelectedAsset(assetCode);

      // Ensure dataTableName is available
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
        throw new Error("Could not determine data table name");
      }

      // Fetch detailed data
      const detailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsWithTable);

      // Process weekly trades using the corrected function
      if (detailedData && detailedData.tradeHistory) {
        const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
        
        // Update detailedData with the processed history for the table
        detailedData.tradeHistory = processedHistory;
        detailedData.tradingDays = processedHistory.length;

        // Filter completed trade pairs for calculations
        const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);

        // Recalculate capital evolution based on completed pairs
        if (tradePairsFiltered.length > 0) {
          let currentCapital = paramsWithTable.initialCapital;
          detailedData.capitalEvolution = tradePairsFiltered.map(pair => {
            currentCapital += pair.close.profit;
            return {
              date: pair.close.date,
              capital: currentCapital
            };
          });

          // Add initial capital point
          detailedData.capitalEvolution.unshift({
            date: tradePairsFiltered[0]?.open.date || detailedData.tradeHistory[0]?.date || new Date().toISOString().split('T')[0], // Use first open or first history date
            capital: paramsWithTable.initialCapital
          });

          // Recalculate risk metrics based on completed pairs
          const finalCapital = currentCapital;
          const totalProfit = finalCapital - paramsWithTable.initialCapital;
          const profitPercentageTotal = (totalProfit / paramsWithTable.initialCapital) * 100;

          detailedData.maxDrawdown = calculateMaxDrawdown(tradePairsFiltered.map(pair => pair.close), paramsWithTable.initialCapital);
          detailedData.sharpeRatio = calculateSharpeRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
          detailedData.sortinoRatio = calculateSortinoRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
          detailedData.recoveryFactor = detailedData.maxDrawdown !== 0 ? Math.abs(totalProfit / detailedData.maxDrawdown) : 0;
        } else {
           // No completed trades, set default values
           detailedData.capitalEvolution = [{
               date: detailedData.tradeHistory[0]?.date || new Date().toISOString().split('T')[0],
               capital: paramsWithTable.initialCapital
           }];
           detailedData.maxDrawdown = 0;
           detailedData.sharpeRatio = 0;
           detailedData.sortinoRatio = 0;
           detailedData.recoveryFactor = 0;
        }
      }

      setDetailedResult(detailedData);
      setShowDetailView(true);
    } catch (error) {
      console.error("Failed to fetch weekly detailed analysis", error);
      toast({
        variant: "destructive",
        title: "Failed to fetch details",
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // This function is called when parameters are updated in the StockDetailView
  const updateAnalysis = async (updatedParams: StockAnalysisParams) => {
     if (!selectedAsset) return;
     // Use the updatedParams directly, assuming they include necessary fields like initialCapital etc.
     // Re-run the analysis for all assets with new params, then view details again
     // Or, potentially, just re-fetch and re-process details for the selected asset?
     // For simplicity, let's re-run the main analysis and then re-view details.
     
     // Update the main analysis parameters state
     setAnalysisParams(updatedParams);
     
     // Close the detail view temporarily
     // setShowDetailView(false);
     // setDetailedResult(null);
     
     // Re-run the full analysis
     await runAnalysis(updatedParams);
     
     // After analysis completes, re-fetch and show details for the selected asset
     // Need to ensure runAnalysis finishes before viewDetails is called if runAnalysis updates state asynchronously
     // A better approach might be to have runAnalysis return the updated results, find the one for selectedAsset,
     // and then call viewDetails or directly setDetailedResult.
     
     // Let's assume runAnalysis updates analysisResults, then we find the relevant result
     // This part needs careful handling of async state updates.
     // For now, let's just re-fetch details after updating params in detail view.
     
     try {
       setIsLoadingDetails(true); // Show loading in detail view while updating
       
       const paramsWithTable = updatedParams.dataTableName
         ? updatedParams
         : {
             ...updatedParams,
             dataTableName: await api.marketData.getDataTableName(
               updatedParams.country,
               updatedParams.stockMarket,
               updatedParams.assetClass
             )
           };
           
       if (!paramsWithTable.dataTableName) {
         throw new Error("Could not determine data table name for update");
       }
       
       // Re-fetch detailed data with updated parameters
       const detailedData = await api.analysis.getDetailedAnalysis(selectedAsset, paramsWithTable);
       
       // Process weekly trades again with updated parameters
       if (detailedData && detailedData.tradeHistory) {
         const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
         detailedData.tradeHistory = processedHistory;
         detailedData.tradingDays = processedHistory.length;
         
         const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
         
         // Recalculate capital evolution and metrics
         if (tradePairsFiltered.length > 0) {
           let currentCapital = paramsWithTable.initialCapital;
           detailedData.capitalEvolution = tradePairsFiltered.map(pair => {
             currentCapital += pair.close.profit;
             return { date: pair.close.date, capital: currentCapital };
           });
           detailedData.capitalEvolution.unshift({
             date: tradePairsFiltered[0]?.open.date || detailedData.tradeHistory[0]?.date || new Date().toISOString().split('T')[0],
             capital: paramsWithTable.initialCapital
           });
           
           const finalCapital = currentCapital;
           const totalProfit = finalCapital - paramsWithTable.initialCapital;
           const profitPercentageTotal = (totalProfit / paramsWithTable.initialCapital) * 100;
           
           detailedData.maxDrawdown = calculateMaxDrawdown(tradePairsFiltered.map(pair => pair.close), paramsWithTable.initialCapital);
           detailedData.sharpeRatio = calculateSharpeRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
           detailedData.sortinoRatio = calculateSortinoRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
           detailedData.recoveryFactor = detailedData.maxDrawdown !== 0 ? Math.abs(totalProfit / detailedData.maxDrawdown) : 0;
         } else {
            detailedData.capitalEvolution = [{
               date: detailedData.tradeHistory[0]?.date || new Date().toISOString().split('T')[0],
               capital: paramsWithTable.initialCapital
            }];
            detailedData.maxDrawdown = 0;
            detailedData.sharpeRatio = 0;
            detailedData.sortinoRatio = 0;
            detailedData.recoveryFactor = 0;
         }
       }
       
       setDetailedResult(detailedData); // Update the detailed result state
       setAnalysisParams(paramsWithTable); // Update the main params state as well
       
       toast({
         title: "Analysis Updated",
         description: "Detailed view updated with new parameters.",
       });
       
     } catch (error) {
       console.error("Failed to update detailed analysis", error);
       toast({
         variant: "destructive",
         title: "Update Failed",
         description: error instanceof Error ? error.message : "An unknown error occurred during update.",
       });
     } finally {
       setIsLoadingDetails(false);
     }
  };

  const closeDetails = () => {
    setShowDetailView(false);
    setDetailedResult(null);
    setSelectedAsset(null);
  };

  // --- Risk Calculation Functions (Placeholder implementations) ---
  // These should be replaced with actual, validated calculations
  const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
    if (!trades || trades.length === 0) return 0;
    let maxDrawdown = 0;
    let peakCapital = initialCapital;
    let currentCapital = initialCapital;

    trades.forEach(trade => {
      if (trade.profit !== undefined) {
        currentCapital += trade.profit;
        if (currentCapital > peakCapital) {
          peakCapital = currentCapital;
        }
        const drawdown = peakCapital === 0 ? 0 : (peakCapital - currentCapital) / peakCapital;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
    });
    return maxDrawdown * 100; // Return as percentage
  };

  const calculateVolatility = (trades: TradeHistoryItem[]): number => {
    const profits = trades.map(t => t.profit).filter(p => p !== undefined) as number[];
    if (profits.length < 2) return 0;
    const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
    const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (profits.length - 1);
    return Math.sqrt(variance);
  };

  const calculateSharpeRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    // Assuming annual risk-free rate of 2%
    const riskFreeRate = 0.02;
    // Need to annualize return and volatility
    // This requires knowing the time period of the analysis
    // Placeholder: return 0 if volatility is 0
    const volatility = calculateVolatility(trades);
    if (volatility === 0) return 0;
    // Simplified Sharpe Ratio (needs proper annualization)
    // Assuming totalReturnPercentage is for the entire period
    // This calculation is likely incorrect without proper time scaling
    return (totalReturnPercentage / 100 - riskFreeRate) / volatility; // Needs adjustment
  };

  const calculateSortinoRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02;
    const negativeReturns = trades.map(t => t.profit).filter(p => p !== undefined && p < 0) as number[];
    if (negativeReturns.length === 0) return Infinity; // Or 0, depending on convention

    const meanNegative = 0; // Target return is often 0 or risk-free rate
    const downsideVariance = negativeReturns.reduce((sum, p) => sum + Math.pow(p - meanNegative, 2), 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);

    if (downsideDeviation === 0) return Infinity; // Or 0

    // Simplified Sortino (needs proper annualization)
    return (totalReturnPercentage / 100 - riskFreeRate) / downsideDeviation; // Needs adjustment
  };
  // --- End Risk Calculation Functions ---

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Weekly Portfolio</h1>

      {!showDetailView ? (
        // Main View: Setup Form and Results Table
        <div className="bg-card p-6 rounded-lg border">
          <StockSetupForm onSubmit={runAnalysis} isLoading={isLoading} />

          {isLoading && (
            <div className="mt-6">
              <div className="flex justify-between text-sm mb-2">
                <span>Processing weekly analysis...</span>
                <span>{progress.toFixed(0)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {analysisResults.length > 0 && !isLoading && (
            <ResultsTable
              results={analysisResults}
              onViewDetails={viewDetails}
            />
          )}
        </div>
      ) : (
        // Detail View: Chart, Setup, and Trade History Table
        detailedResult && analysisParams && (
          <div className="bg-card p-6 rounded-lg border">
            {/* Pass the corrected update function */}
            <StockDetailView
              result={detailedResult}
              params={analysisParams}
              onClose={closeDetails}
              onUpdateParams={updateAnalysis} // Pass the update handler
              isLoading={isLoadingDetails}
            />
          </div>
        )
      )}
    </div>
  );
}

