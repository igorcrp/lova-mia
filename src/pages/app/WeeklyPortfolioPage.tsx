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
  getWeekNumber,
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

  const processWeeklyTrades = (fullHistory: TradeHistoryItem[], params: StockAnalysisParams): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } => {
    if (!fullHistory || fullHistory.length === 0) return { processedHistory: [], tradePairs: [] };
    
    const processedHistory: TradeHistoryItem[] = [];
    const tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] = [];
    const sortedHistory = [...fullHistory].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    let currentCapital = params.initialCapital;
    
    // Group trades by week number
    const tradesByWeek: { [weekKey: string]: TradeHistoryItem[] } = {};
    for (const trade of sortedHistory) {
      const tradeDate = new Date(trade.date);
      const weekKey = `${tradeDate.getFullYear()}-${getWeekNumber(tradeDate)}`;
      if (!tradesByWeek[weekKey]) {
        tradesByWeek[weekKey] = [];
      }
      tradesByWeek[weekKey].push(trade);
    }
    
    // Process each week separately
    for (const weekKey of Object.keys(tradesByWeek)) {
      const weekTrades = tradesByWeek[weekKey];
      let activeTrade: TradeHistoryItem | null = null;
      let stopPriceCalculated: number | null = null;
      
      // Find first business day of week (entry day)
      const entryDay = weekTrades.find(day => 
        isFirstBusinessDayOfWeek(new Date(day.date))
      );
      
      // Find last business day of week (exit day)
      const exitDay = weekTrades.find(day => 
        isLastBusinessDayOfWeek(new Date(day.date))
      );
      
      if (!entryDay || !exitDay) continue;
      
      // Check entry conditions on first business day
      const referencePrice = getReferencePrice(entryDay, params.referencePrice);
      const entryThreshold = referencePrice * (1 + (params.entryPercentage / 100) * (params.operation === 'buy' ? 1 : -1));
      
      const entryPrice = entryDay.exitPrice;
      const shouldEnterTrade = 
        (params.operation === 'buy' && entryPrice >= entryThreshold) ||
        (params.operation === 'sell' && entryPrice <= entryThreshold);
      
      if (shouldEnterTrade) {
        // Create entry trade
        const entryTrade: TradeHistoryItem = {
          ...entryDay,
          trade: params.operation === 'buy' ? 'Buy' : 'Sell',
          suggestedEntryPrice: entryPrice,
          stopPrice: calculateStopPrice(entryPrice, params),
          profit: undefined,
          capital: undefined,
          stop: '-'
        };
        
        stopPriceCalculated = entryTrade.stopPrice;
        activeTrade = entryTrade;
        processedHistory.push(entryTrade);
        
        // Check if stop was hit during the week
        let stopHit = false;
        for (const day of weekTrades) {
          if (day.date === entryDay.date) continue; // Skip entry day
          
          const stopTriggered = checkStopLoss(day, stopPriceCalculated, params.operation);
          if (stopTriggered) {
            // Create exit trade for stop loss
            const exitTrade: TradeHistoryItem = {
              ...day,
              trade: 'Close',
              exitPrice: stopPriceCalculated,
              profit: calculateProfit(entryPrice, stopPriceCalculated, params.operation, entryDay.volume),
              stop: 'Executed',
              capital: currentCapital + calculateProfit(entryPrice, stopPriceCalculated, params.operation, entryDay.volume)
            };
            
            currentCapital = exitTrade.capital || currentCapital;
            tradePairs.push({ open: entryTrade, close: exitTrade });
            processedHistory.push(exitTrade);
            stopHit = true;
            break;
          }
        }
        
        // If stop wasn't hit, close at end of week
        if (!stopHit && exitDay) {
          const exitTrade: TradeHistoryItem = {
            ...exitDay,
            trade: 'Close',
            exitPrice: exitDay.exitPrice,
            profit: calculateProfit(entryPrice, exitDay.exitPrice, params.operation, entryDay.volume),
            stop: 'End of Week',
            capital: currentCapital + calculateProfit(entryPrice, exitDay.exitPrice, params.operation, entryDay.volume)
          };
          
          currentCapital = exitTrade.capital || currentCapital;
          tradePairs.push({ open: entryTrade, close: exitTrade });
          processedHistory.push(exitTrade);
        }
      } else {
        // No trade this week, just add the days
        processedHistory.push(...weekTrades.map(day => ({
          ...day,
          trade: '-',
          stop: '-',
          profit: undefined,
          capital: undefined
        })));
      }
    }
    
    return { processedHistory, tradePairs };
  };

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
      
      const paramsWithTable = {
        ...params,
        dataTableName
      };
      
      const results = await api.analysis.runAnalysis(paramsWithTable, (currentProgress) => {
        setProgress(20 + currentProgress * 0.7);
      });
      
      const processedResults = await Promise.all(
        results.map(async (result) => {
          try {
            const detailedData = await api.analysis.getDetailedAnalysis(result.assetCode, paramsWithTable);
            
            if (detailedData?.tradeHistory) {
              const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
              const filteredTrades = processedHistory.filter(t => t.trade !== '-');
              const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
              
              const trades = tradePairsFiltered.length;
              const profits = tradePairsFiltered.filter(pair => pair.close.profit > 0).length;
              const losses = tradePairsFiltered.filter(pair => pair.close.profit < 0).length;
              const stops = tradePairsFiltered.filter(pair => pair.close.stop === 'Executed').length;
              
              let currentCapital = params.initialCapital;
              tradePairsFiltered.forEach(pair => {
                currentCapital += pair.close.profit || 0;
              });
              
              const profit = currentCapital - params.initialCapital;
              const profitPercentage = (profit / params.initialCapital) * 100;
              
              const gainTrades = tradePairsFiltered.filter(pair => pair.close.profit > 0);
              const lossTrades = tradePairsFiltered.filter(pair => pair.close.profit < 0);
              const averageGain = gainTrades.length > 0 
                ? gainTrades.reduce((sum, pair) => sum + (pair.close.profit || 0), 0) / gainTrades.length 
                : 0;
              const averageLoss = lossTrades.length > 0 
                ? lossTrades.reduce((sum, pair) => sum + Math.abs(pair.close.profit || 0), 0) / lossTrades.length 
                : 0;
              
              const maxDrawdown = calculateMaxDrawdown(tradePairsFiltered.map(pair => pair.close), params.initialCapital);
              const sharpeRatio = calculateSharpeRatio(tradePairsFiltered.map(pair => pair.close), profitPercentage);
              
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
                successRate: trades > 0 ? (profits / trades) * 100 : 0
              };
            }
            return result;
          } catch (error) {
            console.error(`Error processing ${result.assetCode}:`, error);
            return result;
          }
        })
      );
      
      setProgress(100);
      setAnalysisResults(processedResults);
      toast({ title: "Analysis completed", description: "Weekly analysis finished successfully" });
    } catch (error) {
      console.error("Analysis failed:", error);
      toast({
        variant: "destructive",
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
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
      
      const detailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsWithTable);
      
      if (detailedData?.tradeHistory) {
        const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
        detailedData.tradeHistory = processedHistory;
        
        if (tradePairs.length > 0) {
          let currentCapital = paramsWithTable.initialCapital;
          detailedData.capitalEvolution = [
            { date: tradePairs[0].open.date, capital: currentCapital }
          ];
          
          tradePairs.forEach(pair => {
            currentCapital += pair.close.profit || 0;
            detailedData.capitalEvolution.push({
              date: pair.close.date,
              capital: currentCapital
            });
          });
        }
      }
      
      setDetailedResult(detailedData);
      setShowDetailView(true);
    } catch (error) {
      console.error("Failed to fetch details:", error);
      toast({
        variant: "destructive",
        title: "Failed to fetch details",
        description: error instanceof Error ? error.message : "Unknown error occurred",
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
      
      const paramsWithTable = {
        ...params,
        dataTableName
      };
      
      setAnalysisParams(paramsWithTable);
      
      const detailedData = await api.analysis.getDetailedAnalysis(selectedAsset, paramsWithTable);
      
      if (detailedData?.tradeHistory) {
        const { processedHistory, tradePairs } = processWeeklyTrades(detailedData.tradeHistory, paramsWithTable);
        detailedData.tradeHistory = processedHistory;
        
        if (tradePairs.length > 0) {
          let currentCapital = params.initialCapital;
          detailedData.capitalEvolution = [
            { date: tradePairs[0].open.date, capital: currentCapital }
          ];
          
          tradePairs.forEach(pair => {
            currentCapital += pair.close.profit || 0;
            detailedData.capitalEvolution.push({
              date: pair.close.date,
              capital: currentCapital
            });
          });
        }
      }
      
      setDetailedResult(detailedData);
      toast({ title: "Analysis updated", description: "Parameters updated successfully" });
    } catch (error) {
      console.error("Update failed:", error);
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
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
  
  const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
    let maxDrawdown = 0;
    let peak = initialCapital;
    let currentCapital = initialCapital;
    
    trades.forEach(trade => {
      if (trade.profit) {
        currentCapital += trade.profit;
        if (currentCapital > peak) peak = currentCapital;
        const drawdown = (peak - currentCapital) / peak;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }
    });
    
    return maxDrawdown;
  };
  
  const calculateSharpeRatio = (trades: TradeHistoryItem[], totalReturn: number): number => {
    if (trades.length === 0) return 0;
    const riskFreeRate = 2.0;
    const volatility = calculateVolatility(trades);
    return volatility === 0 ? 0 : (totalReturn - riskFreeRate) / volatility;
  };
  
  const calculateVolatility = (trades: TradeHistoryItem[]): number => {
    const profits = trades.filter(t => t.profit !== undefined).map(t => t.profit as number);
    if (profits.length < 2) return 0;
    const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
    const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (profits.length - 1);
    return Math.sqrt(variance);
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

function getReferencePrice(day: TradeHistoryItem, referencePriceKey: string): number {
  return day[referencePriceKey] as number;
}

function calculateStopPrice(entryPrice: number, params: StockAnalysisParams): number {
  return params.operation === 'buy' 
    ? entryPrice * (1 - (params.stopPercentage / 100))
    : entryPrice * (1 + (params.stopPercentage / 100));
}

function checkStopLoss(day: TradeHistoryItem, stopPrice: number, operation: string): boolean {
  return operation === 'buy'
    ? (day.low as number) <= stopPrice
    : (day.high as number) >= stopPrice;
}

function calculateProfit(entryPrice: number, exitPrice: number, operation: string, volume: number): number {
  return operation === 'buy'
    ? (exitPrice - entryPrice) * volume
    : (entryPrice - exitPrice) * volume;
}
