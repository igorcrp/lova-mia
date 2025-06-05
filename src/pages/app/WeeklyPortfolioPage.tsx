import { useState } from "react";
import { StockSetupForm } from "@/components/StockSetupForm";
import { ResultsTable } from "@/components/ResultsTable";
import { StockDetailView } from "@/components/StockDetailView";
import { api } from "@/services/api";
import { AnalysisResult, DetailedResult, StockAnalysisParams, TradeHistoryItem } from "@/types";
import { toast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";

// Utility Functions
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

function calculateProfit(
  entryPrice: number | undefined,
  exitPrice: number | undefined,
  operation: string,
  lotSize: number | undefined
): number {
  if (!entryPrice || !exitPrice || !lotSize) return 0;
  return (operation === 'buy' ? exitPrice - entryPrice : entryPrice - exitPrice) * lotSize;
}

// Financial Calculations
function calculateMaxDrawdown(trades: TradeHistoryItem[], initialCapital: number): number {
  let maxDrawdown = 0;
  let peak = initialCapital;
  let currentCapital = initialCapital;

  trades.forEach(trade => {
    if (trade.profit !== undefined) {
      currentCapital += trade.profit;
      if (currentCapital > peak) {
        peak = currentCapital;
      }
      const drawdown = peak > 0 ? (peak - currentCapital) / peak : 0;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
  });

  return maxDrawdown * 100;
}

function calculateVolatility(trades: TradeHistoryItem[]): number {
  const profits = trades.map(t => t.profit).filter(p => p !== undefined) as number[];
  if (profits.length < 2) return 0;
  const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
  const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (profits.length - 1);
  return Math.sqrt(variance);
}

function calculateSharpeRatio(trades: TradeHistoryItem[], totalReturnPercentage: number): number {
  const riskFreeRate = 0.02;
  const volatility = calculateVolatility(trades);
  if (volatility === 0) return 0;
  return (totalReturnPercentage / 100 - riskFreeRate) / volatility;
}

function calculateSortinoRatio(trades: TradeHistoryItem[], totalReturnPercentage: number): number {
  const riskFreeRate = 0.02;
  const negativeReturns = trades.map(t => t.profit).filter(p => p !== undefined && p < 0) as number[];
  if (negativeReturns.length === 0) return Infinity;
  const downsideVariance = negativeReturns.reduce((sum, p) => sum + Math.pow(p, 2), 0) / negativeReturns.length;
  const downsideDeviation = Math.sqrt(downsideVariance);
  return downsideDeviation === 0 ? Infinity : (totalReturnPercentage / 100 - riskFreeRate) / downsideDeviation;
}

// Main Trade Processing Function
function processWeeklyTrades(
  fullHistory: TradeHistoryItem[],
  params: StockAnalysisParams
): { processedHistory: TradeHistoryItem[], tradePairs: { open: TradeHistoryItem, close: TradeHistoryItem }[] } {
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

  // Primeiro dia sempre mantém o capital inicial
  processedHistory.push({
    ...sortedHistory[0],
    trade: '-',
    profit: 0,
    capital: currentCapital,
    stop: '-'
  });

  let weekBuffer: TradeHistoryItem[] = [];
  
