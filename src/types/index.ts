
export interface StockAnalysisParams {
  operation: string;
  assetClass: string;
  country: string;
  stockMarket: string;
  referencePrice: string;
  period: string;
  entryPercentage: number;
  stopPercentage: number;
  initialCapital: number;
  initialInvestment: number;
  stopLoss: number;
  profitTarget: number;
  riskFactor: number;
  dataTableName?: string;
  comparisonStocks: string[];
}

export interface AnalysisResult {
  assetCode: string;
  assetName?: string;
  tradingDays: number;
  trades: number;
  tradePercentage: number;
  profits: number;
  profitPercentage: number;
  losses: number;
  lossPercentage: number;
  stops: number;
  stopPercentage: number;
  finalBalance: number;
  finalCapital: number;
  totalTrades: number;
  profitableTrades: number;
  winRate: number;
  maxDrawdown: number;
  averageReturn: number;
  profit: number;
}

export interface DetailedResult {
  assetCode: string;
  initialBalance: number;
  finalBalance: number;
  finalCapital: number;
  profit: number;
  successRate: number;
  totalTrades: number;
  trades: number;
  tradePercentage: number;
  profitableTrades: number;
  profits: number;
  profitPercentage: number;
  losses: number;
  lossPercentage: number;
  stops: number;
  stopPercentage: number;
  winRate: number;
  maxDrawdown: number;
  recoveryFactor: number;
  sharpeRatio: number;
  sortinoRatio: number;
  averageReturn: number;
  averageGain: number;
  averageLoss: number;
  tradingDays: number;
  tradeHistory: TradeHistoryItem[];
}

export interface Asset {
  id: string;
  name: string;
  symbol: string;
  market: string;
  country: string;
  asset_class: string;
  created_at?: string;
  updated_at?: string;
}

export interface StockInfo {
  code: string;
  fullName?: string;
}

export interface TradeHistoryItem {
  date: string;
  action: string;
  price: number;
  quantity: number;
  value: number;
  balance: number;
  stopTrigger?: boolean;
  profitPercentage: number;
}

export interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  email_verified?: boolean;
  account_type?: string;
  status: string;
  level_id: number;
  created_at?: string;
  last_login?: string;
}
