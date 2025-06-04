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
  formatDateISO,
  addDays
} from "@/utils/dateUtils";

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

const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
  if (!trades || trades.length === 0) return 0;
  let maxDrawdown = 0;
  let peakCapital = initialCapital;
  trades.forEach(trade => {
    const currentCapital = trade.capital;
    if (currentCapital === undefined) return;
    if (currentCapital > peakCapital) {
      peakCapital = currentCapital;
    }
    const drawdown = peakCapital === 0 ? 0 : (peakCapital - currentCapital) / peakCapital;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  });
  return maxDrawdown * 100;
};
const calculateVolatility = (trades: TradeHistoryItem[]): number => {
  const profits = trades.map(t => t.profit).filter(p => p !== undefined && p !== 0) as number[];
  if (profits.length < 2) return 0;
  const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
  const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (profits.length - 1);
  return Math.sqrt(variance);
};
const calculateSharpeRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
  const riskFreeRate = 0.02;
  const volatility = calculateVolatility(trades);
  if (volatility === 0) return 0;
  return (totalReturnPercentage / 100 - riskFreeRate) / volatility;
};
const calculateSortinoRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
  const riskFreeRate = 0.02;
  const negativeReturns = trades.map(t => t.profit).filter(p => p !== undefined && p < 0) as number[];
  if (negativeReturns.length === 0) return Infinity;
  const meanNegative = 0;
  const downsideVariance = negativeReturns.reduce((sum, p) => sum + Math.pow(p - meanNegative, 2), 0) / negativeReturns.length;
  const downsideDeviation = Math.sqrt(downsideVariance);
  if (downsideDeviation === 0) return Infinity;
  return (totalReturnPercentage / 100 - riskFreeRate) / downsideDeviation;
};

