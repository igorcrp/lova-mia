
export interface ResultsTableProps {
  results: Array<{
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
  }>;
  onViewDetails: (assetCode: string) => Promise<void>;
  isLoading: boolean;
  filterType?: "all" | "positive" | "negative";
  onFilterChange?: (value: "all" | "positive" | "negative") => void;
}
