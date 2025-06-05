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

// Helper functions (getWeekKey, isMondayOrFirstBusinessDay, etc. - kept from v2)
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

function findPreviousDay(history: TradeHistoryItem[], currentDateStr: string): TradeHistoryItem | null {
  const currentDateIndex = history.findIndex(item => item.date === currentDateStr);
  return currentDateIndex > 0 ? history[currentDateIndex - 1] : null;
}

function getReferencePrice(day: TradeHistoryItem, referencePriceKey: string): number {
  const price = day[referencePriceKey as keyof TradeHistoryItem];
  return typeof price === 'number' ? price : 0;
}

function calculateStopPrice(entryPrice: number, params: StockAnalysisParams): number {
  const stopPercent = params.stopPercentage ?? 0;
  return entryPrice * (1 + (params.operation === 'buy' ? -1 : 1) * (stopPercent / 100));
}

function checkStopLoss(currentDay: TradeHistoryItem, stopPrice: number, operation: string): boolean {
  const low = typeof currentDay.low === 'number' ? currentDay.low : -Infinity;
  const high = typeof currentDay.high === 'number' ? currentDay.high : Infinity;
  return operation === 'buy' ? low <= stopPrice : high >= stopPrice;
}

function calculateProfit(entryPrice: number | undefined, exitPrice: number | undefined, operation: string, lotSize: number | undefined): number {
  if (entryPrice === undefined || exitPrice === undefined || lotSize === undefined || lotSize === 0) return 0;
  const numEntryPrice = Number(entryPrice);
  const numExitPrice = Number(exitPrice);
  if (isNaN(numEntryPrice) || isNaN(numExitPrice)) return 0;
  return (operation === 'buy' ? numExitPrice - numEntryPrice : numEntryPrice - numExitPrice) * lotSize;
}

// Risk Calculation Placeholders (kept from v2)
const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
    if (!trades || trades.length === 0) return 0;
    let maxDrawdown = 0;
    let peakCapital = initialCapital;
    let currentCapital = initialCapital;
    trades.forEach(trade => {
      if (trade.profit !== undefined) {
        currentCapital += trade.profit;
        if (currentCapital > peakCapital) peakCapital = currentCapital;
        const drawdown = peakCapital === 0 ? 0 : (peakCapital - currentCapital) / peakCapital;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }
    });
    return maxDrawdown * 100; // Percentage
};
const calculateVolatility = (trades: TradeHistoryItem[]): number => {
    const profits = trades.map(t => t.profit).filter(p => p !== undefined) as number[];
    if (profits.length < 2) return 0;
    const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
    const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (profits.length - 1);
    return Math.sqrt(variance);
};
const calculateSharpeRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02; // Annualized
    const volatility = calculateVolatility(trades);
    if (volatility === 0) return 0;
    return (totalReturnPercentage / 100 - riskFreeRate) / volatility; // Simplified
};
const calculateSortinoRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02;
    const negativeReturns = trades.map(t => t.profit).filter(p => p !== undefined && p < 0) as number[];
    if (negativeReturns.length === 0) return Infinity;
    const meanNegative = 0; // Target return
    const downsideVariance = negativeReturns.reduce((sum, p) => sum + Math.pow(p - meanNegative, 2), 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);
    if (downsideDeviation === 0) return Infinity;
    return (totalReturnPercentage / 100 - riskFreeRate) / downsideDeviation; // Simplified
};

