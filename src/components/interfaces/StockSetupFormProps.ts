
import { StockAnalysisParams } from "@/types";

export interface StockSetupFormProps {
  onSubmit: (params: StockAnalysisParams) => void;
  isLoading?: boolean;
  planType?: "free" | "premium";
  subscriptionLoading?: boolean;
}
