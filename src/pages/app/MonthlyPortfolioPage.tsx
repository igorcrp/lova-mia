import { useState } from "react";
import { StockSetupForm } from "@/components/StockSetupForm";
import { ResultsTable } from "@/components/ResultsTable";
import { StockDetailView } from "@/components/StockDetailView";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import { api } from "@/services/api";
import { AnalysisResult, DetailedResult, StockAnalysisParams, TradeHistoryItem } from "@/types";
import { toast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { 
  isFirstBusinessDayOfMonth, 
  isLastBusinessDayOfMonth, 
  isValidPeriodForMonthly,
  getStartDateForPeriod,
  countBusinessDays
} from "@/utils/dateUtils";

// Helper function to get month key (e.g., YYYY-MM)
function getMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Helper function to find the previous day's data with defined capital
function findPreviousDayWithCapital(history: TradeHistoryItem[], currentDateStr: string): TradeHistoryItem | null {
  const currentDateIndex = history.findIndex(item => item.date === currentDateStr);
  for (let i = currentDateIndex - 1; i >= 0; i--) {
    if (history[i]?.capital !== undefined) {
      return history[i];
    }
  }
  return null; // No previous day with capital found
}

// Helper function to get the reference price
function getReferencePrice(day: TradeHistoryItem, referencePriceKey: string): number {
  const price = day[referencePriceKey as keyof TradeHistoryItem];
  return typeof price === 'number' ? price : Number(price) || 0;
}

// Helper function to calculate stop price
function calculateStopPrice(entryPrice: number, params: StockAnalysisParams): number {
  const stopPercent = params.stopPercentage ?? 0;
  return entryPrice * (1 + (params.operation === 'buy' ? -1 : 1) * (stopPercent / 100));
}

// Helper function to check if stop loss is hit
function checkStopLoss(currentDay: TradeHistoryItem, stopPrice: number, operation: string): boolean {
  const low = typeof currentDay.low === 'number' ? currentDay.low : Number(currentDay.low) || -Infinity;
  const high = typeof currentDay.high === 'number' ? currentDay.high : Number(currentDay.high) || Infinity;
  return operation === 'buy' ? low <= stopPrice : high >= stopPrice;
}

// Helper function to calculate profit/loss
function calculateProfit(entryPrice: number | undefined, exitPrice: number | undefined, operation: string, lotSize: number | undefined): number {
  if (entryPrice === undefined || exitPrice === undefined || lotSize === undefined || lotSize === 0) return 0;
  const numEntryPrice = typeof entryPrice === 'number' ? entryPrice : Number(entryPrice);
  const numExitPrice = typeof exitPrice === 'number' ? exitPrice : Number(exitPrice);
  if (isNaN(numEntryPrice) || isNaN(numExitPrice)) return 0;
  return (operation === 'buy' ? numExitPrice - numEntryPrice : numEntryPrice - numExitPrice) * lotSize;
}

// Risk Calculation Functions (Using Processed History)
const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
    if (!trades || trades.length === 0) return 0;
    let maxDrawdown = 0;
    let peakCapital = initialCapital;
    // Use the capital from the first record if available, otherwise initial
    let currentCapital = trades[0]?.capital ?? initialCapital;
    peakCapital = Math.max(peakCapital, Number(currentCapital)); // Convert to number

    trades.forEach(trade => {
        // Update capital only if it's defined in the record
        if (trade.capital !== undefined) {
            currentCapital = Number(trade.capital); // Convert to number explicitly for type safety
            // Update peak capital encountered so far
            if (currentCapital > peakCapital) {
                peakCapital = currentCapital;
            }
            // Calculate drawdown from the current peak
            const drawdown = peakCapital === 0 ? 0 : (peakCapital - currentCapital) / peakCapital;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        }
    });
    return maxDrawdown * 100; // Return as percentage
};

const calculateVolatility = (trades: TradeHistoryItem[]): number => {
    const profits = trades.filter(t => t.trade === 'Close' && t.profit !== undefined)
                          .map(t => Number(t.profit)); // Convert to number explicitly
    if (profits.length < 2) return 0;
    const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
    const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (profits.length - 1);
    return Math.sqrt(variance);
};

const calculateSharpeRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02; // Annualized
    const volatility = calculateVolatility(trades);
    if (volatility === 0) return 0;
    return (totalReturnPercentage / 100 - riskFreeRate) / volatility;
};

const calculateSortinoRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
    const riskFreeRate = 0.02;
    const negativeReturns = trades.filter(t => t.trade === 'Close' && t.profit !== undefined && Number(t.profit) < 0)
                                 .map(t => Number(t.profit)); // Convert to number explicitly
    if (negativeReturns.length === 0) return Infinity;
    const meanNegative = 0; // Target return
    const downsideVariance = negativeReturns.reduce((sum, p) => sum + Math.pow(p - meanNegative, 2), 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);
    if (downsideDeviation === 0) return Infinity;
    return (totalReturnPercentage / 100 - riskFreeRate) / downsideDeviation;
};

// --- Main Component --- 
export default function MonthlyPortfolioPage() {
  const [analysisParams, setAnalysisParams] = useState<StockAnalysisParams | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);
  const [isPremium, setIsPremium] = useState(false);

  // Function to process trades according to monthly logic (v5 - Profit/Capital logic verified)
  const processMonthlyTrades = (fullHistory: TradeHistoryItem[], params: StockAnalysisParams): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } => {
    if (!fullHistory || fullHistory.length === 0) return { processedHistory: [], tradePairs: [] };

    const finalProcessedHistory: TradeHistoryItem[] = [];
    const finalTradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] = [];
    const sortedHistory = [...fullHistory].sort((a, b) =>
      new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
    );
    
    let capitalBeforeCurrentTrade: number = Number(params.initialCapital);
    let activeTradeEntry: TradeHistoryItem | null = null;
    let stopPriceCalculated: number | null = null;

    const tradesByMonth: { [monthKey: string]: TradeHistoryItem[] } = {};
    sortedHistory.forEach(trade => {
      const tradeDate = new Date(trade.date + 'T00:00:00Z');
      if (isNaN(tradeDate.getTime())) { console.warn(`Invalid date: ${trade.date}`); return; }
      const monthKey = getMonthKey(tradeDate);
      if (!tradesByMonth[monthKey]) tradesByMonth[monthKey] = [];
      tradesByMonth[monthKey].push(trade);
    });

    Object.keys(tradesByMonth).sort().forEach(monthKey => {
      const monthTrades = tradesByMonth[monthKey];
      let entryAttemptMadeThisMonth = false;

      for (let i = 0; i < monthTrades.length; i++) {
        const currentDayData = monthTrades[i];
        const currentDate = new Date(currentDayData.date + 'T00:00:00Z');
        if (isNaN(currentDate.getTime())) continue;

        // --- 1. Attempt Entry ---
        if (!activeTradeEntry && !entryAttemptMadeThisMonth && isFirstBusinessDayOfMonth(currentDate)) {
          entryAttemptMadeThisMonth = true;
          // Find previous day in the *full sorted history* to get exit price
          const previousDayOriginal = sortedHistory.find((_, idx, arr) => arr[idx+1]?.date === currentDayData.date);

          if (previousDayOriginal && previousDayOriginal.exitPrice !== undefined) {
            const potentialEntryPrice = Number(previousDayOriginal.exitPrice); // Convert to number
            const referencePrice = getReferencePrice(previousDayOriginal, params.referencePrice);
            const entryThreshold = referencePrice * (1 + (params.entryPercentage / 100) * (params.operation === 'buy' ? 1 : -1));
            const shouldEnter = (params.operation === 'buy' && potentialEntryPrice >= entryThreshold) || (params.operation === 'sell' && potentialEntryPrice <= entryThreshold);

            if (shouldEnter) {
              const entryDayRecord: TradeHistoryItem = {
                ...currentDayData,
                trade: (params.operation === 'buy' ? 'Buy' : 'Sell'),
                suggestedEntryPrice: potentialEntryPrice,
                actualPrice: potentialEntryPrice,
                stopPrice: calculateStopPrice(potentialEntryPrice, params),
                lotSize: Number(capitalBeforeCurrentTrade / potentialEntryPrice), // Convert to number
                stop: '-',
                profit: undefined, // Profit undefined on entry
                capital: capitalBeforeCurrentTrade // Capital is pre-entry value
              };
              activeTradeEntry = entryDayRecord;
              stopPriceCalculated = entryDayRecord.stopPrice;
              finalProcessedHistory.push(entryDayRecord);
            }
          }
        }

        // --- 2. Manage Active Trade ---
        if (activeTradeEntry && stopPriceCalculated && currentDayData.date !== activeTradeEntry.date) {
          let closedToday = false;
          let exitPrice: number | undefined = undefined;
          let profit = 0;
          let closeRecord: TradeHistoryItem | null = null;
          const stopHit = checkStopLoss(currentDayData, stopPriceCalculated, params.operation);

          if (stopHit) {
            exitPrice = stopPriceCalculated;
            profit = calculateProfit(Number(activeTradeEntry.actualPrice), exitPrice, params.operation, Number(activeTradeEntry.lotSize)); // Convert to numbers
            closeRecord = {
              ...currentDayData,
              trade: 'Close',
              stop: 'Executed',
              profit: profit, // Profit calculated on close
              capital: capitalBeforeCurrentTrade + profit, // Capital updated on close
              suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
              actualPrice: activeTradeEntry.actualPrice,
              stopPrice: activeTradeEntry.stopPrice,
              lotSize: activeTradeEntry.lotSize,
              exitPrice: exitPrice
            };
            closedToday = true;
            capitalBeforeCurrentTrade += profit; // Update tracker for next potential trade

          } else if (isLastBusinessDayOfMonth(currentDate)) {
            exitPrice = typeof currentDayData.exitPrice === 'number' ? currentDayData.exitPrice : Number(currentDayData.exitPrice);
            if (exitPrice !== undefined && !isNaN(exitPrice)) {
              profit = calculateProfit(Number(activeTradeEntry.actualPrice), exitPrice, params.operation, Number(activeTradeEntry.lotSize)); // Convert to numbers
              closeRecord = {
                ...currentDayData,
                trade: 'Close',
                stop: '-',
                profit: profit, // Profit calculated on close
                capital: capitalBeforeCurrentTrade + profit, // Capital updated on close
                suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
                actualPrice: activeTradeEntry.actualPrice,
                stopPrice: activeTradeEntry.stopPrice,
                lotSize: activeTradeEntry.lotSize,
                exitPrice: exitPrice
              };
              closedToday = true;
              capitalBeforeCurrentTrade += profit; // Update tracker for next potential trade
            } else {
              console.warn(`Missing exit price (close) on last business day ${currentDayData.date} for active trade.`);
            }
          }

          if (closedToday && closeRecord) {
            finalProcessedHistory.push(closeRecord);
            finalTradePairs.push({ open: activeTradeEntry, close: closeRecord });
            activeTradeEntry = null;
            stopPriceCalculated = null;
            // if (stopHit) { break; } // Optional: Stop further actions in month after stop hit
          }
        }
      } // End of day loop
    }); // End of month loop

    return { processedHistory: finalProcessedHistory, tradePairs: finalTradePairs };
  };

  const runAnalysis = async (params: StockAnalysisParams) => {
    try {
      setIsLoading(true);
      setAnalysisResults([]);
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false);
      
      console.info('Running analysis with params:', params);
      
      // Simulating the initial data loading
      setProgress(10);
      
      // Get data_table_name from market_data_sources based on selected parameters
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
      
      // Simulating progress after fetching data source
      setProgress(20);
      
      // Store the data_table_name for future reference
      const paramsWithTable = {
        ...params,
        dataTableName
      };
      setAnalysisParams(paramsWithTable);
      
      // Calcular dias úteis apenas para referência (não sobrescrever os resultados)
      const today = new Date();
      const startDate = getStartDateForPeriod(params.period);
      const tradingDaysCount = countBusinessDays(startDate, today);
      
      console.info(`Period: ${params.period}, Start date: ${startDate.toISOString()}, Calculated trading days: ${tradingDaysCount}`);
      
      // Run the analysis using API with the table name
      const results = await api.analysis.runAnalysis(paramsWithTable, (currentProgress) => {
        // Update progress based on the API's progress reports
        setProgress(20 + currentProgress * 0.7);
      });
      
      // Usar diretamente os resultados do backend sem sobrescrever tradingDays
      setAnalysisResults(results);
      
      // Final processing
      setProgress(95);
      setProgress(100);
      
      toast({
        title: "Analysis completed",
        description: "Analysis was completed successfully",
      });
    } catch (error) {
      console.error("Analysis failed", error);
      toast({
        variant: "destructive",
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
      setProgress(0);
    } finally {
      // Reset progress after a short delay to allow the progress bar to reach 100%
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
      
      // Add data table name to params if not already present
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
      
      // Get detailed analysis with correct period filtering
      const detailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsWithTable);
      
      // Não sobrescrever o valor de tradingDays calculado pelo backend
      // Apenas registrar para fins de depuração
      if (detailedData && detailedData.tradeHistory && detailedData.tradeHistory.length > 0) {
        console.info(`Actual trading days in data: ${detailedData.tradingDays}`);
      } else {
        console.info(`No trade history found`);
      }
      
      setDetailedResult(detailedData);
      setShowDetailView(true);
    } catch (error) {
      console.error("Failed to fetch detailed analysis", error);
      toast({
        variant: "destructive",
        title: "Failed to fetch details",
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
  
  const updateAnalysis = async (params: StockAnalysisParams) => {
    if (!selectedAsset) return;
    
    try {
      setIsLoadingDetails(true);
      
      // Ensure we have the data table name
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
      
      // Update both the main results and the detailed result
      const results = await api.analysis.runAnalysis(paramsWithTable, () => {});
      
      // Calcular dias úteis apenas para referência (não sobrescrever os resultados)
      const today = new Date();
      const startDate = getStartDateForPeriod(paramsWithTable.period);
      const tradingDaysCount = countBusinessDays(startDate, today);
      
      console.info(`Period: ${params.period}, Start date: ${startDate.toISOString()}, Calculated trading days: ${tradingDaysCount}`);
      
      // Usar diretamente os resultados do backend sem sobrescrever tradingDays
      setAnalysisResults(results);
      
      // Fetch detailed analysis with correct period filtering
      const detailedData = await api.analysis.getDetailedAnalysis(selectedAsset, paramsWithTable);
      
      // Não sobrescrever o valor de tradingDays calculado pelo backend
      // Apenas registrar para fins de depuração
      if (detailedData && detailedData.tradeHistory && detailedData.tradeHistory.length > 0) {
        console.info(`Actual trading days in updated data: ${detailedData.tradingDays}`);
      }
      
      setDetailedResult(detailedData);
      
      toast({
        title: "Analysis updated",
        description: "Analysis was updated successfully",
      });
    } catch (error) {
      console.error("Analysis update failed", error);
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Monthly Portfolio</h1>
      
      <SubscriptionBanner />
      
      {!showDetailView ? (
        <div className="bg-card p-6 rounded-lg border">
          <StockSetupForm 
            onSubmit={runAnalysis} 
            isLoading={isLoading} 
            isPremium={isPremium}
          />
          
          {isLoading && (
            <div className="mt-6">
              <div className="flex justify-between text-sm mb-2">
                <span>Processing analysis...</span>
                <span>{progress.toFixed(0)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
          
          {!isPremium && !isLoading && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Free Plan:</strong> Limited to 1 month period, 10 results, and basic features. 
                Upgrade to Premium for unlimited access to all features and periods.
              </p>
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
            />
          </div>
        )
      )}
    </div>
  );
}
