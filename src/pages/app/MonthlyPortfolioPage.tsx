import { useState } from "react";
import { StockSetupForm } from "@/components/StockSetupForm";
import { ResultsTable } from "@/components/ResultsTable";
import { StockDetailView } from "@/components/StockDetailView";
import { api } from "@/services/api";
import { AnalysisResult, DetailedResult, StockAnalysisParams, TradeHistoryItem } from "@/types";
import { toast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { 
  isFirstBusinessDayOfMonth, 
  isLastBusinessDayOfMonth, 
  isValidPeriodForMonthly
} from "@/utils/dateUtils";

// Helper function to get month key (e.g., YYYY-MM)
function getMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Helper function to find the previous day's data
function findPreviousDay(history: TradeHistoryItem[], currentDateStr: string): TradeHistoryItem | null {
  const currentDateIndex = history.findIndex(item => item.date === currentDateStr);
  return currentDateIndex > 0 ? history[currentDateIndex - 1] : null;
}

// Helper function to get the reference price
function getReferencePrice(day: TradeHistoryItem, referencePriceKey: string): number {
  const price = day[referencePriceKey as keyof TradeHistoryItem];
  return typeof price === 'number' ? price : 0;
}

// Helper function to calculate stop price
function calculateStopPrice(entryPrice: number, params: StockAnalysisParams): number {
  const stopPercent = params.stopPercentage ?? 0;
  return entryPrice * (1 + (params.operation === 'buy' ? -1 : 1) * (stopPercent / 100));
}

// Helper function to check if stop loss is hit
function checkStopLoss(currentDay: TradeHistoryItem, stopPrice: number, operation: string): boolean {
  const low = typeof currentDay.low === 'number' ? currentDay.low : -Infinity;
  const high = typeof currentDay.high === 'number' ? currentDay.high : Infinity;
  return operation === 'buy' ? low <= stopPrice : high >= stopPrice;
}

// Helper function to calculate profit/loss
function calculateProfit(entryPrice: number | undefined, exitPrice: number | undefined, operation: string, lotSize: number | undefined): number {
  if (!entryPrice || !exitPrice || !lotSize) return 0;
  return (operation === 'buy' ? exitPrice - entryPrice : entryPrice - exitPrice) * lotSize;
}

// Risk Calculation Functions
const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
  if (!trades || trades.length === 0) return 0;
  let maxDrawdown = 0;
  let peakCapital = initialCapital;
  let currentCapital = initialCapital;
  
  trades.forEach(trade => {
    if (trade.trade === 'Closed' && trade.profit !== undefined) {
      currentCapital += trade.profit;
      if (currentCapital > peakCapital) peakCapital = currentCapital;
      const drawdown = peakCapital === 0 ? 0 : (peakCapital - currentCapital) / peakCapital;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
  });
  
  return maxDrawdown * 100;
};

const calculateVolatility = (trades: TradeHistoryItem[]): number => {
  const profits = trades.filter(t => t.trade === 'Closed' && t.profit !== undefined).map(t => t.profit as number);
  if (profits.length < 2) return 0;
  const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
  const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (profits.length - 1);
  return Math.sqrt(variance);
};

const calculateSharpeRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
  const riskFreeRate = 0.02;
  const volatility = calculateVolatility(trades);
  return volatility === 0 ? 0 : (totalReturnPercentage / 100 - riskFreeRate) / volatility;
};

const calculateSortinoRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
  const riskFreeRate = 0.02;
  const negativeReturns = trades.filter(t => t.trade === 'Closed' && t.profit !== undefined && t.profit < 0).map(t => t.profit as number);
  if (negativeReturns.length === 0) return Infinity;
  const downsideVariance = negativeReturns.reduce((sum, p) => sum + Math.pow(p, 2), 0) / negativeReturns.length;
  const downsideDeviation = Math.sqrt(downsideVariance);
  return downsideDeviation === 0 ? Infinity : (totalReturnPercentage / 100 - riskFreeRate) / downsideDeviation;
};

export default function MonthlyPortfolioPage() {
  const [analysisParams, setAnalysisParams] = useState<StockAnalysisParams | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);

 // Helper functions remain the same...

