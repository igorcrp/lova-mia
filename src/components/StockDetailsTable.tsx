
import { useState, useMemo } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { DetailedResult, TradeHistoryItem, StockAnalysisParams } from "@/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

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
    const maxDisplayLinks = 5; // Maximum number of page links to display

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

  // Format date function (UTC safe)
  const formatDate = (dateString: string) => {
    // Parse the date string as UTC
    const date = new Date(`${dateString}T00:00:00Z`);
    // Get UTC components
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
};
  
  // Format trade status - replace "Not Executed" with "-"
  const formatTradeStatus = (status: string) => {
    return status === "Not Executed" ? "-" : status;
  };

  // Get sort icon
  const getSortIcon = (field: keyof TradeHistoryItem) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />;
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
  
  return <div className="w-full flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Capital Evolution Chart (3/4 width) */}
        <div className="md:col-span-3 h-[400px] bg-card rounded-lg border p-4">
          <h3 className="text-lg font-medium mb-4">Capital Evolution</h3>
          <ResponsiveContainer width="100%" height="85%">
            <LineChart data={filteredCapitalEvolution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tickFormatter={dateString => formatDate(dateString)} stroke="#64748b" />
              <YAxis tickFormatter={value => `$${value.toLocaleString()}`} stroke="#64748b" />
              <Tooltip content={({
              active,
              payload
            }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return <div className="bg-background border rounded-md p-2 shadow-md">
                        <p className="text-sm font-medium">{formatDate(data.date)}</p>
                        <p className="text-sm">Capital: {formatCurrency(data.capital)}</p>
                      </div>;
              }
              return null;
            }} />
              <Line type="monotone" dataKey="capital" stroke="#8b5cf6" strokeWidth={2} dot={{
              r: 4,
              strokeWidth: 2
            }} activeDot={{
              r: 6
            }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        {/* Stock Setup Panel (1/4 width) */}
        <div className="md:col-span-1 bg-card rounded-lg border p-4">
          <h3 className="text-lg font-medium mb-4">Stock Setup</h3>
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
                <TableHead className="cursor-pointer text-center" onClick={() => handleSortChange("date")}>
                  <div className="flex items-center justify-center">
                    Date {getSortIcon("date")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => handleSortChange("entryPrice")}>
                  <div className="flex items-center justify-center">
                    Open {getSortIcon("entryPrice")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => handleSortChange("exitPrice")}>
                  <div className="flex items-center justify-center">
                    Close {getSortIcon("exitPrice")}
                  </div>
                </TableHead>
                <TableHead className="text-center">High</TableHead>
                <TableHead className="text-center">Low</TableHead>
                <TableHead className="text-center">Volume</TableHead>
                <TableHead className="text-center">Suggested Entry</TableHead>
                <TableHead className="text-center">Actual Price</TableHead>
                <TableHead className="text-center">Trade</TableHead>
                <TableHead className="text-center">Lot Size</TableHead>
                <TableHead className="text-center">Stop Price</TableHead>
                <TableHead className="text-center">Stop Trigger</TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => handleSortChange("profit")}>
                  <div className="flex items-center justify-center">
                    Profit/ Loss {getSortIcon("profit")}
                  </div>
                </TableHead>
                <TableHead className="text-center">Current Capital</TableHead>
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
                currentData.map((trade, index) => (
                  <TableRow key={trade.date}>
                    <TableCell>{formatDate(trade.date)}</TableCell>
                    <TableCell>{trade.entryPrice.toFixed(2)}</TableCell>
                    <TableCell>{trade.exitPrice.toFixed(2)}</TableCell>
                    <TableCell>
                      {trade.high ? trade.high.toFixed(2) : (trade.exitPrice * 1.005).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {trade.low ? trade.low.toFixed(2) : (trade.entryPrice * 0.995).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {trade.volume ? trade.volume.toLocaleString() : "-"}
                    </TableCell>
                    <TableCell>
                      {params.operation === "buy" 
                        ? (trade.entryPrice * (1 - params.entryPercentage / 100)).toFixed(2) 
                        : (trade.entryPrice * (1 + params.entryPercentage / 100)).toFixed(2)}
                    </TableCell>
                    <TableCell>{trade.entryPrice.toFixed(2)}</TableCell>
                    <TableCell>{formatTradeStatus(trade.trade)}</TableCell>
                    <TableCell>
                      {Math.floor((filteredCapitalEvolution[Math.max(0, index - 1)]?.capital || params.initialCapital) / trade.entryPrice / 10) * 10}
                    </TableCell>
                    <TableCell>
                      {params.operation === "buy" 
                        ? (trade.entryPrice * (1 - params.stopPercentage / 100)).toFixed(2) 
                        : (trade.entryPrice * (1 + params.stopPercentage / 100)).toFixed(2)}
                    </TableCell>
                    <TableCell>{trade.stop || "-"}</TableCell>
                    <TableCell className={trade.profit >= 0 ? "text-green-600" : "text-red-600"}>
                      {formatCurrency(trade.profit)}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(filteredCapitalEvolution[index]?.capital || params.initialCapital)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination and Items Per Page */}
        <div className="flex flex-col sm:flex-row justify-between items-center p-4">
          <div className="flex items-center mb-4 sm:mb-0">
            <span className="text-sm mr-2">Items per page:</span>
            <Select value={String(itemsPerPage)} onValueChange={value => {
            setItemsPerPage(Number(value));
            setCurrentPage(1); // Reset to first page when changing items per page
          }}>
              <SelectTrigger className="w-[80px]">
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
    </div>;
}