const processWeeklyTrades = (
  fullHistory: TradeHistoryItem[],
  params: StockAnalysisParams
): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } => {
  if (!fullHistory || fullHistory.length === 0) return { processedHistory: [], tradePairs: [] };

  const tradeExecutionHistory: TradeHistoryItem[] = [];
  const finalTradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] = [];
  const sortedHistory = [...fullHistory].sort((a, b) =>
    new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
  );

  let currentCapital = params.initialCapital;
  const tradesByWeek: { [weekKey: string]: TradeHistoryItem[] } = {};

  sortedHistory.forEach(trade => {
    const tradeDate = new Date(trade.date + 'T00:00:00Z');
    if (isNaN(tradeDate.getTime())) return;
    const weekKey = getWeekKey(tradeDate);
    if (!tradesByWeek[weekKey]) tradesByWeek[weekKey] = [];
    tradesByWeek[weekKey].push(trade);
  });

  Object.keys(tradesByWeek).sort().forEach(weekKey => {
    const weekTrades = tradesByWeek[weekKey];
    let activeTradeEntry: TradeHistoryItem | null = null;
    let stopPriceCalculated: number | null = null;
    let entryAttemptMadeThisWeek = false;
    let stopHitThisWeek = false;

    for (let i = 0; i < weekTrades.length; i++) {
      const currentDayData = weekTrades[i];
      const currentDate = new Date(currentDayData.date + 'T00:00:00Z');
      if (isNaN(currentDate.getTime())) continue;

      // Entrada
      if (!activeTradeEntry && !entryAttemptMadeThisWeek && !stopHitThisWeek && isMondayOrFirstBusinessDay(currentDate)) {
        entryAttemptMadeThisWeek = true;
        const previousDay = findPreviousDay(sortedHistory, currentDayData.date);
        if (previousDay && previousDay.exitPrice !== undefined) {
          const potentialEntryPrice = previousDay.exitPrice;
          const referencePrice = getReferencePrice(previousDay, params.referencePrice);
          const entryThreshold = referencePrice * (1 + (params.entryPercentage / 100) * (params.operation === 'buy' ? 1 : -1));

          if ((params.operation === 'buy' && potentialEntryPrice >= entryThreshold) ||
            (params.operation === 'sell' && potentialEntryPrice <= entryThreshold)) {
            const lotSize = currentCapital / potentialEntryPrice;
            const entryDayRecord: TradeHistoryItem = {
              ...currentDayData,
              trade: (params.operation === 'buy' ? 'Buy' : 'Sell'),
              suggestedEntryPrice: potentialEntryPrice,
              actualPrice: potentialEntryPrice,
              stopPrice: calculateStopPrice(potentialEntryPrice, params),
              lotSize: lotSize,
              stop: '-',
              profit: undefined,
              capital: undefined
            };
            activeTradeEntry = { ...entryDayRecord };
            stopPriceCalculated = entryDayRecord.stopPrice;
            tradeExecutionHistory.push(entryDayRecord);

            // Stop loss no mesmo dia
            if (stopPriceCalculated) {
              const stopHitToday = checkStopLoss(currentDayData, stopPriceCalculated, params.operation);
              if (stopHitToday) {
                const exitPrice = stopPriceCalculated;
                const profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
                const entryIndex = tradeExecutionHistory.length - 1;
                if (tradeExecutionHistory[entryIndex]?.date === currentDayData.date) {
                  tradeExecutionHistory[entryIndex] = {
                    ...tradeExecutionHistory[entryIndex],
                    trade: `${params.operation === 'buy' ? 'Buy' : 'Sell'}/Closed`,
                    stop: 'Executed',
                    profit: profit,
                    exitPrice: exitPrice,
                  };
                  finalTradePairs.push({
                    open: { ...activeTradeEntry },
                    close: { ...tradeExecutionHistory[entryIndex] }
                  });
                }
                activeTradeEntry = null;
                stopPriceCalculated = null;
                stopHitThisWeek = true;
              }
            }
          }
        }
      }
      // Saída (dias seguintes)
      if (activeTradeEntry && stopPriceCalculated && currentDayData.date !== activeTradeEntry.date) {
        let closedToday = false;
        const stopHit = checkStopLoss(currentDayData, stopPriceCalculated, params.operation);
        if (stopHit) {
          const exitPrice = stopPriceCalculated;
          const profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
          const closeRecord: TradeHistoryItem = {
            ...currentDayData,
            trade: 'Closed',
            stop: 'Executed',
            profit: profit,
            capital: undefined,
            suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
            actualPrice: activeTradeEntry.actualPrice,
            stopPrice: activeTradeEntry.stopPrice,
            lotSize: activeTradeEntry.lotSize,
            exitPrice: exitPrice
          };
          tradeExecutionHistory.push(closeRecord);
          finalTradePairs.push({ open: { ...activeTradeEntry }, close: { ...closeRecord } });
          activeTradeEntry = null;
          stopPriceCalculated = null;
          closedToday = true;
          stopHitThisWeek = true;
          break;
        }
        // Fechamento na sexta/último dia
        if (!closedToday && isFridayOrLastBusinessDay(currentDate)) {
          const exitPrice = typeof currentDayData.close === 'number' ? currentDayData.close : undefined;
          if (exitPrice !== undefined) {
            const profit = calculateProfit(activeTradeEntry.actualPrice, exitPrice, params.operation, activeTradeEntry.lotSize);
            const closeRecord: TradeHistoryItem = {
              ...currentDayData,
              trade: 'Closed',
              stop: '-',
              profit: profit,
              capital: undefined,
              suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
              actualPrice: activeTradeEntry.actualPrice,
              stopPrice: activeTradeEntry.stopPrice,
              lotSize: activeTradeEntry.lotSize,
              exitPrice: exitPrice
            };
            tradeExecutionHistory.push(closeRecord);
            finalTradePairs.push({ open: { ...activeTradeEntry }, close: { ...closeRecord } });
            activeTradeEntry = null;
            stopPriceCalculated = null;
            closedToday = true;
          }
        }
      }
    }
  });

  // Geração do histórico completo (agora inclui todos os dias úteis)
  const completeHistoryWithCapital: TradeHistoryItem[] = [];
  const tradeExecutionMap = new Map(tradeExecutionHistory.map(item => [item.date, item]));
  let previousDayCapital = params.initialCapital;

  if (sortedHistory.length > 0) {
    const firstDayStr = sortedHistory[0].date;
    const lastDayStr = sortedHistory[sortedHistory.length - 1].date;
    let currentDate = new Date(firstDayStr + 'T00:00:00Z');
    const lastDate = new Date(lastDayStr + 'T00:00:00Z');
    const rawDataMap = new Map(sortedHistory.map(item => [item.date, item]));

    while (currentDate <= lastDate) {
      const currentDateStr = formatDateISO(currentDate);

      if (currentDate.getUTCDay() !== 0 && currentDate.getUTCDay() !== 6) {
        const rawDayData = rawDataMap.get(currentDateStr);
        const tradeAction = tradeExecutionMap.get(currentDateStr);
        const dailyProfit = tradeAction?.profit ?? 0;

        let currentDayCapital: number;
        if (currentDateStr === firstDayStr) {
          currentDayCapital = params.initialCapital;
          if (tradeAction && (tradeAction.trade === 'Buy/Closed' || tradeAction.trade === 'Sell/Closed')) {
            currentDayCapital += dailyProfit;
          }
        } else {
          currentDayCapital = previousDayCapital;
          if (tradeAction && (tradeAction.trade === 'Buy/Closed' || tradeAction.trade === 'Sell/Closed' || tradeAction.trade === 'Closed')) {
            currentDayCapital += dailyProfit;
          }
        }

        // GARANTE QUE OS CAMPOS BASE SÃO SEMPRE OS DADOS ORIGINAIS DA API
        const displayRecord: TradeHistoryItem = {
          date: currentDateStr,
          open: rawDayData?.open ?? 0,
          high: rawDayData?.high ?? 0,
          low: rawDayData?.low ?? 0,
          close: rawDayData?.close ?? 0,
          volume: rawDayData?.volume ?? 0,
          trade: tradeAction?.trade ?? '-',
          suggestedEntryPrice: tradeAction?.suggestedEntryPrice,
          actualPrice: tradeAction?.actualPrice,
          lotSize: tradeAction?.lotSize ?? 0,
          stopPrice: tradeAction?.stopPrice,
          stop: tradeAction?.stop ?? '-',
          profit: tradeAction?.profit,
          exitPrice: rawDayData?.close ?? 0, // <-- SEMPRE O CLOSE DO BANCO/API
          capital: currentDayCapital,
        };

        completeHistoryWithCapital.push(displayRecord);
        previousDayCapital = currentDayCapital;
      }
      currentDate = addDays(currentDate, 1);
    }
  }

  return {
    processedHistory: completeHistoryWithCapital,
    tradePairs: finalTradePairs
  };
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

  // runAnalysis function
  const runAnalysis = async (params: StockAnalysisParams) => {
    try {
      setIsLoading(true);
      setAnalysisResults([]);
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false);
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
              const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
              const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
              const trades = tradePairsFiltered.length;

              let summaryResult: AnalysisResult = { ...result, tradingDays: processedHistory.length, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };

              if (trades > 0) {
                const profitsCount = tradePairsFiltered.filter(pair => pair.close.profit > 0).length;
                const lossesCount = trades - profitsCount;
                const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;
                const finalCapital = processedHistory.length > 0 ? processedHistory[processedHistory.length - 1].capital ?? params.initialCapital : params.initialCapital;
                const totalProfit = finalCapital - params.initialCapital;
                const profitPercentageTotal = params.initialCapital === 0 ? 0 : (totalProfit / params.initialCapital) * 100;
                const gainTrades = tradePairsFiltered.filter(pair => pair.close.profit > 0);
                const lossTrades = tradePairsFiltered.filter(pair => pair.close.profit < 0);
                const averageGain = gainTrades.length > 0 ? gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0) / gainTrades.length : 0;
                const averageLoss = lossTrades.length > 0 ? lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close.profit), 0) / lossTrades.length : 0;
                const closeRecordsForRisk = tradePairsFiltered.map(pair => pair.close);
                const maxDrawdown = calculateMaxDrawdown(processedHistory, params.initialCapital);
                const sharpeRatio = calculateSharpeRatio(closeRecordsForRisk, profitPercentageTotal);
                const sortinoRatio = calculateSortinoRatio(closeRecordsForRisk, profitPercentageTotal);
                const maxDrawdownValue = (maxDrawdown / 100 * params.initialCapital);
                const recoveryFactor = maxDrawdownValue !== 0 ? Math.abs(totalProfit / maxDrawdownValue) : (totalProfit > 0 ? Infinity : 0);

                summaryResult = {
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
                  recoveryFactor
                };
              } else {
                summaryResult.finalCapital = params.initialCapital;
                summaryResult.tradingDays = processedHistory.length;
              }
              return summaryResult;
            }
            return { ...result, tradingDays: 0, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };
          } catch (error) {
            return { ...result, tradingDays: 0, trades: 0, profits: 0, losses: 0, stops: 0, finalCapital: params.initialCapital, profit: 0, successRate: 0, averageGain: 0, averageLoss: 0, maxDrawdown: 0, sharpeRatio: 0, sortinoRatio: 0, recoveryFactor: 0 };
          }
        })
      );
      setProgress(95);
      setAnalysisResults(processedResults);
      setProgress(100);
      toast({ title: "Weekly analysis completed", description: "Analysis was completed successfully (v3.1 logic)." });
    } catch (error) {
      toast({ variant: "destructive", title: "Analysis failed", description: error instanceof Error ? error.message : "Unknown error" });
    }
    finally { setTimeout(() => setIsLoading(false), 500); }
  };

  // viewDetails function
  const viewDetails = async (assetCode: string) => {
    if (!analysisParams) return;
    try {
      setIsLoadingDetails(true);
      setSelectedAsset(assetCode);

      const paramsWithTable = analysisParams.dataTableName
        ? analysisParams
        : { ...analysisParams, dataTableName: await api.marketData.getDataTableName(analysisParams.country, analysisParams.stockMarket, analysisParams.assetClass) };

      if (!paramsWithTable.dataTableName) throw new Error("Could not determine data table name");

      const rawDetailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsWithTable);

      if (rawDetailedData && rawDetailedData.tradeHistory) {
        const { processedHistory, tradePairs } = processWeeklyTrades(rawDetailedData.tradeHistory, paramsWithTable);
        rawDetailedData.tradeHistory = processedHistory;
        rawDetailedData.tradingDays = processedHistory.length;

        const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);

        if (processedHistory.length > 0) {
          rawDetailedData.capitalEvolution = processedHistory.map(day => ({
            date: day.date,
            capital: day.capital ?? paramsWithTable.initialCapital
          }));
        } else {
          rawDetailedData.capitalEvolution = [{ date: '', capital: paramsWithTable.initialCapital }];
        }

        if (tradePairsFiltered.length > 0) {
          let finalCapitalFromTrades = paramsWithTable.initialCapital;
          tradePairsFiltered.forEach(pair => { finalCapitalFromTrades += pair.close.profit; });
          const totalProfit = finalCapitalFromTrades - paramsWithTable.initialCapital;
          const profitPercentageTotal = paramsWithTable.initialCapital === 0 ? 0 : (totalProfit / paramsWithTable.initialCapital) * 100;
          const closeRecordsForRisk = tradePairsFiltered.map(pair => pair.close);

          rawDetailedData.maxDrawdown = calculateMaxDrawdown(processedHistory, paramsWithTable.initialCapital);
          rawDetailedData.sharpeRatio = calculateSharpeRatio(closeRecordsForRisk, profitPercentageTotal);
          rawDetailedData.sortinoRatio = calculateSortinoRatio(closeRecordsForRisk, profitPercentageTotal);
          const maxDrawdownValue = (rawDetailedData.maxDrawdown / 100 * paramsWithTable.initialCapital);
          rawDetailedData.recoveryFactor = maxDrawdownValue !== 0 ? Math.abs(totalProfit / maxDrawdownValue) : (totalProfit > 0 ? Infinity : 0);
        } else {
          rawDetailedData.maxDrawdown = 0; rawDetailedData.sharpeRatio = 0; rawDetailedData.sortinoRatio = 0; rawDetailedData.recoveryFactor = 0;
        }

        setDetailedResult(rawDetailedData);
        setShowDetailView(true);

      } else {
        toast({ variant: "destructive", title: "Failed to fetch details", description: "No trade history data found." });
        setDetailedResult(null);
        setShowDetailView(false);
      }

    } catch (error) {
      toast({ variant: "destructive", title: "Failed to fetch details", description: error instanceof Error ? error.message : "An unknown error occurred" });
      setShowDetailView(false);
      setDetailedResult(null);
      setSelectedAsset(null);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const updateAnalysis = async (updatedParams: StockAnalysisParams) => {
    if (!selectedAsset) return;
    setAnalysisParams(updatedParams);
    await viewDetails(selectedAsset);
    toast({ title: "Analysis Updated", description: "Detailed view updated (v3.1 logic)." });
  };

  const closeDetails = () => {
    setShowDetailView(false);
    setDetailedResult(null);
    setSelectedAsset(null);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Weekly Portfolio</h1>
      {!showDetailView ? (
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
