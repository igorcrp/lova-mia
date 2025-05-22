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
  params: StockAnalysisParams;
  onUpdateParams: (params: StockAnalysisParams) => void;
  isLoading?: boolean;
}

export function StockDetailsTable({
  result,
  params,
  onUpdateParams,
  isLoading = false
}: StockDetailsTableProps) {
    // Adicionar o useEffect aqui
  useEffect(() => {
     if (result?.tradeHistory) {
      result.tradeHistory.forEach(item => {
        item.profitLoss = Number(item.profitLoss) || 0;
        item.trade = item.trade?.trim() || "-";
      });
    }
  }, [result]);
  
  // State for sorting
  const [sortField, setSortField] = useState<keyof TradeHistoryItem>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // State for pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // State for stock setup parameters
  const [refPrice, setRefPrice] = useState(params.referencePrice);
  const [entryPercentage, setEntryPercentage] = useState<number | null>(params.entryPercentage);
  const [stopPercentage, setStopPercentage] = useState<number | null>(params.stopPercentage);
  const [initialCapital, setInitialCapital] = useState<number | null>(params.initialCapital);

  // Ref for setup panel
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

    updateHeight();
    window.addEventListener('resize', updateHeight);
    
    return () => {
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  // Data is already filtered at the API level, no need to filter again
  const filteredTradeHistory = result.tradeHistory || [];

  // Calculate sorted data
  const sortedData = useMemo(() => {
    if (filteredTradeHistory.length === 0) return [];
    
    // Sort the data
    const sorted = [...filteredTradeHistory].sort((a, b) => {
      if (sortField === "date") {
        const dateA = new Date(a[sortField]);
        const dateB = new Date(b[sortField]);
        return sortDirection === "asc" ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
      }

      // For numeric fields
      const valA = a[sortField] as number;
      const valB = b[sortField] as number;
      return sortDirection === "asc" ? valA - valB : valB - valA;
    });
    
    // Sort by date ascending to process capital calculations chronologically
    const dateOrdered = [...sorted].sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA.getTime() - dateB.getTime();
    });
    
    // Process Current Capital values based on the rules
    if (dateOrdered.length > 0) {
      // For the first day (oldest entry)
      const firstDay = dateOrdered[0];
      
      // Check trade status
        if (firstDay.trade === "-") {
        // If trade is not executed, use initialCapital directly
        firstDay.currentCapital = initialCapital;
      } else if (
        // For Daytrade interval
        (params.period === "1d" && firstDay.trade === "Executed") ||
        // For other intervals (Weekly, Monthly, Annual)
        (params.period !== "1d" && ["Buy", "Sell"].includes(firstDay.trade))
      ) {
        // If trade is executed, add profit/loss to initialCapital
        firstDay.currentCapital = initialCapital + (firstDay.profitLoss || 0);
      } else {
        // Default fallback
        firstDay.currentCapital = initialCapital;
      }
      
      // For subsequent days, accumulate from previous day
        for (let i = 1; i < dateOrdered.length; i++) {
          const currentDay = dateOrdered[i];
          const previousDay = dateOrdered[i - 1];
        
        // Check trade status for current day
         if (currentDay.trade === "-") {
          // No trade executed, carry forward previous capital
          currentDay.currentCapital = previousDay.currentCapital;
        } else if (
          // For Daytrade interval
          (params.period === "1d" && currentDay.trade === "Executed") ||
          // For other intervals
          (params.period !== "1d" && ["Buy", "Sell"].includes(currentDay.trade))
        ) {
          // Trade executed, add profit/loss to previous capital
          currentDay.currentCapital = previousDay.currentCapital + currentDay.profitLoss;
        } else {
          // Default fallback
          currentDay.currentCapital = previousDay.currentCapital;
        }
      }
    }
    
    return sorted;
  }, [filteredTradeHistory, sortField, sortDirection, initialCapital]);

  // Capital evolution data is already filtered at the API level
  const filteredCapitalEvolution = result.capitalEvolution || [];

  // Calculate pagination
  const totalItems = sortedData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const currentData = sortedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Handle pagination change
  const handlePageChange = (page: number) => {
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    setCurrentPage(page);
  };

  // Handle sorting change
  const handleSortChange = (field: keyof TradeHistoryItem) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc"); // Default to descending when changing fields
    }
  };

  // Handle update button click - Modificado para recalcular apenas Suggested Price e Stop Price
  const handleUpdateResults = () => {
    onUpdateParams({
      ...params,
      referencePrice: refPrice,
      entryPercentage: entryPercentage || 0, // Garante número
      stopPercentage: stopPercentage || 0,   // Garante número
      initialCapital: initialCapital || 0    // Garante número
    });
  };

  // Generate pagination links
  const paginationLinks = () => {
    const links = [];
    const maxDisplayLinks = isMobile ? 3 : 5; // Less links on mobile

    let startPage = Math.max(1, currentPage - Math.floor(maxDisplayLinks / 2));
    const endPage = Math.min(totalPages, startPage + maxDisplayLinks - 1);

    // Adjust startPage if needed to ensure we show maxDisplayLinks if possible
    startPage = Math.max(1, endPage - maxDisplayLinks + 1);
    for (let i = startPage; i <= endPage; i++) {
      links.push(<PaginationItem key={i}>
          <PaginationLink isActive={i === currentPage} onClick={() => handlePageChange(i)}>
            {i}
          </PaginationLink>
        </PaginationItem>);
    }
    return links;
  };

  // Format currency function
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Format percentage function
  const formatPercentage = (value: number) => {
    return `${(value || 0).toFixed(2)}%`; // Proteção contra null/undefined
  };

  // Format date function
  const formatDate = (dateString: string) => {
    const [year, month, day] = dateString.split("-");
    return `${day}/${month}/${year}`;
  };
  
  // Format trade status - replace "Not Executed" with "-"
  const formatTradeStatus = (status: string) => {
    return status === "Not Executed" ? "-" : status;
  };

  // Format value that could be a string or number
    const formatMixedValue = (value: string | number | undefined | null): string => {
      if (value === undefined || value === null || value === '-') return "-";
      if (typeof value === 'number') return value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      return String(value);
    };

  // Get sort icon
  const getSortIcon = (field: keyof TradeHistoryItem) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />;
  };
  
  // Custom chart tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border rounded-md p-3 shadow-lg">
          <p className="text-sm font-medium">{formatDate(data.date)}</p>
          <p className="text-sm font-medium text-alphaquant-500">Capital: {formatCurrency(data.capital)}</p>
        </div>
      );
    }
    return null;
  };
  
  // Check if we have any data to display
  const hasData = filteredTradeHistory.length > 0;
  
  // Show a message if no data is available for the selected period
  if (!hasData && !isLoading) {
    return (
      <Alert className="mt-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No data available</AlertTitle>
        <AlertDescription>
          No trade history data is available for the selected stock in the {params.period} period. 
          Try selecting a different time period or asset.
        </AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className="w-full flex flex-col gap-6">
      <div className={`grid grid-cols-1 ${isMobile ? 'gap-6' : 'md:grid-cols-4 gap-4'}`}>
        {/* Capital Evolution Chart (3/4 width) */}
        <div className={`${isMobile ? 'order-2' : 'md:col-span-3'} bg-card rounded-lg border p-4`} style={{ height: isMobile ? 'auto' : `${chartHeight}px` }}>
          <h3 className="text-base md:text-lg font-medium mb-4">Capital Evolution</h3>
          <div className={isMobile ? 'h-[300px]' : 'h-[calc(100%-40px)]'}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredCapitalEvolution} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="capitalColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="date" 
                  tickFormatter={date => new Date(date).toLocaleDateString()} 
                  stroke="#64748b"
                  axisLine={false}
                  tickLine={false}
                  padding={{ left: 10, right: 10 }}
                  fontSize={12}
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                />
                <YAxis 
                  tickFormatter={value => isMobile ? `$${Math.round(value)}` : `$${value.toLocaleString()}`} 
                  stroke="#64748b"
                  axisLine={false}
                  tickLine={false}
                  fontSize={12}
                  width={isMobile ? 60 : 80}
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line 
                  type="monotone" 
                  dataKey="capital" 
                  stroke="#8b5cf6" 
                  strokeWidth={2} 
                  dot={false}
                  activeDot={{ r: 6, stroke: "#8b5cf6", strokeWidth: 2, fill: "white" }}
                  fillOpacity={1}
                  fill="url(#capitalColor)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Stock Setup Panel (1/4 width) */}
        <div ref={setupPanelRef} className={`${isMobile ? 'order-1' : 'md:col-span-1'} bg-card rounded-lg border p-4`}>
          <h3 className="text-base md:text-lg font-medium mb-4">Stock Setup</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Reference Price</label>
              <Select value={refPrice} onValueChange={value => setRefPrice(value as "open" | "high" | "low" | "close")} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reference price" />
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
              <label className="block text-sm font-medium mb-1">Entry Price</label>
              <div className="flex items-center">
                <Input 
                  type="text" 
                  value={entryPercentage !== null && entryPercentage !== undefined ? entryPercentage.toString() : ""} 
                  onChange={e => {
                    const inputValue = e.target.value;
                    if (inputValue === "") {
                      setEntryPercentage(null);
                    } else if (/^\d*\.?\d{0,2}$/.test(inputValue)) {
                      setEntryPercentage(parseFloat(inputValue));
                    }
                  }}
                  onBlur={() => {
                    if (entryPercentage === null || entryPercentage === undefined) {
                      setEntryPercentage(0);
                    }
                  }}
                  disabled={isLoading} 
                  className="flex-1" 
                />
                <span className="ml-2">%</span>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Stop Price</label>
              <div className="flex items-center">
                <Input 
                    type="text" 
                    value={stopPercentage !== null && stopPercentage !== undefined ? stopPercentage.toString() : ""} 
                    onChange={e => {
                      const inputValue = e.target.value;
                      if (inputValue === "") {
                        setStopPercentage(null);
                      } else if (/^\d*\.?\d{0,2}$/.test(inputValue)) {
                        setStopPercentage(parseFloat(inputValue));
                      }
                    }}
                    onBlur={() => {
                      if (stopPercentage === null || stopPercentage === undefined) {
                        setStopPercentage(0);
                      }
                    }}
                    disabled={isLoading} 
                    className="flex-1" 
                  />
                <span className="ml-2">%</span>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Initial Capital</label>
              <Input 
                type="text" 
                value={initialCapital !== null && initialCapital !== undefined ? initialCapital.toString() : ""} 
                onChange={e => {
                  const inputValue = e.target.value;
                  if (inputValue === "") {
                    setInitialCapital(null);
                  } else if (/^\d*\.?\d{0,2}$/.test(inputValue)) {
                    setInitialCapital(parseFloat(inputValue));
                  }
                }}
                onBlur={() => {
                  if (initialCapital === null || initialCapital === undefined) {
                    setInitialCapital(0);
                  }
                }}
                disabled={isLoading}
                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            
            <Button onClick={handleUpdateResults} className="w-full" disabled={isLoading}>
              Update Results
            </Button>
          </div>
        </div>
      </div>
      
      {/* Stock Details Table */}
      <div className="bg-card rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer text-center whitespace-nowrap" onClick={() => handleSortChange("date")}>
                  <div className="flex items-center justify-center">
                    Date {getSortIcon("date")}
                  </div>
                </TableHead>
                {/* Reordered columns with line breaks for two-word headers */}
                <TableHead className="cursor-pointer text-center" onClick={() => handleSortChange("entryPrice")}>
                  <div className="flex items-center justify-center">
                    Open {getSortIcon("entryPrice")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => handleSortChange("high")}>
                  <div className="flex items-center justify-center">
                    High {getSortIcon("high")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => handleSortChange("low")}>
                  <div className="flex items-center justify-center">
                    Low {getSortIcon("low")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => handleSortChange("exitPrice")}>
                  <div className="flex items-center justify-center">
                    Close {getSortIcon("exitPrice")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => handleSortChange("volume")}>
                  <div className="flex items-center justify-center">
                    Volume {getSortIcon("volume")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => handleSortChange("suggestedEntryPrice")}>
                  <div className="flex flex-col items-center justify-center">
                    <span>Suggested</span>
                    <span>Entry</span>
                    {getSortIcon("suggestedEntryPrice")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => handleSortChange("actualPrice")}>
                  <div className="flex flex-col items-center justify-center">
                    <span>Actual</span>
                    <span>Price</span>
                    {getSortIcon("actualPrice")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => handleSortChange("trade")}>
                  <div className="flex items-center justify-center">
                    Trade {getSortIcon("trade")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => handleSortChange("lotSize")}>
                  <div className="flex flex-col items-center justify-center">
                    <span>Lot</span>
                    <span>Size</span>
                    {getSortIcon("lotSize")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => handleSortChange("stopPrice")}>
                  <div className="flex flex-col items-center justify-center">
                    <span>Stop</span>
                    <span>Price</span>
                    {getSortIcon("stopPrice")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => handleSortChange("profit")}>
                  <div className="flex items-center justify-center">
                    Profit {getSortIcon("profit")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => handleSortChange("currentCapital")}>
                  <div className="flex flex-col items-center justify-center">
                    <span>Current</span>
                    <span>Capital</span>
                    {getSortIcon("currentCapital")}
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-6 text-muted-foreground">
                    No data to display
                  </TableCell>
                </TableRow>
              ) : (
                currentData.map((item, index) => (
                  <TableRow key={index} className={item.trade === "Buy" ? "bg-green-50 dark:bg-green-950/20" : item.trade === "Sell" ? "bg-red-50 dark:bg-red-950/20" : ""}>
                    <TableCell className="text-center whitespace-nowrap">
                      {formatDate(item.date)}
                    </TableCell>
                    <TableCell className="text-center">
                      {formatMixedValue(item.entryPrice)}
                    </TableCell>
                    <TableCell className="text-center">
                      {formatMixedValue(item.high)}
                    </TableCell>
                    <TableCell className="text-center">
                      {formatMixedValue(item.low)}
                    </TableCell>
                    <TableCell className="text-center">
                      {formatMixedValue(item.exitPrice)}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.volume ? item.volume.toLocaleString() : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {formatMixedValue(item.suggestedEntryPrice)}
                    </TableCell>
                    <TableCell className="text-center">
                      {formatMixedValue(item.actualPrice)}
                    </TableCell>
                    <TableCell className={`text-center font-medium ${
                      item.trade === "Buy" 
                        ? "text-green-600 dark:text-green-400" 
                        : item.trade === "Sell" 
                          ? "text-red-600 dark:text-red-400" 
                          : ""
                    }`}>
                      {formatTradeStatus(item.trade)}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.lotSize || "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {formatMixedValue(item.stopPrice)}
                    </TableCell>
                    <TableCell className={`text-center font-medium ${
                      (item.profit || 0) > 0 
                        ? "text-green-600 dark:text-green-400" 
                        : (item.profit || 0) < 0 
                          ? "text-red-600 dark:text-red-400" 
                          : ""
                    }`}>
                      {item.profit ? formatCurrency(item.profit) : "-"}
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      {item.currentCapital ? formatCurrency(item.currentCapital) : "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination with Items Per Page Selector */}
        <div className="flex flex-col sm:flex-row justify-between items-center p-4 border-t">
          <div className="flex items-center gap-2 mb-4 sm:mb-0">
            <span className="text-sm text-muted-foreground">Rows per page:</span>
            <select
              className="bg-transparent border rounded px-2 py-1 text-sm"
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              style={{ backgroundColor: "#0f1729" }}
            >
              <option value={10}>10</option>
              <option value={25}>50</option>
              <option value={50}>100</option>
              <option value={100}>500</option>
            </select>
          </div>
          
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  onClick={() => handlePageChange(currentPage - 1)}
                  className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
              
              {paginationLinks()}
              
              <PaginationItem>
                <PaginationNext 
                  onClick={() => handlePageChange(currentPage + 1)}
                  className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </div>
  );
}
