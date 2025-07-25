import { useState } from "react";
import { StockSetupForm } from "@/components/StockSetupForm";
import { ResultsTable } from "@/components/ResultsTable";
import { StockDetailView } from "@/components/StockDetailView";
import { PremiumUpgrade } from "@/components/PremiumUpgrade";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { api } from "@/services/api";
import { premiumAnalysisService } from "@/services/premiumAnalysisService";
import { AnalysisResult, DetailedResult, StockAnalysisParams } from "@/types";
import { toast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { countBusinessDays, getStartDateForPeriod } from "@/utils/dateUtils";

export default function DaytradePage() {
  const { isSubscribed } = useSubscription();
  const [analysisParams, setAnalysisParams] = useState<StockAnalysisParams | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ field: string; direction: "asc" | "desc" }>({
    field: "assetCode",
    direction: "asc"
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const runAnalysis = async (params: StockAnalysisParams) => {
    try {
      setIsLoading(true);
      setAnalysisResults([]);
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false);
      // Reset sorting to alphabetical when running new analysis
      setSortConfig({ field: "assetCode", direction: "asc" });
      setCurrentPage(1);
      
      console.info('Running analysis with params:', params);
      console.info(`User subscription status: ${isSubscribed ? 'Premium' : 'Free'}`);
      
      setProgress(10);
      
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
      
      setProgress(20);
      
      const paramsWithTable = {
        ...params,
        dataTableName
      };
      setAnalysisParams(paramsWithTable);
      
      const today = new Date();
      const startDate = getStartDateForPeriod(params.period);
      const tradingDaysCount = countBusinessDays(startDate, today);
      
      console.info(`Period: ${params.period}, Start date: ${startDate.toISOString()}, Calculated trading days: ${tradingDaysCount}`);
      
      let results: AnalysisResult[];
      
      // Use optimized analysis for Premium users, regular analysis for Free users
      if (isSubscribed) {
        console.info('Using PREMIUM optimized analysis service');
        results = await premiumAnalysisService.runOptimizedAnalysis(paramsWithTable, (currentProgress) => {
          setProgress(20 + currentProgress * 0.7);
        });
      } else {
        console.info('Using standard analysis service for Free users');
        results = await api.analysis.runAnalysis(paramsWithTable, (currentProgress) => {
          setProgress(20 + currentProgress * 0.7);
        });
      }
      
      setAnalysisResults(results);
      
      setProgress(95);
      setProgress(100);
      
      toast({
        title: "Analysis completed",
        description: `Analysis was completed successfully${isSubscribed ? ' (Premium optimized)' : ''}`,
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
      
      const detailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsWithTable);
      
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
    if (!selectedAsset || !detailedResult) return;
    
    try {
      setIsLoadingDetails(true);
      
      // Use optimized update method instead of full recalculation
      const updatedDetailedData = await api.analysis.updateDetailedAnalysisOptimized(
        detailedResult,
        params
      );
      
      // Update analysis params
      setAnalysisParams(params);
      
      // Update detailed result with optimized data
      setDetailedResult(updatedDetailedData);
      
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
        <div className="bg-card p-6 sm:p-6 p-3 rounded-lg border">
          <StockSetupForm onSubmit={runAnalysis} isLoading={isLoading} initialParams={analysisParams} />
          
          {/* Only show PremiumUpgrade for non-premium users */}
          {!isSubscribed && <PremiumUpgrade />}
          
          {isLoading && (
            <div className="mt-6">
              <div className="flex justify-between text-sm mb-2">
                <span>Processing analysis{isSubscribed ? ' (Premium optimized)' : ''}...</span>
                <span>{progress.toFixed(0)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
          
          {analysisResults.length > 0 && !isLoading && (
            <ResultsTable 
              results={analysisResults} 
              onViewDetails={viewDetails}
              sortConfig={sortConfig}
              setSortConfig={setSortConfig}
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              rowsPerPage={rowsPerPage}
              setRowsPerPage={setRowsPerPage}
            />
          )}
        </div>
      ) : (
        detailedResult && analysisParams && (
          <div className="bg-card p-6 sm:p-6 p-3 rounded-lg border">
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
