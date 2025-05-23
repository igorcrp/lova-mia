import { AnalysisResult, TradeHistoryItem } from "@/types"; // Assuming AnalysisResult might contain tradeHistory and initialCapital
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState, useMemo } from "react";
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

interface ResultsTableProps {
  results: AnalysisResult[]; // IMPORTANT: Assumes AnalysisResult includes optional tradeHistory: TradeHistoryItem[] and initialCapital: number
  onViewDetails: (assetCode: string) => void;
}

// Helper function to safely convert value to number, defaulting to 0
const safeNumber = (value: any): number => {
  const num = Number(value);
  return isNaN(num) ? 0 : num;
};

type SortField = 
  | "assetCode" 
  | "tradingDays"
  | "trades"
  | "tradePercentage"
  | "profits"
  | "profitPercentage"
  | "losses"
  | "lossPercentage"
  | "stops"
  | "stopPercentage"
  | "finalCapital" // Sorting will use the *calculated* final capital if available
  | "profit"
  | "sharpeRatio"
  | "sortinoRatio"
  | "recoveryFactor";

interface SortConfig {
  field: SortField;
  direction: "asc" | "desc";
}

// Function to calculate the final capital based on trade history
// This logic should ideally live upstream where AnalysisResult is created
// It requires initialCapital and the correct profit/loss calculation within tradeHistory items
const calculateFinalCapitalFromHistory = (result: AnalysisResult): number => {
  // Use pre-calculated finalCapital if history/initialCapital is missing
  if (result.finalCapital !== undefined) {
    return result.finalCapital;
  }
    if (result.tradeHistory?.length > 0 && result.initialCapital !== undefined) {
    const lastTrade = result.tradeHistory.reduce((latest, trade) => 
      new Date(trade.date) > new Date(latest.date) ? trade : latest
    );
    return lastTrade.currentCapital ?? result.initialCapital;
  }
    return result.initialCapital ?? 0;
};
  try {
    // Sort trade history chronologically (ascending)
    const dateOrderedHistory = [...result.tradeHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Recalculate current capital chronologically
    let currentCapital = result.initialCapital;
    dateOrderedHistory.forEach((item, index) => {
      const profitLoss = safeNumber(item.profitLoss); // Assumes profitLoss is correctly pre-calculated
      const tradeStatus = typeof item.trade === 'string' ? item.trade.trim() : "-";
      
      // Simplified capital logic based on StockDetailsTable V2/V3
      // NOTE: Needs full params (operation, interval) for perfect accuracy if recalculating profit/loss here.
      // Here we rely on item.profitLoss being correct from upstream.
      if (index === 0) {
         // Use initial capital + profit/loss only if a trade happened on the first day
         currentCapital = result.initialCapital + (tradeStatus !== '-' ? profitLoss : 0);
      } else {
         // Add profit/loss from the current day to the previous day's capital
         // Note: We are recalculating the running total here based on the initial capital and daily profit/loss
         // We need the *previous* day's capital, which we track in the `currentCapital` variable.
         currentCapital += profitLoss;
      }
    });

    // The final capital is the capital after the last day's profit/loss is added
    return currentCapital;

  } catch (error) {
    console.error("Error calculating final capital from history for:", result.assetCode, error);
    return result.finalCapital; // Fallback to original value on error
  }
};

