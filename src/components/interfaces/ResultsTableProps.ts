
import { AnalysisResult } from '@/types';

export interface ResultsTableProps {
  results: AnalysisResult[];
  onViewDetails: (assetCode: string) => Promise<void>;
  isLoading?: boolean;
}
