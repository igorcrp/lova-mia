import { AnalysisResult } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption, // Added for potential "Loading..." message
} from "@/components/ui/table";
import { useState, useMemo } from "react"; // Added useMemo
import { ChevronDown, ChevronUp, Search, Loader2 } from "lucide-react"; // Added Loader2
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

/**
 * Props for the ResultsTable component.
 */
interface ResultsTableProps {
  /**
   * An array of analysis results to display.
   */
  results: AnalysisResult[];
  /**
   * Callback function triggered when the "View Details" button for a result is clicked.
   * @param assetCode The asset code of the selected result.
   */
  onViewDetails: (assetCode: string) => void;
  /**
   * Optional boolean flag to indicate if the data is currently being loaded.
   * When true, a loading indicator (e.g., skeleton rows) may be displayed.
   */
  isLoading?: boolean;
}

/**
 * Defines the possible fields that the results table can be sorted by.
 */
type SortField =
  | "assetCode"
  | "tradingDays" // Number of days with data used in analysis
  | "trades" // Total number of trades executed
  | "tradePercentage" // Percentage of trading days where a trade occurred
  | "profits" // Number of profitable trades
  | "profitPercentage" // Percentage of trades that were profitable
  | "losses" // Number of losing trades
  | "lossPercentage" // Percentage of trades that were losses
  | "stops" // Number of trades closed by stop-loss
  | "stopPercentage" // Percentage of trades closed by stop-loss
  | "finalCapital" // Final capital after all trades
  | "lastCurrentCapital" // Alias for finalCapital or current capital if ongoing
  | "profit" // Net profit/loss value
  | "averageGain"
  | "averageLoss"
  | "maxDrawdown"
  | "recoveryFactor"
  | "successRate";

/**
 * Configuration for sorting the table.
 */
interface SortConfig {
  /** The field currently used for sorting. */
  field: SortField;
  /** The direction of sorting ('asc' or 'desc'). */
  direction: "asc" | "desc";
}

/**
 * Displays analysis results in a sortable and paginated table.
 *
 * @param {ResultsTableProps} props The component props.
 * @returns {JSX.Element} A table component rendering the analysis results.
 */
