import { useState } from "react";
import { StockSetupForm } from "@/components/StockSetupForm";
import { ResultsTable } from "@/components/ResultsTable";
import { StockDetailView } from "@/components/StockDetailView";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/use-toast";
import { api } from "@/services/api";
import {
  AnalysisResult,
  DetailedResult,
  StockAnalysisParams,
  TradeHistoryItem,
  Trade,
  CapitalEvolution
} from "@/types";

// Helper function to get month key (e.g., YYYY-MM)
const getMonthKey = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

// Helper function to find the previous day's data
const findPreviousDay = (history: TradeHistoryItem[], currentDateStr: string): TradeHistoryItem | null => {
  const currentDateIndex = history.findIndex(item => item.date === currentDateStr);
  return currentDateIndex > 0 ? history[currentDateIndex - 1] : null;
};

// Helper function to get the reference price
const getReferencePrice = (day: TradeHistoryItem, referencePriceKey: string): number => {
  const price = day[referencePriceKey as keyof TradeHistoryItem];
  return typeof price === 'number' ? price : 0;
};

// Helper function to calculate stop price
const calculateStopPrice = (entryPrice: number, params: StockAnalysisParams): number => {
  const stopPercent = params.stopPercentage ?? 0;
  return entryPrice * (1 + (params.operation === 'buy' ? -1 : 1) * (stopPercent / 100));
};

// Helper function to check if stop loss is hit
const checkStopLoss = (currentDay: TradeHistoryItem, stopPrice: number, operation: string): boolean => {
  const low = typeof currentDay.low === 'number' ? currentDay.low : -Infinity;
  const high = typeof currentDay.high === 'number' ? currentDay.high : Infinity;
  return operation === 'buy' ? low <= stopPrice : high >= stopPrice;
};

// Helper function to calculate profit/loss
const calculateProfit = (
  entryPrice: number | undefined,
  exitPrice: number | undefined,
  operation: string,
  lotSize: number | undefined
): number => {
  if (!entryPrice || !exitPrice || !lotSize || lotSize === 0) return 0;
  const numEntryPrice = Number(entryPrice);
  const numExitPrice = Number(exitPrice);
  if (isNaN(numEntryPrice) || isNaN(numExitPrice)) return 0;
  return (operation === 'buy' ? numExitPrice - numEntryPrice : numEntryPrice - numExitPrice) * lotSize;
};

// Risk calculation functions
const calculateMaxDrawdown = (trades: TradeHistoryItem[], initialCapital: number): number => {
  if (!trades || trades.length === 0) return 0;
  let maxDrawdown = 0;
  let peakCapital = initialCapital;
  let currentCapital = initialCapital;

  trades.forEach(trade => {
    if (trade.profit !== undefined && trade.trade === 'Closed') {
      currentCapital += trade.profit;
      if (currentCapital > peakCapital) {
        peakCapital = currentCapital;
      }
      const drawdown = peakCapital === 0 ? 0 : (peakCapital - currentCapital) / peakCapital;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  });

  return maxDrawdown * 100;
};

const calculateSharpeRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
  const riskFreeRate = 0.02; // Annual risk-free rate
  const profitsOnClosed = trades
    .filter(t => t.trade === 'Closed' && t.profit !== undefined)
    .map(t => t.profit as number);

  if (profitsOnClosed.length < 2) return 0;

  const mean = profitsOnClosed.reduce((sum, p) => sum + p, 0) / profitsOnClosed.length;
  const variance = profitsOnClosed.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (profitsOnClosed.length - 1);
  const volatility = Math.sqrt(variance);

  return volatility === 0 ? 0 : (totalReturnPercentage / 100 - riskFreeRate) / volatility;
};

const calculateSortinoRatio = (trades: TradeHistoryItem[], totalReturnPercentage: number): number => {
  const riskFreeRate = 0.02;
  const negativeReturns = trades
    .filter(t => t.trade === 'Closed' && t.profit !== undefined && t.profit < 0)
    .map(t => t.profit as number);

  if (negativeReturns.length === 0) return Infinity;

  const meanNegative = 0;
  const downsideVariance = negativeReturns.reduce((sum, p) => sum + Math.pow(p - meanNegative, 2), 0) / negativeReturns.length;
  const downsideDeviation = Math.sqrt(downsideVariance);

  return downsideDeviation === 0 ? Infinity : (totalReturnPercentage / 100 - riskFreeRate) / downsideDeviation;
};

