import { useState, useEffect } from "react";
import { StockSetupForm } from "@/components/StockSetupForm";
import { ResultsTable } from "@/components/ResultsTable";
import { StockDetailView } from "@/components/StockDetailView";
import { PremiumUpgrade } from "@/components/PremiumUpgrade";
import { PlatformTour } from "@/components/PlatformTour";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { api } from "@/services/api";
import { premiumAnalysisService } from "@/services/premiumAnalysisService";
import { AnalysisResult, DetailedResult, StockAnalysisParams } from "@/types";
import { toast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { countBusinessDays, getStartDateForPeriod } from "@/utils/dateUtils";

export default function DaytradePage() {
  const { isSubscribed } = useSubscription();
  
  // Load state from localStorage on mobile
  const loadStateFromStorage = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      try {
        const savedState = localStorage.getItem('daytrade-page-state');
        return savedState ? JSON.parse(savedState) : {};
      } catch {
        return {};
      }
    }
    return {};
  };

  const savedState = loadStateFromStorage();
  
  const [analysisParams, setAnalysisParams] = useState<StockAnalysisParams | null>(savedState.analysisParams || null);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>(savedState.analysisResults || []);
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(savedState.detailedResult || null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(savedState.selectedAsset || null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDetailView, setShowDetailView] = useState(savedState.showDetailView || false);
  const [showTour, setShowTour] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ field: string; direction: "asc" | "desc" }>(savedState.sortConfig || {
    field: "assetCode",
    direction: "asc"
  });

  // Auto-show tour for new users
  useEffect(() => {
    const hasSeenTour = localStorage.getItem('hasSeenPlatformTour');
    if (!hasSeenTour) {
      setShowTour(true);
    }
  }, []);

  // Listen for tour event from sidebar
  useEffect(() => {
    const handleShowTour = () => setShowTour(true);
    window.addEventListener('showTour', handleShowTour);
    return () => window.removeEventListener('showTour', handleShowTour);
  }, []);
  const [currentPage, setCurrentPage] = useState(savedState.currentPage || 1);
  const [rowsPerPage, setRowsPerPage] = useState(savedState.rowsPerPage || 10);

  // Save state to localStorage on mobile when key states change
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      const stateToSave = {
        analysisParams,
        analysisResults,
        detailedResult,
        selectedAsset,
        showDetailView,
        sortConfig,
        currentPage,
        rowsPerPage
      };
      
      try {
        localStorage.setItem('daytrade-page-state', JSON.stringify(stateToSave));
      } catch (error) {
        console.warn('Failed to save state to localStorage:', error);
      }
    }
  }, [analysisParams, analysisResults, detailedResult, selectedAsset, showDetailView, sortConfig, currentPage, rowsPerPage]);

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
      
      console.info(`DEBUG: Analysis results received:`, results.map(r => ({
        assetCode: r.assetCode,
        finalCapital: r.finalCapital,
        trades: r.trades
      })));
      
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
      
      console.info(`DEBUG: Fetching detailed analysis for ${assetCode}`);
      console.info(`DEBUG: Params being passed to detailed analysis:`, paramsWithTable);
      
      const detailedData = await api.analysis.getDetailedAnalysis(assetCode, paramsWithTable);
      
      console.info(`DEBUG: Detailed data received for ${assetCode}:`, {
        finalCapital: detailedData?.finalCapital,
        trades: detailedData?.trades,
        tradeHistoryLength: detailedData?.tradeHistory?.length,
        tradingDays: detailedData?.tradingDays,
        lastTradeCurrentCapital: detailedData?.tradeHistory?.[detailedData.tradeHistory.length - 1]?.currentCapital
      });
      
      if (detailedData && detailedData.tradeHistory && detailedData.tradeHistory.length > 0) {
        console.info(`Actual trading days in data: ${detailedData.tradingDays}`);
        console.info(`DEBUG: First trade current capital: ${detailedData.tradeHistory[0]?.currentCapital}`);
        console.info(`DEBUG: Last trade current capital: ${detailedData.tradeHistory[detailedData.tradeHistory.length - 1]?.currentCapital}`);
        console.info(`DEBUG: Final capital from metrics: ${detailedData.finalCapital}`);
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
    <div className="w-full">
      <h1 className="text-2xl font-bold mb-6">Daytrade Portfolio</h1>
      
      {!showDetailView ? (
        <div className="bg-card p-6 rounded-lg border">
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
            <div data-tour="results-table">
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
            </div>
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

      {/* Platform Tour */}
      <PlatformTour
        isOpen={showTour}
        onClose={() => setShowTour(false)}
        onComplete={() => {
          setShowTour(false);
          localStorage.setItem('hasSeenPlatformTour', 'true');
          toast({
            title: "Tour Complete",
            description: "You're now ready to start analyzing stocks!"
          });
        }}
      />
    </div>
  );
}
