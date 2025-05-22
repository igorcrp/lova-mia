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

  // Função para processar operações semanais
  const processWeeklyTrades = (tradeHistory: TradeHistoryItem[]): TradeHistoryItem[] => {
    if (!tradeHistory || tradeHistory.length === 0) return [];
    
    // Ordena o histórico por data
    const sortedHistory = [...tradeHistory].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    // Agrupa as operações por semana
    const tradesByWeek: { [weekKey: string]: TradeHistoryItem[] } = {};
    
    for (let i = 0; i < sortedHistory.length; i++) {
      const trade = sortedHistory[i];
      const tradeDate = new Date(trade.date);
      const weekStart = new Date(tradeDate);
      weekStart.setDate(weekStart.getDate() - (weekStart.getDay() - 1)); // Ajusta para segunda-feira
      const weekKey = `${weekStart.getFullYear()}-${weekStart.getMonth()}-${weekStart.getDate()}`;
      
      if (!tradesByWeek[weekKey]) {
        tradesByWeek[weekKey] = [];
      }
      
      tradesByWeek[weekKey].push(trade);
    }
    
    // Processa cada semana
    const processedTrades: TradeHistoryItem[] = [];
    let currentCapital = analysisParams?.initialCapital || 10000;
    
    Object.keys(tradesByWeek).forEach(weekKey => {
      const weekTrades = tradesByWeek[weekKey];
      
      // Encontra o primeiro dia útil da semana (segunda-feira)
      let firstDayTrade: TradeHistoryItem | null = null;
      let firstDayIndex = -1;
      
      for (let i = 0; i < weekTrades.length; i++) {
        const trade = weekTrades[i];
        const tradeDate = new Date(trade.date);
        
        if (isFirstBusinessDayOfWeek(tradeDate)) {
          firstDayTrade = trade;
          firstDayIndex = i;
          break;
        }
      }
      
      // Se não encontrou segunda-feira, usa o primeiro dia disponível
      if (!firstDayTrade && weekTrades.length > 0) {
        firstDayTrade = weekTrades[0];
        firstDayIndex = 0;
      }
      
      // Se temos um dia para iniciar a operação
      if (firstDayTrade) {
        // Marca todos os dias da semana como parte do histórico
        for (let i = 0; i < weekTrades.length; i++) {
          const currentTrade = { ...weekTrades[i] };
          
          // Para o primeiro dia (abertura da operação)
          if (i === firstDayIndex) {
            // Usa o preço do dia anterior para abertura (se disponível)
            const previousDayIndex = sortedHistory.findIndex(t => t.date === currentTrade.date) - 1;
            if (previousDayIndex >= 0) {
              const previousDay = sortedHistory[previousDayIndex];
              currentTrade.suggestedEntryPrice = previousDay.exitPrice; // Usa o Close do dia anterior
            }
            
            // Marca como "Buy" ou "Sell" dependendo da operação
            currentTrade.trade = analysisParams?.operation === 'buy' ? 'Buy' : 'Sell';
            
            // Calcula o Stop Price
            if (analysisParams?.operation === 'buy') {
              currentTrade.stopPrice = currentTrade.suggestedEntryPrice * (1 - (analysisParams?.stopPercentage || 1) / 100);
            } else {
              currentTrade.stopPrice = currentTrade.suggestedEntryPrice * (1 + (analysisParams?.stopPercentage || 1) / 100);
            }
            
            // Adiciona ao histórico processado
            processedTrades.push(currentTrade);
            continue;
          }
          
          // Verifica se o Stop Price foi atingido em algum dia da semana
          if (
            currentTrade.low !== undefined && 
            firstDayTrade.stopPrice !== undefined && 
            ((analysisParams?.operation === 'buy' && currentTrade.low <= firstDayTrade.stopPrice) ||
             (analysisParams?.operation === 'sell' && currentTrade.high >= firstDayTrade.stopPrice))
          ) {
            // Stop Price atingido, encerra a operação
            currentTrade.trade = 'Close';
            currentTrade.stop = 'Executed';
            
            // Calcula o profit/loss
            if (analysisParams?.operation === 'buy') {
              currentTrade.profit = (firstDayTrade.stopPrice - firstDayTrade.suggestedEntryPrice) * (firstDayTrade.volume || 1);
            } else {
              currentTrade.profit = (firstDayTrade.suggestedEntryPrice - firstDayTrade.stopPrice) * (firstDayTrade.volume || 1);
            }
            
            // Atualiza o capital
            currentCapital += currentTrade.profit;
            currentTrade.capital = currentCapital;
            
            // Adiciona ao histórico processado
            processedTrades.push(currentTrade);
            
            // Marca os dias restantes da semana sem operação
            for (let j = i + 1; j < weekTrades.length; j++) {
              processedTrades.push({ ...weekTrades[j], trade: '-' });
            }
            
            break;
          }
          
          // Se for o último dia útil da semana e o Stop não foi atingido
          if (i === weekTrades.length - 1 || isLastBusinessDayOfWeek(new Date(currentTrade.date))) {
            // Encerra a operação com o preço de fechamento
            currentTrade.trade = 'Close';
            
            // Calcula o profit/loss
            if (analysisParams?.operation === 'buy') {
              currentTrade.profit = (currentTrade.exitPrice - firstDayTrade.suggestedEntryPrice) * (firstDayTrade.volume || 1);
            } else {
              currentTrade.profit = (firstDayTrade.suggestedEntryPrice - currentTrade.exitPrice) * (firstDayTrade.volume || 1);
            }
            
            // Atualiza o capital
            currentCapital += currentTrade.profit;
            currentTrade.capital = currentCapital;
            
            // Adiciona ao histórico processado
            processedTrades.push(currentTrade);
            
            // Se não for o último dia da semana, marca os dias restantes sem operação
            if (i !== weekTrades.length - 1) {
              for (let j = i + 1; j < weekTrades.length; j++) {
                processedTrades.push({ ...weekTrades[j], trade: '-' });
              }
            }
            
            break;
          }
          
          // Dias intermediários da semana (sem abertura ou fechamento)
          processedTrades.push({ ...currentTrade, trade: '-' });
        }
      } else {
        // Se não tiver dia para iniciar operação, adiciona todos os dias sem operação
        for (let i = 0; i < weekTrades.length; i++) {
          processedTrades.push({ ...weekTrades[i], trade: '-' });
        }
      }
    });
    
    return processedTrades;
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
              const processedTrades = processWeeklyTrades(detailedData.tradeHistory);
              
              // Filtra apenas os trades com operações (Buy/Sell e Close)
              const filteredTrades = processedTrades.filter(t => t.trade === 'Buy' || t.trade === 'Sell' || t.trade === 'Close');
              const tradePairs = [];
              
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
              
              // Recalcula as métricas com base nos pares de operações
              const trades = tradePairs.length;
              const profits = tradePairs.filter(pair => pair.close.profit > 0).length;
              const losses = tradePairs.filter(pair => pair.close.profit < 0).length;
              const stops = tradePairs.filter(pair => pair.close.stop === 'Executed').length;
              
              // Calcula o capital final e lucro
              let currentCapital = params.initialCapital;
              tradePairs.forEach(pair => {
                currentCapital += pair.close.profit;
              });
              
              const profit = currentCapital - params.initialCapital;
              const profitPercentage = (profit / params.initialCapital) * 100;
              
              // Calcula médias de ganho e perda
              const gainTrades = tradePairs.filter(pair => pair.close.profit > 0);
              const lossTrades = tradePairs.filter(pair => pair.close.profit < 0);
              const averageGain = gainTrades.length > 0 
                ? gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0) / gainTrades.length 
                : 0;
              const averageLoss = lossTrades.length > 0 
                ? lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close.profit), 0) / lossTrades.length 
                : 0;
              
              // Calcula métricas de risco
              const maxDrawdown = calculateMaxDrawdown(tradePairs.map(pair => pair.close), params.initialCapital);
              const volatility = calculateVolatility(tradePairs.map(pair => pair.close));
              const sharpeRatio = calculateSharpeRatio(tradePairs.map(pair => pair.close), profitPercentage);
              const sortinoRatio = calculateSortinoRatio(tradePairs.map(pair => pair.close), profitPercentage);
              const recoveryFactor = maxDrawdown !== 0 ? Math.abs(profit / maxDrawdown) : 0;
              
              // Atualiza o resultado com as métricas recalculadas
              return {
                ...result,
                tradingDays: processedTrades.length,
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
        const processedTrades = processWeeklyTrades(detailedData.tradeHistory);
        detailedData.tradeHistory = processedTrades;
        detailedData.tradingDays = processedTrades.length;
        
        // Filtra apenas os trades com operações (Buy/Sell e Close)
        const filteredTrades = processedTrades.filter(t => t.trade === 'Buy' || t.trade === 'Sell' || t.trade === 'Close');
        const tradePairs = [];
        
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
              const processedTrades = processWeeklyTrades(detailedData.tradeHistory);
              
              // Filtra apenas os trades com operações (Buy/Sell e Close)
              const filteredTrades = processedTrades.filter(t => t.trade === 'Buy' || t.trade === 'Sell' || t.trade === 'Close');
              const tradePairs = [];
              
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
              
              // Recalcula as métricas
              const trades = tradePairs.length;
              const profits = tradePairs.filter(pair => pair.close.profit > 0).length;
              const losses = tradePairs.filter(pair => pair.close.profit < 0).length;
              const stops = tradePairs.filter(pair => pair.close.stop === 'Executed').length;
              
              let currentCapital = params.initialCapital;
              tradePairs.forEach(pair => {
                currentCapital += pair.close.profit;
              });
              
              const profit = currentCapital - params.initialCapital;
              const profitPercentage = (profit / params.initialCapital) * 100;
              
              const gainTrades = tradePairs.filter(pair => pair.close.profit > 0);
              const lossTrades = tradePairs.filter(pair => pair.close.profit < 0);
              const averageGain = gainTrades.length > 0 
                ? gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0) / gainTrades.length 
                : 0;
              const averageLoss = lossTrades.length > 0 
                ? lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close.profit), 0) / lossTrades.length 
                : 0;
              
              // Calcula métricas de risco
              const maxDrawdown = calculateMaxDrawdown(tradePairs.map(pair => pair.close), params.initialCapital);
              const volatility = calculateVolatility(tradePairs.map(pair => pair.close));
              const sharpeRatio = calculateSharpeRatio(tradePairs.map(pair => pair.close), profitPercentage);
              const sortinoRatio = calculateSortinoRatio(tradePairs.map(pair => pair.close), profitPercentage);
              const recoveryFactor = maxDrawdown !== 0 ? Math.abs(profit / maxDrawdown) : 0;
              
              return {
                ...result,
                tradingDays: processedTrades.length,
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
        const processedTrades = processWeeklyTrades(detailedData.tradeHistory);
        detailedData.tradeHistory = processedTrades;
        detailedData.tradingDays = processedTrades.length;
        
        // Filtra apenas os trades com operações (Buy/Sell e Close)
        const filteredTrades = processedTrades.filter(t => t.trade === 'Buy' || t.trade === 'Sell' || t.trade === 'Close');
        const tradePairs = [];
        
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
