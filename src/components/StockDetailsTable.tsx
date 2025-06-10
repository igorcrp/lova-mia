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
  // State management
  const [sortField, setSortField] = useState<keyof TradeHistoryItem>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [refPrice, setRefPrice] = useState(params.referencePrice);
  const [entryPercentage, setEntryPercentage] = useState<number | string | null>(params.entryPercentage ?? null);
  const [stopPercentage, setStopPercentage] = useState<number | string | null>(params.stopPercentage ?? null);
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
    window.addEventListener("resize", updateHeight);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", updateHeight);
    };
  }, []);

  // Process and sort data
  const processedData = useMemo(() => {
    if (!result?.tradeHistory?.length) return [];
    
    // Create a safe copy of the data
    const data = result.tradeHistory.map(item => ({
      ...item,
      profitLoss: Number(item.profitLoss) || 0,
      currentCapital: item.currentCapital !== undefined && item.currentCapital !== null 
        ? Number(item.currentCapital) 
        : undefined,
      trade: typeof item.trade === 'string' ? item.trade.trim() || "-" : "-",
      stopTrigger: calculateStopTrigger(item, params.operation)
    }));

    // Sort data
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

      // Attempt numeric comparison first, then fallback to string comparison
      const numA = Number(valA);
      const numB = Number(valB);

      if (!isNaN(numA) && !isNaN(numB)) {
        return sortDirection === "asc" ? numA - numB : numB - numA;
      } else {
        const strA = String(valA);
        const strB = String(valB);
        return sortDirection === "asc" ? strA.localeCompare(strB) : strB.localeCompare(strA);
      }
    });
  }, [result, sortField, sortDirection, params.operation]);

  // Function to calculate stop trigger
  function calculateStopTrigger(item: TradeHistoryItem, operation: string): string {
    if (!item || item.stopPrice === '-' || item.stopPrice === null || item.low === null || item.high === null) {
        return "-";
    }
    const stopPrice = Number(item.stopPrice);
    const low = Number(item.low);
    const high = Number(item.high);
    if (isNaN(stopPrice) || stopPrice <= 0 || isNaN(low) || isNaN(high)) {
        return "-";
    }
    const lowerCaseOperation = operation?.toLowerCase();
    if (lowerCaseOperation === 'buy') {
        return low < stopPrice ? "Executed" : "-";
    } else if (lowerCaseOperation === 'sell') {
        return high > stopPrice ? "Executed" : "-";
    } else {
        return "-";
    }
  }

  // Função para formatar o valor do trade com cores
  function formatTradeValue(trade: string) {
    if (typeof trade !== "string" || !trade) return <span>-</span>;

    if (trade.includes("/")) {
      // Exemplo: "Buy/Closed" ou "Sell/Closed"
      const [firstPart, secondPart] = trade.split("/");
      return (
        <>
          <span className={
            firstPart === "Buy"
              ? "text-green-600"
              : firstPart === "Sell"
              ? "text-red-600"
              : ""
          }>
            {firstPart}
          </span>
          <span>/</span>
          <span className={
            secondPart === "Closed"
              ? "text-yellow-600"
              : ""
          }>
            {secondPart}
          </span>
        </>
      );
    } else {
      return (
        <span className={
          trade === "Buy"
            ? "text-green-600"
            : trade === "Sell"
            ? "text-red-600"
            : trade === "Closed"
            ? "text-yellow-600"
            : ""
        }>
          {trade}
        </span>
      );
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

  const handleUpdateResults = () => {
    const cleanParams = {
      ...params,
      referencePrice: refPrice,
      entryPercentage: typeof entryPercentage === 'number' ? Number(entryPercentage.toFixed(2)) : Number(entryPercentage) || 0,
      stopPercentage: typeof stopPercentage === 'number' ? Number(stopPercentage.toFixed(2)) : Number(stopPercentage) || 0,
      initialCapital: initialCapital !== null ? Number(initialCapital.toFixed(2)) : 0
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
      const date = new Date(`${dateString}T00:00:00Z`);
      const day = String(date.getUTCDate()).padStart(2, '0');
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const year = date.getUTCFullYear();
      if (isNaN(date.getTime())) {
          return dateString;
      }
      return `${day}/${month}/${year}`;
    } catch {
        return dateString;
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

  const handleDecimalInputChange = (value: string, setter: React.Dispatch<React.SetStateAction<number | string | null>>) => {
    // Allow empty string or string ending with a dot for partial input
    if (value === '' || value === '.') {
      setter(value);
      return;
    }
    // Allow numbers with one dot
    if (/^\d*\.?\d*$/.test(value)) {
      setter(value);
    }
  };

  const handleBlurFormatting = (value: number | string | null, setter: React.Dispatch<React.SetStateAction<number | string | null>>) => {
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) {
        setter(parsed);
      } else {
        setter(null); // Clear if not a valid number
      }
    } else if (value === null) {
      setter(null);
    }
  };

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Chart and Setup Panel */}
      <div className={`grid grid-cols-1 ${isMobile ? 'gap-6' : 'md:grid-cols-4 gap-4'}`}>
        {/* Chart */}
        <div className={`${isMobile ? 'order-2' : 'md:col-span-3'} bg-card rounded-lg border p-4`}>
          <h3 className="text-lg font-medium mb-4">Capital Evolution</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={result.capitalEvolution || []}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              >
                <Tooltip 
                  cursor={false}
                  content={({ active, payload }) => (
                    active && payload?.length ? (
                      <div className="bg-background border rounded-md p-2 shadow-lg text-sm">
                        <p className="font-medium mb-0.5">{formatDate(payload[0].payload.date)}</p>
                        <p className="text-primary">Capital: {formatCurrency(payload[0].payload.capital)}</p>
                      </div>
                    ) : null
                  )}
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
                  stroke="#00ffff"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 1, fill: '#ffffff', stroke: '#00ffff' }}
                  filter="url(#glow)"
                  isAnimationActive={true}
                  animationDuration={2000}
                  animationEasing="ease-in-out"
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
                  value={isEntryPriceFocused 
                         ? (entryPercentage === null || entryPercentage === undefined ? '' : String(entryPercentage)) 
                         : (typeof entryPercentage === 'number' ? entryPercentage.toFixed(2) : '')}
                  onChange={(e) => handleDecimalInputChange(e.target.value, setEntryPercentage)}
                  onFocus={() => setIsEntryPriceFocused(true)}
                  onBlur={() => {
                    handleBlurFormatting(entryPercentage, setEntryPercentage);
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
              <label className="block text-sm font-medium mb-1">Stop Price (%)</label>
              <div className="flex items-center">
                <Input 
                  type="text"
                  inputMode="decimal"
                  value={isStopPriceFocused 
                         ? (stopPercentage === null || stopPercentage === undefined ? '' : String(stopPercentage)) 
                         : (typeof stopPercentage === 'number' ? stopPercentage.toFixed(2) : '')}
                  onChange={(e) => handleDecimalInputChange(e.target.value, setStopPercentage)}
                  onFocus={() => setIsStopPriceFocused(true)}
                  onBlur={() => {
                    handleBlurFormatting(stopPercentage, setStopPercentage);
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
              <label className="block text-sm font-medium mb-1">Initial Capital ($)</label>
              <Input 
                type="number"
                value={initialCapital ?? ""}
                onChange={(e) => setInitialCapital(Number(e.target.value) || null)}
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
                  <TableHead key={column.id} className={`${column.width} ${column.id === 'trade' || column.id === 'stopTrigger' ? 'text-center' : 'text-right'}`}>
                    <Button
                      variant="ghost"
                      onClick={() => handleSortChange(column.id as keyof TradeHistoryItem)}
                      className="h-auto p-0 font-semibold"
                    >
                      {column.label}
                      {getSortIcon(column.id as keyof TradeHistoryItem)}
                    </Button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentData.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">{formatDate(item.date)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.entryPrice)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.high)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.low)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.exitPrice)}</TableCell>
                  <TableCell className="text-right">{item.volume?.toLocaleString() || '-'}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.suggestedEntryPrice)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.actualPrice)}</TableCell>
                  <TableCell className="text-center">{formatTradeValue(item.trade)}</TableCell>
                  <TableCell className="text-right">{item.lotSize || '-'}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.stopPrice)}</TableCell>
                  <TableCell className="text-center">{item.stopTrigger}</TableCell>
                  <TableCell className="text-right">
                    <span className={item.profitLoss && item.profitLoss >= 0 ? 'text-green-500' : 'text-red-500'}>
                      {formatCurrency(item.profitLoss)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(item.currentCapital)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination className="mt-4">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => handlePageChange(currentPage - 1)}
                  className={currentPage === 1 ? "pointer-events-none opacity-50" : undefined}
                />
              </PaginationItem>
              {[...Array(totalPages)].map((_, i) => (
                <PaginationItem key={i}>
                  <PaginationLink 
                    onClick={() => handlePageChange(i + 1)}
                    isActive={i + 1 === currentPage}
                  >
                    {i + 1}
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
        )}
      </div>
    </div>
  );
}
