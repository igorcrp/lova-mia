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
  // State for sorting
  const [sortField, setSortField] = useState<keyof TradeHistoryItem>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // State for pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // State for stock setup parameters
  const [refPrice, setRefPrice] = useState(params.referencePrice);
  const [entryPercentage, setEntryPercentage] = useState(params.entryPercentage);
  const [stopPercentage, setStopPercentage] = useState(params.stopPercentage);
  const [initialCapital, setInitialCapital] = useState(params.initialCapital);

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
    return [...filteredTradeHistory].sort((a, b) => {
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
  }, [filteredTradeHistory, sortField, sortDirection]);

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

  // Handle update button click
  const handleUpdateResults = () => {
    onUpdateParams({
      ...params,
      referencePrice: refPrice,
      entryPercentage: entryPercentage,
      stopPercentage: stopPercentage,
      initialCapital: initialCapital
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
    return `${value.toFixed(2)}%`;
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
    if (value === undefined || value === null) return "-";
    if (value === '-') return "-";
    if (typeof value === 'number') return value.toFixed(2);
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
                <Input type="text" value={entryPercentage} onChange={e => {
                const value = parseFloat(e.target.value);
                setEntryPercentage(!isNaN(value) ? value : entryPercentage);
              }} disabled={isLoading} className="flex-1" />
                <span className="ml-2">%</span>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Stop Price</label>
              <div className="flex items-center">
                <Input type="text" value={stopPercentage} onChange={e => {
                const value = parseFloat(e.target.value);
                setStopPercentage(!isNaN(value) ? value : stopPercentage);
              }} disabled={isLoading} className="flex-1" />
                <span className="ml-2">%</span>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Initial Capital</label>
              <Input type="text" value={initialCapital} onChange={e => {
              const value = parseFloat(e.target.value);
              setInitialCapital(!isNaN(value) ? value : initialCapital);
            }} disabled={isLoading} />
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
                <TableHead className="cursor-pointer text-center" onClick={() => handleSortChange("stop")}>
                  <div className="flex flex-col items-center justify-center">
                    <span>Stop</span>
                    <span>Trigger</span>
                    {getSortIcon("stop")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => handleSortChange("profit")}>
                  <div className="flex flex-col items-center justify-center">
                    <span>Profit/</span>
                    <span>Loss</span>
                    {getSortIcon("profit")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => handleSortChange("capital")}>
                  <div className="flex flex-col items-center justify-center">
                    <span>Current</span>
                    <span>Capital</span>
                    {getSortIcon("capital")}
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center py-4 text-muted-foreground">
                    No data available for the selected period
                  </TableCell>
                </TableRow>
              ) : (
                currentData.map((item, index) => (
                  <TableRow key={index} className={index % 2 === 0 ? "bg-muted/30" : ""}>
                    <TableCell className="text-center">{formatDate(item.date)}</TableCell>
                    <TableCell className="text-center">{formatMixedValue(item.entryPrice)}</TableCell>
                    <TableCell className="text-center">{formatMixedValue(item.high)}</TableCell>
                    <TableCell className="text-center">{formatMixedValue(item.low)}</TableCell>
                    <TableCell className="text-center">{formatMixedValue(item.exitPrice)}</TableCell>
                    <TableCell className="text-center">{item.volume?.toLocaleString() || "-"}</TableCell>
                    <TableCell className="text-center">{formatMixedValue(item.suggestedEntryPrice)}</TableCell>
                    <TableCell className="text-center">{formatMixedValue(item.actualPrice)}</TableCell>
                    <TableCell className="text-center">
                      {item.trade === "Buy" ? (
                        <span className="text-green-600 font-medium">Buy</span>
                      ) : item.trade === "Sell" ? (
                        <span className="text-green-600 font-medium">Sell</span>
                      ) : item.trade === "Close" ? (
                        <span className="text-red-600 font-medium">Close</span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-center">{item.lotSize || "-"}</TableCell>
                    <TableCell className="text-center">{formatMixedValue(item.stopPrice)}</TableCell>
                    <TableCell className="text-center">{formatTradeStatus(item.stop || "")}</TableCell>
                    <TableCell className={`text-center ${item.profit > 0 ? "text-green-600" : item.profit < 0 ? "text-red-600" : ""}`}>
                      {item.profit ? formatCurrency(item.profit) : "-"}
                    </TableCell>
                    <TableCell className="text-center">{item.capital ? formatCurrency(item.capital) : "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination and Items Per Page */}
        <div className="flex flex-col sm:flex-row justify-between items-center p-4">
          <div className="flex items-center mb-4 sm:mb-0">
            <span className="text-xs md:text-sm mr-2">Items per page:</span>
            <Select value={String(itemsPerPage)} onValueChange={value => {
            setItemsPerPage(Number(value));
            setCurrentPage(1); // Reset to first page when changing items per page
          }}>
              <SelectTrigger className="w-[70px] md:w-[80px] h-8 text-xs md:text-sm">
                <SelectValue placeholder="10" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="500">500</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {totalPages > 0 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious onClick={() => handlePageChange(currentPage - 1)} className={currentPage === 1 ? "pointer-events-none opacity-50" : ""} />
                </PaginationItem>
                
                {paginationLinks()}
                
                <PaginationItem>
                  <PaginationNext onClick={() => handlePageChange(currentPage + 1)} className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""} />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
      </div>
    </div>
  );
}