export default function WeeklyPortfolioPage() {
  const [analysisParams, setAnalysisParams] = useState<StockAnalysisParams | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);

  // Função para processar operações semanais
  const processWeeklyTrades = (fullHistory: TradeHistoryItem[], params: StockAnalysisParams): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } => {
    if (!fullHistory || fullHistory.length === 0) return { processedHistory: [], tradePairs: [] };
    
    const processedHistory: TradeHistoryItem[] = [];
    const tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] = [];
    const sortedHistory = [...fullHistory].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    let currentCapital = params.initialCapital;
    
    // Group trades by week
    const tradesByWeek: { [weekKey: string]: TradeHistoryItem[] } = {};
    for (let i = 0; i < sortedHistory.length; i++) {
      const trade = sortedHistory[i];
      const tradeDate = new Date(trade.date);
      const weekKey = getWeekKey(tradeDate);
      if (!tradesByWeek[weekKey]) {
        tradesByWeek[weekKey] = [];
      }
      tradesByWeek[weekKey].push(trade);
    }
    
    // Process each week - ensuring only one trade per week
    Object.keys(tradesByWeek).forEach(weekKey => {
      const weekTrades = tradesByWeek[weekKey];
      let activeTrade: TradeHistoryItem | null = null;
      let stopPriceCalculated: number | null = null;
      let entryDayFound = false;

      for (let i = 0; i < weekTrades.length; i++) {
        const currentDayData = weekTrades[i];
        const currentDay = { ...currentDayData, trade: '-' as TradeHistoryItem['trade'], profit: undefined, capital: undefined, stop: '-' as TradeHistoryItem['stop'] }; // Default state
        const currentDate = new Date(currentDay.date);

        // Try to open trade on Monday
        if (!entryDayFound && isMondayOrFirstBusinessDay(currentDate) && !activeTrade) {
          const previousDay = findPreviousDay(sortedHistory, currentDay.date);
          if (previousDay && previousDay.exitPrice !== undefined) {
            const entryPrice = previousDay.exitPrice;
            activeTrade = { ...currentDay }; // Store entry details
            
            // Determine entry signal based on price movement
            const referencePrice = getReferencePrice(previousDay, params.referencePrice);
            const entryThreshold = referencePrice * (1 + (params.entryPercentage / 100) * (params.operation === 'buy' ? 1 : -1));
            
            if ((params.operation === 'buy' && entryPrice >= entryThreshold) ||
                (params.operation === 'sell' && entryPrice <= entryThreshold)) {
              activeTrade.suggestedEntryPrice = entryPrice;
              activeTrade.trade = (params.operation === 'buy' ? 'Buy' : 'Sell') as TradeHistoryItem['trade'];
              stopPriceCalculated = calculateStopPrice(entryPrice, params);
              activeTrade.stopPrice = stopPriceCalculated;
              
              currentDay.trade = activeTrade.trade;
              currentDay.suggestedEntryPrice = activeTrade.suggestedEntryPrice;
              currentDay.stopPrice = activeTrade.stopPrice;
              entryDayFound = true; // Mark entry day found for this week
            } else {
              activeTrade = null; // No entry signal
            }
          }
        }

        // If a trade is active
        if (activeTrade && stopPriceCalculated && currentDay.date !== activeTrade.date) {
          // Check Stop Loss
          const stopHit = checkStopLoss(currentDay, stopPriceCalculated, params.operation);
          if (stopHit) {
            const exitPrice = stopPriceCalculated;
            currentDay.trade = 'Close' as TradeHistoryItem['trade'];
            currentDay.stop = 'Executed' as TradeHistoryItem['stop'];
            currentDay.profit = calculateProfit(activeTrade.suggestedEntryPrice, exitPrice, params.operation, activeTrade.volume);
            currentCapital += currentDay.profit;
            currentDay.capital = currentCapital;
            tradePairs.push({ open: activeTrade, close: { ...currentDay, exitPrice: exitPrice } });
            activeTrade = null; // Close trade
            stopPriceCalculated = null;
          } else if (isFridayOrLastBusinessDay(currentDate)) {
            // Check End of Week
            const exitPrice = currentDay.exitPrice;
            currentDay.trade = 'Close' as TradeHistoryItem['trade'];
            currentDay.profit = calculateProfit(activeTrade.suggestedEntryPrice, exitPrice, params.operation, activeTrade.volume);
            currentCapital += currentDay.profit;
            currentDay.capital = currentCapital;
            tradePairs.push({ open: activeTrade, close: { ...currentDay } });
            activeTrade = null; // Close trade
            stopPriceCalculated = null;
          }
        }
        
        // Add current day to processed history
        if (currentDay.trade !== 'Close') {
           currentDay.capital = activeTrade ? undefined : currentCapital; // Show capital only after close or if no trade active
        }
        processedHistory.push(currentDay);
      }
    });
    
    return { processedHistory, tradePairs };
  };

  // runAnalysis function (kept from v2 - uses refined processWeeklyTrades)
  const runAnalysis = async (params: StockAnalysisParams) => {
    try {
      setIsLoading(true);
      setAnalysisResults([]);
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false); // Ensure detail view is closed on new analysis
      console.info('Running weekly analysis (v4) with params:', params);
      setProgress(10);
      let dataTableName = params.dataTableName || await api.marketData.getDataTableName(params.country, params.stockMarket, params.assetClass);
      if (!dataTableName) throw new Error("Failed to identify data source");
      setProgress(20);
      const paramsWithTable = { ...params, dataTableName };
      setAnalysisParams(paramsWithTable);
      const results = await api.analysis.runAnalysis(paramsWithTable, (p) => setProgress(20 + p * 0.7));
      const processedResults = await Promise.all(
        results.map(async (result) => {
          try {
            const detailedData = await api.analysis.getDetailedAnalysis(result.assetCode, paramsWithTable);
            if (detailedData && detailedData.tradeHistory) {
              // *** Use REFINED v2 processWeeklyTrades function ***
              const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
              const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
              const trades = tradePairsFiltered.length;
              if (trades === 0) return { ...result, tradingDays: processedHistory.length, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };
              const profitsCount = tradePairsFiltered.filter(pair => pair.close.profit > 0).length;
              const lossesCount = trades - profitsCount;
              const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;
              let finalCapital = params.initialCapital; tradePairsFiltered.forEach(pair => { finalCapital += pair.close.profit; });
              const totalProfit = finalCapital - params.initialCapital;
              const profitPercentageTotal = (totalProfit / params.initialCapital) * 100;
              const gainTrades = tradePairsFiltered.filter(pair => pair.close.profit > 0);
              const lossTrades = tradePairsFiltered.filter(pair => pair.close.profit < 0);
              const averageGain = gainTrades.length > 0 ? gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0) / gainTrades.length : 0;
              const averageLoss = lossTrades.length > 0 ? lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close.profit), 0) / lossTrades.length : 0;
              const maxDrawdown = calculateMaxDrawdown(tradePairsFiltered.map(pair => pair.close), params.initialCapital);
              const sharpeRatio = calculateSharpeRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
              const sortinoRatio = calculateSortinoRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
              const recoveryFactor = maxDrawdown !== 0 ? Math.abs(totalProfit / (maxDrawdown / 100 * params.initialCapital)) : (totalProfit > 0 ? Infinity : 0);
              return { ...result, tradingDays: processedHistory.length, trades, profits: profitsCount, losses: lossesCount, stops: stopsCount, finalCapital, profit: totalProfit, successRate: trades > 0 ? (profitsCount / trades) * 100 : 0, averageGain, averageLoss, maxDrawdown, sharpeRatio, sortinoRatio, recoveryFactor };
            }
            return result;
          } catch (error) { console.error(`Error processing ${result.assetCode}:`, error); return result; }
        })
      );
      setProgress(95);
      setAnalysisResults(processedResults);
      setProgress(100);
      toast({ title: "Weekly analysis completed", description: "Analysis was completed successfully (v4 logic)." });
    } catch (error) { console.error("Weekly analysis failed", error); toast({ variant: "destructive", title: "Analysis failed", description: error instanceof Error ? error.message : "Unknown error" }); setProgress(0); }
    finally { setTimeout(() => setIsLoading(false), 500); }
  };

  // *** viewDetails function - RESTORED from v1 (WeeklyPortfolioPage_corrected.tsx) ***
  const viewDetails = async (assetCode: string) => {
    if (!analysisParams) return;
    
    try {
      setIsLoadingDetails(true);
      setSelectedAsset(assetCode);
      
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
      
      const detailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsWithTable);
      
      // Processa as operações semanais (using v2 refined logic)
      if (detailedData && detailedData.tradeHistory) {
        // *** Use REFINED v2 processWeeklyTrades function ***
        const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
        detailedData.tradeHistory = processedHistory;
        detailedData.tradingDays = processedHistory.length;
        
        const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
        
        // Recalcula a evolução do capital (using v2 logic)
        if (tradePairsFiltered.length > 0) {
          let currentCapital = paramsWithTable.initialCapital;
          detailedData.capitalEvolution = tradePairsFiltered.map(pair => {
            currentCapital += pair.close.profit;
            return { date: pair.close.date, capital: currentCapital };
          });
          detailedData.capitalEvolution.unshift({ date: tradePairsFiltered[0]?.open.date || processedHistory[0]?.date || '', capital: paramsWithTable.initialCapital });
          
          const finalCapital = currentCapital;
          const totalProfit = finalCapital - paramsWithTable.initialCapital;
          const profitPercentageTotal = (totalProfit / paramsWithTable.initialCapital) * 100;
          detailedData.maxDrawdown = calculateMaxDrawdown(tradePairsFiltered.map(pair => pair.close), paramsWithTable.initialCapital);
          detailedData.sharpeRatio = calculateSharpeRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
          detailedData.sortinoRatio = calculateSortinoRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
          detailedData.recoveryFactor = detailedData.maxDrawdown !== 0 ? Math.abs(totalProfit / (detailedData.maxDrawdown / 100 * paramsWithTable.initialCapital)) : (totalProfit > 0 ? Infinity : 0);
        } else {
           detailedData.capitalEvolution = [{ date: processedHistory[0]?.date || '', capital: paramsWithTable.initialCapital }];
           detailedData.maxDrawdown = 0; detailedData.sharpeRatio = 0; detailedData.sortinoRatio = 0; detailedData.recoveryFactor = 0;
        }
      }
      
      // *** Logic from v1 ***
      setDetailedResult(detailedData);
      setShowDetailView(true); 
      // *** End of Logic from v1 ***

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

  // updateAnalysis function (kept from v2 - uses refined processWeeklyTrades)
  const updateAnalysis = async (updatedParams: StockAnalysisParams) => {
     if (!selectedAsset) return;
     try {
       setIsLoadingDetails(true);
       const paramsWithTable = updatedParams.dataTableName ? updatedParams : { ...updatedParams, dataTableName: await api.marketData.getDataTableName(updatedParams.country, updatedParams.stockMarket, updatedParams.assetClass) };
       if (!paramsWithTable.dataTableName) throw new Error("Could not determine data table name for update");
       const detailedData = await api.analysis.getDetailedAnalysis(selectedAsset, paramsWithTable);
       if (detailedData && detailedData.tradeHistory) {
         // *** Use REFINED v2 processWeeklyTrades function ***
         const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
         detailedData.tradeHistory = processedHistory;
         detailedData.tradingDays = processedHistory.length;
         const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
         if (tradePairsFiltered.length > 0) {
           let currentCapital = paramsWithTable.initialCapital;
           detailedData.capitalEvolution = tradePairsFiltered.map(pair => { currentCapital += pair.close.profit; return { date: pair.close.date, capital: currentCapital }; });
           detailedData.capitalEvolution.unshift({ date: tradePairsFiltered[0]?.open.date || processedHistory[0]?.date || '', capital: paramsWithTable.initialCapital });
           const finalCapital = currentCapital;
           const totalProfit = finalCapital - paramsWithTable.initialCapital;
           const profitPercentageTotal = (totalProfit / paramsWithTable.initialCapital) * 100;
           detailedData.maxDrawdown = calculateMaxDrawdown(tradePairsFiltered.map(pair => pair.close), paramsWithTable.initialCapital);
           detailedData.sharpeRatio = calculateSharpeRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
           detailedData.sortinoRatio = calculateSortinoRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
           detailedData.recoveryFactor = detailedData.maxDrawdown !== 0 ? Math.abs(totalProfit / (detailedData.maxDrawdown / 100 * paramsWithTable.initialCapital)) : (totalProfit > 0 ? Infinity : 0);
         } else {
           detailedData.capitalEvolution = [{ date: processedHistory[0]?.date || '', capital: paramsWithTable.initialCapital }];
           detailedData.maxDrawdown = 0; detailedData.sharpeRatio = 0; detailedData.sortinoRatio = 0; detailedData.recoveryFactor = 0;
         }
       }
       setDetailedResult(detailedData); // Update result
       setAnalysisParams(paramsWithTable); // Update params
       toast({ title: "Analysis Updated", description: "Detailed view updated (v4 logic)." });
     } catch (error) { console.error("Failed to update detailed analysis", error); toast({ variant: "destructive", title: "Update Failed", description: error instanceof Error ? error.message : "Unknown error" }); }
     finally { setIsLoadingDetails(false); }
  };

  // closeDetails function (kept from v2)
  const closeDetails = () => {
    setShowDetailView(false);
    setDetailedResult(null);
    setSelectedAsset(null);
  };

  // --- RETURN JSX - RESTORED from v1 (WeeklyPortfolioPage_corrected.tsx) --- 
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Weekly Portfolio</h1>
      
      {/* Conditional rendering based on showDetailView */} 
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
            <ResultsTable results={analysisResults} onViewDetails={viewDetails} />
          )}
        </div>
      ) : (
        // Detail View: Render ONLY if detailedResult and analysisParams exist
        detailedResult && analysisParams && (
          <div className="bg-card p-6 rounded-lg border">
            <StockDetailView
              result={detailedResult} // Pass the validated result
              params={analysisParams}
              onClose={closeDetails}
              onUpdateParams={updateAnalysis}
              isLoading={isLoadingDetails} // Pass loading state
            />
          </div>
        )
        // If detailedResult is null or analysisParams is null, this block won't render,
        // effectively showing nothing or the previous view until data is ready.
      )}
    </div>
  );
}

