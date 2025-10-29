import { useState, useEffect } from "react";
import { StockSetupForm } from "@/components/StockSetupForm";
import { ResultsTable } from "@/components/ResultsTable";
import { StockDetailView } from "@/components/StockDetailView";
import { PremiumUpgrade } from "@/components/PremiumUpgrade";
import { PlatformTour } from "@/components/PlatformTour";
import { QueryLimitModal } from "@/components/QueryLimitModal";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { api } from "@/services/api";
import { premiumAnalysisService } from "@/services/premiumAnalysisService";
import { AnalysisResult, DetailedResult, StockAnalysisParams } from "@/types";
import { toast } from "@/components/ui/use-toast";
import { Progress } from "@/components/ui/progress";
import { countBusinessDays, getStartDateForPeriod } from "@/utils/dateUtils";

export default function DaytradePage() {
  const { isSubscribed, incrementQueries, isQueryLimitReached } = useSubscription();
  const { user, markTourAsCompleted } = useAuth();
  const [showLimitModal, setShowLimitModal] = useState(false);
  
  // Load state from localStorage (both mobile and desktop)
  const loadStateFromStorage = () => {
    if (typeof window !== 'undefined') {
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
  const [currentPage, setCurrentPage] = useState(savedState.currentPage || 1);
  const [rowsPerPage, setRowsPerPage] = useState(savedState.rowsPerPage || 10);

  // Check for localStorage changes and reset state if needed
  useEffect(() => {
    const checkLocalStorage = () => {
      if (typeof window !== 'undefined') {
        const currentSavedState = localStorage.getItem('daytrade-page-state');
        if (!currentSavedState) {
          // localStorage foi limpo, resetar todos os states
          setAnalysisParams(null);
          setAnalysisResults([]);
          setDetailedResult(null);
          setSelectedAsset(null);
          setShowDetailView(false);
          setSortConfig({ field: "assetCode", direction: "asc" });
          setCurrentPage(1);
          setRowsPerPage(10);
        }
      }
    };

    // Check immediately on mount
    checkLocalStorage();

    // Set up interval to check periodically (in case localStorage is cleared by another component)
    const interval = setInterval(checkLocalStorage, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Auto-show tour for new users who haven't seen it yet
  useEffect(() => {
    const checkTourStatus = async () => {
      if (user?.id) {
        // Check if user just registered (has_seen_tour is null or false)
        const { data, error } = await supabase
          .from('users')
          .select('has_seen_tour, created_at')
          .eq('id', user.id)
          .single();
        
        if (!error && data) {
          // Only show tour if has_seen_tour is explicitly false or null
          // and this is a relatively new user (created within last 24 hours)
          const isNewUser = new Date(data.created_at).getTime() > Date.now() - 24 * 60 * 60 * 1000;
          if (!data.has_seen_tour && isNewUser) {
            setShowTour(true);
          }
        }
      }
    };

    // Only check on mount if user exists
    if (user?.id) {
      checkTourStatus();
    }
  }, [user?.id]); // Only depend on user.id, not the entire user object

  // Listen for tour event from sidebar
  useEffect(() => {
    const handleShowTour = () => setShowTour(true);
    window.addEventListener('showTour', handleShowTour);
    return () => window.removeEventListener('showTour', handleShowTour);
  }, []);

  // Prevent losing analysis when user switches windows/tabs
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Keep analysis state when user switches tabs/windows
      if (document.visibilityState === 'visible') {
        console.log('User returned to tab - preserving analysis state');
      }
    };

    const handleWindowFocus = () => {
      console.log('Window gained focus - preserving analysis state');
    };

    const handleWindowBlur = () => {
      console.log('Window lost focus - preserving analysis state');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  // Save state to localStorage when key states change (both mobile and desktop now)
  useEffect(() => {
    if (typeof window !== 'undefined') {
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
      // Check if free user has reached limit BEFORE incrementing
      if (!isSubscribed && isQueryLimitReached) {
        setShowLimitModal(true);
        return;
      }
      
      // Increment query count before starting analysis (for tracking purposes)
      incrementQueries();
      
      // Show modal after incrementing if this was the last free query
      if (!isSubscribed && isQueryLimitReached) {
        setShowLimitModal(true);
      }
      
      setIsLoading(true);
      setAnalysisResults([]);
      setAnalysisParams(params);
      setProgress(0);
      setShowDetailView(false);
      // Reset sorting to alphabetical when running new analysis
      setSortConfig({ field: "assetCode", direction: "asc" });
      setCurrentPage(1);
      
      console.info('DEBUG DaytradePage: Running analysis with params:', params);
      console.info(`DEBUG DaytradePage: User subscription status: ${isSubscribed ? 'Premium' : 'Free'}`);
      console.info(`DEBUG DaytradePage: ComparisonStocks:`, params.comparisonStocks);
      
      setProgress(10);
      
      let dataTableName = params.dataTableName;
      
      if (!dataTableName) {
        console.info('DEBUG DaytradePage: Getting data table name...');
        dataTableName = await api.marketData.getDataTableName(
          params.country,
          params.stockMarket,
          params.assetClass
        );
        
        if (!dataTableName) {
          throw new Error("Failed to identify data source");
        }
        console.info(`DEBUG DaytradePage: Found data table: ${dataTableName}`);
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
      
      console.info(`DEBUG DaytradePage: Period: ${params.period}, Start date: ${startDate.toISOString()}, Calculated trading days: ${tradingDaysCount}`);
      
      let results: AnalysisResult[];
      
      // Use optimized analysis for Premium users, regular analysis for Free users
      if (isSubscribed) {
        console.info('DEBUG DaytradePage: Using PREMIUM optimized analysis service');
        results = await premiumAnalysisService.runOptimizedAnalysis(paramsWithTable, (currentProgress) => {
          setProgress(20 + currentProgress * 0.7);
        });
      } else {
        console.info('DEBUG DaytradePage: Using standard analysis service for Free users');
        results = await api.analysis.runAnalysis(paramsWithTable, (currentProgress) => {
          setProgress(20 + currentProgress * 0.7);
        });
      }
      
      console.info(`DEBUG DaytradePage: Analysis results received:`, results.map(r => ({
        assetCode: r.assetCode,
        finalCapital: r.finalCapital,
        trades: r.trades,
        hasData: true
      })));
      
      console.info(`DEBUG DaytradePage: Total results count: ${results.length}`);
      
      setAnalysisResults(results);
      
      setProgress(95);
      setProgress(100);
      
      toast({
        title: "Analysis completed",
        description: `Analysis was completed successfully${isSubscribed ? ' (Premium optimized)' : ''} - Found ${results.length} results`,
      });
    } catch (error) {
      console.error("DEBUG DaytradePage: Analysis failed", error);
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
    <div className="w-full max-w-full overflow-x-hidden">
      <h1 className="text-xl md:text-2xl font-bold mb-6">Daytrade Portfolio</h1>
      
      {!showDetailView ? (
        <div className="bg-card p-6 rounded-lg border">
          <StockSetupForm onSubmit={runAnalysis} isLoading={isLoading} initialParams={analysisParams} />
          
          {/* Show PremiumUpgrade only when limit is reached for free users */}
          <PremiumUpgrade />
          
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
        onComplete={async () => {
          setShowTour(false);
          await markTourAsCompleted();
          toast({
            title: "Tour Complete",
            description: "You're now ready to start analyzing stocks!"
          });
        }}
      />

      {/* Query Limit Modal */}
      <QueryLimitModal
        isOpen={showLimitModal}
        onClose={() => setShowLimitModal(false)}
      />
    </div>
  );
}
