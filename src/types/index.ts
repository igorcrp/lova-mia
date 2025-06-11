

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
  period: string;
  comparisonStocks?: string[];
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
  tradeHistory?: TradeHistoryItem[];
  tradeDetails?: TradeDetail[];
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
  profitLoss?: number;
  profitPercentage: number;
  trade: 'Executed' | 'Not Executed' | 'Buy' | 'Sell' | 'Close' | '-';
  stop?: 'Executed' | 'Close' | '-';
  stopTrigger?: 'Executed' | 'Close' | '-';
  volume?: number;
  high?: number;
  low?: number;
  suggestedEntryPrice?: number;
  actualPrice?: number | string;
  lotSize?: number;
  stopPrice?: number | string;
  capital?: number;
  currentCapital?: number;
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

export interface TradeDetail {
  profitLoss: number;
  trade: string;
  stop: string;
}

// Add subscription related types
export interface SubscriptionData {
  subscribed: boolean;
  subscription_tier?: string;
  subscription_end?: string;
}
