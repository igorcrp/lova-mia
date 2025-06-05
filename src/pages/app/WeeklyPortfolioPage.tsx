import { useState } from "react";
import { StockSetupForm } from "@/components/StockSetupForm";
import { ResultsTable } from "@/components/ResultsTable";
import { StockDetailView } from "@/components/StockDetailView";
import { api } from "@/services/api";
import { AnalysisResult, DetailedResult, StockAnalysisParams, TradeHistoryItem } from "@/types";
import { toast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";

// Funções utilitárias
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
  if (!entryPrice || !exitPrice || !lotSize) return 0;
  return (operation === 'buy' ? exitPrice - entryPrice : entryPrice - exitPrice) * lotSize;
}

// Funções de análise financeira
function calculateMaxDrawdown(trades: TradeHistoryItem[], initialCapital: number): number {
  let maxDrawdown = 0;
  let peak = initialCapital;
  let current = initialCapital;

  trades.forEach(trade => {
    if (trade.profit) {
      current += trade.profit;
      if (current > peak) peak = current;
      const drawdown = peak > 0 ? (peak - current) / peak : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
  });

  return maxDrawdown * 100;
}

function calculateVolatility(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  return Math.sqrt(variance);
}

function calculateSharpeRatio(returns: number[], riskFreeRate: number = 0.02): number {
  const volatility = calculateVolatility(returns);
  if (volatility === 0) return 0;
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  return (meanReturn - riskFreeRate) / volatility;
}

function calculateSortinoRatio(returns: number[], riskFreeRate: number = 0.02): number {
  const negativeReturns = returns.filter(r => r < 0);
  if (negativeReturns.length === 0) return Infinity;
  
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const downsideVariance = negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length;
  const downsideDeviation = Math.sqrt(downsideVariance);
  
  return downsideDeviation === 0 ? Infinity : (meanReturn - riskFreeRate) / downsideDeviation;
}

// Função principal de processamento de trades semanais
const processWeeklyTrades = (
  fullHistory: TradeHistoryItem[],
  params: StockAnalysisParams
): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } => {
  if (!fullHistory || fullHistory.length === 0) {
    return { processedHistory: [], tradePairs: [] };
  }

  const processedHistory: TradeHistoryItem[] = [];
  const tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] = [];
  const sortedHistory = [...fullHistory].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  let currentCapital = params.initialCapital;
  let hasActiveTrade = false;
  let openTrade: TradeHistoryItem | null = null;
  let stopPrice: number | null = null;

  // Primeiro dia sempre mantém o capital inicial
  const firstDay = sortedHistory[0];
  processedHistory.push({
    ...firstDay,
    trade: '-',
    profit: 0,
    capital: params.initialCapital,
    stop: '-'
  });
  
  let weekBuffer: TradeHistoryItem[] = [];
  let lastWeekKey = "";

  for (let i = 1; i < sortedHistory.length; i++) {
    const day = sortedHistory[i];
    const dateObj = new Date(day.date);
    const weekKey = getWeekKey(dateObj);
    
    if (weekKey !== lastWeekKey) {
      if (weekBuffer.length > 0) {
        processWeek(weekBuffer);
      }
      weekBuffer = [];
    }
    weekBuffer.push(day);
    lastWeekKey = weekKey;
  }
  if (weekBuffer.length > 0) {
    processWeek(weekBuffer);
  }

  function processWeek(weekDays: TradeHistoryItem[]) {
    const firstDayOfWeek = weekDays[0];
    const dateObj = new Date(firstDayOfWeek.date);

    // Verificar se pode abrir operação
    if (!hasActiveTrade && isMondayOrFirstBusinessDay(dateObj)) {
      const suggestedEntryPrice = firstDayOfWeek.open;
      stopPrice = calculateStopPrice(suggestedEntryPrice, params);
      const lotSize = Math.floor(currentCapital / suggestedEntryPrice / 10) * 10;

      // Verificar stop no mesmo dia
      const stopHitSameDay =
        (params.operation === 'buy' && firstDayOfWeek.low <= stopPrice) ||
        (params.operation === 'sell' && firstDayOfWeek.high >= stopPrice);

      if (stopHitSameDay) {
        // Stop hit no mesmo dia
        const profit = calculateProfit(suggestedEntryPrice, stopPrice, params.operation, lotSize);
        currentCapital += profit;
        
        const tradeDay = {
          ...firstDayOfWeek,
          trade: `${params.operation === 'buy' ? 'Buy' : 'Sell'}/Closed`,
          suggestedEntryPrice,
          stopPrice,
          lotSize,
          profit,
          capital: currentCapital,
          stop: 'Executed'
        };
        
        processedHistory.push(tradeDay);
        tradePairs.push({ open: tradeDay, close: tradeDay });
      } else {
        // Abertura normal
        const tradeDay = {
          ...firstDayOfWeek,
          trade: params.operation === 'buy' ? 'Buy' : 'Sell',
          suggestedEntryPrice,
          stopPrice,
          lotSize,
          profit: 0,
          capital: currentCapital,
          stop: '-'
        };
        
        processedHistory.push(tradeDay);
        openTrade = tradeDay;
        hasActiveTrade = true;
      }
    } else {
      // Dia sem abertura de operação
      processedHistory.push({
        ...firstDayOfWeek,
        trade: '-',
        profit: 0,
        capital: currentCapital,
        stop: '-'
      });
    }

    // Processar dias restantes da semana
    for (let i = 1; i < weekDays.length; i++) {
      const currentDay = weekDays[i];
      
      if (hasActiveTrade && openTrade && stopPrice) {
        // Verificar stop
        const stopHit =
          (params.operation === 'buy' && currentDay.low <= stopPrice) ||
          (params.operation === 'sell' && currentDay.high >= stopPrice);

        if (stopHit || i === weekDays.length - 1) {
          // Stop hit ou último dia da semana
          const closePrice = stopHit ? stopPrice : currentDay.close;
          const profit = calculateProfit(
            openTrade.suggestedEntryPrice,
            closePrice,
            params.operation,
            openTrade.lotSize
          );
          currentCapital += profit;

          const closeDay = {
            ...currentDay,
            trade: 'Closed',
            profit,
            capital: currentCapital,
            stop: stopHit ? 'Executed' : '-'
          };

          processedHistory.push(closeDay);
          tradePairs.push({ open: openTrade, close: closeDay });
          hasActiveTrade = false;
          openTrade = null;
          stopPrice = null;
        } else {
          // Dia intermediário com operação aberta
          processedHistory.push({
            ...currentDay,
            trade: '-',
            profit: 0,
            capital: currentCapital,
            stop: '-'
          });
        }
      } else {
        // Dia sem operação ativa
        processedHistory.push({
          ...currentDay,
          trade: '-',
          profit: 0,
          capital: currentCapital,
          stop: '-'
        });
      }
    }
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

  const runAnalysis = async (params: StockAnalysisParams) => {
    try {
      setIsLoading(true);
      setAnalysisResults([]);
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false);

      const dataTableName = params.dataTableName || await api.marketData.getDataTableName(
        params.country,
        params.stockMarket,
        params.assetClass
      );

      if (!dataTableName) {
        throw new Error("Failed to identify data source");
      }

      setProgress(20);
      const paramsWithTable = { ...params, dataTableName };
      setAnalysisParams(paramsWithTable);

      // Buscar ações disponíveis
      const stocks = await api.analysis.getAvailableStocks(dataTableName);
      setProgress(30);

      const results = await Promise.all(
        stocks.map(async (stock) => {
          try {
            const stockData = await api.analysis.getStockData(dataTableName, stock.code, params.period);
            if (!stockData || stockData.length === 0) return null;

            const { processedHistory, tradePairs } = processWeeklyTrades(stockData, paramsWithTable);
            
            // Calcular métricas
            const trades = tradePairs.length;
            if (trades === 0) {
              return {
                assetCode: stock.code,
                assetName: stock.name,
                tradingDays: processedHistory.length,
                trades: 0,
                profits: 0,
                losses: 0,
                stops: 0,
                finalCapital: params.initialCapital,
                profit: 0,
                successRate: 0,
                averageGain: 0,
                averageLoss: 0,
                maxDrawdown: 0,
                sharpeRatio: 0,
                sortinoRatio: 0,
                recoveryFactor: 0
              };
            }

            const profits = tradePairs.filter(pair => pair.close.profit > 0).length;
            const losses = trades - profits;
            const stops = tradePairs.filter(pair => pair.close.stop === 'Executed').length;
            const finalCapital = tradePairs[tradePairs.length - 1].close.capital;
            const totalProfit = finalCapital - params.initialCapital;
            const successRate = (profits / trades) * 100;

            const gainTrades = tradePairs.filter(pair => pair.close.profit > 0);
            const lossTrades = tradePairs.filter(pair => pair.close.profit < 0);
            const averageGain = gainTrades.length > 0
              ? gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0) / gainTrades.length
              : 0;
            const averageLoss = lossTrades.length > 0
              ? Math.abs(lossTrades.reduce((sum, pair) => sum + pair.close.profit, 0)) / lossTrades.length
              : 0;

            const maxDrawdown = calculateMaxDrawdown(processedHistory, params.initialCapital);
            const returns = tradePairs.map(pair => pair.close.profit / params.initialCapital);
            const sharpeRatio = calculateSharpeRatio(returns);
            const sortinoRatio = calculateSortinoRatio(returns);
            const recoveryFactor = maxDrawdown !== 0 ? Math.abs(totalProfit / (maxDrawdown / 100 * params.initialCapital)) : (totalProfit > 0 ? Infinity : 0);

            return {
              assetCode: stock.code,
              assetName: stock.name,
              tradingDays: processedHistory.length,
              trades,
              profits,
              losses,
              stops,
              finalCapital,
              profit: totalProfit,
              successRate,
              averageGain,
              averageLoss,
              maxDrawdown,
              sharpeRatio,
              sortinoRatio,
              recoveryFactor
            };
          } catch (error) {
            console.error(`Error analyzing ${stock.code}:`, error);
            return null;
          }
        })
      );

      setProgress(90);
      const validResults = results.filter((r): r is AnalysisResult => r !== null);
      setAnalysisResults(validResults);
      setProgress(100);
      toast({
        title: "Weekly analysis completed",
        description: "Analysis was completed successfully."
      });
    } catch (error) {
      console.error("Weekly analysis failed:", error);
      toast({
        variant: "destructive",
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "Unknown error"
      });
    } finally {
      setTimeout(() => setIsLoading(false), 500);
    }
  };

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
          
          detailedData.capitalEvolution.unshift({
            date: tradePairsFiltered[0]?.open.date || processedHistory[0]?.date || '',
            capital: paramsWithTable.initialCapital
          });

          const finalCapital = currentCapital;
          const totalProfit = finalCapital - paramsWithTable.initialCapital;
          const profitPercentageTotal = (totalProfit / paramsWithTable.initialCapital) * 100;

          detailedData.maxDrawdown = calculateMaxDrawdown(tradePairsFiltered.map(pair => pair.close), paramsWithTable.initialCapital);
          
          const returns = tradePairs.map(pair => pair.close.profit / paramsWithTable.initialCapital);
          detailedData.sharpeRatio = calculateSharpeRatio(returns);
          detailedData.sortinoRatio = calculateSortinoRatio(returns);
          detailedData.recoveryFactor = detailedData.maxDrawdown !== 0 
            ? Math.abs(totalProfit / (detailedData.maxDrawdown / 100 * paramsWithTable.initialCapital)) 
            : (totalProfit > 0 ? Infinity : 0);
        } else {
          detailedData.capitalEvolution = [{
            date: processedHistory[0]?.date || '',
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
      console.error("Failed to fetch detailed analysis:", error);
      toast({
        variant: "destructive",
        title: "Failed to fetch details",
        description: error instanceof Error ? error.message : "An unknown error occurred"
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const updateAnalysis = async (updatedParams: StockAnalysisParams) => {
    if (!selectedAsset) return;
    try {
      setIsLoadingDetails(true);
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

      await viewDetails(selectedAsset);
      setAnalysisParams(paramsWithTable);
      
      toast({
        title: "Analysis Updated",
        description: "Detailed view has been updated with new parameters."
      });
    } catch (error) {
      console.error("Failed to update analysis:", error);
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred"
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
