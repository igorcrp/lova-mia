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

// Função para gerar o histórico de negociações
const generateTradeHistory = (stockData: any[], params: StockAnalysisParams): TradeHistoryItem[] => {
  if (!stockData || stockData.length === 0) return [];
  
  // Ordenar os dados por data
  const sortedData = [...stockData].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  
  // Mapear os dados para o formato TradeHistoryItem
  return sortedData.map(record => ({
    date: record.date,
    open: record.open,
    high: record.high,
    low: record.low,
    close: record.close,
    volume: record.volume,
    exitPrice: record.close, // Usar o preço de fechamento como preço de saída
    trade: '-' as TradeHistoryItem['trade'],
    stop: '-' as TradeHistoryItem['stop'],
    profit: undefined,
    capital: undefined,
    suggestedEntryPrice: undefined,
    stopPrice: undefined
  }));
};

// Função para calcular a evolução do capital
const calculateCapitalEvolution = (tradeHistory: TradeHistoryItem[], initialCapital: number): { date: string, capital: number }[] => {
  const evolution: { date: string, capital: number }[] = [];
  let currentCapital = initialCapital;
  
  // Adicionar o capital inicial
  if (tradeHistory.length > 0) {
    evolution.push({ date: tradeHistory[0].date, capital: initialCapital });
  }
  
  // Calcular a evolução do capital com base nos lucros/perdas
  for (const trade of tradeHistory) {
    if (trade.profit !== undefined) {
      currentCapital += trade.profit;
      evolution.push({ date: trade.date, capital: currentCapital });
    }
  }
  
  return evolution;
};