export function ResultsTable({ results, onViewDetails, isLoading = false }: ResultsTableProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: "profitPercentage", // Default sort by profitPercentage descending
    direction: "desc",
  });
  const [page, setPage] = useState(1); // Current page number (1-indexed)
  const [rowsPerPage, setRowsPerPage] = useState(10); // Number of results to show per page

  // Memoized sorted results to avoid re-sorting on every render unless results or sortConfig changes.
  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      // Handle potentially undefined fields by falling back to a default (e.g., 0 for numbers, "" for strings)
      // This makes sorting more robust if data is missing, though ideally data should be clean.
      const fieldA = a[sortConfig.field] ?? (typeof a[sortConfig.field] === "number" ? 0 : "");
      const fieldB = b[sortConfig.field] ?? (typeof b[sortConfig.field] === "number" ? 0 : "");

      if (fieldA < fieldB) {
        return sortConfig.direction === "asc" ? -1 : 1;
      }
      if (fieldA > fieldB) {
        return sortConfig.direction === "asc" ? 1 : -1;
      }
      return 0;
    });
  }, [results, sortConfig]);

  // Memoized paginated results.
  const paginatedResults = useMemo(() => {
    return sortedResults.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  }, [sortedResults, page, rowsPerPage]);

  const totalPages = Math.ceil(sortedResults.length / rowsPerPage);

  /**
   * Handles click on a table header to change sorting configuration.
   * Toggles direction if the same field is clicked, otherwise sets to ascending.
   * @param {SortField} field The field to sort by.
   */
  const handleSort = (field: SortField) => {
    const isAsc = sortConfig.field === field && sortConfig.direction === "asc";
    setSortConfig({
      field,
      direction: isAsc ? "desc" : "asc",
    });
    setPage(1); // Reset to first page on sort change
  };

  /**
   * Renders a sort icon (up or down chevron) next to the column header
   * if it's the currently sorted column.
   * @param {{ field: SortField }} props Props containing the field name.
   * @returns {JSX.Element | null} The sort icon or null.
   */
  const SortIcon = ({ field }: { field: SortField }): JSX.Element | null => {
    if (sortConfig.field !== field) {
      return null;
    }

    return sortConfig.direction === "asc" ? (
      <ChevronUp className="ml-1 h-4 w-4" />
    ) : (
      <ChevronDown className="ml-1 h-4 w-4" />
    );
  };

  // Generate pagination items
  const generatePaginationItems = () => {
    const items = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        items.push(
          <PaginationItem key={i}>
            <PaginationLink isActive={page === i} onClick={() => setPage(i)}>
              {i}
            </PaginationLink>
          </PaginationItem>
        );
      }
    } else {
      items.push(
        <PaginationItem key={1}>
          <PaginationLink isActive={page === 1} onClick={() => setPage(1)}>
            1
          </PaginationLink>
        </PaginationItem>
      );

      if (page > 3) {
        items.push(
          <PaginationItem key="start-ellipsis">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }

      let startPage = Math.max(2, page - 1);
      let endPage = Math.min(totalPages - 1, page + 1);

      if (page <= 3) {
        endPage = Math.min(totalPages - 1, 4);
      } else if (page >= totalPages - 2) {
        startPage = Math.max(2, totalPages - 3);
      }

      for (let i = startPage; i <= endPage; i++) {
        items.push(
          <PaginationItem key={i}>
            <PaginationLink isActive={page === i} onClick={() => setPage(i)}>
              {i}
            </PaginationLink>
          </PaginationItem>
        );
      }

      if (page < totalPages - 2) {
        items.push(
          <PaginationItem key="end-ellipsis">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }

      items.push(
        <PaginationItem key={totalPages}>
          <PaginationLink isActive={page === totalPages} onClick={() => setPage(totalPages)}>
            {totalPages}
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
                <TableHead
                  className="w-20 cursor-pointer text-center"
                  onClick={() => handleSort("assetCode")}
                >
                  <div className="flex items-center justify-center">
                    Stock Code
                    <SortIcon field="assetCode" />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer text-center"
                  onClick={() => handleSort("tradingDays")}
                >
                  <div className="flex items-center justify-center">
                    Trading Days
                    <SortIcon field="tradingDays" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-center cursor-pointer"
                  onClick={() => handleSort("trades")}
                >
                  <div className="flex items-center justify-center">
                    Nº of Trades
                    <SortIcon field="trades" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-center cursor-pointer"
                  onClick={() => handleSort("tradePercentage")}
                >
                  <div className="flex items-center justify-center">
                    % Trade
                    <SortIcon field="tradePercentage" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-center cursor-pointer"
                  onClick={() => handleSort("profits")}
                >
                  <div className="flex items-center justify-center">
                    Profits
                    <SortIcon field="profits" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-center cursor-pointer"
                  onClick={() => handleSort("profitPercentage")}
                >
                  <div className="flex items-center justify-center">
                    % Profits
                    <SortIcon field="profitPercentage" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-center cursor-pointer"
                  onClick={() => handleSort("losses")}
                >
                  <div className="flex items-center justify-center">
                    Losses
                    <SortIcon field="losses" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-center cursor-pointer"
                  onClick={() => handleSort("lossPercentage")}
                >
                  <div className="flex items-center justify-center">
                    % Losses
                    <SortIcon field="lossPercentage" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-center cursor-pointer"
                  onClick={() => handleSort("stops")}
                >
                  <div className="flex items-center justify-center">
                    Nº of Stop
                    <SortIcon field="stops" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-center cursor-pointer"
                  onClick={() => handleSort("stopPercentage")}
                >
                  <div className="flex items-center justify-center">
                    % Stop
                    <SortIcon field="stopPercentage" />
                  </div>
                </TableHead>
                <TableHead
                  className="text-center cursor-pointer"
                  onClick={() => handleSort("finalCapital")}
                >
                  <div className="flex items-center justify-center">
                    Final Capital
                    <SortIcon field="finalCapital" />
                  </div>
                </TableHead>
                <TableHead className="w-24 text-center">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedResults.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-6 text-muted-foreground">
                    No results to display
                  </TableCell>
                </TableRow>
              ) : (
                paginatedResults.map((result) => (
                  <TableRow key={result.assetCode}>
                    <TableCell className="font-medium text-center">{result.assetCode}</TableCell>
                    <TableCell className="text-center">{result.tradingDays}</TableCell>
                    <TableCell className="text-center">{result.trades}</TableCell>
                    <TableCell className="text-center">
                      {result.tradePercentage.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-center">{result.profits}</TableCell>
                    <TableCell className={cn("text-center", "text-green-600 dark:text-green-400")}>
                      {result.profitPercentage.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-center">{result.losses}</TableCell>
                    <TableCell className={cn("text-center", "text-red-600 dark:text-red-400")}>
                      {result.lossPercentage.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-center">{result.stops}</TableCell>
                    <TableCell className="text-center">
                      {result.stopPercentage.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      $
                      {(result as any).lastCurrentCapital
                        ? (result as any).lastCurrentCapital.toFixed(2)
                        : result.finalCapital.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
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
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows per page:</span>
          <select
            className="bg-transparent border rounded px-2 py-1 text-sm"
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setPage(1);
            }}
            style={{ backgroundColor: "#0f1729" }}
          >
            <option value={10}>10</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={500}>500</option>
          </select>
        </div>

        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage(Math.max(1, page - 1))}
                className={cn(page === 1 && "pointer-events-none opacity-50")}
              />
            </PaginationItem>

            {generatePaginationItems()}

            <PaginationItem>
              <PaginationNext
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                className={cn(page === totalPages && "pointer-events-none opacity-50")}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
