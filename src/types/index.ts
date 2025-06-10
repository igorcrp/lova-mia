export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  level_id: number; // 1 = Investor, 2 = Admin
  status: 'active' | 'inactive' | 'pending';
  email_verified: boolean;
  account_type: 'free' | 'premium';
  created_at: string;
  last_login?: string;
}

export interface MarketDataSource {
  id: string;
  country: string;
  stock_market: string;
  asset_class: string;
  stock_table: string; // Updated from data_table_name to stock_table
}

export interface Asset {
  id: string;
  code: string;
  name: string;
  country: string;
  stock_market: string;
  asset_class: string;
  status: 'active' | 'inactive';
  created_at?: string; // Add created_at as optional property
  updated_at?: string; // Add updated_at as optional property
}

export interface StockAnalysisParams {
  country: string;
  stockMarket: string;
  assetClass: string;
  operation: "buy" | "sell";
  referencePrice: "open" | "high" | "low" | "close";
  entryPercentage: number;
  stopPercentage: number;
  initialCapital: number;
  dataTableName?: string;
  period: string; // Period parameter (now required)
  comparisonStocks?: string[]; // Added comparisonStocks parameter
}

export interface AnalysisResult {
  assetCode: string;
  assetName: string;
  tradingDays: number;
  trades: number;
  tradePercentage: number;
  profits: number;
  profitPercentage: number;
  losses: number;
  lossPercentage: number;
  stops: number;
  stopPercentage: number;
  finalCapital: number;
  profit: number;
  averageGain: number;
  averageLoss: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  recoveryFactor: number;
  successRate: number;
  tradeHistory?: TradeHistoryItem[]; // Make tradeHistory optional in AnalysisResult
  tradeDetails?: TradeDetail[]; // Add tradeDetails property
  detailedHistory?: TradeHistoryItem[]; // Add detailedHistory for MonthlyPortfolioPage
}

export interface DetailedResult extends AnalysisResult {
  tradeHistory: TradeHistoryItem[];
  capitalEvolution: CapitalPoint[];
}

export interface TradeHistoryItem {
  date: string;
  entryPrice: number;
  exitPrice: number;
  profit?: number;
  profitLoss?: number; // Add profitLoss property
  profitPercentage: number;
  trade: 'Executed' | 'Not Executed' | 'Buy' | 'Sell' | 'Close' | '-'; // Expand trade types
  stop?: 'Executed' | 'Close' | '-'; // Updated to include 'Close'
  stopTrigger?: string; // Add stopTrigger property
  volume?: number;
  high?: number;
  low?: number;
  suggestedEntryPrice?: number;
  actualPrice?: number;
  lotSize?: number;
  stopPrice?: number;
  capital?: number; // Current capital after this trade
  currentCapital?: number; // Add currentCapital property
}

export interface CapitalPoint {
  date: string;
  capital: number;
}

export interface StockInfo {
  code: string;
  name: string;
  fullName?: string;
}

// Add TradeDetail interface for ResultsTable
export interface TradeDetail {
  profitLoss: number;
  trade: string;
  stop: string;
}
