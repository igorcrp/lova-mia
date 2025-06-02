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
} from "@/utils/dateUtils";

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
        const weekKey = `${tradeDate.getFullYear()}-${tradeDate.getMonth()}-${getWeekNumber(tradeDate)}`;
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
        
        // Find first business day (Monday)
        const firstDay = weekTrades.find(day => isMondayOrFirstBusinessDay(new Date(day.date)));
        // Find last business day (Friday)
        const lastDay = weekTrades.find(day => isFridayOrLastBusinessDay(new Date(day.date)));
        
        if (!firstDay || !lastDay) return;
        
        // Try to open trade on Monday
        if (!activeTrade) {
          const previousDay = findPreviousDay(sortedHistory, firstDay.date);
          if (previousDay && previousDay.exitPrice !== undefined) {
            const entryPrice = previousDay.exitPrice;
            const referencePrice = getReferencePrice(previousDay, params.referencePrice);
            const entryThreshold = referencePrice * (1 + (params.entryPercentage / 100) * (params.operation === 'buy' ? 1 : -1));
            
            if ((params.operation === 'buy' && entryPrice >= entryThreshold) ||
                (params.operation === 'sell' && entryPrice <= entryThreshold)) {
              activeTrade = { 
                ...firstDay,
                trade: (params.operation === 'buy' ? 'Buy' : 'Sell') as TradeHistoryItem['trade'],
                suggestedEntryPrice: entryPrice,
                stopPrice: calculateStopPrice(entryPrice, params),
                profitLoss: 0,
                currentCapital
              };
              stopPriceCalculated = activeTrade.stopPrice;
              
              // Update Monday's data in processed history
              processedHistory.push(activeTrade);
            } else {
              processedHistory.push({ ...firstDay, trade: '-', currentCapital });
            }
          }
        }
        
        // Check if we have an active trade to close on Friday
        if (activeTrade && stopPriceCalculated) {
          const exitPrice = checkStopLoss(lastDay, stopPriceCalculated, params.operation) 
            ? stopPriceCalculated 
            : lastDay.exitPrice;
          
          const profit = calculateProfit(activeTrade.suggestedEntryPrice, exitPrice, params.operation, activeTrade.lotSize || 0);
          currentCapital += profit;
          
          const closeTrade: TradeHistoryItem = {
            ...lastDay,
            trade: 'Close',
            stopTrigger: checkStopLoss(lastDay, stopPriceCalculated, params.operation) ? 'Executed' : '-',
            profitLoss: profit,
            currentCapital
          };
          
          processedHistory.push(closeTrade);
          tradePairs.push({ open: activeTrade, close: closeTrade });
        } else {
          processedHistory.push({ ...lastDay, trade: '-', currentCapital });
        }
        
        // Add other days without trades
        weekTrades.forEach(day => {
          if (day.date !== firstDay.date && day.date !== lastDay.date) {
            processedHistory.push({ ...day, trade: '-', currentCapital });
          }
        });
      });
      
      return { processedHistory, tradePairs };
    };
    
    // Helper function to get week number
    function getWeekNumber(date: Date): number {
      const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
      const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
      return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    }

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
      
      const results = await api.analysis.runAnalysis(paramsWithTable, (currentProgress) => {
        setProgress(20 + currentProgress * 0.7);
      });
      
      // Processa cada resultado para obter detalhes e filtrar operações semanais
      const processedResults = await Promise.all(
        results.map(async (result) => {
          try {
            // Obtém detalhes para filtrar as operações
            const detailedData = await api.analysis.getDetailedAnalysis(result.assetCode, paramsWithTable);
            
            if (detailedData && detailedData.tradeHistory) {
              // Processa as operações semanais
              const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, params);
              
              // Filtra apenas os trades com operações (Buy/Sell e Close)
              const filteredTrades = processedHistory.filter(t => t.trade === 'Buy' || t.trade === 'Sell' || t.trade === 'Close');
              const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
              
              // Recalcula as métricas com base nos pares de operações
              const trades = tradePairsFiltered.length;
              const profits = tradePairsFiltered.filter(pair => pair.close.profit > 0).length;
              const losses = tradePairsFiltered.filter(pair => pair.close.profit < 0).length;
              const stops = tradePairsFiltered.filter(pair => pair.close.stop === 'Close').length;
              
              // Calcula o capital final e lucro
              let currentCapital = params.initialCapital;
              tradePairsFiltered.forEach(pair => {
                currentCapital += pair.close.profit;
              });
              
              const profit = currentCapital - params.initialCapital;
              const profitPercentage = (profit / params.initialCapital) * 100;
              
              // Calcula médias de ganho e perda
              const gainTrades = tradePairsFiltered.filter(pair => pair.close.profit > 0);
              const lossTrades = tradePairsFiltered.filter(pair => pair.close.profit < 0);
              const averageGain = gainTrades.length > 0 
                ? gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0) / gainTrades.length 
                : 0;
              const averageLoss = lossTrades.length > 0 
                ? lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close.profit), 0) / lossTrades.length 
                : 0;
              
              // Calcula métricas de risco
              const maxDrawdown = calculateMaxDrawdown(tradePairsFiltered.map(pair => pair.close), params.initialCapital);
              const volatility = calculateVolatility(tradePairsFiltered.map(pair => pair.close));
              const sharpeRatio = calculateSharpeRatio(tradePairsFiltered.map(pair => pair.close), profitPercentage);
              const sortinoRatio = calculateSortinoRatio(tradePairsFiltered.map(pair => pair.close), profitPercentage);
              const recoveryFactor = maxDrawdown !== 0 ? Math.abs(profit / maxDrawdown) : 0;
              
              // Atualiza o resultado com as métricas recalculadas
              return {
                ...result,
                tradingDays: processedHistory.length,
                trades,
                tradePercentage: trades > 0 ? 100 : 0,
                profits,
                profitPercentage: trades > 0 ? (profits / trades) * 100 : 0,
                losses,
                lossPercentage: trades > 0 ? (losses / trades) * 100 : 0,
                stops,
                stopPercentage: trades > 0 ? (stops / trades) * 100 : 0,
                finalCapital: currentCapital,
                profit,
                averageGain,
                averageLoss,
                maxDrawdown,
                sharpeRatio,
                sortinoRatio,
                recoveryFactor,
                successRate: trades > 0 ? (profits / trades) * 100 : 0
              };
            }
            
            return result;
          } catch (error) {
            console.error(`Error processing detailed data for ${result.assetCode}:`, error);
            return result;
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
      }, 500);
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
      
      // Processa as operações semanais
      if (detailedData && detailedData.tradeHistory) {
        const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
        detailedData.tradeHistory = processedHistory;
        detailedData.tradingDays = processedHistory.length;
        
        // Filtra apenas os trades com operações (Buy/Sell e Close)
        const filteredTrades = processedHistory.filter(t => t.trade === 'Buy' || t.trade === 'Sell' || t.trade === 'Close');
        const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
        
        // Agrupa em pares de operações (abertura e fechamento)
        for (let i = 0; i < filteredTrades.length; i++) {
          if (filteredTrades[i].trade === 'Buy' || filteredTrades[i].trade === 'Sell') {
            // Procura o fechamento correspondente
            const closeIndex = filteredTrades.findIndex((t, idx) => idx > i && t.trade === 'Close');
            if (closeIndex !== -1) {
              tradePairs.push({
                open: filteredTrades[i],
                close: filteredTrades[closeIndex]
              });
              i = closeIndex; // Avança para depois do fechamento
            }
          }
        }
        
        // Recalcula a evolução do capital
        if (tradePairs.length > 0) {
          let currentCapital = paramsWithTable.initialCapital;
          detailedData.capitalEvolution = tradePairs.map(pair => {
            currentCapital += pair.close.profit;
            return {
              date: pair.close.date,
              capital: currentCapital
            };
          });
          
          // Adiciona o ponto inicial
          detailedData.capitalEvolution.unshift({
            date: tradePairs[0]?.open.date || new Date().toISOString(),
            capital: paramsWithTable.initialCapital
          });
          
          // Recalcula métricas de risco
          const profit = currentCapital - paramsWithTable.initialCapital;
          const profitPercentage = (profit / paramsWithTable.initialCapital) * 100;
          
          detailedData.maxDrawdown = calculateMaxDrawdown(tradePairs.map(pair => pair.close), paramsWithTable.initialCapital);
          detailedData.sharpeRatio = calculateSharpeRatio(tradePairs.map(pair => pair.close), profitPercentage);
          detailedData.sortinoRatio = calculateSortinoRatio(tradePairs.map(pair => pair.close), profitPercentage);
          detailedData.recoveryFactor = detailedData.maxDrawdown !== 0 ? Math.abs(profit / detailedData.maxDrawdown) : 0;
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
  
  const updateAnalysis = async (params: StockAnalysisParams) => {
    if (!selectedAsset) return;
    
    try {
      setIsLoadingDetails(true);
      
      const dataTableName = params.dataTableName || await api.marketData.getDataTableName(
        params.country,
        params.stockMarket,
        params.assetClass
      );
      
      if (!dataTableName) {
        throw new Error("Failed to identify data source");
      }
      
      const paramsWithTable = {
        ...params,
        dataTableName
      };
      
      setAnalysisParams(paramsWithTable);
      
      // Executa a análise novamente com os novos parâmetros
      const results = await api.analysis.runAnalysis(paramsWithTable);
      
      // Processa os resultados para filtrar operações semanais
      const processedResults = await Promise.all(
        results.map(async (result) => {
          try {
            const detailedData = await api.analysis.getDetailedAnalysis(result.assetCode, paramsWithTable);
            
            if (detailedData && detailedData.tradeHistory) {
              // Processa as operações semanais
              const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
              
              // Filtra apenas os trades com operações (Buy/Sell e Close)
              const filteredTrades = processedHistory.filter(t => t.trade === 'Buy' || t.trade === 'Sell' || t.trade === 'Close');
              const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
              
              // Recalcula as métricas
              const trades = tradePairsFiltered.length;
              const profits = tradePairsFiltered.filter(pair => pair.close.profit > 0).length;
              const losses = tradePairsFiltered.filter(pair => pair.close.profit < 0).length;
              const stops = tradePairsFiltered.filter(pair => pair.close.stop === 'Close').length;
              
              let currentCapital = params.initialCapital;
              tradePairsFiltered.forEach(pair => {
                currentCapital += pair.close.profit;
              });
              
              const profit = currentCapital - params.initialCapital;
              const profitPercentage = (profit / params.initialCapital) * 100;
              
              const gainTrades = tradePairsFiltered.filter(pair => pair.close.profit > 0);
              const lossTrades = tradePairsFiltered.filter(pair => pair.close.profit < 0);
              const averageGain = gainTrades.length > 0 
                ? gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0) / gainTrades.length 
                : 0;
              const averageLoss = lossTrades.length > 0 
                ? lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close.profit), 0) / lossTrades.length 
                : 0;
              
              // Calcula métricas de risco
              const maxDrawdown = calculateMaxDrawdown(tradePairsFiltered.map(pair => pair.close), params.initialCapital);
              const volatility = calculateVolatility(tradePairsFiltered.map(pair => pair.close));
              const sharpeRatio = calculateSharpeRatio(tradePairsFiltered.map(pair => pair.close), profitPercentage);
              const sortinoRatio = calculateSortinoRatio(tradePairsFiltered.map(pair => pair.close), profitPercentage);
              const recoveryFactor = maxDrawdown !== 0 ? Math.abs(profit / maxDrawdown) : 0;
              
              return {
                ...result,
                tradingDays: processedHistory.length,
                trades,
                tradePercentage: trades > 0 ? 100 : 0,
                profits,
                profitPercentage: trades > 0 ? (profits / trades) * 100 : 0,
                losses,
                lossPercentage: trades > 0 ? (losses / trades) * 100 : 0,
                stops,
                stopPercentage: trades > 0 ? (stops / trades) * 100 : 0,
                finalCapital: currentCapital,
                profit,
                averageGain,
                averageLoss,
                maxDrawdown,
                sharpeRatio,
                sortinoRatio,
                recoveryFactor,
                successRate: trades > 0 ? (profits / trades) * 100 : 0
              };
            }
            
            return result;
          } catch (error) {
            console.error(`Error processing detailed data for ${result.assetCode}:`, error);
            return result;
          }
        })
      );
      
      setAnalysisResults(processedResults);
      
      // Atualiza os detalhes para o ativo selecionado
      const detailedData = await api.analysis.getDetailedAnalysis(selectedAsset, paramsWithTable);
      
      if (detailedData && detailedData.tradeHistory) {
        // Processa as operações semanais
        const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
        detailedData.tradeHistory = processedHistory;
        detailedData.tradingDays = processedHistory.length;
        
        // Filtra apenas os trades com operações (Buy/Sell e Close)
        const filteredTrades = processedHistory.filter(t => t.trade === 'Buy' || t.trade === 'Sell' || t.trade === 'Close');
        const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
        
        // Agrupa em pares de operações (abertura e fechamento)
        for (let i = 0; i < filteredTrades.length; i++) {
          if (filteredTrades[i].trade === 'Buy' || filteredTrades[i].trade === 'Sell') {
            // Procura o fechamento correspondente
            const closeIndex = filteredTrades.findIndex((t, idx) => idx > i && t.trade === 'Close');
            if (closeIndex !== -1) {
              tradePairs.push({
                open: filteredTrades[i],
                close: filteredTrades[closeIndex]
              });
              i = closeIndex; // Avança para depois do fechamento
            }
          }
        }
        
        // Recalcula a evolução do capital
        if (tradePairs.length > 0) {
          let currentCapital = paramsWithTable.initialCapital;
          detailedData.capitalEvolution = tradePairs.map(pair => {
            currentCapital += pair.close.profit;
            return {
              date: pair.close.date,
              capital: currentCapital
            };
          });
          
          // Adiciona o ponto inicial
          detailedData.capitalEvolution.unshift({
            date: tradePairs[0]?.open.date || new Date().toISOString(),
            capital: paramsWithTable.initialCapital
          });
          
          // Recalcula métricas de risco
          const profit = currentCapital - paramsWithTable.initialCapital;
          const profitPercentage = (profit / paramsWithTable.initialCapital) * 100;
          
          detailedData.maxDrawdown = calculateMaxDrawdown(tradePairs.map(pair => pair.close), paramsWithTable.initialCapital);
          detailedData.sharpeRatio = calculateSharpeRatio(tradePairs.map(pair => pair.close), profitPercentage);
          detailedData.sortinoRatio = calculateSortinoRatio(tradePairs.map(pair => pair.close), profitPercentage);
          detailedData.recoveryFactor = detailedData.maxDrawdown !== 0 ? Math.abs(profit / detailedData.maxDrawdown) : 0;
        }
      }
      
      setDetailedResult(detailedData);
      
      toast({
        title: "Weekly analysis updated",
        description: "Analysis was updated successfully",
      });
    } catch (error) {
      console.error("Weekly analysis update failed", error);
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
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
  
  // Funções para cálculo de métricas de risco
  const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
    if (trades.length === 0) return 0;
    
    let maxDrawdown = 0;
    let peak = initialCapital;
    let currentCapital = initialCapital;
    
    trades.forEach(trade => {
      if (trade.profit) {
        currentCapital += trade.profit;
        
        if (currentCapital > peak) {
          peak = currentCapital;
        }
        
        const drawdown = (peak - currentCapital) / peak;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
    });
    
    return maxDrawdown;
  };
  
  const calculateVolatility = (trades: TradeHistoryItem[]): number => {
    const profits = trades.filter(t => t.profit !== undefined).map(t => t.profit as number);
    if (profits.length < 2) return 0;
    
    const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
    const squaredDiffs = profits.map(p => Math.pow(p - mean, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / (profits.length - 1);
    
    return Math.sqrt(variance);
  };
  
  const calculateSharpeRatio = (trades: TradeHistoryItem[], totalReturn: number): number => {
    if (trades.length === 0) return 0;
    
    const riskFreeRate = 2.0; // 2% risk-free rate
    const volatility = calculateVolatility(trades);
    
    if (volatility === 0) return 0;
    
    return (totalReturn - riskFreeRate) / volatility;
  };
  
  const calculateSortinoRatio = (trades: TradeHistoryItem[], totalReturn: number): number => {
    const negativeReturns = trades
      .filter(t => t.profit !== undefined && t.profit < 0)
      .map(t => t.profit as number);
    
    if (negativeReturns.length === 0) return 0;
    
    const meanNegative = negativeReturns.reduce((sum, p) => sum + p, 0) / negativeReturns.length;
    const squaredDiffs = negativeReturns.map(p => Math.pow(p - meanNegative, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / negativeReturns.length;
    const downside = Math.sqrt(variance);
    
    if (downside === 0) return 0;
    
    const riskFreeRate = 2.0; // 2% risk-free rate
    return (totalReturn - riskFreeRate) / downside;
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
            <ResultsTable 
              results={analysisResults} 
              onViewDetails={viewDetails} 
            />
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

function getWeekKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isMondayOrFirstBusinessDay(date: Date): boolean {
  return date.getDay() === 1; // Monday
}

function isFridayOrLastBusinessDay(date: Date): boolean {
  return date.getDay() === 5; // Friday
}

function findPreviousDay(history: TradeHistoryItem[], date: string): TradeHistoryItem | null {
  const currentIndex = history.findIndex(item => item.date === date);
  return currentIndex > 0 ? history[currentIndex - 1] : null;
}

function getReferencePrice(day: TradeHistoryItem, referencePriceKey: string): number {
  return day[referencePriceKey] as number;
}

function calculateStopPrice(entryPrice: number, params: StockAnalysisParams): number {
  if (params.operation === 'buy') {
    return entryPrice - (entryPrice * (params.stopPercentage || 1) / 100);
  } else {
    return entryPrice + (entryPrice * (params.stopPercentage || 1) / 100);
  }
}

function checkStopLoss(currentDay: TradeHistoryItem, stopPrice: number, operation: string): boolean {
  if (operation === 'buy') {
    return currentDay.low <= stopPrice;
  } else {
    return currentDay.high >= stopPrice;
  }
}

function calculateProfit(entryPrice: number, exitPrice: number, operation: string, volume: number): number {
  if (operation === 'buy') {
    return (exitPrice - entryPrice) * volume;
  } else {
    return (entryPrice - exitPrice) * volume;
  }
}
