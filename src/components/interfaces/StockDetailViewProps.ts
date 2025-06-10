
import { DetailedResult, StockAnalysisParams } from '@/types';

export interface StockDetailViewProps {
  result: DetailedResult;
  params: StockAnalysisParams;
  onUpdateParams: (updatedParams: StockAnalysisParams) => Promise<void>;
  onBack?: () => void;
  isLoading?: boolean;
}
