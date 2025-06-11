import { useState } from "react";
import { StockSetupForm } from "@/components/StockSetupForm";
import { ResultsTable } from "@/components/ResultsTable";
import { StockDetailView } from "@/components/StockDetailView";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { api } from "@/services/api";
import { AnalysisResult, DetailedResult, StockAnalysisParams } from "@/types";
import { toast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { countBusinessDays, getStartDateForPeriod } from "@/utils/dateUtils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Crown } from "lucide-react";

export default function DaytradePage() {
  const { planType, createCheckoutSession, isLoading: subscriptionLoading } = useSubscription();
  const [analysisParams, setAnalysisParams] = useState<StockAnalysisParams | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);

  const isFreePlan = planType === 'free';

  const runAnalysis = async (params: StockAnalysisParams) => {
    try {
      setIsLoading(true);
      setAnalysisResults([]);
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false);
      
      console.info('Running analysis with params:', params);
      
      // Simulating the initial data loading
      setProgress(10);
      
      // Get data_table_name from market_data_sources based on selected parameters
      let dataTableName = params.dataTableName;
      
      if (!dataTableName) {
        dataTableName = await api.marketData.getDataTableName(
          params.country,
          params.stockMarket,
          params.assetClass
        );
        
        if (!dataTableName) {
          throw new Error("Failed to identify data source");
        }
      }
      
      // Simulating progress after fetching data source
      setProgress(20);
      
      // Store the data_table_name for future reference
      const paramsWithTable = {
        ...params,
        dataTableName
      };
      setAnalysisParams(paramsWithTable);
      
      // Calcular dias úteis apenas para referência (não sobrescrever os resultados)
      const today = new Date();
      const startDate = getStartDateForPeriod(params.period);
      const tradingDaysCount = countBusinessDays(startDate, today);
      
      console.info(`Period: ${params.period}, Start date: ${startDate.toISOString()}, Calculated trading days: ${tradingDaysCount}`);
      
      // Run the analysis using API with the table name
      const results = await api.analysis.runAnalysis(paramsWithTable, (currentProgress) => {
        // Update progress based on the API's progress reports
        setProgress(20 + currentProgress * 0.7);
      });
      
      // Usar diretamente os resultados do backend sem sobrescrever tradingDays
      setAnalysisResults(results);
      
      // Final processing
      setProgress(95);
      setProgress(100);
      
      toast({
        title: "Analysis completed",
        description: "Analysis was completed successfully",
      });
    } catch (error) {
      console.error("Analysis failed", error);
      toast({
        variant: "destructive",
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
      setProgress(0);
    } finally {
      // Reset progress after a short delay to allow the progress bar to reach 100%
      setTimeout(() => {
        setIsLoading(false);
      }, 500);
    }
  };
  
  const viewDetails = async (assetCode: string) => {
    if (!analysisParams) return;
    
    try {
      setIsLoadingDetails(true);
      setSelectedAsset(assetCode);
      
      // Add data table name to params if not already present
      const paramsWithTable = analysisParams.dataTableName
        ? analysisParams
        : {
            ...analysisParams,
            dataTableName: await api.marketData.getDataTableName(
              analysisParams.country,
              analysisParams.stockMarket,
              analysisParams.assetClass
            )
          };
      
      if (!paramsWithTable.dataTableName) {
        throw new Error("Could not determine data table name");
      }
      
      // Get detailed analysis with correct period filtering
      const detailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsWithTable);
      
      // Não sobrescrever o valor de tradingDays calculado pelo backend
      // Apenas registrar para fins de depuração
      if (detailedData && detailedData.tradeHistory && detailedData.tradeHistory.length > 0) {
        console.info(`Actual trading days in data: ${detailedData.tradingDays}`);
      } else {
        console.info(`No trade history found`);
      }
      
      setDetailedResult(detailedData);
      setShowDetailView(true);
    } catch (error) {
      console.error("Failed to fetch detailed analysis", error);
      toast({
        variant: "destructive",
        title: "Failed to fetch details",
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };
  
  const closeDetails = () => {
    setShowDetailView(false);
    setDetailedResult(null);
    setSelectedAsset(null);
  };
  
  const updateAnalysis = async (params: StockAnalysisParams) => {
    if (!selectedAsset) return;
    
    try {
      setIsLoadingDetails(true);
      
      // Ensure we have the data table name
      const dataTableName = params.dataTableName || await api.marketData.getDataTableName(
        params.country,
        params.stockMarket,
        params.assetClass
      );
      
      if (!dataTableName) {
        throw new Error("Failed to identify data source");
      }
      
      const paramsWithTable = {
        ...params,
        dataTableName
      };
      
      setAnalysisParams(paramsWithTable);
      
      // Update both the main results and the detailed result
      const results = await api.analysis.runAnalysis(paramsWithTable);
      
      // Calcular dias úteis apenas para referência (não sobrescrever os resultados)
      const today = new Date();
      const startDate = getStartDateForPeriod(paramsWithTable.period);
      const tradingDaysCount = countBusinessDays(startDate, today);
      
      console.info(`Period: ${params.period}, Start date: ${startDate.toISOString()}, Calculated trading days: ${tradingDaysCount}`);
      
      // Usar diretamente os resultados do backend sem sobrescrever tradingDays
      setAnalysisResults(results);
      
      // Fetch detailed analysis with correct period filtering
      const detailedData = await api.analysis.getDetailedAnalysis(selectedAsset, paramsWithTable);
      
      // Não sobrescrever o valor de tradingDays calculado pelo backend
      // Apenas registrar para fins de depuração
      if (detailedData && detailedData.tradeHistory && detailedData.tradeHistory.length > 0) {
        console.info(`Actual trading days in updated data: ${detailedData.tradingDays}`);
      }
      
      setDetailedResult(detailedData);
      
      toast({
        title: "Analysis updated",
        description: "Analysis was updated successfully",
      });
    } catch (error) {
      console.error("Analysis update failed", error);
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleUpgrade = async () => {
    if (subscriptionLoading) return;
    await createCheckoutSession();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Daytrade Portfolio</h1>
      
      {!showDetailView ? (
        <div className="bg-card p-6 rounded-lg border">
          <StockSetupForm 
            onSubmit={runAnalysis} 
            isLoading={isLoading}
            isFreePlan={isFreePlan}
          />
          
          {isLoading && (
            <div className="mt-6">
              <div className="flex justify-between text-sm mb-2">
                <span>Processing analysis...</span>
                <span>{progress.toFixed(0)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
          
          {/* Upgrade Message */}
          {isFreePlan && analysisResults.length > 0 && (
            <Card className="mt-4 border-amber-200 bg-amber-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-amber-800">
                    <Crown className="h-4 w-4" />
                    <span>Upgrade to Premium for full access to all results and features</span>
                  </div>
                  <Button 
                    onClick={handleUpgrade}
                    disabled={subscriptionLoading}
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700"
                  >
                    {subscriptionLoading ? "Loading..." : "Upgrade to Premium"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          
          {analysisResults.length > 0 && !isLoading && (
            <ResultsTable 
              results={analysisResults} 
              onViewDetails={viewDetails}
              isFreePlan={isFreePlan}
            />
          )}
        </div>
      ) : (
        detailedResult && analysisParams && (
          <div className="bg-card p-6 rounded-lg border">
            <StockDetailView
              result={detailedResult}
              params={analysisParams}
              onClose={closeDetails}
              onUpdateParams={updateAnalysis}
              isLoading={isLoadingDetails}
            />
          </div>
        )
      )}
    </div>
  );
}
