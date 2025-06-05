
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
      // Corrigido: Usar item.profit para profitLoss e item.capital para currentCapital
      profitLoss: Number(item.profit) || 0,
      currentCapital: item.capital !== undefined && item.capital !== null 
        ? Number(item.capital) 
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
  function calculateStopTrigger(item: TradeHistoryItem, operation: string): string {
    // Verifica se os dados necessários existem e são válidos
    if (!item || item.stopPrice === '-' || item.stopPrice === null || item.low === null || item.high === null) {
        return "-"; // Retorna "-" se faltar Stop Price, Low ou High
    }

    // Converte os valores para número, tratando possíveis strings
    const stopPrice = Number(item.stopPrice);
    const low = Number(item.low);
    const high = Number(item.high);

    // Verifica se as conversões foram bem sucedidas e se stopPrice é válido (> 0)
    // Considera 0 como inválido para Stop Price, pois geralmente é usado como placeholder
    if (isNaN(stopPrice) || stopPrice <= 0 || isNaN(low) || isNaN(high)) {
        return "-"; // Retorna "-" se a conversão falhar ou stopPrice for inválido
    }

    // Aplica a lógica de stop trigger baseada na operação (case-insensitive)
    const lowerCaseOperation = operation?.toLowerCase(); // Garante que a comparação não seja sensível a maiúsculas/minúsculas

    if (lowerCaseOperation === 'buy') {
        // Para Buy: Low < Stop Price
        return low < stopPrice ? "Executed" : "-";
    } else if (lowerCaseOperation === 'sell') {
        // Para Sell: High > Stop Price
        return high > stopPrice ? "Executed" : "-";
    } else {
        // Se a operação não for 'buy' nem 'sell', ou se 'operation' for undefined/null, retorna "-"
        return "-";
    }
  }

  // Function to format trade display with new logic
  const formatTradeDisplay = (item: any): string => {
    let tradeValue = item.trade;
    
    // 1. Replace all "Close" with "Closed"
    if (tradeValue === "Close") {
      tradeValue = "Closed";
    }
    
    // 2. For Weekly interval, check if trade started and stop was hit on same day
    if (params.interval === 'weekly') {
      const stopTrigger = item.stopTrigger || calculateStopTrigger(item, params.operation);
      
      // If a Buy or Sell trade AND stop was executed on same day
      if ((tradeValue === "Buy" || tradeValue === "Sell") && stopTrigger === "Executed") {
        return `${tradeValue}/Closed`;
      }
    }
    
    return tradeValue || "-";
  };

  // Function to get trade text color
  const getTradeTextColor = (tradeDisplay: string): string => {
    if (tradeDisplay.includes("Buy")) {
      return "text-green-600";
    } else if (tradeDisplay.includes("Sell")) {
      return "text-red-600";
    } else if (tradeDisplay.includes("Closed")) {
      return "text-yellow-600";
    }
    return "";
  };

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
      entryPercentage: typeof entryPercentage === 'number' ? Number(entryPercentage.toFixed(2)) : 0,
      stopPercentage: typeof stopPercentage === 'number' ? Number(stopPercentage.toFixed(2)) : 0,
      initialCapital: Number(initialCapital?.toFixed(2)) || 0
    };
    onUpdateParams(cleanParams);
  };

  // Função para lidar com a entrada de valores decimais (mantida a original)
  const handleDecimalInputChange = (value: string, setter: React.Dispatch<React.SetStateAction<number | string | null>>) => {
    // Permite valores vazios, números e um único ponto decimal
    if (value === '' || value === '.') {
      setter(value);
      return;
    }
    
    // Verifica se é um número válido com até 2 casas decimais
    const regex = /^-?\d*\.?\d{0,2}$/;
    if (regex.test(value)) {
      // Se for um número válido, converte para número se possível
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        setter(numValue);
      } else {
        setter(value);
      }
    }
  };

  // Função para formatar valores ao perder o foco (mantida a original)
  const handleBlurFormatting = (value: number | string | null, setter: React.Dispatch<React.SetStateAction<number | string | null>>) => {
    if (value === '' || value === '.' || value === null) {
      setter(0);
      return;
    }
    
    if (typeof value === 'string') {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        setter(numValue);
      } else {
        setter(0);
      }
    }
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
              <LineChart
                data={result.capitalEvolution || []}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }} // Remove margins
              >
                <Tooltip 
                  cursor={false} // Remove vertical line on hover
                  content={({ active, payload }) => (
                    active && payload?.length ? (
                      <div className="bg-background border rounded-md p-2 shadow-lg text-sm"> {/* Reduced padding and font size */}
                        <p className="font-medium mb-0.5">{formatDate(payload[0].payload.date)}</p> {/* Added small bottom margin */}
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
                  stroke="#00ffff" // Neon cyan color
                  strokeWidth={2}
                  dot={false} // No dots by default, maybe add activeDot styling
                  activeDot={{ r: 5, strokeWidth: 1, fill: '#ffffff', stroke: '#00ffff' }} // White dot with cyan border on hover
                  filter="url(#glow)" // Apply glow effect
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
              <label className="block text-sm font-medium mb-1">Initial Capital</label>
              <div className="flex items-center">
                <span className="mr-2">$</span>
                <Input 
                  type="number"
                  value={initialCapital !== null ? initialCapital : ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      setInitialCapital(null);
                    } else {
                      const numValue = parseFloat(value);
                      if (!isNaN(numValue)) {
                        setInitialCapital(numValue);
                      }
                    }
                  }}
                  disabled={isLoading}
                  placeholder="e.g. 10000"
                  min="0"
                />
              </div>
            </div>
            
            <Button 
              onClick={handleUpdateResults} 
              disabled={isLoading}
              className="w-full"
            >
              Update Results
            </Button>
          </div>
        </div>
      </div>
      
      {/* Data Table */}
      <div className="bg-card rounded-lg border p-4">
        <h3 className="text-lg font-medium mb-4">Trade History</h3>
        
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead 
                    key={col.id} 
                    className={`${col.width} cursor-pointer`}
                    onClick={() => handleSortChange(col.id as keyof TradeHistoryItem)}
                  >
                    <div className="flex items-center">
                      {col.label}
                      {getSortIcon(col.id as keyof TradeHistoryItem)}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentData.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>{formatDate(item.date)}</TableCell>
                  <TableCell>{item.entryPrice !== undefined ? item.entryPrice : "-"}</TableCell>
                  <TableCell>{item.high !== undefined ? item.high : "-"}</TableCell>
                  <TableCell>{item.low !== undefined ? item.low : "-"}</TableCell>
                  <TableCell>{item.exitPrice !== undefined ? item.exitPrice : "-"}</TableCell>
                  <TableCell>{item.volume !== undefined ? item.volume.toLocaleString() : "-"}</TableCell>
                  <TableCell>{item.suggestedEntryPrice !== undefined ? item.suggestedEntryPrice : "-"}</TableCell>
                  <TableCell>{item.actualPrice !== undefined ? item.actualPrice : "-"}</TableCell>
                  <TableCell className={getTradeTextColor(formatTradeDisplay(item))}>
                    {formatTradeDisplay(item)}
                  </TableCell>
                  <TableCell>{item.lotSize !== undefined ? item.lotSize : "-"}</TableCell>
                  <TableCell>{item.stopPrice !== undefined && item.stopPrice !== '-' ? item.stopPrice : "-"}</TableCell>
                  <TableCell>{item.stopTrigger}</TableCell>
                  {/* Corrigido: Usar item.profit para a coluna Profit/Loss */}
                  <TableCell className={item.profit > 0 ? "text-green-600" : item.profit < 0 ? "text-red-600" : ""}>
                    {item.profit !== undefined && item.profit !== 0 ? formatCurrency(item.profit) : "$0.00"}
                  </TableCell>
                  {/* Corrigido: Usar item.capital para a coluna Current Capital */}
                  <TableCell>{item.capital !== undefined ? formatCurrency(item.capital) : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => handlePageChange(currentPage - 1)}
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  // Logic to show pages around current page
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <PaginationItem key={i}>
                      <PaginationLink
                        onClick={() => handlePageChange(pageNum)}
                        isActive={currentPage === pageNum}
                        className="cursor-pointer"
                      >
                        {pageNum}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                
                <PaginationItem>
                  <PaginationNext 
                    onClick={() => handlePageChange(currentPage + 1)}
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
        
        {/* Items per page selector */}
        <div className="mt-4 flex items-center justify-end">
          <span className="text-sm mr-2">Rows per page:</span>
          <Select 
            value={String(itemsPerPage)} 
            onValueChange={(v) => {
              setItemsPerPage(Number(v));
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-[80px]">
              <SelectValue placeholder={itemsPerPage} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

