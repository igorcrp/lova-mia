import { useState, useMemo, useRef, useEffect } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";
import { DetailedResult, TradeHistoryItem, StockAnalysisParams } from "@/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface StockDetailsTableProps {
  result: DetailedResult;
  params: StockAnalysisParams & { interval?: string };
  onUpdateParams: (params: StockAnalysisParams) => void;
  isLoading?: boolean;
}

export function StockDetailsTable({
  result,
  params,
  onUpdateParams,
  isLoading = false
}: StockDetailsTableProps) {
  // State management for table sorting and pagination
  const [sortField, setSortField] = useState<keyof TradeHistoryItem>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Local state for parameters that can be updated within this component
  const [currentParams, setCurrentParams] = useState({
    referencePrice: params.referencePrice,
    entryPercentage: params.entryPercentage,
    stopPercentage: params.stopPercentage,
    initialCapital: params.initialCapital,
  });

  // State for focused inputs to manage decimal formatting display
  const [isEntryPriceFocused, setIsEntryPriceFocused] = useState(false);
  const [isStopPriceFocused, setIsStopPriceFocused] = useState(false);
  const [isInitialCapitalFocused, setIsInitialCapitalFocused] = useState(false);


  const setupPanelRef = useRef<HTMLDivElement>(null);
  const [chartHeight, setChartHeight] = useState(400); // Default chart height
  const isMobile = useIsMobile();

  // Effect to update chart height based on setup panel's height
  useEffect(() => {
    const updateHeight = () => {
      if (setupPanelRef.current) {
        setChartHeight(setupPanelRef.current.offsetHeight); // Use offsetHeight for better accuracy
      }
    };
    // Initial update after render
    const timer = setTimeout(updateHeight, 100); // Delay to allow panel to render fully
    window.addEventListener('resize', updateHeight);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateHeight);
    };
  }, []); // Empty dependency array, runs once and on resize

  // Memoized processing and sorting of trade history data
  const processedData = useMemo(() => {
    if (!result?.tradeHistory?.length) return [];
    
    // Map data to ensure calculations are based on consistent numeric types and add computed fields
    const data = result.tradeHistory.map((item: TradeHistoryItem) => ({
      ...item,
      profitLoss: Number(item.profitLoss ?? 0), // Ensure profitLoss is a number, default to 0
      currentCapital: item.currentCapital !== undefined && item.currentCapital !== null 
        ? Number(item.currentCapital) 
        : undefined, // Keep undefined if not present
      trade: typeof item.trade === 'string' ? item.trade.trim() || "-" : "-", // Sanitize trade string
      stopTrigger: calculateStopTrigger(item, params.operation) // Calculate stop trigger status
    }));

    // Sort data based on current sortField and sortDirection
    return [...data].sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];

      if (sortField === "date") {
        // Ensure date comparison is robust
        const dateA = new Date(valA as string).getTime();
        const dateB = new Date(valB as string).getTime();
        if (isNaN(dateA) || isNaN(dateB)) return 0; // Handle invalid dates
        return sortDirection === "asc" 
          ? dateA - dateB
          : dateB - dateA;
      }

      // General numeric comparison for other fields, defaulting to 0 if not a number
      const numA = Number(valA);
      const numB = Number(valB);

      if (isNaN(numA) && isNaN(numB)) return 0;
      if (isNaN(numA)) return sortDirection === "asc" ? 1 : -1; // Treat NaN as greater or less based on sort
      if (isNaN(numB)) return sortDirection === "asc" ? -1 : 1;

      return sortDirection === "asc" ? numA - numB : numB - numA;
    });
  }, [result, sortField, sortDirection, params.operation]);

  // Calculates if a stop-loss was triggered for a given trade item.
  function calculateStopTrigger(item: TradeHistoryItem, operation: string): string {
    // Ensure item, stopPrice, low, and high are valid before attempting calculations.
    // item.stopPrice can be string, number, or null. item.low/high can be number or null.
    if (!item || item.stopPrice === '-' || item.stopPrice === null || item.low === null || item.high === null) {
        return "-"; // Not enough data or stop not set.
    }

    const stopPriceNum = Number(item.stopPrice);
    const lowNum = Number(item.low);
    const highNum = Number(item.high);

    // Check if conversions resulted in valid numbers and stopPrice is positive.
    if (isNaN(stopPriceNum) || stopPriceNum <= 0 || isNaN(lowNum) || isNaN(highNum)) {
        return "-"; // Invalid numeric data.
    }

    const lowerCaseOperation = typeof operation === 'string' ? operation.toLowerCase() : "";

    if (lowerCaseOperation === 'buy') {
        return lowNum <= stopPriceNum ? "Executed" : "-"; // Use <= for buy stop loss (price drops to or below stop)
    } else if (lowerCaseOperation === 'sell') {
        return highNum >= stopPriceNum ? "Executed" : "-"; // Use >= for sell stop loss (price rises to or above stop)
    } else {
        return "-"; // Operation not supported or invalid.
    }
  }

  // Formats the trade value with appropriate colors based on its type (Buy, Sell, Closed).
  function formatTradeValue(trade: string) {
    if (typeof trade !== "string" || !trade || trade === "-") return <span>-</span>;

    // Handle combined trade types like "Buy/Closed"
    if (trade.includes("/")) {
      const parts = trade.split("/");
      return (
        <>
          <span className={parts[0] === "Buy" ? "text-green-600 dark:text-green-400" : parts[0] === "Sell" ? "text-red-600 dark:text-red-400" : ""}>
            {parts[0]}
          </span>
          {parts[1] && (
            <>
              <span>/</span>
              <span className={parts[1] === "Closed" ? "text-yellow-600 dark:text-yellow-400" : ""}>
                {parts[1]}
              </span>
            </>
          )}
        </>
      );
    } else {
      // Handle single trade types
      return (
        <span className={
          trade === "Buy" ? "text-green-600 dark:text-green-400" :
          trade === "Sell" ? "text-red-600 dark:text-red-400" :
          trade === "Closed" ? "text-yellow-600 dark:text-yellow-400" : ""
        }>
          {trade}
        </span>
      );
    }
  }

  // Pagination logic
  const totalItems = processedData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const currentData = processedData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Handlers for sorting and pagination
  const handleSortChange = (field: keyof TradeHistoryItem) => {
    if (sortField === field) {
      setSortDirection(prevDirection => (prevDirection === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc"); // Default to descending for new field
    }
    setCurrentPage(1); // Reset to first page on sort change
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // Handler for updating analysis parameters
  const handleUpdateResults = () => {
    // Consolidate params from local state and existing params before calling onUpdateParams
    const updatedAnalysisParams: StockAnalysisParams = {
      ...params, // Spread existing params to retain other fields like country, stockMarket etc.
      referencePrice: currentParams.referencePrice,
      entryPercentage: Number(currentParams.entryPercentage ?? 0), // Ensure number, default to 0
      stopPercentage: Number(currentParams.stopPercentage ?? 0),   // Ensure number, default to 0
      initialCapital: Number(currentParams.initialCapital ?? 0),     // Ensure number, default to 0
    };
    onUpdateParams(updatedAnalysisParams);
  };

  // Helper to format currency values
  const formatCurrency = (amount: number | undefined | null): string => {
    if (amount === undefined || amount === null || isNaN(Number(amount))) return "$ -";
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(amount)); // Ensure amount is number before formatting
  };

  // Helper to format date strings
  const formatDate = (dateString: string | undefined | null): string => {
    if (!dateString) return "-";
    try {
      // Assuming dateString is YYYY-MM-DD from server, add time to ensure UTC parsing
      const date = new Date(dateString.includes('T') ? dateString : `${dateString}T00:00:00Z`);
      if (isNaN(date.getTime())) {
          return dateString; // Return original if date is invalid
      }
      // Format to DD/MM/YYYY
      const day = String(date.getUTCDate()).padStart(2, '0');
      const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Month is 0-indexed
      const year = date.getUTCFullYear();
      return `${day}/${month}/${year}`;
    } catch {
        return dateString; // Fallback to original string on error
    }
  };

  // Helper to get sort icon for table headers
  const getSortIcon = (field: keyof TradeHistoryItem) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" 
      ? <ChevronUp className="h-4 w-4 ml-1" /> 
      : <ChevronDown className="h-4 w-4 ml-1" />;
  };

  // Configuration for table columns
  const columns: { id: keyof TradeHistoryItem; label: string; width: string }[] = [
    { id: "date", label: "Date", width: "w-24" },
    { id: "entryPrice", label: "Open", width: "w-20" },
    { id: "high", label: "High", width: "w-20" },
    { id: "low", label: "Low", width: "w-20" },
    { id: "exitPrice", label: "Close", width: "w-20" },
    { id: "volume", label: "Volume", width: "w-24" },
    { id: "suggestedEntryPrice", label: "Suggested Entry", width: "w-28" },
    { id: "actualPrice", label: "Actual Price", width: "w-24" },
    { id: "trade", label: "Trade", width: "w-20" },
    { id: "lotSize", label: "Lot Size", width: "w-20" },
    { id: "stopPrice", label: "Stop Price", width: "w-24" },
    { id: "stopTrigger", label: "Stop Trigger", width: "w-24" },
    { id: "profitLoss", label: "Profit/Loss", width: "w-28" },
    { id: "currentCapital", label: "Current Capital", width: "w-32" }
  ];

  if (!isLoading && !processedData.length) {
    return (
      <Alert className="mt-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No Data Available</AlertTitle>
        <AlertDescription>
          No trade history data is available for the selected stock with the current parameters.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Chart and Setup Panel: Grid layout, responsive columns */}
      <div className={`grid grid-cols-1 ${isMobile ? 'gap-6' : 'md:grid-cols-4 gap-4'}`}>
        {/* Chart Display Area */}
        <div className={`${isMobile ? 'order-2' : 'md:col-span-3'} bg-card rounded-lg border p-4`}>
          <h3 className="text-lg font-medium mb-4">Capital Evolution</h3>
          <div style={{ height: isMobile ? '300px' : `${chartHeight}px` }} className="min-h-[300px]"> {/* Ensure min height for chart */}
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={result.capitalEvolution || []} // Ensure data is always an array
                margin={{ top: 5, right: 5, left: 0, bottom: 5 }} // Adjusted margins
              >
                <Tooltip 
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)' }}
                  labelFormatter={(label) => formatDate(label)}
                  formatter={(value: number, name: string) => [formatCurrency(value), name === 'capital' ? 'Capital' : name]}
                />
                <defs>
                  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3.5" result="coloredBlur"/>
                    <feMerge>
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
                <Line
                  type="monotone"
                  dataKey="capital"
                  stroke="hsl(var(--primary))" // Use theme primary color
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6, strokeWidth: 1, fill: 'hsl(var(--background))', stroke: 'hsl(var(--primary))' }}
                  filter="url(#glow)"
                  isAnimationActive={true}
                  animationDuration={1500} // Slightly faster animation
                  animationEasing="ease-out"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Parameters Setup Panel */}
        <div ref={setupPanelRef} className={`${isMobile ? 'order-1' : 'md:col-span-1'} bg-card rounded-lg border p-4`}>
          <h3 className="text-lg font-medium mb-4">Adjust Parameters</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="referencePrice" className="block text-sm font-medium mb-1">Reference Price</label>
              <Select 
                value={currentParams.referencePrice}
                onValueChange={(value: StockAnalysisParams['referencePrice']) =>
                  setCurrentParams(prev => ({ ...prev, referencePrice: value }))
                }
                disabled={isLoading}
              >
                <SelectTrigger id="referencePrice">
                  <SelectValue placeholder="Select price type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="close">Close</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label htmlFor="entryPercentage" className="block text-sm font-medium mb-1">Entry Price (%)</label>
              <div className="flex items-center">
                <Input 
                  id="entryPercentage"
                  type="text"
                  inputMode="decimal"
                  value={isEntryPriceFocused 
                         ? (currentParams.entryPercentage === null || currentParams.entryPercentage === undefined ? '' : String(currentParams.entryPercentage))
                         : (typeof currentParams.entryPercentage === 'number' ? currentParams.entryPercentage.toFixed(2) : '')}
                  onChange={(e) => localHandleDecimalInputChange(e.target.value, (val) => setCurrentParams(p => ({...p, entryPercentage: val === null ? 0 : Number(val) })) )}
                  onFocus={() => setIsEntryPriceFocused(true)}
                  onBlur={() => {
                    localHandleBlurFormatting(currentParams.entryPercentage, (val) => setCurrentParams(p => ({...p, entryPercentage: val === null ? 0 : val })));
                    setIsEntryPriceFocused(false);
                  }}
                  disabled={isLoading}
                  placeholder="e.g. 1.50"
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  min="0"
                />
                <span className="ml-2">%</span>
              </div>
            </div>
            
            <div>
              <label htmlFor="stopPercentage" className="block text-sm font-medium mb-1">Stop Price (%)</label>
              <div className="flex items-center">
                <Input 
                  id="stopPercentage"
                  type="text"
                  inputMode="decimal"
                  value={isStopPriceFocused 
                         ? (currentParams.stopPercentage === null || currentParams.stopPercentage === undefined ? '' : String(currentParams.stopPercentage))
                         : (typeof currentParams.stopPercentage === 'number' ? currentParams.stopPercentage.toFixed(2) : '')}
                  onChange={(e) => localHandleDecimalInputChange(e.target.value, (val) => setCurrentParams(p => ({...p, stopPercentage: val === null ? 0 : Number(val) })) )}
                  onFocus={() => setIsStopPriceFocused(true)}
                  onBlur={() => {
                    localHandleBlurFormatting(currentParams.stopPercentage, (val) => setCurrentParams(p => ({...p, stopPercentage: val === null ? 0 : val })));
                    setIsStopPriceFocused(false);
                  }}
                  disabled={isLoading}
                  placeholder="e.g. 2.00"
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  min="0"
                />
                <span className="ml-2">%</span>
              </div>
            </div>
            
            <div>
              <label htmlFor="initialCapital" className="block text-sm font-medium mb-1">Initial Capital ($)</label>
               <div className="flex items-center">
                <Input
                  id="initialCapital"
                  type="text" // Changed to text for controlled input similar to percentages
                  inputMode="decimal"
                  value={isInitialCapitalFocused
                        ? (currentParams.initialCapital === null || currentParams.initialCapital === undefined ? '' : String(currentParams.initialCapital))
                        : (typeof currentParams.initialCapital === 'number' ? currentParams.initialCapital.toFixed(2) : '')}
                  onChange={(e) => localHandleDecimalInputChange(e.target.value, (val) => setCurrentParams(p => ({...p, initialCapital: val === null ? 0 : Number(val) })) )}
                  onFocus={() => setIsInitialCapitalFocused(true)}
                  onBlur={() => {
                    localHandleBlurFormatting(currentParams.initialCapital, (val) => setCurrentParams(p => ({...p, initialCapital: val === null ? 0 : val })));
                    setIsInitialCapitalFocused(false);
                  }}
                  disabled={isLoading}
                  placeholder="e.g. 10000.00"
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  min="0"
                />
              </div>
            </div>

            <Button
              onClick={handleUpdateResults}
              className="w-full"
              disabled={isLoading ||
                (params.referencePrice === currentParams.referencePrice &&
                 params.entryPercentage === currentParams.entryPercentage &&
                 params.stopPercentage === currentParams.stopPercentage &&
                 params.initialCapital === currentParams.initialCapital)
              }
            >
              {isLoading ? 'Updating...' : 'Update Results'}
            </Button>
          </div>
        </div>
      </div>

      {/* Table for Trade History */}
      <div className="bg-card rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    key={column.id}
                    className={`text-center px-2 py-2 text-sm cursor-pointer ${column.width} hover:bg-muted/50`}
                    onClick={() => handleSortChange(column.id as keyof TradeHistoryItem)}
                  >
                    <div className="flex items-center justify-center">
                      {column.label} {getSortIcon(column.id as keyof TradeHistoryItem)}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center py-6">
                    Updating data, please wait...
                  </TableCell>
                </TableRow>
              ) : currentData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center py-6 text-muted-foreground">
                    No trade data to display for the current selection.
                  </TableCell>
                </TableRow>
              ) : (
                currentData.map((item, index) => ( // Added index for unique key if dates aren't unique enough
                  <TableRow
                    key={`${item.date}-${item.trade}-${index}`} // More robust key
                    className={"hover:bg-muted/50"}
                  >
                    {columns.map((column) => {
                      const value = item[column.id as keyof TradeHistoryItem];
                      let formattedValue: string | JSX.Element = "-"; // Default value

                      if (value !== undefined && value !== null) {
                        if (column.id === "date") {
                          formattedValue = formatDate(value as string);
                        } else if (column.id === "profitLoss" || column.id === "currentCapital" || column.id === "suggestedEntryPrice" || column.id === "actualPrice" || column.id === "stopPrice" ) {
                          formattedValue = formatCurrency(value as number);
                        } else if (column.id === "volume" || column.id === "lotSize") {
                          // Ensure toLocaleString is called on a number
                          const numValue = Number(value);
                          formattedValue = isNaN(numValue) ? "-" : numValue.toLocaleString();
                        } else if (column.id === "stopTrigger") {
                          formattedValue = item.stopTrigger || "-"; // Already calculated
                        } else if (column.id === "trade") {
                           // formatTradeValue returns JSX, so it should be assigned directly
                          formattedValue = formatTradeValue(value as string);
                        } else if (typeof value === "number") {
                          // Default number formatting for fields like open, high, low, close
                          formattedValue = Number(value).toFixed(2);
                        } else {
                          formattedValue = String(value);
                        }
                      }

                      return (
                        <TableCell
                          key={column.id}
                          className={`text-center px-2 py-2 text-sm ${
                            column.id === "currentCapital" ? "font-medium" : ""
                          } ${
                            column.id === "profitLoss" ?
                              (Number(item.profitLoss ?? 0) > 0 ? "text-green-600 dark:text-green-400" :
                               Number(item.profitLoss ?? 0) < 0 ? "text-red-600 dark:text-red-400" : "") : ""
                          }`}
                        >
                          {formattedValue}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row justify-between items-center p-4 border-t gap-y-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows per page:</span>
              <Select
                value={String(itemsPerPage)}
                onValueChange={(value) => {
                  setItemsPerPage(Number(value));
                  setCurrentPage(1); // Reset to first page when items per page changes
                }}
              >
                <SelectTrigger className="w-20 bg-card">
                  <SelectValue placeholder={String(itemsPerPage)} />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((size) => (
                    <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => handlePageChange(currentPage - 1)}
                    // `disabled` prop is not standard for PaginationPrevious/Next from shadcn
                    // Use className to style disabled state if needed, or ensure onClick does nothing
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : undefined}
                  />
                </PaginationItem>

                {/* Dynamic pagination links (simplified example) */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .slice(Math.max(0, currentPage - 3), Math.min(totalPages, currentPage + 2)) // Show limited pages
                  .map(pageNum => (
                    <PaginationItem key={pageNum}>
                      <PaginationLink
                        isActive={currentPage === pageNum}
                        onClick={() => handlePageChange(pageNum)}
                      >
                        {pageNum}
                      </PaginationLink>
                    </PaginationItem>
                ))}

                <PaginationItem>
                  <PaginationNext
                    onClick={() => handlePageChange(currentPage + 1)}
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : undefined}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>
    </div>
  );
}

// Local helper function for decimal input change (positive numbers, up to 2 decimal places)
// Similar to StockSetupForm, but adapted for local state management here.
function localHandleDecimalInputChange(
  inputValue: string,
  onChangeCallback: (value: number | string | null) => void
) {
  if (inputValue === "") {
    onChangeCallback(null); // Allow clearing the input
    return;
  }
  // Prevent negative numbers by ignoring '-' input if it's the first character
  if (inputValue === "-") {
    onChangeCallback(""); // Or null, depending on desired behavior for invalid start
    return;
  }
  // Regex to allow positive numbers (including 0) with up to 2 decimal places.
  // Allows: 1, 1., 1.0, 1.05, 0, 0., 0.0, 0.05, .5, .05
  const regex = /^\d*(\.\d{0,2})?$/;
  if (regex.test(inputValue)) {
    // If it's a valid intermediate string (like "1." or ".5"), pass it as string.
    // Otherwise, parse to number if it's a complete number string.
    if (inputValue.endsWith(".") || inputValue.startsWith(".")) {
      onChangeCallback(inputValue);
    } else {
      const numValue = parseFloat(inputValue);
      // Ensure it's a valid, non-negative number before calling onChange
      if (!isNaN(numValue) && numValue >= 0) {
        onChangeCallback(numValue);
      } else if (inputValue === "") { // Should be caught by first if, but as safeguard
         onChangeCallback(null);
      }
      // If not valid (e.g. "1.2.3"), do nothing, input won't change
    }
  }
  // If regex fails (e.g. "abc", "1.234"), do nothing.
}

// Local helper function to format number on blur (positive, 2 decimal places)
function localHandleBlurFormatting(
  currentValue: number | string | null | undefined,
  onChangeCallback: (value: number | null) => void
) {
  if (currentValue === null || currentValue === undefined || currentValue === "") {
    onChangeCallback(null); // Keep it null if it was intentionally cleared
    return;
  }
  let numValue = 0;
  if (typeof currentValue === "string") {
    // Handle cases like "." or "1." which might be left by inputChange
    numValue = parseFloat(currentValue) || 0; // Default to 0 if parsing fails
  } else { // Assumes number type
    numValue = currentValue;
  }
  // Ensure the value is non-negative and formatted to two decimal places
  onChangeCallback(Math.max(0, parseFloat(numValue.toFixed(2))));
}
                disabled={isLoading}
                placeholder="e.g. 10000.00"
              />
            </div>
            
            <Button 
              onClick={handleUpdateResults} 
              className="w-full" 
              disabled={isLoading}
            >
              {isLoading ? 'Updating...' : 'Update Results'}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Table */}
      <div className="bg-card rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead 
                    key={column.id}
                    className={`text-center px-2 py-2 text-sm cursor-pointer ${column.width}`}
                    onClick={() => handleSortChange(column.id as keyof TradeHistoryItem)}
                  >
                    <div className="flex items-center justify-center">
                      {column.label} {getSortIcon(column.id as keyof TradeHistoryItem)}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center py-6">
                    Loading data...
                  </TableCell>
                </TableRow>
              ) : currentData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center py-6">
                    No data to display
                  </TableCell>
                </TableRow>
              ) : (
                currentData.map((item) => (
                  <TableRow 
                    key={`${item.date}-${item.profitLoss}`}
                    className={"hover:bg-muted/50"}
                  >
                    {columns.map((column) => {
                      const value = item[column.id as keyof TradeHistoryItem];
                      let formattedValue = "-";
                      
                      if (value !== undefined && value !== null) {
                        if (column.id === "date") {
                          formattedValue = formatDate(value as string);
                        } else if (column.id === "profitLoss" || column.id === "currentCapital") {
                          formattedValue = formatCurrency(value as number);
                        } else if (column.id === "volume" || column.id === "lotSize") {
                          formattedValue = (value as number).toLocaleString();
                        } else if (column.id === "stopTrigger") {
                          formattedValue = item.stopTrigger || "-";
                        } else if (column.id === "trade") {
                          formattedValue = value as string;
                        } else if (typeof value === "number") {
                          formattedValue = value.toFixed(2);
                        } else {
                          formattedValue = String(value);
                        }
                      }
                      
                      return (
                        <TableCell 
                          key={column.id}
                          className={`text-center px-2 py-2 text-sm ${
                            column.id === "currentCapital" ? "font-medium" : ""
                          } ${
                            column.id === "profitLoss" ? 
                              (Number(item.profitLoss) > 0 ? "text-green-600" : 
                               Number(item.profitLoss) < 0 ? "text-red-600" : "") : ""
                          }`}
                        >
                          {column.id === "trade" ? formatTradeValue(formattedValue) : formattedValue}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row justify-between items-center p-4 border-t">
            <div className="flex items-center gap-2 mb-4 sm:mb-0">
              <span className="text-sm text-muted-foreground">Rows per page:</span>
              <select
                className="bg-card border rounded px-2 py-1 text-sm"
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                {[10, 50, 100, 500].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
            
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  />
                </PaginationItem>
                
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = currentPage <= 3
                    ? i + 1
                    : currentPage >= totalPages - 2
                      ? totalPages - 4 + i
                      : currentPage - 2 + i;
                  return (
                    <PaginationItem key={pageNum}>
                      <PaginationLink
                        isActive={currentPage === pageNum}
                        onClick={() => handlePageChange(pageNum)}
                      >
                        {pageNum}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                
                <PaginationItem>
                  <PaginationNext 
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>
    </div>
  );
}

// Função auxiliar para lidar com a entrada de números decimais positivos
function handleDecimalInputChange(value: string, onChange: (val: number | string | null) => void) {
  if (value === "") {
    onChange(null);
    return;
  }
  const regex = /^(?:\d+)?(?:\.\d{0,2})?$/;
  if (regex.test(value)) {
    if (value === "." || value.endsWith(".")) {
      onChange(value);
    } else {
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue >= 0) {
        onChange(numValue);
      }
    }
  } else if (value === "-") {
    // Não faz nada se tentar digitar "-"
  } else {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      onChange(parseFloat(numValue.toFixed(2)));
    } else if (value === "") {
      onChange(null);
    }
  }
}

// Função auxiliar para formatar no blur
function handleBlurFormatting(value: number | string | null | undefined, onChange: (val: number | null) => void) {
  let numValue = 0;
  if (typeof value === "string") {
    if (value === ".") {
      numValue = 0;
    } else {
      numValue = parseFloat(value) || 0;
    }
  } else if (typeof value === "number") {
    numValue = value;
  } else if (value === null || value === undefined) {
    onChange(null);
    return;
  }
  onChange(Math.max(0, parseFloat(numValue.toFixed(2))));
}

