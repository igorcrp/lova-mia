
import { DetailedResult, StockAnalysisParams } from "@/types";

export interface StockDetailViewProps {
  result: DetailedResult;
  params: StockAnalysisParams;
  onClose: () => void;
  onBack?: () => void;
  onUpdateParams: (params: StockAnalysisParams) => void;
  isLoading?: boolean;
}
