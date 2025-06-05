import { useState } from "react";
import { StockSetupForm } from "@/components/StockSetupForm";
import { ResultsTable } from "@/components/ResultsTable";
import { StockDetailView } from "@/components/StockDetailView";
import { api } from "@/services/api";
import { AnalysisResult, DetailedResult, StockAnalysisParams, TradeHistoryItem } from "@/types";
import { toast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";

// Funções utilitárias para datas e cálculos
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
  return date.getUTCDay() === 1 || [1, 2, 3, 4, 5].includes(date.getUTCDay());
}

function calculateStopPrice(entryPrice: number, params: StockAnalysisParams): number {
  const stopPercent = params.stopPercentage ?? 0;
  return entryPrice * (1 + (params.operation === 'buy' ? -1 : 1) * (stopPercent / 100));
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
  let currentCapital = initialCapital;
  trades.forEach(trade => {
    if (trade.profit !== undefined) {
      currentCapital += trade.profit;
      if (currentCapital > peakCapital) peakCapital = currentCapital;
      const drawdown = peakCapital === 0 ? 0 : (peakCapital - currentCapital) / peakCapital;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
  });
  return maxDrawdown * 100; // Percentual
};
const calculateVolatility = (trades: TradeHistoryItem[]): number => {
  const profits = trades.map(t => t.profit).filter(p => p !== undefined) as number[];
  if (profits.length < 2) return 0;
  const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
  const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (profits.length - 1);
  return Math.sqrt(variance);
};
const calculateSharpeRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
  const riskFreeRate = 0.02; // Anualizado
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

// Função PRINCIPAL: processamento semanal conforme regras do usuário
const processWeeklyTrades = (
  fullHistory: TradeHistoryItem[],
  params: StockAnalysisParams
): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } => {
  if (!fullHistory || fullHistory.length === 0) return { processedHistory: [], tradePairs: [] };

  const processedHistory: TradeHistoryItem[] = [];
  const tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] = [];
  const sortedHistory = [...fullHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let currentCapital = params.initialCapital;
  let hasActiveTrade = false;
  let openTrade: TradeHistoryItem | null = null;
  let stopPrice: number | null = null;

  let weekBuffer: TradeHistoryItem[] = [];
  let lastWeekKey = "";
  for (let i = 0; i < sortedHistory.length; i++) {
    const day = sortedHistory[i];
    const dateObj = new Date(day.date);
    const weekKey = getWeekKey(dateObj);
    if (weekKey !== lastWeekKey && weekBuffer.length > 0) {
      processWeek(weekBuffer);
      weekBuffer = [];
    }
    weekBuffer.push(day);
    lastWeekKey = weekKey;
  }
  if (weekBuffer.length > 0) processWeek(weekBuffer);

  function processWeek(weekDays: TradeHistoryItem[]) {
    const firstDay = weekDays[0];
    const lastDay = weekDays[weekDays.length - 1];

    let openedThisWeek = false;
    let closedThisWeek = false;
    let tradeOpenDay: TradeHistoryItem | null = null;
    let tradeCloseDay: TradeHistoryItem | null = null;
    let localStopPrice: number | null = null;
    let localLotSize: number | null = null;

    // 1. Tentativa de abertura no primeiro dia útil
    const dateObj = new Date(firstDay.date);
    // Substitua por sua lógica de setup!
    const setupOk = true; // Exemplo: sempre abre, ajuste conforme necessário

    if (!hasActiveTrade && setupOk) {
      const suggestedEntryPrice = firstDay.open;
      localStopPrice = calculateStopPrice(suggestedEntryPrice, params);
      localLotSize = Math.floor(currentCapital / suggestedEntryPrice / 10) * 10;

      const stopHitSameDay =
        (params.operation === 'buy' && firstDay.low <= localStopPrice) ||
        (params.operation === 'sell' && firstDay.high >= localStopPrice);

      let tradeLabel: TradeHistoryItem['trade'] = params.operation === 'buy' ? 'Buy' : 'Sell';
      let tradeStr = tradeLabel;
      let pl = 0;
      let closedNow = false;

      if (stopHitSameDay) {
        tradeStr = params.operation === 'buy' ? 'Buy/Closed' : 'Sell/Closed';
        pl = params.operation === 'buy'
          ? (localStopPrice - suggestedEntryPrice) * localLotSize
          : (suggestedEntryPrice - localStopPrice) * localLotSize;
        closedNow = true;
        closedThisWeek = true;
        hasActiveTrade = false;
        currentCapital += pl;
        tradeCloseDay = {
          ...firstDay,
          trade: tradeStr,
          suggestedEntryPrice,
          stopPrice: localStopPrice,
          lotSize: localLotSize,
          profit: pl,
          capital: currentCapital,
          stop: 'Executed'
        };
        processedHistory.push(tradeCloseDay);
        tradePairs.push({ open: tradeCloseDay, close: tradeCloseDay });
        return;
      } else {
        tradeOpenDay = {
          ...firstDay,
          trade: tradeStr,
          suggestedEntryPrice,
          stopPrice: localStopPrice,
          lotSize: localLotSize,
          profit: 0,
          capital: currentCapital,
          stop: '-'
        };
        processedHistory.push(tradeOpenDay);
        hasActiveTrade = true;
        openedThisWeek = true;
        openTrade = tradeOpenDay;
        stopPrice = localStopPrice;
      }
    } else {
      processedHistory.push({
        ...firstDay,
        trade: '-',
        profit: 0,
        capital: currentCapital,
        stop: '-'
      });
    }

    // 2. Dias subsequentes da semana
    for (let idx = 1; idx < weekDays.length; idx++) {
      const day = weekDays[idx];
      if (hasActiveTrade && openTrade && stopPrice && !closedThisWeek) {
        const stopHit =
          (params.operation === 'buy' && day.low <= stopPrice) ||
          (params.operation === 'sell' && day.high >= stopPrice);
        if (stopHit) {
          let pl = params.operation === 'buy'
            ? (stopPrice - (openTrade.suggestedEntryPrice ?? 0)) * (openTrade.lotSize ?? 0)
            : ((openTrade.suggestedEntryPrice ?? 0) - stopPrice) * (openTrade.lotSize ?? 0);
          currentCapital += pl;
          const closeDay = {
            ...day,
            trade: 'Closed',
            profit: pl,
            capital: currentCapital,
            stop: 'Executed'
          };
          processedHistory.push(closeDay);
          tradePairs.push({ open: openTrade, close: closeDay });
          hasActiveTrade = false;
          closedThisWeek = true;
          continue;
        }
        if (idx === weekDays.length - 1) {
          let pl = params.operation === 'buy'
            ? (day.close - (openTrade.suggestedEntryPrice ?? 0)) * (openTrade.lotSize ?? 0)
            : ((openTrade.suggestedEntryPrice ?? 0) - day.close) * (openTrade.lotSize ?? 0);
          currentCapital += pl;
          const closeDay = {
            ...day,
            trade: 'Closed',
            profit: pl,
            capital: currentCapital,
            stop: '-'
          };
          processedHistory.push(closeDay);
          tradePairs.push({ open: openTrade, close: closeDay });
          hasActiveTrade = false;
          closedThisWeek = true;
          continue;
        }
        processedHistory.push({
          ...day,
          trade: '-',
          profit: 0,
          capital: currentCapital,
          stop: '-'
        });
      } else {
        processedHistory.push({
          ...day,
          trade: '-',
          profit: 0,
          capital: currentCapital,
          stop: '-'
        });
      }
    }
    openTrade = null;
    stopPrice = null;
  }

  return { processedHistory, tradePairs };
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

  // Função para rodar análise
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
    } catch (error) {
      console.error("Weekly analysis failed", error);
      toast({ variant: "destructive", title: "Analysis failed", description: error instanceof Error ? error.message : "Unknown error" });
    } finally { setTimeout(() => setIsLoading(false), 500); }
  };

  // Função para visualizar detalhes
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
      if (detailedData && detailedData.tradeHistory) {
        const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
        detailedData.tradeHistory = processedHistory;
        detailedData.tradingDays = processedHistory.length;
        const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
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

  // updateAnalysis
  const updateAnalysis = async (updatedParams: StockAnalysisParams) => {
    if (!selectedAsset) return;
    try {
      setIsLoadingDetails(true);
      const paramsWithTable = updatedParams.dataTableName ? updatedParams : { ...updatedParams, dataTableName: await api.marketData.getDataTableName(updatedParams.country, updatedParams.stockMarket, updatedParams.assetClass) };
      if (!paramsWithTable.dataTableName) throw new Error("Could not determine data table name for update");
      const detailedData = await api.analysis.getDetailedAnalysis(selectedAsset, paramsWithTable);
      if (detailedData && detailedData.tradeHistory) {
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
      setDetailedResult(detailedData);
      setAnalysisParams(paramsWithTable);
      toast({ title: "Analysis Updated", description: "Detailed view updated (v4 logic)." });
    } catch (error) { console.error("Failed to update detailed analysis", error); toast({ variant: "destructive", title: "Update Failed", description: error instanceof Error ? error.message : "Unknown error" }); }
    finally { setIsLoadingDetails(false); }
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