const processMonthlyTrades = (fullHistory: TradeHistoryItem[], params: StockAnalysisParams): { 
    processedHistory: TradeHistoryItem[], 
    tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] 
} => {
    if (!fullHistory || fullHistory.length === 0) {
        return { processedHistory: [], tradePairs: [] };
    }

    const finalProcessedHistory: TradeHistoryItem[] = [];
    const finalTradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] = [];
    const sortedHistory = [...fullHistory].sort((a, b) =>
        new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
    );
    
    let currentCapital = params.initialCapital;
    let activeTrade: TradeHistoryItem | null = null;

    // Agrupar por mês
    const tradesByMonth: { [monthKey: string]: TradeHistoryItem[] } = {};
    sortedHistory.forEach(trade => {
        const tradeDate = new Date(trade.date + 'T00:00:00Z');
        if (isNaN(tradeDate.getTime())) return;
        const monthKey = getMonthKey(tradeDate);
        if (!tradesByMonth[monthKey]) tradesByMonth[monthKey] = [];
        tradesByMonth[monthKey].push(trade);
    });

    // Processar cada mês
    Object.keys(tradesByMonth).sort().forEach(monthKey => {
        const monthTrades = tradesByMonth[monthKey];
        let entryAttemptMade = false;

        for (let i = 0; i < monthTrades.length; i++) {
            const currentDay = monthTrades[i];
            const currentDate = new Date(currentDay.date + 'T00:00:00Z');

            // 1. Tentar entrada apenas no primeiro dia útil do mês e se não houver trade ativo
            if (!activeTrade && !entryAttemptMade && isFirstBusinessDayOfMonth(currentDate)) {
                entryAttemptMade = true;
                const previousDay = findPreviousDay(sortedHistory, currentDay.date);
                
                if (previousDay) {
                    const potentialEntryPrice = previousDay.close;
                    const referencePrice = getReferencePrice(previousDay, params.referencePrice);
                    const entryThreshold = referencePrice * (1 + (params.entryPercentage / 100) * (params.operation === 'buy' ? 1 : -1));
                    
                    if ((params.operation === 'buy' && potentialEntryPrice >= entryThreshold) || 
                        (params.operation === 'sell' && potentialEntryPrice <= entryThreshold)) {
                        
                        // Criar entrada sem calcular lucro/perda e mantendo o capital anterior
                        const entryTrade: TradeHistoryItem = {
                            ...currentDay,
                            trade: params.operation === 'buy' ? 'Buy' : 'Sell',
                            suggestedEntryPrice: potentialEntryPrice,
                            actualPrice: potentialEntryPrice,
                            stopPrice: calculateStopPrice(potentialEntryPrice, params),
                            lotSize: currentCapital / potentialEntryPrice,
                            stop: '-',
                            profit: undefined,        // Não calcula lucro na entrada
                            capital: currentCapital   // Mantém o capital anterior
                        };
                        
                        activeTrade = entryTrade;
                        finalProcessedHistory.push(entryTrade);
                    }
                }
            }

            // 2. Gerenciar trade ativo
            if (activeTrade && currentDay.date !== activeTrade.date) {
                const stopHit = checkStopLoss(currentDay, activeTrade.stopPrice, params.operation);
                const isLastDay = isLastBusinessDayOfMonth(currentDate);
                
                // Fechar posição apenas se atingiu stop ou é último dia útil
                if (stopHit || isLastDay) {
                    const exitPrice = stopHit ? activeTrade.stopPrice : currentDay.close;
                    const profit = calculateProfit(
                        activeTrade.actualPrice,
                        exitPrice,
                        params.operation,
                        activeTrade.lotSize
                    );
                    
                    // Criar trade de fechamento com cálculo de lucro/perda e atualização do capital
                    const closeTrade: TradeHistoryItem = {
                        ...currentDay,
                        trade: 'Closed',
                        stop: stopHit ? 'Executed' : '-',
                        suggestedEntryPrice: activeTrade.suggestedEntryPrice,
                        actualPrice: activeTrade.actualPrice,
                        stopPrice: activeTrade.stopPrice,
                        lotSize: activeTrade.lotSize,
                        exitPrice: exitPrice,
                        profit: profit,           // Calcula lucro apenas no fechamento
                        capital: currentCapital + profit  // Atualiza capital apenas no fechamento
                    };
                    
                    finalProcessedHistory.push(closeTrade);
                    finalTradePairs.push({ open: activeTrade, close: closeTrade });
                    
                    // Atualizar capital somente após o fechamento
                    currentCapital += profit;
                    
                    // Resetar trade ativo
                    activeTrade = null;
                    
                    // Se foi stop, sair do loop do mês
                    if (stopHit) break;
                }
            }
        }
        
        // Verificar se há trade ativo não fechado ao final do mês
        if (activeTrade) {
            const lastDayOfMonth = monthTrades[monthTrades.length - 1];
            // Forçar fechamento com o preço de fechamento do último dia
            const exitPrice = lastDayOfMonth.close;
            const profit = calculateProfit(
                activeTrade.actualPrice,
                exitPrice,
                params.operation,
                activeTrade.lotSize
            );
            
            const forcedCloseTrade: TradeHistoryItem = {
                ...lastDayOfMonth,
                trade: 'Closed',
                stop: '-',
                suggestedEntryPrice: activeTrade.suggestedEntryPrice,
                actualPrice: activeTrade.actualPrice,
                stopPrice: activeTrade.stopPrice,
                lotSize: activeTrade.lotSize,
                exitPrice: exitPrice,
                profit: profit,
                capital: currentCapital + profit
            };
            
            finalProcessedHistory.push(forcedCloseTrade);
            finalTradePairs.push({ open: activeTrade, close: forcedCloseTrade });
            currentCapital += profit;
            activeTrade = null;
        }
    });

    return { processedHistory: finalProcessedHistory, tradePairs: finalTradePairs };
};

  const runAnalysis = async (params: StockAnalysisParams) => {
    try {
      setIsLoading(true);
      setAnalysisResults([]);
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false);
      
      if (!isValidPeriodForMonthly(params.period)) {
        toast({ variant: "default", title: "Period Selection", description: "For monthly analysis, select a period of 2 months or more." });
      }

      const dataTableName = params.dataTableName || await api.marketData.getDataTableName(params.country, params.stockMarket, params.assetClass);
      if (!dataTableName) throw new Error("Failed to identify data source");
      
      const paramsWithTable = { ...params, dataTableName };
      setAnalysisParams(paramsWithTable);
      
      const results = await api.analysis.runAnalysis(paramsWithTable, (p) => setProgress(20 + p * 0.7));
      
      const processedResults = await Promise.all(results.map(async (result) => {
        try {
          const detailedData = await api.analysis.getDetailedAnalysis(result.assetCode, paramsWithTable);
          
          if (detailedData?.tradeHistory) {
            const { processedHistory, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
            const validPairs = tradePairs.filter(pair => pair.close.profit !== undefined);
            
            if (validPairs.length === 0) {
              return { 
                ...result, 
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
            
            const profitsCount = validPairs.filter(pair => pair.close.profit > 0).length;
            const lossesCount = validPairs.length - profitsCount;
            const stopsCount = validPairs.filter(pair => pair.close.stop === 'Executed').length;
            const finalCapital = validPairs[validPairs.length - 1].close.capital ?? params.initialCapital;
            const totalProfit = finalCapital - params.initialCapital;
            const profitPercentage = (totalProfit / params.initialCapital) * 100;
            
            const gainTrades = validPairs.filter(pair => pair.close.profit > 0);
            const lossTrades = validPairs.filter(pair => pair.close.profit < 0);
            
            const averageGain = gainTrades.length > 0 
              ? gainTrades.reduce((sum, pair) => sum + pair.close.profit, 0) / gainTrades.length 
              : 0;
              
            const averageLoss = lossTrades.length > 0 
              ? lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close.profit), 0) / lossTrades.length 
              : 0;
            
            const maxDrawdown = calculateMaxDrawdown(processedHistory, params.initialCapital);
            const sharpeRatio = calculateSharpeRatio(processedHistory, profitPercentage);
            const sortinoRatio = calculateSortinoRatio(processedHistory, profitPercentage);
            const recoveryFactor = maxDrawdown !== 0 
              ? Math.abs(totalProfit / (maxDrawdown / 100 * params.initialCapital)) 
              : (totalProfit > 0 ? Infinity : 0);
            
            return {
              ...result,
              tradingDays: processedHistory.length,
              trades: validPairs.length,
              profits: profitsCount,
              losses: lossesCount,
              stops: stopsCount,
              finalCapital,
              profit: totalProfit,
              successRate: validPairs.length > 0 ? (profitsCount / validPairs.length) * 100 : 0,
              averageGain,
              averageLoss,
              maxDrawdown,
              sharpeRatio,
              sortinoRatio,
              recoveryFactor
            };
          }
          return result;
        } catch (error) {
          console.error(`Error processing ${result.assetCode}:`, error);
          return result;
        }
      });
      
      setAnalysisResults(processedResults);
      setProgress(100);
      toast({ title: "Monthly analysis completed", description: "Analysis was completed successfully." });
    } catch (error) {
      console.error("Monthly analysis failed", error);
      toast({ 
        variant: "destructive", 
        title: "Analysis failed", 
        description: error instanceof Error ? error.message : "Unknown error" 
      });
    } finally {
      setIsLoading(false);
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
      
      if (!paramsWithTable.dataTableName) throw new Error("Could not determine data table name");
      
      const detailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsWithTable);
      
      if (detailedData?.tradeHistory) {
        const { processedHistory, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
        const validPairs = tradePairs.filter(pair => pair.close.profit !== undefined);
        
        detailedData.tradeHistory = processedHistory;
        detailedData.tradingDays = processedHistory.length;
        
        if (validPairs.length > 0) {
          detailedData.capitalEvolution = validPairs.map(pair => ({
            date: pair.close.date,
            capital: pair.close.capital ?? paramsWithTable.initialCapital
          }));
          
          detailedData.capitalEvolution.unshift({ 
            date: validPairs[0].open.date, 
            capital: paramsWithTable.initialCapital 
          });
          
          const finalCapital = detailedData.capitalEvolution[detailedData.capitalEvolution.length - 1].capital;
          const totalProfit = finalCapital - paramsWithTable.initialCapital;
          const profitPercentage = (totalProfit / paramsWithTable.initialCapital) * 100;
          
          detailedData.maxDrawdown = calculateMaxDrawdown(processedHistory, paramsWithTable.initialCapital);
          detailedData.sharpeRatio = calculateSharpeRatio(processedHistory, profitPercentage);
          detailedData.sortinoRatio = calculateSortinoRatio(processedHistory, profitPercentage);
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
      console.error("Failed to fetch monthly detailed analysis", error);
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
      
      if (!paramsWithTable.dataTableName) throw new Error("Could not determine data table name for update");
      
      const detailedData = await api.analysis.getDetailedAnalysis(selectedAsset, paramsWithTable);
      
      if (detailedData?.tradeHistory) {
        const { processedHistory, tradePairs } = processMonthlyTrades(detailedData.tradeHistory, paramsWithTable);
        const validPairs = tradePairs.filter(pair => pair.close.profit !== undefined);
        
        detailedData.tradeHistory = processedHistory;
        detailedData.tradingDays = processedHistory.length;
        
        if (validPairs.length > 0) {
          detailedData.capitalEvolution = validPairs.map(pair => ({
            date: pair.close.date,
            capital: pair.close.capital ?? paramsWithTable.initialCapital
          }));
          
          detailedData.capitalEvolution.unshift({ 
            date: validPairs[0].open.date, 
            capital: paramsWithTable.initialCapital 
          });
          
          const finalCapital = detailedData.capitalEvolution[detailedData.capitalEvolution.length - 1].capital;
          const totalProfit = finalCapital - paramsWithTable.initialCapital;
          const profitPercentage = (totalProfit / paramsWithTable.initialCapital) * 100;
          
          detailedData.maxDrawdown = calculateMaxDrawdown(processedHistory, paramsWithTable.initialCapital);
          detailedData.sharpeRatio = calculateSharpeRatio(processedHistory, profitPercentage);
          detailedData.sortinoRatio = calculateSortinoRatio(processedHistory, profitPercentage);
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
      setAnalysisParams(paramsWithTable);
      toast({ title: "Analysis Updated", description: "Detailed view updated successfully." });
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

  const closeDetails = () => {
    setShowDetailView(false);
    setDetailedResult(null);
    setSelectedAsset(null);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Monthly Portfolio</h1>
      
      {!showDetailView ? (
        <div className="bg-card p-6 rounded-lg border">
          <StockSetupForm onSubmit={runAnalysis} isLoading={isLoading} />
          
          {isLoading && (
            <div className="mt-6">
              <div className="flex justify-between text-sm mb-2">
                <span>Processing monthly analysis...</span>
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
