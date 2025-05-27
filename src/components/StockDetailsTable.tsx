import { useState, useMemo, useRef, useEffect } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
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
  // State management
  const [sortField, setSortField] = useState<keyof TradeHistoryItem>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [refPrice, setRefPrice] = useState(params.referencePrice);
  // Use string | null for input state to handle intermediate values like "1."
  const [entryPercentageInput, setEntryPercentageInput] = useState<string | null>(params.entryPercentage !== null && params.entryPercentage !== undefined ? String(params.entryPercentage.toFixed(2)) : null);
  const [stopPercentageInput, setStopPercentageInput] = useState<string | null>(params.stopPercentage !== null && params.stopPercentage !== undefined ? String(params.stopPercentage.toFixed(2)) : null);
  const [initialCapital, setInitialCapital] = useState<number | null>(params.initialCapital ?? null);
  const [isEntryPriceFocused, setIsEntryPriceFocused] = useState(false);
  const [isStopPriceFocused, setIsStopPriceFocused] = useState(false);

  const setupPanelRef = useRef<HTMLDivElement>(null);
  const [chartHeight, setChartHeight] = useState(400);
  const isMobile = useIsMobile();

  // Update chart height to match setup panel
  useEffect(() => {
    const updateHeight = () => {
      if (setupPanelRef.current) {
        setChartHeight(setupPanelRef.current.clientHeight);
      }
    };

    const timer = setTimeout(updateHeight, 100);
    window.addEventListener('resize', updateHeight);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  // Process and sort data
  const processedData = useMemo(() => {
    if (!result?.tradeHistory?.length) return [];
    
    const data = result.tradeHistory.map(item => ({
      ...item,
      profitLoss: Number(item.profitLoss) || 0,
      currentCapital: item.currentCapital !== undefined && item.currentCapital !== null 
        ? Number(item.currentCapital) 
        : undefined,
      trade: typeof item.trade === 'string' ? item.trade.trim() || "-" : "-",
      stopTrigger: calculateStopTrigger(item, params.operation)
    }));

    return [...data].sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];

      if (sortField === "date") {
        const dateA = new Date(valA as string);
        const dateB = new Date(valB as string);
        return sortDirection === "asc" 
          ? dateA.getTime() - dateB.getTime() 
          : dateB.getTime() - dateA.getTime();
      }

      const numA = Number(valA) || 0;
      const numB = Number(valB) || 0;
      return sortDirection === "asc" ? numA - numB : numB - numA;
    });
  }, [result, sortField, sortDirection, params.operation]);

  // Function to calculate stop trigger
  interface TradeItemForStopTrigger {
    trade: string;
    stopPrice: string | number | null;
    low: number | string | null;
    high: number | string | null;
  }
  
  function calculateStopTrigger(item: TradeItemForStopTrigger, operation: string): string {
    if (!item || item.trade !== "Executed" || item.stopPrice === '-' || item.stopPrice === null) {
        return "-";
    }
    const stopPrice = Number(item.stopPrice);
    const low = Number(item.low);
    const high = Number(item.high);
    if (isNaN(stopPrice) || isNaN(low) || isNaN(high)) {
        return "-";
    }
    if (operation === 'buy') {
        return low < stopPrice ? "Executed" : "-";
    } else {
        return high > stopPrice ? "Executed" : "-";
    }
  }

  // Pagination
  const totalItems = processedData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const currentData = processedData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Handlers
  const handleSortChange = (field: keyof TradeHistoryItem) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    setCurrentPage(page);
  };

  // --- Helper functions for decimal input (defined inside component) ---
  const handleDecimalInputChange = (value: string, onChange: (val: string | null) => void) => {
    if (value === "") {
      onChange(null);
      return;
    }
    if (value.startsWith('-')) {
      return;
    }
    const regex = /^\d*(\.\d{0,2})?$/;
    if (regex.test(value)) {
      onChange(value);
    }
  };

  const handleBlurFormatting = (value: string | null | undefined, onChange: (val: string | null) => void) => {
    let numValue = 0;
    if (typeof value === 'string') {
      // Handle cases like '.' or '1.' before parsing
      if (value === '.' || value.endsWith('.')) {
         value = value.replace('.', ''); // Treat '.' as empty, '1.' as '1'
      }
      numValue = parseFloat(value) || 0;
    } else if (typeof value === 'number') { // Should not happen with string state, but safe guard
      numValue = value;
    }
    // Format to 2 decimal places and update the string state
    onChange(Math.max(0, numValue).toFixed(2));
  };
  // --- End Helper functions ---

  const handleUpdateResults = () => {
    // Parse the string state to number before updating params
    const parseAndFormat = (value: string | null | undefined): number => {
      let numValue = 0;
      if (typeof value === 'string') {
        if (value === '.' || value.endsWith('.')) {
           value = value.replace('.', '');
        }
        numValue = parseFloat(value) || 0;
      }
      // Ensure positive and format
      return Math.max(0, parseFloat(numValue.toFixed(2)));
    };

    const finalEntryPercentage = parseAndFormat(entryPercentageInput);
    const finalStopPercentage = parseAndFormat(stopPercentageInput);
    const finalInitialCapital = Number(initialCapital) || 0;

    // Update local state with formatted string values for consistency in display
    setEntryPercentageInput(finalEntryPercentage.toFixed(2));
    setStopPercentageInput(finalStopPercentage.toFixed(2));
    setInitialCapital(finalInitialCapital); // Assuming initialCapital state is fine as number

    const cleanParams = {
      ...params,
      referencePrice: refPrice,
      entryPercentage: finalEntryPercentage,
      stopPercentage: finalStopPercentage,
      initialCapital: finalInitialCapital
    };
    onUpdateParams(cleanParams);
  };

  // Formatting functions
  const formatCurrency = (amount: number | undefined | null): string => {
    if (amount === undefined || amount === null) return "-";
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateString: string | undefined | null): string => {
    if (!dateString) return "-";
    try {
      // Ensure UTC interpretation
      const date = new Date(`${dateString}T00:00:00Z`); 
      if (isNaN(date.getTime())) {
          // Fallback if parsing fails
          return dateString; 
      }
      const day = String(date.getUTCDate()).padStart(2, '0');
      const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Month is 0-indexed
      const year = date.getUTCFullYear();
      return `${day}/${month}/${year}`;
    } catch {
        return dateString; // Return original on error
    }
  };

  const getSortIcon = (field: keyof TradeHistoryItem) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" 
      ? <ChevronUp className="h-4 w-4 ml-1" /> 
      : <ChevronDown className="h-4 w-4 ml-1" />;
  };

  // Columns configuration
  const columns = [
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

  if (!processedData.length && !isLoading) {
    return (
      <Alert className="mt-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No data available</AlertTitle>
        <AlertDescription>
          No trade history data is available for the selected stock with the current parameters.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Chart and Setup Panel */}
      <div className={`grid grid-cols-1 ${isMobile ? 'gap-6' : 'md:grid-cols-4 gap-4'}`}>
        {/* Chart */}
        <div className={`${isMobile ? 'order-2' : 'md:col-span-3'} bg-card rounded-lg border p-4`}>
          <h3 className="text-lg font-medium mb-4">Capital Evolution</h3>
          {/* Adjust height based on isMobile or keep fixed */} 
          <div style={{ height: isMobile ? '250px' : chartHeight }}> 
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={result.capitalEvolution || []}>
                <XAxis 
                  dataKey="date" 
                  tickFormatter={formatDate}
                  stroke="#64748b"
                  axisLine={false}
                  tickLine={false}
                  interval={isMobile ? 'preserveStartEnd' : undefined} // Adjust ticks for mobile
                  tick={{ fontSize: 10 }} // Smaller font for mobile
                />
                <YAxis 
                  tickFormatter={formatCurrency}
                  stroke="#64748b"
                  axisLine={false}
                  tickLine={false}
                  width={isMobile ? 70 : 80} // Adjust width for mobile
                  tick={{ fontSize: 10 }}
                />
                <Tooltip 
                  content={({ active, payload }) => (
                    active && payload?.length ? (
                      <div className="bg-background border rounded-md p-2 shadow-lg text-xs">
                        <p className="font-medium">{formatDate(payload[0].payload.date)}</p>
                        <p className="text-primary">Capital: {formatCurrency(payload[0].payload.capital)}</p>
                      </div>
                    ) : null
                  )}
                />
                <Line 
                  type="monotone" 
                  dataKey="capital" 
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Setup Panel */}
        <div ref={setupPanelRef} className={`${isMobile ? 'order-1' : 'md:col-span-1'} bg-card rounded-lg border p-4`}>
          <h3 className="text-lg font-medium mb-4">Stock Setup</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Reference Price</label>
              <Select 
                value={refPrice} 
                onValueChange={(v) => setRefPrice(v as any)}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select price" />
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
              <label className="block text-sm font-medium mb-1">Entry Price (%)</label>
              <div className="flex items-center">
                <Input 
                  type="text" 
                  inputMode="decimal" 
                  value={entryPercentageInput ?? ''} // Use string state directly
                  onChange={(e) => handleDecimalInputChange(e.target.value, setEntryPercentageInput)}
                  onFocus={() => setIsEntryPriceFocused(true)} // Focus state might not be needed anymore
                  onBlur={() => {
                    handleBlurFormatting(entryPercentageInput, setEntryPercentageInput);
                    setIsEntryPriceFocused(false);
                  }}
                  disabled={isLoading}
                  placeholder="e.g. 1.05"
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  min="0"
                />
                <span className="ml-2">%</span>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Stop Price (%)</label>
              <div className="flex items-center">
                <Input 
                  type="text" 
                  inputMode="decimal" 
                  value={stopPercentageInput ?? ''} // Use string state directly
                  onChange={(e) => handleDecimalInputChange(e.target.value, setStopPercentageInput)}
                  onFocus={() => setIsStopPriceFocused(true)} // Focus state might not be needed anymore
                  onBlur={() => {
                    handleBlurFormatting(stopPercentageInput, setStopPercentageInput);
                    setIsStopPriceFocused(false);
                  }}
                  disabled={isLoading}
                  placeholder="e.g. 1.00"
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  min="0"
                />
                <span className="ml-2">%</span>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Initial Capital ($)</label>
              <Input 
                type="number" // Keep as number for simplicity if direct number input is okay
                value={initialCapital ?? ""}
                onChange={(e) => setInitialCapital(Number(e.target.value) || null)} // Basic number handling
                disabled={isLoading}
                placeholder="e.g. 10000.00"
                step="0.01" // Optional: suggest step for number input
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
                currentData.map((item, index) => (
                  <TableRow 
                    // Use a more robust key if possible, combining date and another unique field
                    key={`${item.date}-${index}-${item.trade}`}
                    className="text-center text-xs md:text-sm"
                  >
                    {columns.map((column) => (
                      <TableCell key={column.id} className="px-2 py-1">
                        {column.id === 'date' ? formatDate(item[column.id]) :
                         column.id === 'profitLoss' || column.id === 'currentCapital' ? formatCurrency(item[column.id]) :
                         // Handle potential null/undefined or non-numeric values gracefully
                         item[column.id] !== null && item[column.id] !== undefined ? String(item[column.id]) : '-'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                href="#"
                onClick={(e) => { e.preventDefault(); handlePageChange(currentPage - 1); }}
                className={currentPage === 1 ? "pointer-events-none opacity-50" : undefined}
              />
            </PaginationItem>
            {/* Simple page number display - consider more advanced logic for many pages */}
            <PaginationItem>
              <PaginationLink href="#" isActive>
                Page {currentPage} of {totalPages}
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext 
                href="#"
                onClick={(e) => { e.preventDefault(); handlePageChange(currentPage + 1); }}
                className={currentPage === totalPages ? "pointer-events-none opacity-50" : undefined}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
