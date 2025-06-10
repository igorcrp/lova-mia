
import { AnalysisResult } from "@/types";

export interface ResultsTableProps {
  results: AnalysisResult[];
  onViewDetails: (assetCode: string) => void;
  planType?: "free" | "premium";
  isLoading?: boolean;
}
