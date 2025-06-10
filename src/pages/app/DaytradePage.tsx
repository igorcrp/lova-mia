
import { useState, useEffect } from "react";
import { StockSetupForm } from "@/components/StockSetupForm";
import { ResultsTable } from "@/components/ResultsTable";
import { StockDetailView } from "@/components/StockDetailView";
import { api } from "@/services/api";
import { AnalysisResult, DetailedResult, StockAnalysisParams } from "@/types";
import { toast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Crown, Check } from "lucide-react";
import { countBusinessDays, getStartDateForPeriod } from "@/utils/dateUtils";
import { useAuth } from "@/contexts/AuthContext";

export default function DaytradePage() {
  const { planType, subscriptionLoading, createCheckout, openCustomerPortal, user } = useAuth();
  const [analysisParams, setAnalysisParams] = useState<StockAnalysisParams | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);

  // Check for success/cancel URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === 'true') {
      toast({
        title: "Payment successful!",
        description: "Your subscription has been activated.",
      });
      // Clear URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get('canceled') === 'true') {
      toast({
        variant: "destructive",
        title: "Payment canceled",
        description: "Your subscription was not activated.",
      });
      // Clear URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const runAnalysis = async (params: StockAnalysisParams) => {
    try {
      setIsLoading(true);
      setAnalysisResults([]);
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false);
      
      console.info('Running analysis with params:', params);
      
      // Apply Free plan restrictions
      if (planType === 'free') {
        // Force period to 1 month for free users
        params = { ...params, period: '1 month' };
      }
      
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
      
      // Apply Free plan result limitation
      let finalResults = results;
      if (planType === 'free' && results.length > 10) {
        finalResults = results.slice(0, 10);
      }
      
      // Usar diretamente os resultados do backend sem sobrescrever tradingDays
      setAnalysisResults(finalResults);
      
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
      
      // Apply Free plan restrictions
      if (planType === 'free') {
        params = { ...params, period: '1 month' };
      }
      
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
      
      // Apply Free plan result limitation
      let finalResults = results;
      if (planType === 'free' && results.length > 10) {
        finalResults = results.slice(0, 10);
      }
      
      // Calcular dias úteis apenas para referência (não sobrescrever os resultados)
      const today = new Date();
      const startDate = getStartDateForPeriod(paramsWithTable.period);
      const tradingDaysCount = countBusinessDays(startDate, today);
      
      console.info(`Period: ${params.period}, Start date: ${startDate.toISOString()}, Calculated trading days: ${tradingDaysCount}`);
      
      // Usar diretamente os resultados do backend sem sobrescrever tradingDays
      setAnalysisResults(finalResults);
      
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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Daytrade Portfolio</h1>
      
      {!showDetailView ? (
        <div className="bg-card p-6 rounded-lg border">
          <StockSetupForm 
            onSubmit={runAnalysis} 
            isLoading={isLoading}
            planType={planType}
            subscriptionLoading={subscriptionLoading}
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
          
          {/* Free Plan Upgrade Message */}
          {planType === 'free' && !isLoading && (
            <Card className="mt-6 border-orange-200 bg-orange-50/50">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <Crown className="h-5 w-5 text-orange-600 mt-0.5" />
                    <div>
                      <h3 className="font-medium text-orange-900">Upgrade to Premium for Full Access</h3>
                      <p className="text-sm text-orange-700 mt-1">
                        Get unlimited analysis periods, complete results, and advanced filtering capabilities.
                      </p>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center text-sm text-orange-700">
                          <Check className="h-3 w-3 mr-1" />
                          <span>All time periods available</span>
                        </div>
                        <div className="flex items-center text-sm text-orange-700">
                          <Check className="h-3 w-3 mr-1" />
                          <span>Complete stock results</span>
                        </div>
                        <div className="flex items-center text-sm text-orange-700">
                          <Check className="h-3 w-3 mr-1" />
                          <span>Advanced table filtering</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      onClick={createCheckout}
                      className="bg-orange-600 hover:bg-orange-700"
                      disabled={subscriptionLoading}
                    >
                      Upgrade to Premium
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          {analysisResults.length > 0 && !isLoading && (
            <ResultsTable 
              results={analysisResults} 
              onViewDetails={viewDetails}
              planType={planType}
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
