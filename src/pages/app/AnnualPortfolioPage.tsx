import { useState } from "react";
import { StockSetupForm } from "@/components/StockSetupForm";
import { ResultsTable } from "@/components/ResultsTable";
import { StockDetailView } from "@/components/StockDetailView";
import { api } from "@/services/api";
import { AnalysisResult, DetailedResult, StockAnalysisParams, TradeHistoryItem } from "@/types";
import { toast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { 
  isFirstBusinessDayOfYear, 
  isLastBusinessDayOfYear, 
  isSameYear,
  isValidPeriodForAnnual
} from "@/utils/dateUtils";

export default function AnnualPortfolioPage() {
  const [analysisParams, setAnalysisParams] = useState<StockAnalysisParams | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);

  // Helper function to find the previous day's data
  const findPreviousDay = (sortedHistory: TradeHistoryItem[], currentDate: string): TradeHistoryItem | null => {
    const currentIndex = sortedHistory.findIndex(t => t.date === currentDate);
    return currentIndex > 0 ? sortedHistory[currentIndex - 1] : null;
  };

  // Helper function to calculate stop price
  const calculateStopPrice = (entryPrice: number, params: StockAnalysisParams): number => {
    const stopPercentage = params.stopPercentage / 100;
    return params.operation === 'buy' 
      ? entryPrice * (1 - stopPercentage) 
      : entryPrice * (1 + stopPercentage);
  };

  // Helper function to check stop loss
  const checkStopLoss = (currentDay: TradeHistoryItem, stopPrice: number, operation: 'buy' | 'sell'): boolean => {
    if (operation === 'buy') {
      return currentDay.low !== undefined && currentDay.low <= stopPrice;
    } else {
      return currentDay.high !== undefined && currentDay.high >= stopPrice;
    }
  };

  // Helper function to calculate profit
  const calculateProfit = (entryPrice: number, exitPrice: number, operation: 'buy' | 'sell', volume: number = 1): number => {
    return operation === 'buy' 
      ? (exitPrice - entryPrice) * volume 
      : (entryPrice - exitPrice) * volume;
  };

  // Função para processar operações anuais
  const processAnnualTrades = (fullHistory: TradeHistoryItem[], params: StockAnalysisParams): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } => {
    if (!fullHistory || fullHistory.length === 0) return { processedHistory: [], tradePairs: [] };
    
    const processedHistory: TradeHistoryItem[] = [];
    const tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] = [];
    const sortedHistory = [...fullHistory].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    let currentCapital = params.initialCapital;
    
    // Agrupa as operações por ano
    const tradesByYear: { [yearKey: string]: TradeHistoryItem[] } = {};
    for (let i = 0; i < sortedHistory.length; i++) {
      const trade = sortedHistory[i];
      const tradeDate = new Date(trade.date);
      const yearKey = `${tradeDate.getFullYear()}`;
      if (!tradesByYear[yearKey]) {
        tradesByYear[yearKey] = [];
      }
      tradesByYear[yearKey].push(trade);
    }
    
    // Processa cada ano - garantindo apenas um trade por ano
    Object.keys(tradesByYear).forEach(yearKey => {
      const yearTrades = tradesByYear[yearKey];
      let activeTrade: TradeHistoryItem | null = null;
      let stopPriceCalculated: number | null = null;
      let entryDayFound = false;

      for (let i = 0; i < yearTrades.length; i++) {
        const currentDayData = yearTrades[i];
        const currentDay = { ...currentDayData, trade: '-', profit: undefined, capital: undefined, stop: '-' }; // Default state
        const currentDate = new Date(currentDay.date);

        // Tenta abrir operação no primeiro dia útil do ano
        if (!entryDayFound && isFirstBusinessDayOfYear(currentDate) && !activeTrade) {
          const previousDay = findPreviousDay(sortedHistory, currentDay.date);
          if (previousDay && previousDay.exitPrice !== undefined) {
            const entryPrice = previousDay.exitPrice;
            activeTrade = { ...currentDay }; // Store entry details
            activeTrade.suggestedEntryPrice = entryPrice;
            activeTrade.trade = params.operation === 'buy' ? 'Buy' : 'Sell';
            stopPriceCalculated = calculateStopPrice(entryPrice, params);
            activeTrade.stopPrice = stopPriceCalculated;
            
            currentDay.trade = activeTrade.trade;
            currentDay.suggestedEntryPrice = activeTrade.suggestedEntryPrice;
            currentDay.stopPrice = activeTrade.stopPrice;
            entryDayFound = true; // Mark entry day found for this year
          }
        }

        // Se uma operação está ativa
        if (activeTrade && stopPriceCalculated && currentDay.date !== activeTrade.date) {
          // Verifica Stop Loss
          const stopHit = checkStopLoss(currentDay, stopPriceCalculated, params.operation);
          if (stopHit) {
            const exitPrice = stopPriceCalculated;
            currentDay.trade = 'Close';
            currentDay.stop = 'Executed';
            currentDay.profit = calculateProfit(activeTrade.suggestedEntryPrice, exitPrice, params.operation, activeTrade.volume);
            currentCapital += currentDay.profit;
            currentDay.capital = currentCapital;
            tradePairs.push({ open: activeTrade, close: { ...currentDay, exitPrice: exitPrice } });
            activeTrade = null; // Close trade
            stopPriceCalculated = null;
          } else if (isLastBusinessDayOfYear(currentDate)) {
            // Verifica Fim do Ano
            const exitPrice = currentDay.exitPrice;
            currentDay.trade = 'Close';
            currentDay.profit = calculateProfit(activeTrade.suggestedEntryPrice, exitPrice, params.operation, activeTrade.volume);
            currentCapital += currentDay.profit;
            currentDay.capital = currentCapital;
            tradePairs.push({ open: activeTrade, close: { ...currentDay } });
            activeTrade = null; // Close trade
            stopPriceCalculated = null;
          }
        }
        
        // Adiciona o dia atual ao histórico processado
        // Se um trade foi fechado neste dia, o capital já está atualizado
        if (currentDay.trade !== 'Close') {
           currentDay.capital = activeTrade ? undefined : currentCapital; // Show capital only after close or if no trade active
        }
        processedHistory.push(currentDay);
        
        // Se o trade foi fechado, para de procurar no ano
        if (currentDay.trade === 'Close') {
           // No need to break, process rest of the days as '-' 
        }
      }
      
      // Se o trade abriu mas não fechou no ano (não deveria acontecer com a lógica acima)
      // Adiciona os dias restantes sem trade ativo
      // A lógica atual já adiciona todos os dias, então isso pode não ser necessário
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
      
      // Verifica se o período selecionado é adequado para análise anual
      if (!isValidPeriodForAnnual(params.period)) {
        toast({
          variant: "default",
          title: "Period Selection",
          description: "For better results, select a period of 2 years or more.",
        });
      }
      
      console.info("Running annual analysis with params:", params);
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
      
      // Processa cada resultado para obter detalhes e filtrar operações anuais
      const processedResults = await Promise.all(
        results.map(async (result) => {
          try {
            // Obtém o histórico completo
            const detailedData = await api.analysis.getDetailedAnalysis(result.assetCode, paramsWithTable);
            
            if (detailedData && detailedData.tradeHistory) {
              // Processa as operações anuais e obtém os pares de trades
              const { tradePairs } = processAnnualTrades(detailedData.tradeHistory, paramsWithTable);
              
              // Recalcula as métricas com base nos pares de operações
              const trades = tradePairs.length;
              const profits = tradePairs.filter(pair => pair.close.profit > 0).length;
              const losses = tradePairs.filter(pair => pair.close.profit < 0).length;
              const stops = tradePairs.filter(pair => pair.close.stop === 'Executed').length;
              
              // Calcula o capital final e lucro
              let finalCapital = params.initialCapital;
              tradePairs.forEach(pair => {
                finalCapital += pair.close.profit;
              });
              
              const profit = finalCapital - params.initialCapital;
              const profitPercentage = (profit / params.initialCapital) * 100;
              
              // Calcula médias de ganho e perda
              const gainTrades = tradePairs.filter(pair => pair.close.profit > 0);
              const lossTrades = tradePairs.filter(pair => pair.close.profit < 0);
              const totalGain = gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0);
              const totalLoss = lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close.profit), 0);
              const averageGain = gainTrades.length > 0 ? totalGain / gainTrades.length : 0;
              const averageLoss = lossTrades.length > 0 ? totalLoss / lossTrades.length : 0;
              const profitFactor = totalLoss > 0 ? totalGain / totalLoss : (totalGain > 0 ? Infinity : 0);
              const avgWinLossRatio = averageLoss > 0 ? averageGain / averageLoss : (averageGain > 0 ? Infinity : 0);

              // Calcula métricas de risco
              const maxDrawdown = calculateMaxDrawdown(tradePairs.map(pair => pair.close), params.initialCapital);
              const volatility = calculateVolatility(tradePairs.map(pair => pair.close));
              const sharpeRatio = calculateSharpeRatio(tradePairs.map(pair => pair.close), profitPercentage);
              const sortinoRatio = calculateSortinoRatio(tradePairs.map(pair => pair.close), profitPercentage);
              const recoveryFactor = maxDrawdown !== 0 ? Math.abs(profit / maxDrawdown) : 0;
              const calmarRatio = maxDrawdown !== 0 ? profitPercentage / maxDrawdown : 0;
              
              // Atualiza o resultado com as métricas recalculadas
              return {
                ...result,
                tradingDays: detailedData.tradeHistory.length, // Total days in period
                trades,
                tradePercentage: detailedData.tradeHistory.length > 0 ? (trades / detailedData.tradeHistory.length) * 100 : 0,
                profits,
                profitPercentage: trades > 0 ? (profits / trades) * 100 : 0,
                losses,
                lossPercentage: trades > 0 ? (losses / trades) * 100 : 0,
                stops,
                stopPercentage: trades > 0 ? (stops / trades) * 100 : 0,
                finalCapital,
                profit,
                averageGain,
                averageLoss,
                profitFactor,
                avgWinLossRatio,
                maxDrawdown,
                volatility,
                sharpeRatio,
                sortinoRatio,
                recoveryFactor,
                calmarRatio,
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
        title: "Annual analysis completed",
        description: "Analysis was completed successfully",
      });
    } catch (error) {
      console.error("Annual analysis failed", error);
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
      
      // Processa as operações anuais
      if (detailedData && detailedData.tradeHistory) {
        const { processedHistory, tradePairs } = processAnnualTrades(detailedData.tradeHistory, paramsWithTable);
        detailedData.tradeHistory = processedHistory; // Pass ALL days to the table
        detailedData.tradingDays = processedHistory.length;
        
        // Recalcula a evolução do capital baseada nos trades fechados
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
          
          // Recalcula métricas de risco baseadas nos trades fechados
          const profit = currentCapital - paramsWithTable.initialCapital;
          const profitPercentage = (profit / paramsWithTable.initialCapital) * 100;
          
          detailedData.maxDrawdown = calculateMaxDrawdown(tradePairs.map(pair => pair.close), paramsWithTable.initialCapital);
          detailedData.sharpeRatio = calculateSharpeRatio(tradePairs.map(pair => pair.close), profitPercentage);
          detailedData.sortinoRatio = calculateSortinoRatio(tradePairs.map(pair => pair.close), profitPercentage);
          detailedData.recoveryFactor = detailedData.maxDrawdown !== 0 ? Math.abs(profit / detailedData.maxDrawdown) : 0;
        } else {
           detailedData.capitalEvolution = [{ date: new Date().toISOString(), capital: paramsWithTable.initialCapital }];
           detailedData.maxDrawdown = 0;
           detailedData.sharpeRatio = 0;
           detailedData.sortinoRatio = 0;
           detailedData.recoveryFactor = 0;
        }
      }
      
      setDetailedResult(detailedData);
      setShowDetailView(true);
    } catch (error) {
      console.error("Failed to fetch annual detailed analysis", error);
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
      
      // Verifica se o período selecionado é adequado para análise anual
      if (!isValidPeriodForAnnual(params.period)) {
        toast({
          variant: "default",
          title: "Period Selection",
          description: "For better results, select a period of 2 years or more.",
        });
      }
      
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
      
      // Processa os resultados para filtrar operações anuais
      const processedResults = await Promise.all(
        results.map(async (result) => {
          try {
            const detailedData = await api.analysis.getDetailedAnalysis(result.assetCode, paramsWithTable);
            
            if (detailedData && detailedData.tradeHistory) {
              const { tradePairs } = processAnnualTrades(detailedData.tradeHistory, paramsWithTable);
              
              // Recalcula as métricas
              const trades = tradePairs.length;
              const profits = tradePairs.filter(pair => pair.close.profit > 0).length;
              const losses = tradePairs.filter(pair => pair.close.profit < 0).length;
              const stops = tradePairs.filter(pair => pair.close.stop === 'Executed').length;
              
              let finalCapital = params.initialCapital;
              tradePairs.forEach(pair => {
                finalCapital += pair.close.profit;
              });
              
              const profit = finalCapital - params.initialCapital;
              const profitPercentage = (profit / params.initialCapital) * 100;
              
              const gainTrades = tradePairs.filter(pair => pair.close.profit > 0);
              const lossTrades = tradePairs.filter(pair => pair.close.profit < 0);
              const totalGain = gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0);
              const totalLoss = lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close.profit), 0);
              const averageGain = gainTrades.length > 0 ? totalGain / gainTrades.length : 0;
              const averageLoss = lossTrades.length > 0 ? totalLoss / lossTrades.length : 0;
              const profitFactor = totalLoss > 0 ? totalGain / totalLoss : (totalGain > 0 ? Infinity : 0);
              const avgWinLossRatio = averageLoss > 0 ? averageGain / averageLoss : (averageGain > 0 ? Infinity : 0);

              // Calcula métricas de risco
              const maxDrawdown = calculateMaxDrawdown(tradePairs.map(pair => pair.close), params.initialCapital);
              const volatility = calculateVolatility(tradePairs.map(pair => pair.close));
              const sharpeRatio = calculateSharpeRatio(tradePairs.map(pair => pair.close), profitPercentage);
              const sortinoRatio = calculateSortinoRatio(tradePairs.map(pair => pair.close), profitPercentage);
              const recoveryFactor = maxDrawdown !== 0 ? Math.abs(profit / maxDrawdown) : 0;
              const calmarRatio = maxDrawdown !== 0 ? profitPercentage / maxDrawdown : 0;
              
              return {
                ...result,
                tradingDays: detailedData.tradeHistory.length,
                trades,
                tradePercentage: detailedData.tradeHistory.length > 0 ? (trades / detailedData.tradeHistory.length) * 100 : 0,
                profits,
                profitPercentage: trades > 0 ? (profits / trades) * 100 : 0,
                losses,
                lossPercentage: trades > 0 ? (losses / trades) * 100 : 0,
                stops,
                stopPercentage: trades > 0 ? (stops / trades) * 100 : 0,
                finalCapital,
                profit,
                averageGain,
                averageLoss,
                profitFactor,
                avgWinLossRatio,
                maxDrawdown,
                volatility,
                sharpeRatio,
                sortinoRatio,
                recoveryFactor,
                calmarRatio,
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
        const { processedHistory, tradePairs } = processAnnualTrades(detailedData.tradeHistory, paramsWithTable);
        detailedData.tradeHistory = processedHistory;
        detailedData.tradingDays = processedHistory.length;
        
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
        } else {
           detailedData.capitalEvolution = [{ date: new Date().toISOString(), capital: paramsWithTable.initialCapital }];
           detailedData.maxDrawdown = 0;
           detailedData.sharpeRatio = 0;
           detailedData.sortinoRatio = 0;
           detailedData.recoveryFactor = 0;
        }
      }
      
      setDetailedResult(detailedData);
      
      toast({
        title: "Annual analysis updated",
        description: "Analysis was updated successfully",
      });
    } catch (error) {
      console.error("Annual analysis update failed", error);
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
  
  // Funções para cálculo de métricas de risco (baseadas nos trades fechados)
  const calculateMaxDrawdown = (closedTrades: TradeHistoryItem[], initialCapital: number): number => {
    if (closedTrades.length === 0) return 0;
    
    let maxDrawdownPercentage = 0;
    let peakCapital = initialCapital;
    let currentCapital = initialCapital;
    
    closedTrades.forEach(trade => {
      if (trade.profit !== undefined) {
        currentCapital += trade.profit;
        if (currentCapital > peakCapital) {
          peakCapital = currentCapital;
        }
        const drawdown = peakCapital > 0 ? (peakCapital - currentCapital) / peakCapital : 0;
        if (drawdown > maxDrawdownPercentage) {
          maxDrawdownPercentage = drawdown;
        }
      }
    });
    
    return maxDrawdownPercentage * 100; // Return as percentage
  };
  
  const calculateVolatility = (closedTrades: TradeHistoryItem[]): number => {
    const returns = closedTrades.map(trade => trade.profitPercentage).filter(p => p !== undefined) as number[];
    if (returns.length < 2) return 0;
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    return Math.sqrt(variance);
  };
  
  const calculateSharpeRatio = (closedTrades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const volatility = calculateVolatility(closedTrades);
    if (volatility === 0) return 0;
    const riskFreeRate = 2.0; // Annualized rate
    // Adjust return and volatility based on period? For now, use simple calculation
    return (totalReturnPercentage - riskFreeRate) / volatility;
  };
  
  const calculateSortinoRatio = (closedTrades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const negativeReturns = closedTrades.map(trade => trade.profitPercentage).filter(p => p !== undefined && p < 0) as number[];
    if (negativeReturns.length === 0) return 0; // Or handle as infinite if totalReturn > riskFreeRate
    
    const meanNegative = negativeReturns.reduce((sum, r) => sum + r, 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(negativeReturns.reduce((sum, r) => sum + Math.pow(r - 0, 2), 0) / negativeReturns.length); // Using 0 as MAR
    
    if (downsideDeviation === 0) return 0; // Or handle as infinite
    
    const riskFreeRate = 2.0;
    return (totalReturnPercentage - riskFreeRate) / downsideDeviation;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Annual Portfolio</h1>
      
      {!showDetailView ? (
        <div className="bg-card p-6 rounded-lg border">
          <StockSetupForm onSubmit={runAnalysis} isLoading={isLoading} />
          
          {isLoading && (
            <div className="mt-6">
              <div className="flex justify-between text-sm mb-2">
                <span>Processing annual analysis...</span>
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