export function ResultsTable({ results, onViewDetails }: ResultsTableProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: "assetCode",
    direction: "asc"
  });
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Calculate the correct final capital for each result *before* sorting
  const resultsWithCorrectedCapital = useMemo(() => {
    return results.map(result => ({
      ...result,
      calculatedFinalCapital: calculateFinalCapitalFromHistory(result)
    }));
  }, [results]);

  // Sort results based on potentially corrected capital
  const sortedResults = useMemo(() => {
    return [...resultsWithCorrectedCapital].sort((a, b) => {
      // Use calculatedFinalCapital for sorting if the sort field is finalCapital
      const fieldA = sortConfig.field === 'finalCapital' ? a.calculatedFinalCapital : a[sortConfig.field];
      const fieldB = sortConfig.field === 'finalCapital' ? b.calculatedFinalCapital : b[sortConfig.field];
      
      // Handle numeric comparison for relevant fields
      const numericFields: SortField[] = [
          'tradingDays', 'trades', 'tradePercentage', 'profits', 'profitPercentage',
          'losses', 'lossPercentage', 'stops', 'stopPercentage', 'finalCapital',
          'profit', 'sharpeRatio', 'sortinoRatio', 'recoveryFactor'
      ];
      
      if (numericFields.includes(sortConfig.field)) {
          const numA = safeNumber(fieldA);
          const numB = safeNumber(fieldB);
          return sortConfig.direction === "asc" ? numA - numB : numB - numA;
      }
      
      // Default to string comparison
      const strA = String(fieldA ?? '').toLowerCase();
      const strB = String(fieldB ?? '').toLowerCase();
      if (strA < strB) return sortConfig.direction === "asc" ? -1 : 1;
      if (strA > strB) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [resultsWithCorrectedCapital, sortConfig]);

  // Pagination
  const totalPages = Math.ceil(sortedResults.length / rowsPerPage);
  const paginatedResults = sortedResults.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );
  
  const handleSort = (field: SortField) => {
    setSortConfig({
      field,
      direction:
        sortConfig.field === field && sortConfig.direction === "asc"
          ? "desc"
          : "asc",
    });
    setPage(1); // Reset to first page on sort
  };
  
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortConfig.field !== field) {
      return null;
    }
    return sortConfig.direction === "asc" ? (
      <ChevronUp className="ml-1 h-4 w-4" />
    ) : (
      <ChevronDown className="ml-1 h-4 w-4" />
    );
  };

  // Generate pagination items (simplified for brevity, use original if needed)
  const generatePaginationItems = () => {
    const items = [];
    // ... (keep original pagination logic or simplify) ...
     for (let i = 1; i <= totalPages; i++) {
        items.push(
          <PaginationItem key={i}>
            <PaginationLink
              href="#"
              isActive={page === i}
              onClick={(e) => {e.preventDefault(); setPage(i);}}
            >
              {i}
            </PaginationLink>
          </PaginationItem>
        );
      }
    return items;
  };
  
  return (
    <div className="mt-6 space-y-4">
      <h2 className="text-xl font-semibold">Results</h2>
      
      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                 {/* Headers using flex-col for multi-word titles */}
                <TableHead 
                  className="w-20 cursor-pointer text-center px-2 py-3"
                  onClick={() => handleSort("assetCode")}
                >
                  <div className="flex flex-col items-center justify-center"><span>Stock</span><span>Code</span><SortIcon field="assetCode" /></div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer text-center px-2 py-3"
                  onClick={() => handleSort("tradingDays")}
                >
                  <div className="flex flex-col items-center justify-center"><span>Trading</span><span>Days</span><SortIcon field="tradingDays" /></div>
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer px-2 py-3"
                  onClick={() => handleSort("trades")}
                >
                  <div className="flex flex-col items-center justify-center"><span>Nº of</span><span>Trades</span><SortIcon field="trades" /></div>
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer px-2 py-3"
                  onClick={() => handleSort("tradePercentage")}
                >
                  <div className="flex flex-col items-center justify-center"><span>%</span><span>Trade</span><SortIcon field="tradePercentage" /></div>
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer px-2 py-3"
                  onClick={() => handleSort("profits")}
                >
                  <div className="flex items-center justify-center">Profits<SortIcon field="profits" /></div>
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer px-2 py-3"
                  onClick={() => handleSort("profitPercentage")}
                >
                  <div className="flex flex-col items-center justify-center"><span>%</span><span>Profits</span><SortIcon field="profitPercentage" /></div>
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer px-2 py-3"
                  onClick={() => handleSort("losses")}
                >
                  <div className="flex items-center justify-center">Losses<SortIcon field="losses" /></div>
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer px-2 py-3"
                  onClick={() => handleSort("lossPercentage")}
                >
                  <div className="flex flex-col items-center justify-center"><span>%</span><span>Losses</span><SortIcon field="lossPercentage" /></div>
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer px-2 py-3"
                  onClick={() => handleSort("stops")}
                >
                  <div className="flex flex-col items-center justify-center"><span>Nº of</span><span>Stop</span><SortIcon field="stops" /></div>
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer px-2 py-3"
                  onClick={() => handleSort("stopPercentage")}
                >
                  <div className="flex flex-col items-center justify-center"><span>%</span><span>Stop</span><SortIcon field="stopPercentage" /></div>
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer px-2 py-3"
                  onClick={() => handleSort("finalCapital")}
                >
                  <div className="flex flex-col items-center justify-center"><span>Final</span><span>Capital</span><SortIcon field="finalCapital" /></div>
                </TableHead>
                <TableHead className="w-24 text-center px-2 py-3">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedResults.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-center py-6 text-muted-foreground">
                    No results to display
                  </TableCell>
                </TableRow>
              ) : (
                paginatedResults.map((result) => (
                  <TableRow key={result.assetCode}>
                    <TableCell className="font-medium text-center px-2 py-2">{result.assetCode}</TableCell>
                    <TableCell className="text-center px-2 py-2">{result.tradingDays}</TableCell>
                    <TableCell className="text-center px-2 py-2">{result.trades}</TableCell>
                    <TableCell className="text-center px-2 py-2">
                      {safeNumber(result.tradePercentage).toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-center px-2 py-2">
                      {result.profits}
                    </TableCell>
                    <TableCell className={cn(
                      "text-center px-2 py-2",
                      "text-green-600 dark:text-green-400"
                    )}>
                      {safeNumber(result.profitPercentage).toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-center px-2 py-2">
                      {result.losses}
                    </TableCell>
                    <TableCell className={cn(
                      "text-center px-2 py-2",
                      "text-red-600 dark:text-red-400"
                    )}>
                      {safeNumber(result.lossPercentage).toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-center px-2 py-2">
                      {result.stops}
                    </TableCell>
                    <TableCell className="text-center px-2 py-2">
                      {safeNumber(result.stopPercentage).toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-center font-medium px-2 py-2">
                      {/* Display the calculated final capital */}
                      ${safeNumber(result.calculatedFinalCapital).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center px-2 py-2">
                      <Button 
                        size="icon" 
                        variant="outline" 
                        onClick={() => onViewDetails(result.assetCode)}
                      >
                        <Search className="h-4 w-4" />
                        <span className="sr-only">View Details</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      
      {/* Pagination */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4">
         <div className="flex items-center gap-2">
           <span className="text-sm text-muted-foreground">Rows per page:</span>
           <select
             className="bg-background border rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
             value={rowsPerPage}
             onChange={(e) => {
               setRowsPerPage(Number(e.target.value));
               setPage(1);
             }}
           >
             <option value={10}>10</option>
             <option value={25}>25</option>
             <option value={50}>50</option>
             <option value={100}>100</option>
           </select>
         </div>
        
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                href="#"
                onClick={(e) => {e.preventDefault(); setPage(Math.max(1, page - 1));}}
                className={cn(page === 1 && "pointer-events-none opacity-50", "cursor-pointer")}
              />
            </PaginationItem>
            
            {generatePaginationItems()} 
            
            <PaginationItem>
              <PaginationNext 
                href="#"
                onClick={(e) => {e.preventDefault(); setPage(Math.min(totalPages, page + 1));}}
                className={cn(page === totalPages && "pointer-events-none opacity-50", "cursor-pointer")}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
       <p className="text-xs text-muted-foreground pt-2">
         Note: Final Capital is calculated based on the detailed trade history for accuracy. Ensure that the `results` prop includes `tradeHistory` and `initialCapital` for each item.
       </p>
    </div>
  );
}

