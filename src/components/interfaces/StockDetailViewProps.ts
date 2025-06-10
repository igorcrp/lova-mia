
import { DetailedResult, StockAnalysisParams } from "@/types";

export interface StockDetailViewProps {
  result: DetailedResult;
  params: StockAnalysisParams;
  onClose: () => void;
  onUpdateParams: (params: StockAnalysisParams) => void;
  onBack?: () => void; // Add missing onBack property
  isLoading: boolean;
}