// Main trade processing function
const processMonthlyTrades = (
  fullHistory: TradeHistoryItem[],
  params: StockAnalysisParams
): {
  processedHistory: TradeHistoryItem[];
  tradePairs: { open: TradeHistoryItem; close: TradeHistoryItem }[];
} => {
  if (!fullHistory || fullHistory.length === 0) {
    return { processedHistory: [], tradePairs: [] };
  }

  const finalProcessedHistory: TradeHistoryItem[] = [];
  const finalTradePairs: { open: TradeHistoryItem; close: TradeHistoryItem }[] = [];
  let currentCapital = params.initialCapital;

  // Sort history by date
  const sortedHistory = [...fullHistory].sort((a, b) =>
    new Date(a.date + 'T00:00:00Z').getTime() - new Date(b.date + 'T00:00:00Z').getTime()
  );

  // Group trades by month
  const tradesByMonth: { [key: string]: TradeHistoryItem[] } = {};
  sortedHistory.forEach(trade => {
    const tradeDate = new Date(trade.date + 'T00:00:00Z');
    if (isNaN(tradeDate.getTime())) {
      console.warn(`Invalid date: ${trade.date}`);
      return;
    }
    const monthKey = getMonthKey(tradeDate);
    if (!tradesByMonth[monthKey]) {
      tradesByMonth[monthKey] = [];
    }
    tradesByMonth[monthKey].push(trade);
  });

  // Process trades month by month
  Object.keys(tradesByMonth).sort().forEach(monthKey => {
    const monthTrades = tradesByMonth[monthKey];
    let activeTradeEntry: TradeHistoryItem | null = null;
    let stopPriceCalculated: number | null = null;
    let entryAttemptMadeThisMonth = false;

    monthTrades.forEach((currentDayData, index) => {
      const currentDate = new Date(currentDayData.date + 'T00:00:00Z');
      if (isNaN(currentDate.getTime())) return;

      // Attempt entry only on first business day if no active trade
      if (!activeTradeEntry && !entryAttemptMadeThisMonth && isFirstBusinessDayOfMonth(currentDate)) {
        entryAttemptMadeThisMonth = true;
        const previousDay = findPreviousDay(sortedHistory, currentDayData.date);

        if (previousDay?.exitPrice !== undefined) {
          const potentialEntryPrice = previousDay.exitPrice;
          const referencePrice = getReferencePrice(previousDay, params.referencePrice);
          const entryThreshold = referencePrice * (1 + (params.entryPercentage / 100) * (params.operation === 'buy' ? 1 : -1));

          if ((params.operation === 'buy' && potentialEntryPrice >= entryThreshold) ||
              (params.operation === 'sell' && potentialEntryPrice <= entryThreshold)) {
            
            // Create entry record
            const entryDayRecord: TradeHistoryItem = {
              ...currentDayData,
              trade: params.operation === 'buy' ? 'Buy' : 'Sell',
              suggestedEntryPrice: potentialEntryPrice,
              actualPrice: potentialEntryPrice,
              stopPrice: calculateStopPrice(potentialEntryPrice, params),
              lotSize: currentCapital / potentialEntryPrice,
              stop: '-',
              profit: undefined, // No profit calculation on entry
              capital: currentCapital // Maintain previous capital on entry
            };

            activeTradeEntry = entryDayRecord;
            stopPriceCalculated = entryDayRecord.stopPrice;
            finalProcessedHistory.push(entryDayRecord);
          }
        }
      }

      // Process active trade
      if (activeTradeEntry && stopPriceCalculated && currentDayData.date !== activeTradeEntry.date) {
        const stopHit = checkStopLoss(currentDayData, stopPriceCalculated, params.operation);
        const isLastDay = isLastBusinessDayOfMonth(currentDate);

        if (stopHit || isLastDay) {
          const exitPrice = stopHit ? stopPriceCalculated : currentDayData.exitPrice;

          if (exitPrice !== undefined) {
            const profit = calculateProfit(
              activeTradeEntry.actualPrice,
              exitPrice,
              params.operation,
              activeTradeEntry.lotSize
            );

            // Update capital only on close
            currentCapital += profit;

            // Create close record
            const closeRecord: TradeHistoryItem = {
              ...currentDayData,
              trade: 'Closed',
              stop: stopHit ? 'Executed' : '-',
              profit: profit,
              capital: currentCapital,
              suggestedEntryPrice: activeTradeEntry.suggestedEntryPrice,
              actualPrice: activeTradeEntry.actualPrice,
              stopPrice: activeTradeEntry.stopPrice,
              lotSize: activeTradeEntry.lotSize,
              exitPrice: exitPrice
            };

            finalProcessedHistory.push(closeRecord);
            finalTradePairs.push({ open: activeTradeEntry, close: closeRecord });

            // Reset trade tracking
            activeTradeEntry = null;
            stopPriceCalculated = null;
          }
        }
      }
    });
  });

  return { processedHistory: finalProcessedHistory, tradePairs: finalTradePairs };
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

  const runAnalysis = async (params: StockAnalysisParams) => {
    try {
      setIsLoading(true);
      setAnalysisResults([]);
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false);

      if (!isValidPeriodForMonthly(params.period)) {
        toast({
          variant: "default",
          title: "Period Selection",
          description: "For monthly analysis, select a period of 2 months or more."
        });
        return;
      }

      setProgress(10);
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

      const results = await api.analysis.runAnalysis(paramsWithTable, (p) => setProgress(20 + p * 0.7));
      const processedResults = await Promise.all(
        results.map(async (result) => {
          try {
            const detailedData = await api.analysis.getDetailedAnalysis(
              result.assetCode,
              paramsWithTable
            );

            if (detailedData?.tradeHistory) {
              const { processedHistory, tradePairs } = processMonthlyTrades(
                detailedData.tradeHistory,
                paramsWithTable
              );

              const tradePairsFiltered = tradePairs.filter(pair => pair.close.profit !== undefined);
              const trades = tradePairsFiltered.length;

              if (trades === 0) {
                return {
                
