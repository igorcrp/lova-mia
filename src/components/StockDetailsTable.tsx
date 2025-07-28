
import { useState, useMemo, useRef, useEffect } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, Tooltip, Area, AreaChart, YAxis } from "recharts";
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
  
  // Estados para os inputs (valores temporários)
  const [refPrice, setRefPrice] = useState(params.referencePrice);
  const [entryPercentage, setEntryPercentage] = useState<number | string | null>(params.entryPercentage ?? null);
  const [stopPercentage, setStopPercentage] = useState<number | string | null>(params.stopPercentage ?? null);
  const [initialCapital, setInitialCapital] = useState<number | null>(params.initialCapital ?? null);
  
  // Estados para os valores usados nos cálculos (só mudam após "Update Results")
  const [appliedRefPrice, setAppliedRefPrice] = useState(params.referencePrice);
  const [appliedEntryPercentage, setAppliedEntryPercentage] = useState(params.entryPercentage ?? 0);
  const [appliedStopPercentage, setAppliedStopPercentage] = useState(params.stopPercentage ?? 0);
  const [appliedInitialCapital, setAppliedInitialCapital] = useState(params.initialCapital ?? 0);
  
  const [isEntryPriceFocused, setIsEntryPriceFocused] = useState(false);
  const [isStopPriceFocused, setIsStopPriceFocused] = useState(false);

  const setupPanelRef = useRef<HTMLDivElement>(null);
  const [chartHeight, setChartHeight] = useState(400);
  const isMobile = useIsMobile();

  // Sincronizar estados dos inputs quando params mudam
  useEffect(() => {
    console.log('Syncing params to input states:', params);
    setRefPrice(params.referencePrice);
    setEntryPercentage(params.entryPercentage ?? null);
    setStopPercentage(params.stopPercentage ?? null);
    setInitialCapital(params.initialCapital ?? null);
    
    // Também atualizar os valores aplicados
    setAppliedRefPrice(params.referencePrice);
    setAppliedEntryPercentage(params.entryPercentage ?? 0);
    setAppliedStopPercentage(params.stopPercentage ?? 0);
    setAppliedInitialCapital(params.initialCapital ?? 0);
  }, [params.referencePrice, params.entryPercentage, params.stopPercentage, params.initialCapital]);

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

  // Function to get previous business day reference price
  const getPreviousDayReferencePrice = (currentIndex: number, tradeHistory: TradeHistoryItem[], referenceField: string): number => {
    if (currentIndex <= 0) return 0;
    
    const previousDayData = tradeHistory[currentIndex - 1];
    if (!previousDayData) return 0;
    
    switch (referenceField.toLowerCase()) {
      case 'open':
        return Number(previousDayData.entryPrice) || 0;
      case 'high':
        return Number(previousDayData.high) || 0;
      case 'low':
        return Number(previousDayData.low) || 0;
      case 'close':
        return Number(previousDayData.exitPrice) || 0;
      default:
        return Number(previousDayData.exitPrice) || 0;
    }
  };

  // Function to calculate suggested entry price
  const calculateSuggestedEntry = (item: TradeHistoryItem, index: number): number => {
    if (!result?.tradeHistory || index <= 0) return 0;
    
    const currentOperation = params.operation || 'buy';
    const currentEntryPercentage = Number(appliedEntryPercentage) || 0;
    const currentReferencePrice = appliedRefPrice || 'close';
    
    const previousDayRefPrice = getPreviousDayReferencePrice(index, result.tradeHistory, currentReferencePrice);
    
    if (previousDayRefPrice <= 0) return 0;
    
    const entryPercent = currentEntryPercentage / 100;
    
    if (currentOperation.toLowerCase() === 'buy') {
      return previousDayRefPrice - (previousDayRefPrice * entryPercent);
    } else if (currentOperation.toLowerCase() === 'sell') {
      return previousDayRefPrice + (previousDayRefPrice * entryPercent);
    }
    
    return 0;
  };

  // Function to calculate actual price - CORRECTED FORMULA
  const calculateActualPrice = (item: TradeHistoryItem, suggestedEntry: number): number | string => {
    const currentOperation = params.operation || 'buy';
    const open = Number(item.entryPrice) || 0;
    const low = Number(item.low) || 0;
    const high = Number(item.high) || 0;
    
    if (currentOperation.toLowerCase() === 'buy') {
      // Para Buy: Se o Open <= Suggested Entry, então considera o menor valor (open)
      if (open <= suggestedEntry && open > 0) {
        return open;
      }
      
      // Se Low <= Suggested Price, então registra o valor de Suggested Price
      if (low <= suggestedEntry && suggestedEntry > 0) {
        return suggestedEntry;
      }
    } else if (currentOperation.toLowerCase() === 'sell') {
      // Para Sell: Se o Open >= Suggested Entry, então considera o valor (open)
      if (open >= suggestedEntry && open > 0) {
        return open;
      }
      
      // Se High >= Suggested Price, então registra o valor de Suggested Price
      if (high >= suggestedEntry && suggestedEntry > 0) {
        return suggestedEntry;
      }
    }
    
    // senão coloque " – "
    return "-";
  };

  // Function to calculate trade status
  const calculateTradeStatus = (item: TradeHistoryItem, actualPrice: number | string, suggestedEntry: number): string => {
    const currentOperation = params.operation || 'buy';
    const low = Number(item.low) || 0;
    const high = Number(item.high) || 0;
    
    // Se actualPrice é "-", não há trade
    if (actualPrice === "-") return "-";
    
    const actualPriceNum = Number(actualPrice);
    
    if (currentOperation.toLowerCase() === 'buy') {
      // Buy: Se Actual Price <= Suggested Entry ou se low <= Suggested Entry, então registre "Buy", senão coloque " – "
      if (actualPriceNum <= suggestedEntry || low <= suggestedEntry) {
        return "Buy";
      }
    } else if (currentOperation.toLowerCase() === 'sell') {
      // Sell: Se Actual Price >= Suggested Entry ou se High >= Suggested Entry, então registre "Sell", senão coloque " – "
      if (actualPriceNum >= suggestedEntry || high >= suggestedEntry) {
        return "Sell";
      }
    }
    
    return "-";
  };

  // Function to calculate lot size
  const calculateLotSize = (actualPrice: number | string, previousCapital: number): number => {
    if (actualPrice === "-" || Number(actualPrice) <= 0) return 0;
    
    const actualPriceNum = Number(actualPrice);
    
    // Previous day's Current Capital / "Actual Price"
    const lotSize = previousCapital / actualPriceNum;
    
    // Para CRYPTO, permite lotes fracionários
    if (params.stockMarket === "CRYPTO") {
      return Number(lotSize.toFixed(8)); // 8 casas decimais para crypto
    }
    
    // Para outros mercados, arredondar para baixo em dezenas
    return Math.floor(lotSize / 10) * 10;
  };

  // Function to calculate stop price
  const calculateStopPrice = (actualPrice: number | string): number => {
    const currentOperation = params.operation || 'buy';
    const currentStopPercentage = Number(appliedStopPercentage) || 0;
    
    if (actualPrice === "-" || Number(actualPrice) <= 0) return 0;
    
    const actualPriceNum = Number(actualPrice);
    const stopPercent = currentStopPercentage / 100;
    
    if (currentOperation.toLowerCase() === 'buy') {
      // Buy: Actual Price – (Actual Price * % Stop)
      return actualPriceNum - (actualPriceNum * stopPercent);
    } else if (currentOperation.toLowerCase() === 'sell') {
      // Sell: Actual Price + (Actual Price * % Stop)
      return actualPriceNum + (actualPriceNum * stopPercent);
    }
    
    return 0;
  };

  // Function to calculate stop trigger
  const calculateStopTrigger = (item: TradeHistoryItem, stopPrice: number): string => {
    const currentOperation = params.operation || 'buy';
    const low = Number(item.low) || 0;
    const high = Number(item.high) || 0;
    
    if (stopPrice <= 0) return "-";
    
    if (currentOperation.toLowerCase() === 'buy') {
      // Buy: Se "Low" < "Stop Price"; então "Executed"; senão coloque " – "
      return low < stopPrice ? "Executed" : "-";
    } else if (currentOperation.toLowerCase() === 'sell') {
      // Sell: Se "High" > "Stop Price"; então "Executed"; senão coloque " – "
      return high > stopPrice ? "Executed" : "-";
    }
    
    return "-";
  };

  // Function to calculate profit/loss
  const calculateProfitLoss = (item: TradeHistoryItem, actualPrice: number | string, stopPrice: number, lotSize: number, stopTrigger: string): number => {
    if (actualPrice === "-" || lotSize === 0) return 0;
    
    const currentOperation = params.operation || 'buy';
    const actualPriceNum = Number(actualPrice);
    const close = Number(item.exitPrice) || 0;
    
    if (currentOperation.toLowerCase() === 'buy') {
      if (stopTrigger === "Executed") {
        // Buy + Executed: (Stop Price – Actual Price) * Lot Size
        return (stopPrice - actualPriceNum) * lotSize;
      } else {
        // Buy + "-": (Close – Actual Price) * Lot Size
        return (close - actualPriceNum) * lotSize;
      }
    } else if (currentOperation.toLowerCase() === 'sell') {
      if (stopTrigger === "Executed") {
        // Sell + Executed: (Actual Price - Stop Price) * Lot Size
        return (actualPriceNum - stopPrice) * lotSize;
      } else {
        // Sell + "-": (Actual Price - Close do dia atual) * Lot Size
        return (actualPriceNum - close) * lotSize;
      }
    }
    
    return 0;
  };

  // Process and sort data with corrected formulas - RECALCULATE ALL VALUES WHEN PARAMETERS CHANGE
  const processedData = useMemo(() => {
    if (!result?.tradeHistory?.length) return [];
    
    console.log('Processing data with applied values:', {
      appliedRefPrice,
      appliedEntryPercentage,
      appliedStopPercentage,
      appliedInitialCapital,
      operation: params.operation
    });
    
    // CRITICAL: Use the exact same logic as the analysis services to ensure Final Capital = last Current Capital
    // Instead of recalculating everything locally, use the existing Current Capital from trade history
    // and only recalculate if the applied parameters are different from the original params
    
    const shouldRecalculate = (
      appliedRefPrice !== params.referencePrice ||
      appliedEntryPercentage !== params.entryPercentage ||
      appliedStopPercentage !== params.stopPercentage ||
      appliedInitialCapital !== params.initialCapital
    );
    
    if (!shouldRecalculate) {
      // If parameters haven't changed, use the original current capital values
      // This ensures consistency with Final Capital
      return result.tradeHistory.map(item => ({
        ...item,
        // Keep original calculated values to maintain consistency
        currentCapital: item.currentCapital ?? appliedInitialCapital
      }));
    }
    
    // Only recalculate if parameters have changed
    let runningCapital = appliedInitialCapital;
    
    const data = result.tradeHistory.map((item, index) => {
      if (index === 0) {
        // Primeiro item sempre mantém capital inicial
        return {
          ...item,
          suggestedEntryPrice: 0,
          actualPrice: "-",
          trade: "-",
          stopPrice: 0,
          stopTrigger: "-",
          currentCapital: appliedInitialCapital,
          profitLoss: 0,
          lotSize: 0
        };
      }
      
      // Calcular todos os valores baseados nos parâmetros aplicados
      const suggestedEntry = calculateSuggestedEntry(item, index);
      const actualPrice = calculateActualPrice(item, suggestedEntry);
      const trade = calculateTradeStatus(item, actualPrice, suggestedEntry);
      const stopPrice = actualPrice !== "-" ? calculateStopPrice(actualPrice) : 0;
      const stopTrigger = stopPrice > 0 ? calculateStopTrigger(item, stopPrice) : "-";
      
      // Calcular lot size baseado no capital anterior
      const lotSize = calculateLotSize(actualPrice, runningCapital);
      
      // Calcular profit/loss
      const profitLoss = calculateProfitLoss(item, actualPrice, stopPrice, lotSize, stopTrigger);
      
      // Atualizar capital corrente - mesma lógica dos serviios de análise
      runningCapital = runningCapital + profitLoss;
      
      return {
        ...item,
        suggestedEntryPrice: suggestedEntry,
        actualPrice: actualPrice,
        trade: trade,
        stopPrice: stopPrice,
        stopTrigger: stopTrigger,
        currentCapital: runningCapital,
        profitLoss: profitLoss,
        lotSize: lotSize
      };
    });

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

      const numA = Number(valA) || 0;
      const numB = Number(valB) || 0;
      return sortDirection === "asc" ? numA - numB : numB - numA;
    });
  }, [result, sortField, sortDirection, params.operation, appliedEntryPercentage, appliedStopPercentage, appliedRefPrice, appliedInitialCapital]);

  // Enhanced chart data processing - sempre do mais antigo para o mais novo
  const chartData = useMemo(() => {
    if (!processedData.length) return [];
    
    // Ordenar os dados por data (do mais antigo para o mais novo) para o gráfico
    const sortedForChart = [...processedData].sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA.getTime() - dateB.getTime();
    });
    
    return sortedForChart.map((item, index) => {
      const capital = item.currentCapital || 0;
      
      return {
        date: item.date,
        capital
      };
    });
  }, [processedData]);

  // Função para formatar o valor do trade com cores
  function formatTradeValue(trade: string) {
    if (typeof trade !== "string" || !trade) return <span>-</span>;

    if (trade.includes("/")) {
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
    // Atualizar os valores aplicados com os valores dos inputs
    setAppliedRefPrice(refPrice);
    setAppliedEntryPercentage(Number(entryPercentage) || 0);
    setAppliedStopPercentage(Number(stopPercentage) || 0);
    setAppliedInitialCapital(Number(initialCapital) || 0);
    
    const cleanParams = {
      ...params,
      referencePrice: refPrice,
      entryPercentage: typeof entryPercentage === 'number' ? Number(entryPercentage.toFixed(2)) : Number(entryPercentage) || 0,
      stopPercentage: typeof stopPercentage === 'number' ? Number(stopPercentage.toFixed(2)) : Number(stopPercentage) || 0,
      initialCapital: initialCapital !== null ? Number(initialCapital.toFixed(2)) : 0
    };
    
    console.log('Calling onUpdateParams with:', cleanParams);
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

  const formatPrice = (amount: number | undefined | null): string => {
    if (amount === undefined || amount === null) return "-";
    
    // Para CRYPTO, mostrar 6 casas decimais
    if (params.stockMarket === "CRYPTO") {
      return amount.toFixed(6);
    }
    
    // Para outros mercados, usar formatação padrão (2 casas decimais)
    return amount.toFixed(2);
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

  // Columns configuration - SWAPPED Actual Price and Trade positions
  const columns = [
    { id: "date", label: "Date", width: "w-24" },
    { id: "entryPrice", label: "Open", width: "w-20" },
    { id: "high", label: "High", width: "w-20" },
    { id: "low", label: "Low", width: "w-20" },
    { id: "exitPrice", label: "Close", width: "w-20" },
    { id: "volume", label: "Volume", width: "w-24" },
    { id: "suggestedEntryPrice", label: "Suggested Entry", width: "w-28" },
    { id: "trade", label: "Trade", width: "w-20" }, // MOVED UP
    { id: "actualPrice", label: "Actual Price", width: "w-24" }, // MOVED DOWN
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
    <div className="w-full flex flex-col gap-4 md:gap-6">
      {/* Chart and Setup Panel - Mobile Optimized */}
      <div className={`${isMobile ? 'space-y-4' : 'grid md:grid-cols-4 gap-4'}`}>
        {/* Capital Evolution Chart (appears first on mobile) */}
        <div className={`${isMobile ? 'order-1' : 'md:col-span-3'} bg-card rounded-lg border p-3 md:p-4`}>
          <h3 className="text-base md:text-lg font-medium mb-3 md:mb-4">Capital Evolution</h3>
          <div style={{ width: '100%', height: isMobile ? '250px' : '360px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <defs>
                  <linearGradient id="cyanGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#03d5c0" stopOpacity={0.8}/>
                    <stop offset="100%" stopColor="#03d5c0" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <Tooltip 
                  labelFormatter={(label) => formatDate(label)} 
                  formatter={(value) => [formatCurrency(value as number), 'Capital']}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--popover-foreground))',
                    fontSize: '12px'
                  }}
                />
                <YAxis 
                  orientation="left"
                  domain={['dataMin', 'dataMax']}
                  hide={true}
                />
                <Area
                  type="monotone"
                  dataKey="capital"
                  stroke="#03d5c0"
                  strokeWidth={2}
                  fill="url(#cyanGradient)"
                  connectNulls={true}
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 1, fill: '#ffffff', stroke: '#03d5c0' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Setup Panel (appears second on mobile) */}
        <div ref={setupPanelRef} className={`${isMobile ? 'order-2' : 'md:col-span-1 h-[420px]'} bg-card rounded-lg border p-3 md:p-4 flex flex-col`}>
          <h3 className="text-base md:text-lg font-medium mb-3 md:mb-4">Stock Setup</h3>
          <div className="space-y-3 md:space-y-4">
            {/* Mobile: Two fields per row */}
            <div className={`${isMobile ? 'grid grid-cols-2 gap-3' : 'space-y-3 md:space-y-4'}`}>
              <div>
                <label className="block text-xs md:text-sm font-medium mb-1">Reference Price</label>
                <Select 
                  value={refPrice} 
                  onValueChange={(v) => setRefPrice(v as any)}
                  disabled={isLoading}
                >
                  <SelectTrigger className="h-9 md:h-10">
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
                <label className="block text-xs md:text-sm font-medium mb-1">Entry Price (%)</label>
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
                    placeholder="1.50"
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none h-9 md:h-10 text-sm"
                    min="0"
                  />
                  <span className="ml-2 text-xs md:text-sm">%</span>
                </div>
              </div>
            </div>
            
            <div className={`${isMobile ? 'grid grid-cols-2 gap-3' : 'space-y-3 md:space-y-4'}`}>
              <div>
                <label className="block text-xs md:text-sm font-medium mb-1">Stop Price (%)</label>
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
                    placeholder="2.00"
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none h-9 md:h-10 text-sm"
                    min="0"
                  />
                  <span className="ml-2 text-xs md:text-sm">%</span>
                </div>
              </div>
              
              <div>
                <label className="block text-xs md:text-sm font-medium mb-1">Initial Capital ($)</label>
                <Input 
                  type="text"
                  value={initialCapital ? initialCapital.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace(/,/g, '.') : ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "") {
                      setInitialCapital(null);
                      return;
                    }
                    const cleanValue = value.replace(/\./g, '');
                    if (cleanValue.startsWith('-')) return;
                    const regex = /^\d*$/;
                    if (regex.test(cleanValue)) {
                      const numValue = parseInt(cleanValue) || null;
                      setInitialCapital(numValue);
                    }
                  }}
                  disabled={isLoading}
                  placeholder="10.000"
                  className="h-9 md:h-10 text-sm"
                />
              </div>
            </div>
            
            <Button 
              onClick={handleUpdateResults} 
              className="w-full h-9 md:h-10 text-sm md:text-base mt-4" 
              disabled={isLoading}
            >
              {isLoading ? 'Updating...' : 'Update Results'}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Mobile Card View for Trade History */}
      <div className="md:hidden space-y-3 mb-6">
        <h3 className="text-base font-medium">Trade History</h3>
        {isLoading ? (
          <div className="text-center py-6">Loading data...</div>
        ) : currentData.length === 0 ? (
          <div className="text-center py-6">No data to display</div>
        ) : (
          currentData.map((item, index) => (
            <div key={`${item.date}-${item.profitLoss}-${index}`} className="bg-card border rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center pb-2 border-b">
                <span className="font-medium text-sm">{formatDate(item.date)}</span>
                <span className={`text-sm font-medium ${
                  Number(item.profitLoss) > 0 ? "text-green-600 dark:text-green-400" : 
                  Number(item.profitLoss) < 0 ? "text-red-600 dark:text-red-400" : ""
                }`}>
                  {formatCurrency(item.profitLoss)}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Open:</span>
                    <span>{formatPrice(item.entryPrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">High:</span>
                    <span>{formatPrice(item.high)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Low:</span>
                    <span>{formatPrice(item.low)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Close:</span>
                    <span>{formatPrice(item.exitPrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Trade:</span>
                    <span>{formatTradeValue(item.trade || "-")}</span>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sugg. Entry:</span>
                    <span>{formatPrice(item.suggestedEntryPrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Actual Price:</span>
                    <span>{typeof item.actualPrice === "number" ? formatPrice(item.actualPrice) : item.actualPrice}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Lot Size:</span>
                    <span>{item.lotSize ? item.lotSize.toLocaleString() : "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Capital:</span>
                    <span className="font-medium">{formatCurrency(item.currentCapital)}</span>
                  </div>
                </div>
              </div>
              
              {item.stopTrigger && item.stopTrigger !== "-" && (
                <div className="pt-2 border-t">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Stop Trigger:</span>
                    <span className="text-red-600 dark:text-red-400">{item.stopTrigger}</span>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-card rounded-lg border overflow-hidden">
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
                          formattedValue = typeof item.stopTrigger === 'string' ? item.stopTrigger : "-";
                        } else if (column.id === "trade") {
                          formattedValue = value as string;
                        } else if (column.id === "actualPrice") {
                          // Handle actualPrice which can be number or string ("-")
                          formattedValue = typeof value === "number" ? formatPrice(value) : String(value);
                        } else if (column.id === "entryPrice" || column.id === "high" || column.id === "low" || column.id === "exitPrice" || column.id === "lotSize") {
                          // Format OHLC columns with special handling for CRYPTO
                          formattedValue = formatPrice(value as number);
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
                              (Number(item.profitLoss) > 0 ? "text-green-600 dark:text-green-400" : 
                               Number(item.profitLoss) < 0 ? "text-red-600 dark:text-red-400" : "") : ""
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
        
        {/* Desktop Pagination */}
        <div className="hidden md:block">
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
      
      {/* Mobile Pagination */}
      <div className="md:hidden">
        {totalPages > 1 && (
          <div className="flex flex-col items-center gap-3 mt-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Items per page:</span>
              <select
                className="bg-card border rounded px-2 py-1 text-xs"
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                {[10, 50, 100].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="h-8 px-3 text-xs"
              >
                Previous
              </Button>
              
              <span className="text-xs text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="h-8 px-3 text-xs"
              >
                Next
              </Button>
            </div>
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
