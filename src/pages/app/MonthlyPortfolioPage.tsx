import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { StockSetupForm } from "@/components/StockSetupForm";
import { ResultsTable } from "@/components/ResultsTable";
import { StockDetailView } from "@/components/StockDetailView";
import { api } from "@/services/api";
import { StockAnalysisParams, AnalysisResult, DetailedResult } from "@/types";
import { toast } from "sonner";

export default function MonthlyPortfolioPage() {
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [detailedResult, setDetailedResult] = useState<DetailedResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleRunAnalysis = async (params: StockAnalysisParams) => {
    try {
      setIsLoading(true);
      const results = await api.analysis.runAnalysis(params);
      setAnalysisResults(results);
      toast.success("Análise concluída com sucesso!");
    } catch (error) {
      console.error("Erro ao executar análise:", error);
      toast.error("Erro ao executar análise");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Carteira Mensal</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuração da Análise</CardTitle>
        </CardHeader>
        <CardContent>
          <StockSetupForm
            onRunAnalysis={handleRunAnalysis}
            isLoading={isLoading}
            analysisType="monthly"
          />
        </CardContent>
      </Card>

      {analysisResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resultados da Análise</CardTitle>
          </CardHeader>
          <CardContent>
            <ResultsTable
              results={analysisResults}
              onViewDetails={(assetCode) => {
                // Mock detailed view for now
                setDetailedResult({
                  assetCode,
                  assetName: `Asset ${assetCode}`,
                  tradingDays: 250,
                  trades: 50,
                  tradePercentage: 20,
                  profits: 30,
                  profitPercentage: 60,
                  losses: 15,
                  lossPercentage: 30,
                  stops: 5,
                  stopPercentage: 10,
                  finalCapital: 115000,
                  profit: 15000,
                  averageGain: 500,
                  averageLoss: 300,
                  maxDrawdown: 5.2,
                  sharpeRatio: 1.8,
                  sortinoRatio: 2.1,
                  recoveryFactor: 2.9,
                  successRate: 60,
                  tradeHistory: [],
                  capitalEvolution: []
                });
                setShowDetails(true);
              }}
            />
          </CardContent>
        </Card>
      )}

      {showDetails && detailedResult && (
        <StockDetailView
          result={detailedResult}
          onClose={() => {
            setShowDetails(false);
            setDetailedResult(null);
          }}
        />
      )}
    </div>
  );
}
