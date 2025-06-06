
import { useState } from "react";
import { StockSetupForm } from "@/components/StockSetupForm";
import { ResultsTable } from "@/components/ResultsTable";
import { StockDetailView } from "@/components/StockDetailView";
import { api } from "@/services/api";
import { AnalysisResult, DetailedResult, StockAnalysisParams } from "@/types";
import { toast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { countBusinessDays, getStartDateForPeriod } from "@/utils/dateUtils";

export default function DaytradePage() {
  const [analysisParams, setAnalysisParams] = useState<StockAnalysisParams | null>(null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);

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
      
      // Run the analysis using API with the table name and better error handling
      const results = await api.analysis.runAnalysis(paramsWithTable, (currentProgress) => {
        // Update progress based on the API's progress reports
        const newProgress = 20 + currentProgress * 0.7;
        console.info(`Analysis progress: ${newProgress.toFixed(1)}%`);
        setProgress(newProgress);
      });
      
      console.info(`Analysis completed with ${results.length} results`);
      
      // Usar diretamente os resultados do backend sem sobrescrever tradingDays
      setAnalysisResults(results);
      
      // Final processing
      setProgress(95);
      
      // Complete progress
      setTimeout(() => {
        setProgress(100);
        toast({
          title: "Analysis completed",
          description: `Analysis completed successfully with ${results.length} stocks analyzed`,
        });
      }, 200);
      
    } catch (error) {
      console.error("Analysis failed", error);
      toast({
        variant: "destructive",
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
      });
      setProgress(0);
    } finally {
      // Reset progress and loading state after a short delay
      setTimeout(() => {
        setIsLoading(false);
        setProgress(0);
      }, 1000);
    }
  };
  
  const viewDetails = async (assetCode: string) => {
    if (!analysisParams) return;
    
    try {
      setIsLoadingDetails(true);
      setSelectedAsset(assetCode);
      
      console.info(`Loading details for asset: ${assetCode}`);
      
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
      
      console.info(`Detailed analysis loaded for ${assetCode}`);
      
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
      
      console.info(`Updating analysis for ${selectedAsset}`);
      
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
      
      console.info(`Updated analysis completed with ${results.length} results`);
      
      setAnalysisResults(results);
      
      // Fetch detailed analysis with correct period filtering
      const detailedData = await api.analysis.getDetailedAnalysis(selectedAsset, paramsWithTable);
      
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
          <StockSetupForm onSubmit={runAnalysis} isLoading={isLoading} />
          
          {isLoading && (
            <div className="mt-6">
              <div className="flex justify-between text-sm mb-2">
                <span>Processing analysis...</span>
                <span>{progress.toFixed(0)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="text-xs text-muted-foreground mt-1">
                This may take a few minutes depending on the number of stocks to analyze
              </div>
            </div>
          )}
          
          {analysisResults.length > 0 && !isLoading && (
            <div className="mt-6">
              <div className="mb-4">
                <h3 className="text-lg font-semibold">Analysis Results</h3>
                <p className="text-sm text-muted-foreground">
                  Found {analysisResults.length} stocks with sufficient data for analysis
                </p>
              </div>
              <ResultsTable 
                results={analysisResults} 
                onViewDetails={viewDetails} 
              />
            </div>
          )}
        </div>
      ) : (
        detailedResult && analysisParams && (
          <div className="bg-card p-6 rounded-lg border">
            <StockDetailView
              result={detailedResult}
              params={{ ...analysisParams, interval: 'daytrade' }}
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