// Função para calcular métricas detalhadas
const calculateDetailedMetrics = (
  stockData: any[], 
  tradeHistory: TradeHistoryItem[], 
  capitalEvolution: { date: string, capital: number }[], 
  params: StockAnalysisParams
) => {
  const tradingDays = stockData.length;
  
  // Filtrar operações executadas (com lucro/perda definido)
  const executedTrades = tradeHistory.filter(t => t.profit !== undefined);
  const trades = executedTrades.length;
  
  // Calcular porcentagem de dias com operações
  const tradePercentage = tradingDays > 0 ? (trades / tradingDays) * 100 : 0;
  
  // Contar operações lucrativas e com perdas
  const profits = executedTrades.filter(t => t.profit !== undefined && t.profit > 0).length;
  const losses = executedTrades.filter(t => t.profit !== undefined && t.profit < 0).length;
  const stops = executedTrades.filter(t => t.stop === 'Executed').length;
  
  // Calcular porcentagens
  const profitRate = trades > 0 ? (profits / trades) * 100 : 0;
  const lossRate = trades > 0 ? (losses / trades) * 100 : 0;
  const stopRate = trades > 0 ? (stops / trades) * 100 : 0;
  
  // Calcular lucro total
  const totalProfit = executedTrades.reduce((sum, t) => {
    return sum + (t.profit !== undefined ? t.profit : 0);
  }, 0);
  
  // Calcular capital final e lucro a partir da evolução do capital
  const finalCapital = capitalEvolution.length > 0 
    ? capitalEvolution[capitalEvolution.length - 1].capital 
    : params.initialCapital;
    
  const profit = finalCapital - params.initialCapital;
  const overallProfitPercentage = params.initialCapital > 0 ? (profit / params.initialCapital) * 100 : 0;
  
  // Calcular ganho e perda média
  const averageGain = profits > 0 
    ? totalProfit / profits 
    : 0;
    
  // Usar valor absoluto para cálculo de perda média
  const averageLoss = (losses + stops) > 0 // Considerar stops como perdas para cálculo de perda média
    ? Math.abs(executedTrades.filter(t => t.profit !== undefined && t.profit < 0).reduce((sum, t) => sum + (t.profit || 0), 0)) / (losses + stops) 
    : 0;
  
  // Calcular drawdown máximo a partir da evolução do capital
  let maxDrawdown = 0;
  let peak = params.initialCapital;
  
  for (const point of capitalEvolution) {
    // Garantir que o capital seja tratado como número
    const currentCapitalPoint = Number(point.capital);
    if (isNaN(currentCapitalPoint)) continue; // Pular se o capital não for um número

    if (currentCapitalPoint > peak) {
      peak = currentCapitalPoint;
    }
    
    // Calcular drawdown relativo ao pico
    const drawdown = peak > 0 ? (peak - currentCapitalPoint) / peak : 0;
    
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  maxDrawdown = maxDrawdown * 100; // Expressar como porcentagem
    
  // Cálculo de índices
  const sharpeRatio = calculateSharpeRatio(executedTrades, overallProfitPercentage);
  const sortinoRatio = calculateSortinoRatio(executedTrades, overallProfitPercentage);
  const recoveryFactor = maxDrawdown > 0 ? Math.abs(profit / (maxDrawdown / 100 * params.initialCapital)) : 0;
  
  // Calcular taxa de sucesso (Lucros / Total de Operações)
  const successRate = trades > 0 ? (profits / trades) * 100 : 0;
  
  return {
    tradingDays,
    trades,
    tradePercentage,
    profits,
    profitPercentage: profitRate,
    losses,
    lossPercentage: lossRate,
    stops,
    stopPercentage: stopRate,
    finalCapital,
    profit,
    averageGain,
    averageLoss,
    maxDrawdown,
    sharpeRatio,
    sortinoRatio,
    recoveryFactor,
    successRate
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
        
        // Definir o capital inicial no dia mais antigo do período selecionado
        if (i === 0 && weekTrades === Object.values(tradesByWeek)[0]) {
          currentDay.capital = params.initialCapital;
        } else if (i === 0) {
          // Para as semanas subsequentes, manter o capital atual
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
                const exitPrice = stopPriceCalculated;
                currentDay.trade = (params.operation === 'buy' ? 'Buy/Closed' : 'Sell/Closed') as TradeHistoryItem['trade'];
                currentDay.stop = 'Executed' as TradeHistoryItem['stop'];
                currentDay.profit = calculateProfit(activeTrade.suggestedEntryPrice, exitPrice, params.operation, activeTrade.volume);
                currentCapital += currentDay.profit;
                currentDay.capital = currentCapital;
                tradePairs.push({ open: activeTrade, close: { ...currentDay, exitPrice: exitPrice } });
                activeTrade = null; // Close trade
                stopPriceCalculated = null;
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
          }
        }
        
        // Add current day to processed history
        if (activeTrade && currentDay.trade !== 'Buy/Closed' && currentDay.trade !== 'Sell/Closed' && currentDay.trade !== 'Closed') {
          // Se há uma operação ativa e não foi fechada, manter o capital do dia anterior
          currentDay.capital = currentCapital;
          currentDay.profit = 0.00; // Profit/Loss é zero enquanto a operação está aberta
        }
        
        processedHistory.push(currentDay);
      }
    });
    
    return { processedHistory, tradePairs };
  };

  // Função para obter dados de ações
  const getStockData = async (
    tableName: string,
    stockCode: string,
    period: string
  ): Promise<any[]> => {
    try {
      return await api.analysis.getStockData(tableName, stockCode, period);
    } catch (error) {
      console.error(`Failed to get stock data for ${stockCode}:`, error);
      throw error;
    }
  };

  // Função para executar análise
  const runAnalysis = async (params: StockAnalysisParams) => {
    try {
      setIsLoading(true);
      setAnalysisResults([]);
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false); // Ensure detail view is closed on new analysis
      console.info('Running weekly analysis with params:', params);
      setProgress(10);
      
      let dataTableName = params.dataTableName || await api.marketData.getDataTableName(
        params.country, 
        params.stockMarket, 
        params.assetClass
      );
      
      if (!dataTableName) throw new Error("Failed to identify data source");
      setProgress(20);
      
      const paramsWithTable = { ...params, dataTableName };
      setAnalysisParams(paramsWithTable);
      
      // Obter lista de ações disponíveis
      const availableStocks = await api.analysis.getAvailableStocks(dataTableName);
      setProgress(30);
      
      // Processar cada ação
      const results = await Promise.all(
        availableStocks.slice(0, params.maxResults || 10).map(async (stock, index) => {
          try {
            // Obter dados históricos da ação
            const stockData = await getStockData(dataTableName, stock.code, params.period);
            
            // Gerar histórico de negociações
            const tradeHistory = generateTradeHistory(stockData, paramsWithTable);
            
            // Processar operações semanais
            const { processedHistory, tradePairs } = processWeeklyTrades(tradeHistory, paramsWithTable);
            
            // Filtrar pares de negociação com lucro/perda definido
            const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
            
            // Calcular métricas
            const trades = tradePairsFiltered.length;
            if (trades === 0) {
              return {
                assetCode: stock.code,
                assetName: stock.name || stock.code,
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
            
            // Calcular métricas detalhadas
            const profitsCount = tradePairsFiltered.filter(pair => pair.close.profit !== undefined && pair.close.profit > 0).length;
            const lossesCount = trades - profitsCount;
            const stopsCount = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;
            
            let finalCapital = params.initialCapital;
            tradePairsFiltered.forEach(pair => {
              if (pair.close.profit !== undefined) {
                finalCapital += pair.close.profit;
              }
            });
            
            const totalProfit = finalCapital - params.initialCapital;
            const profitPercentageTotal = (totalProfit / params.initialCapital) * 100;
            
            const gainTrades = tradePairsFiltered.filter(pair => pair.close.profit !== undefined && pair.close.profit > 0);
            const lossTrades = tradePairsFiltered.filter(pair => pair.close.profit !== undefined && pair.close.profit < 0);
            
            const averageGain = gainTrades.length > 0 
              ? gainTrades.reduce((sum, pair) => sum + (pair.close.profit || 0), 0) / gainTrades.length 
              : 0;
              
            const averageLoss = lossTrades.length > 0 
              ? lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close.profit || 0), 0) / lossTrades.length 
              : 0;
              
            const maxDrawdown = calculateMaxDrawdown(tradePairsFiltered.map(pair => pair.close), params.initialCapital);
            const sharpeRatio = calculateSharpeRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
            const sortinoRatio = calculateSortinoRatio(tradePairsFiltered.map(pair => pair.close), profitPercentageTotal);
            const recoveryFactor = maxDrawdown !== 0 
              ? Math.abs(totalProfit / (maxDrawdown / 100 * params.initialCapital)) 
              : (totalProfit > 0 ? Infinity : 0);
              
            // Atualizar progresso
            setProgress(30 + ((index + 1) / availableStocks.length) * 60);
            
            return {
              assetCode: stock.code,
              assetName: stock.name || stock.code,
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
          } catch (error) {
            console.error(`Error processing ${stock.code}:`, error);
            return {
              assetCode: stock.code,
              assetName: stock.name || stock.code,
              tradingDays: 0,
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
        })
      );
      
      setProgress(95);
      setAnalysisResults(results);
      setProgress(100);
      toast({ title: "Weekly analysis completed", description: "Analysis was completed successfully." });
    } catch (error) {
      console.error("Weekly analysis failed", error);
      toast({ 
        variant: "destructive", 
        title: "Analysis failed", 
        description: error instanceof Error ? error.message : "Unknown error" 
      });
      setProgress(0);
    } finally {
      setTimeout(() => setIsLoading(false), 500);
    }
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
      
      // Obter dados históricos da ação
      const stockData = await getStockData(
        paramsWithTable.dataTableName,
        assetCode,
        paramsWithTable.period
      );
      
      if (!stockData || stockData.length === 0) {
        throw new Error("No data found for the selected stock in the specified period");
      }
      
      // Gerar histórico de negociações
      const tradeHistory = generateTradeHistory(stockData, paramsWithTable);
      
      // Processar operações semanais
      const { processedHistory, tradePairs } = processWeeklyTrades(tradeHistory, paramsWithTable);
      
      // Calcular evolução do capital
      const capitalEvolution = calculateCapitalEvolution(processedHistory, paramsWithTable.initialCapital);
      
      // Calcular métricas detalhadas
      const metrics = calculateDetailedMetrics(stockData, processedHistory, capitalEvolution, paramsWithTable);
      
      // Criar resultado detalhado
      const detailedData: DetailedResult = {
        assetCode,
        assetName: assetCode,
        tradeHistory: processedHistory,
        capitalEvolution,
        ...metrics
      };
      
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

  // Função para atualizar análise
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
      
      // Obter dados históricos da ação
      const stockData = await getStockData(
        paramsWithTable.dataTableName,
        selectedAsset,
        paramsWithTable.period
      );
      
      if (!stockData || stockData.length === 0) {
        throw new Error("No data found for the selected stock in the specified period");
      }
      
      // Gerar histórico de negociações
      const tradeHistory = generateTradeHistory(stockData, paramsWithTable);
      
      // Processar operações semanais
      const { processedHistory, tradePairs } = processWeeklyTrades(tradeHistory, paramsWithTable);
      
      // Calcular evolução do capital
      const capitalEvolution = calculateCapitalEvolution(processedHistory, paramsWithTable.initialCapital);
      
      // Calcular métricas detalhadas
      const metrics = calculateDetailedMetrics(stockData, processedHistory, capitalEvolution, paramsWithTable);
      
      // Criar resultado detalhado
      const detailedData: DetailedResult = {
        assetCode: selectedAsset,
        assetName: selectedAsset,
        tradeHistory: processedHistory,
        capitalEvolution,
        ...metrics
      };
      
      setDetailedResult(detailedData);
      setAnalysisParams(paramsWithTable);
      
      toast({ title: "Analysis Updated", description: "Detailed view updated." });
    } catch (error) {
      console.error("Failed to update detailed analysis", error);
      toast({ 
        variant: "destructive", 
        title: "Update Failed", 
        description: error instanceof Error ? error.message : "Unknown error" 
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Função para fechar detalhes
  const closeDetails = () => {
    setShowDetailView(false);
    setDetailedResult(null);
    setSelectedAsset(null);
  };

  // Renderização do componente
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Weekly Portfolio</h1>
      
      {/* Renderização condicional baseada em showDetailView */} 
      {!showDetailView ? (
        // Visão Principal: Formulário de Configuração e Tabela de Resultados
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
        // Visão Detalhada: Renderizar APENAS se detailedResult e analysisParams existirem
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

