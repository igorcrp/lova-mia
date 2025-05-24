import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface TradeDetail {
  profitLoss: number;
  tradeStatus: string;
  stopStatus: string;
}

interface AnalysisResult {
  assetCode: string;
  tradingDays: number;
  trades: number;
  tradePercentage: number;
  finalCapital: number;
  lastCurrentCapital?: number;
  tradeDetails: TradeDetail[];
}

interface ResultsTableProps {
  results: AnalysisResult[];
  onViewDetails: (assetCode: string) => void;
}

type SortField = keyof Omit<AnalysisResult, 'tradeDetails' | 'lastCurrentCapital'> | 
  'profits' | 'profitPercentage' | 'losses' | 'lossPercentage' | 'stops' | 'stopPercentage';

export function ResultsTable({ results, onViewDetails }: ResultsTableProps) {
  const [sortConfig, setSortConfig] = useState<{field: SortField; direction: 'asc' | 'desc'}>({
    field: "assetCode",
    direction: "asc"
  });
  const [page, setPage] = useState(1);
  const [rowsPerPage] = useState(10);

  // Função para calcular métricas
  const getCalculatedMetrics = (result: AnalysisResult) => {
    const validTrades = result.tradeDetails.filter(d => d.tradeStatus === "Executed");
    
    const profits = validTrades.filter(d => d.profitLoss > 0 && !d.stopStatus).length;
    const losses = validTrades.filter(d => d.profitLoss < 0 && !d.stopStatus).length;
    const stops = validTrades.filter(d => d.profitLoss < 0 && d.stopStatus === "Executed").length;
    
    return {
      profits,
      profitPercentage: result.trades > 0 ? (profits / result.trades) * 100 : 0,
      losses,
      lossPercentage: result.trades > 0 ? (losses / result.trades) * 100 : 0,
      stops,
      stopPercentage: result.trades > 0 ? (stops / result.trades) * 100 : 0
    };
  };

  // Processa os resultados com as métricas calculadas
  const processedResults = results.map(result => ({
    ...result,
    ...getCalculatedMetrics(result)
  }));

  // Ordenação
  const sortedResults = [...processedResults].sort((a, b) => {
    const aValue = a[sortConfig.field];
    const bValue = b[sortConfig.field];
    
    if (aValue === undefined || bValue === undefined) return 0;
    
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  // Paginação
  const paginatedResults = sortedResults.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  const handleSort = (field: SortField) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortConfig.field !== field) return null;
    return sortConfig.direction === 'asc' 
      ? <ChevronUp className="ml-1 h-4 w-4" /> 
      : <ChevronDown className="ml-1 h-4 w-4" />;
  };

  return (
    <div className="mt-6 space-y-4">
      <h2 className="text-xl font-semibold">Results</h2>
      
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {[
                { field: 'assetCode', label: 'Stock Code', width: 'w-20' },
                { field: 'tradingDays', label: 'Trading Days' },
                { field: 'trades', label: 'Nº of Trades' },
                { field: 'tradePercentage', label: '% Trade' },
                { field: 'profits', label: 'Profits' },
                { field: 'profitPercentage', label: '% Profits' },
                { field: 'losses', label: 'Losses' },
                { field: 'lossPercentage', label: '% Losses' },
                { field: 'stops', label: 'Nº of Stop' },
                { field: 'stopPercentage', label: '% Stop' },
                { field: 'finalCapital', label: 'Final Capital' },
              ].map(({ field, label, width }) => (
                <TableHead 
                  key={field}
                  className={`text-center cursor-pointer ${width || ''}`}
                  onClick={() => handleSort(field as SortField)}
                >
                  <div className="flex items-center justify-center">
                    {label}
                    <SortIcon field={field as SortField} />
                  </div>
                </TableHead>
              ))}
              <TableHead className="w-24 text-center">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedResults.length > 0 ? (
              paginatedResults.map((result) => {
                const metrics = getCalculatedMetrics(result);
                return (
                  <TableRow key={result.assetCode}>
                    <TableCell className="text-center font-medium">{result.assetCode}</TableCell>
                    <TableCell className="text-center">{result.tradingDays}</TableCell>
                    <TableCell className="text-center">{result.trades}</TableCell>
                    <TableCell className="text-center">{result.tradePercentage.toFixed(2)}%</TableCell>
                    <TableCell className="text-center">{metrics.profits}</TableCell>
                    <TableCell className="text-center text-green-600 dark:text-green-400">
                      {metrics.profitPercentage.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-center">{metrics.losses}</TableCell>
                    <TableCell className="text-center text-red-600 dark:text-red-400">
                      {metrics.lossPercentage.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-center">{metrics.stops}</TableCell>
                    <TableCell className="text-center">{metrics.stopPercentage.toFixed(2)}%</TableCell>
                    <TableCell className="text-center font-medium">
                      ${(result.lastCurrentCapital || result.finalCapital).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button 
                        size="icon" 
                        variant="outline" 
                        onClick={() => onViewDetails(result.assetCode)}
                      >
                        <Search className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-6 text-muted-foreground">
                  No results to display
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginação simplificada */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          Showing {paginatedResults.length} of {sortedResults.length} results
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button 
            variant="outline" 
            disabled={page * rowsPerPage >= sortedResults.length}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
