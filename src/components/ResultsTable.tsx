import { AnalysisResult } from "@/types";
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
import { useSubscription } from "@/contexts/SubscriptionContext";

interface TradeDetail {
  profitLoss: number;
  trade: string;
  stop: string;
}

interface ResultsTableProps {
  results: AnalysisResult[];
  onViewDetails: (assetCode: string) => void;
  sortConfig: { field: string; direction: "asc" | "desc" };
  setSortConfig: (config: { field: string; direction: "asc" | "desc" }) => void;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  rowsPerPage: number;
  setRowsPerPage: (rows: number) => void;
}

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
  | "finalCapital";

interface SortConfig {
  field: SortField;
  direction: "asc" | "desc";
}

export function ResultsTable({ 
  results, 
  onViewDetails, 
  sortConfig, 
  setSortConfig, 
  currentPage, 
  setCurrentPage, 
  rowsPerPage, 
  setRowsPerPage 
}: ResultsTableProps) {
  const { isSubscribed } = useSubscription();

  // Sort results
  const sortedResults = [...results].sort((a, b) => {
    if (isSubscribed) {
      const fieldA = a[sortConfig.field as SortField];
      const fieldB = b[sortConfig.field as SortField];
      
      if (fieldA < fieldB) {
        return sortConfig.direction === "asc" ? -1 : 1;
      }
      if (fieldA > fieldB) {
        return sortConfig.direction === "asc" ? 1 : -1;
      }
      return 0;
    } else {
      // For free users, always sort alphabetically by assetCode
      return a.assetCode.localeCompare(b.assetCode);
    }
  });

  // For free users, limit to 10 results
  const displayResults = isSubscribed ? sortedResults : sortedResults.slice(0, 10);

  // Pagination
  const totalPages = Math.ceil(displayResults.length / rowsPerPage);
  const paginatedResults = displayResults.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );
  
  const handleSort = (field: SortField) => {
    if (!isSubscribed) return; // Disable sorting for free users
    
    setSortConfig({
      field,
      direction:
        sortConfig.field === field && sortConfig.direction === "asc"
          ? "desc"
          : "asc",
    });
  };
  
  const SortIcon = ({ field }: { field: SortField }) => {
    if (!isSubscribed || sortConfig.field !== field) {
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
            <PaginationLink
              isActive={currentPage === i}
              onClick={() => setCurrentPage(i)}
            >
              {i}
            </PaginationLink>
          </PaginationItem>
        );
      }
    } else {
      items.push(
        <PaginationItem key={1}>
          <PaginationLink
            isActive={currentPage === 1}
            onClick={() => setCurrentPage(1)}
          >
            1
          </PaginationLink>
        </PaginationItem>
      );
      
      if (currentPage > 3) {
        items.push(
          <PaginationItem key="start-ellipsis">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }
      
      let startPage = Math.max(2, currentPage - 1);
      let endPage = Math.min(totalPages - 1, currentPage + 1);
      
      if (currentPage <= 3) {
        endPage = Math.min(totalPages - 1, 4);
      } else if (currentPage >= totalPages - 2) {
        startPage = Math.max(2, totalPages - 3);
      }
      
      for (let i = startPage; i <= endPage; i++) {
        items.push(
        <PaginationItem key={i}>
          <PaginationLink
            isActive={currentPage === i}
            onClick={() => setCurrentPage(i)}
          >
            {i}
          </PaginationLink>
        </PaginationItem>
        );
      }
      
      if (currentPage < totalPages - 2) {
        items.push(
          <PaginationItem key="end-ellipsis">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }
      
      items.push(
      <PaginationItem key={totalPages}>
        <PaginationLink
          isActive={currentPage === totalPages}
          onClick={() => setCurrentPage(totalPages)}
        >
          {totalPages}
        </PaginationLink>
      </PaginationItem>
      );
    }
    
    return items;
  };
  
  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">Results</h2>
          {!isSubscribed && results.length > 10 && (
            <span className="text-sm text-muted-foreground">
              Showing 10 of {results.length} results (Premium shows all)
            </span>
          )}
        </div>
      </div>
      
      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {/* Mobile Sorting Controls for Premium users */}
        {isSubscribed && (
          <div className="mb-4 p-3 bg-muted/30 rounded-lg">
            <div className="text-sm font-medium text-muted-foreground mb-2">Sort by:</div>
            <div className="flex gap-1 overflow-x-auto" 
                 style={{ 
                   scrollbarWidth: 'none', 
                   msOverflowStyle: 'none',
                   whiteSpace: 'nowrap'
                 }}>
              <style dangerouslySetInnerHTML={{
                __html: `
                  .overflow-x-auto::-webkit-scrollbar {
                    display: none;
                  }
                `
              }} />
              {[
                { field: "assetCode", label: "Stock" },
                { field: "finalCapital", label: "Final Capital" },
                { field: "trades", label: "Trades" },
                { field: "profits", label: "Profits" },
                { field: "losses", label: "Losses" }
              ].map(({ field, label }) => (
                <Button
                  key={field}
                  variant={sortConfig.field === field ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSort(field as SortField)}
                  className="h-8 px-2 text-xs whitespace-nowrap flex-shrink-0"
                >
                  {label}
                  {sortConfig.field === field && (
                    sortConfig.direction === "asc" ? (
                      <ChevronUp className="ml-1 h-3 w-3" />
                    ) : (
                      <ChevronDown className="ml-1 h-3 w-3" />
                    )
                  )}
                </Button>
              ))}
            </div>
          </div>
        )}
        
        {paginatedResults.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No results to display
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedResults.map((result) => (
              <div key={result.assetCode} className="bg-card border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">{result.assetCode}</h3>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => onViewDetails(result.assetCode)}
                    className="h-8 px-3"
                  >
                    <Search className="h-3 w-3 mr-1" />
                    Details
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Trading Days:</span>
                      <span className="font-medium">{result.tradingDays}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nº Trades:</span>
                      <span className="font-medium">{result.trades}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">% Trade:</span>
                      <span className="font-medium">{result.tradePercentage.toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Profits:</span>
                      <span className="font-medium text-green-600 dark:text-green-400">
                        {result.profits} ({result.profitPercentage.toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Losses:</span>
                      <span className="font-medium text-red-600 dark:text-red-400">
                        {result.losses} ({result.lossPercentage.toFixed(2)}%)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stops:</span>
                      <span className="font-medium">{result.stops} ({result.stopPercentage.toFixed(2)}%)</span>
                    </div>
                     <div className="flex justify-between">
                       <span className="text-muted-foreground">Final Capital:</span>
                        <span className="font-semibold">
                          ${(result.lastCurrentCapital ?? result.finalCapital).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                     </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead 
                  className={cn(
                    "w-20 text-center",
                    isSubscribed && "cursor-pointer"
                  )}
                  onClick={() => handleSort("assetCode")}
                >
                  <div className="flex items-center justify-center">
                    Stock
                    <SortIcon field="assetCode" />
                  </div>
                </TableHead>
                <TableHead 
                  className={cn(
                    "text-center",
                    isSubscribed && "cursor-pointer"
                  )}
                  onClick={() => handleSort("tradingDays")}
                >
                  <div className="flex items-center justify-center">
                    Trading Days
                    <SortIcon field="tradingDays" />
                  </div>
                </TableHead>
                <TableHead 
                  className={cn(
                    "text-center",
                    isSubscribed && "cursor-pointer"
                  )}
                  onClick={() => handleSort("trades")}
                >
                  <div className="flex items-center justify-center">
                    Nº of Trades
                    <SortIcon field="trades" />
                  </div>
                </TableHead>
                <TableHead 
                  className={cn(
                    "text-center",
                    isSubscribed && "cursor-pointer"
                  )}
                  onClick={() => handleSort("tradePercentage")}
                >
                  <div className="flex items-center justify-center">
                    % Trade
                    <SortIcon field="tradePercentage" />
                  </div>
                </TableHead>
                <TableHead 
                  className={cn(
                    "text-center",
                    isSubscribed && "cursor-pointer"
                  )}
                  onClick={() => handleSort("profits")}
                >
                  <div className="flex items-center justify-center">
                    Profits
                    <SortIcon field="profits" />
                  </div>
                </TableHead>
                <TableHead 
                  className={cn(
                    "text-center",
                    isSubscribed && "cursor-pointer"
                  )}
                  onClick={() => handleSort("profitPercentage")}
                >
                  <div className="flex items-center justify-center">
                    % Profits
                    <SortIcon field="profitPercentage" />
                  </div>
                </TableHead>
                <TableHead 
                  className={cn(
                    "text-center",
                    isSubscribed && "cursor-pointer"
                  )}
                  onClick={() => handleSort("losses")}
                >
                  <div className="flex items-center justify-center">
                    Losses
                    <SortIcon field="losses" />
                  </div>
                </TableHead>
                <TableHead 
                  className={cn(
                    "text-center",
                    isSubscribed && "cursor-pointer"
                  )}
                  onClick={() => handleSort("lossPercentage")}
                >
                  <div className="flex items-center justify-center">
                    % Losses
                    <SortIcon field="lossPercentage" />
                  </div>
                </TableHead>
                <TableHead 
                  className={cn(
                    "text-center",
                    isSubscribed && "cursor-pointer"
                  )}
                  onClick={() => handleSort("stops")}
                >
                  <div className="flex items-center justify-center">
                    Nº of Stop
                    <SortIcon field="stops" />
                  </div>
                </TableHead>
                <TableHead 
                  className={cn(
                    "text-center",
                    isSubscribed && "cursor-pointer"
                  )}
                  onClick={() => handleSort("stopPercentage")}
                >
                  <div className="flex items-center justify-center">
                    % Stop
                    <SortIcon field="stopPercentage" />
                  </div>
                </TableHead>
                <TableHead 
                  className={cn(
                    "text-center",
                    isSubscribed && "cursor-pointer"
                  )}
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
                    <TableCell className={cn(
                      "text-center",
                      "text-green-600 dark:text-green-400"
                    )}>
                      {result.profitPercentage.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-center">{result.losses}</TableCell>
                    <TableCell className={cn(
                      "text-center",
                      "text-red-600 dark:text-red-400"
                    )}>
                      {result.lossPercentage.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-center">{result.stops}</TableCell>
                    <TableCell className="text-center">
                      {result.stopPercentage.toFixed(2)}%
                    </TableCell>
                     <TableCell className="text-center font-medium">
                       ${(result.lastCurrentCapital ?? result.finalCapital).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
      
      {/* Pagination - only show if subscribed or if free user has less than 10 results */}
      {(isSubscribed || paginatedResults.length <= 10) && totalPages > 1 && (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page:</span>
            <select
              className="bg-transparent border rounded px-2 py-1 text-sm"
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              disabled={!isSubscribed}
              style={{ backgroundColor: "#0f1729" }}
            >
              <option value={10}>10</option>
              {isSubscribed && (
                <>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={500}>500</option>
                </>
              )}
            </select>
          </div>
          
          <Pagination>
            <PaginationContent>
              <PaginationItem>
              <PaginationPrevious 
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                className={cn(currentPage === 1 && "pointer-events-none opacity-50")}
              />
              </PaginationItem>
              
              {generatePaginationItems()}
              
              <PaginationItem>
              <PaginationNext 
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                className={cn(currentPage === totalPages && "pointer-events-none opacity-50")}
              />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
