
import { StockAnalysisParams } from "@/types";

export interface StockSetupFormProps {
  onSubmit: (params: StockAnalysisParams) => Promise<void>;
  isLoading: boolean;
  planType?: "free" | "premium";
  subscriptionLoading?: boolean;
}
