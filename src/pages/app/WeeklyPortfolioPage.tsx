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
        
        // Definir o capital inicial para o dia mais antigo do período selecionado
        if (i === 0 && weekTrades[0] === sortedHistory[0]) {
          currentDay.capital = params.initialCapital;
        } else if (i === 0) {
          // Para o primeiro dia de outras semanas, manter o capital atual
          currentDay.capital = currentCapital;
        }
        
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
              
              // Verificar se o Stop Price foi atingido no mesmo dia da operação
              const stopHitSameDay = checkStopLoss(currentDay, stopPriceCalculated, params.operation);
              if (stopHitSameDay) {
                // Se o Stop Price foi atingido no mesmo dia, marcar como Buy/Closed ou Sell/Closed
                currentDay.trade = `${currentDay.trade}/Closed` as TradeHistoryItem['trade'];
                currentDay.stop = 'Executed' as TradeHistoryItem['stop'];
                const exitPrice = stopPriceCalculated;
                currentDay.profit = calculateProfit(entryPrice, exitPrice, params.operation, currentDay.volume);
                currentCapital += currentDay.profit;
                currentDay.capital = currentCapital;
                tradePairs.push({ open: activeTrade, close: { ...currentDay, exitPrice: exitPrice } });
                activeTrade = null; // Close trade
                stopPriceCalculated = null;
              } else {
                // Se o Stop Price não foi atingido no mesmo dia, zerar o Profit/Loss
                currentDay.profit = 0;
                currentDay.capital = currentCapital; // Manter o capital atual
              }
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
            currentDay.trade = 'Closed' as TradeHistoryItem['trade'];
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
            currentDay.trade = 'Closed' as TradeHistoryItem['trade'];
            currentDay.profit = calculateProfit(activeTrade.suggestedEntryPrice, exitPrice, params.operation, activeTrade.volume);
            currentCapital += currentDay.profit;
            currentDay.capital = currentCapital;
            tradePairs.push({ open: activeTrade, close: { ...currentDay } });
            activeTrade = null; // Close trade
            stopPriceCalculated = null;
          } else {
            // Operação ainda ativa, mas não encerrada - manter capital do dia anterior
            currentDay.profit = 0;
            currentDay.capital = currentCapital;
          }
        }
        
        // Se não for o primeiro dia e não tiver capital definido, usar o capital atual
        if (currentDay.capital === undefined) {
          currentDay.capital = currentCapital;
        }
        
        // Add current day to processed history
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
      
      const detailedData = await api.analysis.getDetailedAnalysis(
        assetCode,
        paramsWithTable
      );
      
      if (!detailedData) {
        throw new Error("Failed to fetch detailed data");
      }
      
      // Process the trade history with the updated Weekly logic
      const { processedHistory, tradePairs } = processWeeklyTrades(
        detailedData.tradeHistory,
        {
          ...paramsWithTable,
          interval: 'weekly' // Adiciona o parâmetro interval para identificar que é Weekly
        }
      );
      
      // Calculate additional metrics
      const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
      const trades = tradePairsFiltered.length;
      
      if (trades === 0) {
        setDetailedResult({
          ...detailedData,
          assetCode,
          tradeHistory: processedHistory,
          tradingDays: processedHistory.length,
          trades: 0,
          profits: 0,
          losses: 0,
          stops: 0,
          finalCapital: paramsWithTable.initialCapital,
          profit: 0,
          successRate: 0,
          profitPercentage: 0,
          lossPercentage: 0,
          tradePercentage: 0,
          stopPercentage: 0,
          averageGain: 0,
          averageLoss: 0,
          maxDrawdown: 0,
          sharpeRatio: 0,
          sortinoRatio: 0,
          recoveryFactor: 0,
          capitalEvolution: processedHistory.map(day => ({
            date: day.date,
            capital: day.capital !== undefined ? day.capital : paramsWithTable.initialCapital
          }))
        });
      } else {
        const profitsCount = tradePairsFiltered.filter(pair => pair.close.profit > 0).length;
        const lossesCount = trades - profitsCount;
        const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;
        
        let finalCapital = paramsWithTable.initialCapital;
        tradePairsFiltered.forEach(pair => {
          finalCapital += pair.close.profit;
        });
        
        const totalProfit = finalCapital - paramsWithTable.initialCapital;
        const profitPercentageTotal = (totalProfit / paramsWithTable.initialCapital) * 100;
        
        const gainTrades = tradePairsFiltered.filter(pair => pair.close.profit > 0);
        const lossTrades = tradePairsFiltered.filter(pair => pair.close.profit < 0);
        
        const averageGain = gainTrades.length > 0
          ? gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0) / gainTrades.length
          : 0;
          
        const averageLoss = lossTrades.length > 0
          ? lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close.profit), 0) / lossTrades.length
          : 0;
          
        const maxDrawdown = calculateMaxDrawdown(
          tradePairsFiltered.map(pair => pair.close),
          paramsWithTable.initialCapital
        );
        
        const sharpeRatio = calculateSharpeRatio(
          tradePairsFiltered.map(pair => pair.close),
          profitPercentageTotal
        );
        
        const sortinoRatio = calculateSortinoRatio(
          tradePairsFiltered.map(pair => pair.close),
          profitPercentageTotal
        );
        
        const recoveryFactor = maxDrawdown !== 0
          ? Math.abs(totalProfit / (maxDrawdown / 100 * paramsWithTable.initialCapital))
          : (totalProfit > 0 ? Infinity : 0);
          
        // Prepare capital evolution data
        const capitalEvolution = processedHistory.map(day => ({
          date: day.date,
          capital: day.capital !== undefined ? day.capital : paramsWithTable.initialCapital
        }));
        
        // Calculate percentages
        const profitPercentage = trades > 0 ? (profitsCount / trades) * 100 : 0;
        const lossPercentage = trades > 0 ? (lossesCount / trades) * 100 : 0;
        const tradePercentage = processedHistory.length > 0 ? (trades / processedHistory.length) * 100 : 0;
        const stopPercentage = trades > 0 ? (stopsCount / trades) * 100 : 0;
        
        // Add profit percentage to each trade for chart
        const tradeHistoryWithPercentages = processedHistory.map(day => {
          const profitPercentage = day.profit !== undefined && day.profit !== 0 && day.capital !== undefined
            ? (day.profit / (day.capital - day.profit)) * 100
            : 0;
            
          return {
            ...day,
            profitPercentage
          };
        });
        
        setDetailedResult({
          ...detailedData,
          assetCode,
          tradeHistory: tradeHistoryWithPercentages,
          tradingDays: processedHistory.length,
          trades,
          profits: profitsCount,
          losses: lossesCount,
          stops: stopsCount,
          finalCapital,
          profit: totalProfit,
          successRate: profitPercentage,
          profitPercentage,
          lossPercentage,
          tradePercentage,
          stopPercentage,
          averageGain,
          averageLoss,
          maxDrawdown,
          sharpeRatio,
          sortinoRatio,
          recoveryFactor,
          capitalEvolution
        });
      }
      
      setShowDetailView(true);
    } catch (error) {
      console.error("Failed to load details:", error);
      toast({
        variant: "destructive",
        title: "Failed to load details",
        description: error instanceof Error ? error.message : "Unknown error"
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Weekly Portfolio Analysis</h1>
        <p className="text-muted-foreground">
          Analyze stocks with a weekly trading strategy. Trades open on the first business day of the week
          and close on the last business day or when stop loss is triggered.
        </p>
      </div>

      {isLoading && (
        <div className="w-full mt-4">
          <Progress value={progress} className="h-2" />
          <p className="text-sm text-muted-foreground mt-2">
            {progress < 100 ? "Processing..." : "Completed"}
          </p>
        </div>
      )}

      {!showDetailView ? (
        <>
          <StockSetupForm onSubmit={runAnalysis} isLoading={isLoading} />
          
          {analysisResults.length > 0 && (
            <ResultsTable 
              results={analysisResults} 
              onViewDetails={viewDetails}
              isLoading={isLoadingDetails}
            />
          )}
        </>
      ) : (
        detailedResult && (
          <StockDetailView 
            result={detailedResult}
            params={{
              ...analysisParams!,
              interval: 'weekly' // Adiciona o parâmetro interval para identificar que é Weekly
            }}
            onClose={() => setShowDetailView(false)}
            onUpdateParams={runAnalysis}
            isLoading={isLoadingDetails}
          />
        )
      )}
    </div>
  );
}
