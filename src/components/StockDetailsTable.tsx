import { useState, useMemo, useRef, useEffect } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Area, AreaChart, YAxis, Line, ResponsiveContainer, Tooltip } from "recharts";import { DetailedResult, TradeHistoryItem, StockAnalysisParams } from "@/types";
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
    window.addEventListener('resize', updateHeight);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateHeight);
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
      // Calculate stop trigger here for consistency
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

      // Numeric comparison for other fields
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
    // Verifica se o item é válido e se a trade foi executada
    if (!item || item.trade !== "Executed" || item.stopPrice === '-' || item.stopPrice === null) {
        return "-";
    }

    // Converte os valores para número
    const stopPrice = Number(item.stopPrice);
    const low = Number(item.low);
    const high = Number(item.high);

    // Verifica se as conversões foram bem sucedidas
    if (isNaN(stopPrice) || isNaN(low) || isNaN(high)) {
        return "-";
    }

    // Aplica a lógica de stop trigger baseada na operação
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

  const handleUpdateResults = () => {
    const cleanParams = {
      ...params,
      referencePrice: refPrice,
      entryPercentage: Number(entryPercentage?.toFixed(2)) || 0,
      stopPercentage: Number(stopPercentage?.toFixed(2)) || 0,
      initialCapital: Number(initialCapital?.toFixed(2)) || 0
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

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Chart and Setup Panel */}
      <div className={`grid grid-cols-1 ${isMobile ? 'gap-6' : 'md:grid-cols-4 gap-4'}`}>
        {/* Chart */}
        <div className={`${isMobile ? 'order-2' : 'md:col-span-3'} bg-card rounded-lg border p-4`}>
          <h3 className="text-lg font-medium mb-4">Capital Evolution</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
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
                <YAxis />
                <defs>
                  <linearGradient id="capitalArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="capital"
                  stroke="#8884d8"
                  fill="url(#capitalArea)"
                  fillOpacity={1}
                  strokeWidth={2}
                  dot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: '#8884d8' }}
                  activeDot={{ r: 6, strokeWidth: 2, fill: '#fff', stroke: '#8884d8' }}
                  isAnimationActive={true}
                  animationDuration={2000}
                  animationEasing="ease-in-out"
                />
                <Line
                  type="monotone"
                  dataKey="capital"
                  stroke="#82ca9d"
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                />
              </AreaChart>
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
                  type="text" // Changed from number
                  inputMode="decimal" // Added for mobile
                  value={isEntryPriceFocused 
                         ? (entryPercentage === null || entryPercentage === undefined ? '' : String(entryPercentage)) 
                         : (typeof entryPercentage === 'number' ? entryPercentage.toFixed(2) : '')} // Conditional formatting
                  onChange={(e) => handleDecimalInputChange(e.target.value, setEntryPercentage)}
                  onFocus={() => setIsEntryPriceFocused(true)}
                  onBlur={() => {
                    handleBlurFormatting(entryPercentage, setEntryPercentage);
                    setIsEntryPriceFocused(false);
                  }}
                  disabled={isLoading}
                  placeholder="e.g. 1.50"
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" // Added to hide spinners
                  min="0" // Added for semantics
                />
                <span className="ml-2">%</span>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Stop Price (%)</label>
              <div className="flex items-center">
                <Input 
                  type="text" // Changed from number
                  inputMode="decimal" // Added for mobile
                  value={isStopPriceFocused 
                         ? (stopPercentage === null || stopPercentage === undefined ? '' : String(stopPercentage)) 
                         : (typeof stopPercentage === 'number' ? stopPercentage.toFixed(2) : '')} // Conditional formatting
                  onChange={(e) => handleDecimalInputChange(e.target.value, setStopPercentage)}
                  onFocus={() => setIsStopPriceFocused(true)}
                  onBlur={() => {
                    handleBlurFormatting(stopPercentage, setStopPercentage);
                    setIsStopPriceFocused(false);
                  }}
                  disabled={isLoading}
                  placeholder="e.g. 2.00"
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" // Added to hide spinners
                  min="0" // Added for semantics
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
                    className={
                      item.trade === "Buy" ? "bg-green-50 hover:bg-green-100" :
                      item.trade === "Sell" ? "bg-red-50 hover:bg-red-100" :
                      "hover:bg-muted/50"
                    }
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
                          } ${
                            column.id === "trade" ?
                              (item.trade === "Buy" ? "text-green-600" :
                               item.trade === "Sell" ? "text-red-600" : "") : ""
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
                {[10, 25, 50, 100].map((size) => (
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
  const handleDecimalInputChange = (value: string, onChange: (val: number | string | null) => void) => {
    if (value === "") {
      onChange(null); // Permite campo vazio temporariamente
      return;
    }
    // Regex para permitir números positivos com até 2 casas decimais
    // Permite iniciar com "." ou "0."
    const regex = /^(?:\d+)?(?:\.\d{0,2})?$/;
    if (regex.test(value)) {
      // Se o valor for apenas ".", ou terminar com ".", não converte para float ainda
      if (value === "." || value.endsWith(".")) {
         onChange(value); // Mantém como string temporariamente para permitir digitação
      } else {
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue >= 0) {
          onChange(numValue);
        }
      }
    } else if (value === "-") { // Impede digitar negativo
      // Não faz nada se tentar digitar "-" 
    } else {
      // Se o regex falhar mas for um número válido (ex: colado), tenta parsear
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue >= 0) {
         // Formata para 2 casas decimais se for um número válido colado
         onChange(parseFloat(numValue.toFixed(2)));
      } else if (value === "") {
         onChange(null);
      }
    }
  };

  // Função auxiliar para formatar no blur
  const handleBlurFormatting = (value: number | string | null | undefined, onChange: (val: number | null) => void) => {
    let numValue = 0;
    if (typeof value === "string") {
      // Se for só um ponto, trata como 0
      if (value === ".") {
        numValue = 0;
      } else {
        numValue = parseFloat(value) || 0;
      }
    } else if (typeof value === "number") {
      numValue = value;
    } else if (value === null || value === undefined) {
      onChange(null); // Mantém nulo se estava vazio
      return;
    }
    // Garante que seja positivo e formata
    onChange(Math.max(0, parseFloat(numValue.toFixed(2))));
  };
