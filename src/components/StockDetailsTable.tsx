import { useState, useMemo, useRef, useEffect } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { DetailedResult, TradeHistoryItem, StockAnalysisParams } from "@/types"; // Assume TradeHistoryItem includes stopTrigger, actualPrice, lotSize, stopPrice, exitPrice
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface StockDetailsTableProps {
  result: DetailedResult;
  params: StockAnalysisParams & { interval?: string }; // Adicionando 'interval' opcional aos params para clareza
  onUpdateParams: (params: StockAnalysisParams) => void;
  isLoading?: boolean;
}

// Helper function to safely convert value to number, defaulting to 0
const safeNumber = (value: any): number => {
  const num = Number(value);
  return isNaN(num) ? 0 : num;
};

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

  // State for stock setup parameters - Inicializa com valores formatados se possível
  const [refPrice, setRefPrice] = useState(params.referencePrice);
  const [entryPercentage, setEntryPercentage] = useState<number | null>(params.entryPercentage !== null && params.entryPercentage !== undefined ? parseFloat(params.entryPercentage.toFixed(2)) : null);
  const [stopPercentage, setStopPercentage] = useState<number | null>(params.stopPercentage !== null && params.stopPercentage !== undefined ? parseFloat(params.stopPercentage.toFixed(2)) : null);
  const [initialCapital, setInitialCapital] = useState<number | null>(params.initialCapital !== null && params.initialCapital !== undefined ? parseFloat(params.initialCapital.toFixed(2)) : null);

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

    const timer = setTimeout(updateHeight, 100);
    window.addEventListener('resize', updateHeight);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  // Calculate processed data (Profit/Loss and Current Capital)
  const processedData = useMemo(() => {
    const tradeHistory = result.tradeHistory || [];
    if (tradeHistory.length === 0 || initialCapital === null) return [];
    
    // 1. Sort by date ascending to process calculations chronologically
    const dateOrdered = [...tradeHistory].sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA.getTime() - dateB.getTime();
    });
    
    // 2. Calculate Profit/Loss and Current Capital
    const analysisInterval = params.interval || "Daytrade";
    const isDaytrade = analysisInterval === "Daytrade";
    const isWeeklyMonthlyAnnual = ["Weekly", "Monthly", "Annual"].includes(analysisInterval);
    const operationType = params.operation || 'buy'; // Default to 'buy'

    dateOrdered.forEach((item, index) => {
      // Sanitize inputs needed for calculation
      const stopTrigger = String(item.stopTrigger || '-').trim(); // Default to '-' if undefined/null
      const actualPrice = safeNumber(item.actualPrice);
      const stopPrice = safeNumber(item.stopPrice);
      const closePrice = safeNumber(item.exitPrice); // Assuming exitPrice is the Close price
      const lotSize = safeNumber(item.lotSize);
      const tradeStatus = typeof item.trade === 'string' ? item.trade.trim() : "-";

      // --- Calculate Profit/Loss based on new rules --- 
      let calculatedProfitLoss = 0;
      if (tradeStatus !== '-') { // Only calculate profit if a trade occurred
        if (stopTrigger === "Executed") {
          // Rule: Stop Trigger == "Executed"
          if (operationType === 'buy') {
            calculatedProfitLoss = (stopPrice - actualPrice) * lotSize;
          } else { // 'sell' operation
            calculatedProfitLoss = (actualPrice - stopPrice) * lotSize;
          }
        } else if (stopTrigger === "-") {
          // Rule: Stop Trigger == "-"
          if (operationType === 'buy') {
            calculatedProfitLoss = (closePrice - actualPrice) * lotSize;
          } else { // 'sell' operation
            calculatedProfitLoss = (actualPrice - closePrice) * lotSize;
          }
        } else {
           // Fallback or handle other stopTrigger cases if necessary
           // For now, default to 0 if stopTrigger is neither 'Executed' nor '-'
           calculatedProfitLoss = 0; 
        }
      }
      // Assign the calculated profit/loss back to the item
      item.profitLoss = calculatedProfitLoss; 
      // --- End of Profit/Loss Calculation ---

      // --- Calculate Current Capital using the *new* profitLoss ---
      if (index === 0) {
        // First day (oldest)
        let firstDayCapital = initialCapital;
        if (tradeStatus === "-") {
          firstDayCapital = initialCapital;
        } else if (isDaytrade && tradeStatus === "Executed") {
          firstDayCapital = initialCapital + item.profitLoss; // Use calculated profitLoss
        } else if (isWeeklyMonthlyAnnual && ["Buy", "Sell"].includes(tradeStatus)) {
          firstDayCapital = initialCapital + item.profitLoss; // Use calculated profitLoss
        } else {
          firstDayCapital = initialCapital;
        }
        item.currentCapital = firstDayCapital;
      } else {
        // Subsequent days
        const previousDayCapital = safeNumber(dateOrdered[index - 1].currentCapital);
        // Use calculated profitLoss for the current day
        item.currentCapital = previousDayCapital + item.profitLoss; 
      }
      // --- End of Current Capital Calculation ---
    });

    // 3. Sort the data based on user's current selection (sortField, sortDirection)
    const finalSorted = [...dateOrdered].sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];

      if (sortField === "date") {
        const dateA = new Date(valA as string);
        const dateB = new Date(valB as string);
        return sortDirection === "asc" ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
      }

      let numA = NaN;
      let numB = NaN;

      if (typeof valA === 'number') numA = valA;
      else if (valA !== null && valA !== undefined) numA = parseFloat(String(valA));
      
      if (typeof valB === 'number') numB = valB;
      else if (valB !== null && valB !== undefined) numB = parseFloat(String(valB));

      if (!isNaN(numA) && !isNaN(numB)) {
        return sortDirection === "asc" ? numA - numB : numB - numA;
      }

      const strA = String(valA ?? '').toLowerCase();
      const strB = String(valB ?? '').toLowerCase();
      if (strA < strB) return sortDirection === "asc" ? -1 : 1;
      if (strA > strB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    
    return finalSorted;
  }, [result.tradeHistory, initialCapital, params.interval, params.operation, sortField, sortDirection]); 

  // Capital evolution data (assuming it's calculated correctly elsewhere or uses the processed data)
  const filteredCapitalEvolution = useMemo(() => {
      if (!processedData || processedData.length === 0) return [];
      // Assuming processedData is already sorted chronologically ASC for chart
      const chronologicalData = [...processedData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return chronologicalData.map(item => ({
          date: item.date,
          capital: safeNumber(item.currentCapital)
      }));
  }, [processedData]);

  // Calculate pagination
  const totalItems = processedData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const currentData = processedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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
      setSortDirection("desc");
    }
    setCurrentPage(1);
  };

  // Handle update button click
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

  // Generate pagination links
  const paginationLinks = () => {
    const links = [];
    const maxDisplayLinks = isMobile ? 3 : 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxDisplayLinks / 2));
    const endPage = Math.min(totalPages, startPage + maxDisplayLinks - 1);
    startPage = Math.max(1, endPage - maxDisplayLinks + 1);
    for (let i = startPage; i <= endPage; i++) {
      links.push(
        <PaginationItem key={i}>
          <PaginationLink href="#" isActive={i === currentPage} onClick={(e) => {e.preventDefault(); handlePageChange(i);}}>
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }
    return links;
  };

  // Format currency function
  const formatCurrency = (amount: number | undefined | null): string => {
    if (amount === undefined || amount === null || isNaN(Number(amount))) return "-";
    return new Intl.NumberFormat('en-US', { // ou 'pt-BR'
      style: 'currency',
      currency: 'USD', // TODO: Dinâmico?
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(amount));
  };

  // Format percentage function
  const formatPercentageDisplay = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(Number(value))) return "-";
    return `${Number(value).toFixed(2)}%`;
  };

  // Format date function
  const formatDate = (dateString: string | undefined | null): string => {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString + 'T00:00:00');
      if (isNaN(date.getTime())) return dateString;
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch (e) {
      return dateString;
    }
  };
  
  // Format trade status
  const formatTradeStatus = (status: string | undefined | null): string => {
    if (status === undefined || status === null) return "-";
    const trimmedStatus = String(status).trim();
    return trimmedStatus === "Not Executed" ? "-" : trimmedStatus || "-";
  };

  // Format mixed values (numbers or '-')
  const formatMixedValue = (value: string | number | undefined | null): string => {
    if (value === undefined || value === null || String(value).trim() === "-" || String(value).trim() === "") return "-";
    const numValue = Number(value);
    if (!isNaN(numValue)) {
      return numValue.toLocaleString('en-US', { // ou 'pt-BR'
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
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
          <p className="text-sm font-medium text-primary">Capital: {formatCurrency(data.capital)}</p>
        </div>
      );
    }
    return null;
  };

  // Input validation/handling for percentages in setup panel
  const handlePercentageInput = (value: string, setter: (val: number | null | string) => void) => {
    if (value === "") {
      setter(null);
      return;
    }
    const regex = /^(?:\d+)?(?:\.\d{0,2})?$/;
    if (regex.test(value)) {
      if (value === '.' || value.endsWith('.')) {
        setter(value); // Keep as string temporarily
      } else {
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue >= 0) {
          setter(numValue);
        }
      }
    } else if (value === '-') {
      // Prevent negative input
    }
  };

  // Input validation/handling for capital in setup panel
  const handleCapitalInput = (value: string) => {
    if (value === "") {
      setInitialCapital(null);
      return;
    }
    const regex = /^(?:\d+)?(?:\.\d{0,2})?$/;
    if (regex.test(value)) {
      if (value === '.' || value.endsWith('.')) {
        setInitialCapital(value as any); // Keep as string temporarily
      } else {
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue >= 0) {
          setInitialCapital(numValue);
        }
      }
    } else if (value === '-') {
       // Prevent negative input
    }
  };

  // Format value on blur for percentage and capital inputs
  const handleBlurFormatting = (currentValue: string | number | null, setter: (val: number | null) => void) => {
    let numValue = 0;
    if (typeof currentValue === 'string') {
      numValue = parseFloat(currentValue) || 0;
    } else if (typeof currentValue === 'number') {
      numValue = currentValue;
    }
    const formattedValue = Math.max(0, parseFloat(numValue.toFixed(2)));
    setter(formattedValue);
  };
  
  const hasData = processedData.length > 0;
  
  if (!hasData && !isLoading) {
    return (
      <Alert className="mt-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>No data available</AlertTitle>
        <AlertDescription>
          No trade history data is available for the selected stock with the current parameters. 
          Try selecting a different time period, asset, or adjusting setup parameters.
        </AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className="w-full flex flex-col gap-6">
      {/* Top Section: Chart and Setup Panel */}
      <div className={`grid grid-cols-1 ${isMobile ? 'gap-6' : 'md:grid-cols-4 gap-4'}`}>
        {/* Capital Evolution Chart */}
        <div className={`${isMobile ? 'order-2' : 'md:col-span-3'} bg-card rounded-lg border p-4`} style={{ height: isMobile ? 'auto' : `${chartHeight}px` }}>
          <h3 className="text-base md:text-lg font-medium mb-4">Capital Evolution</h3>
          <div className={isMobile ? 'h-[300px]' : 'h-[calc(100%-40px)]'}>
            <ResponsiveContainer width="100%" height="100%">
              {filteredCapitalEvolution.length > 0 ? (
                <LineChart data={filteredCapitalEvolution} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="capitalColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={date => formatDate(date)}
                    stroke="hsl(var(--muted-foreground))"
                    axisLine={false}
                    tickLine={false}
                    padding={{ left: 10, right: 10 }}
                    fontSize={12}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: isMobile ? 10 : 12 }}
                  />
                  <YAxis 
                    tickFormatter={value => formatCurrency(value)}
                    stroke="hsl(var(--muted-foreground))"
                    axisLine={false}
                    tickLine={false}
                    fontSize={12}
                    width={isMobile ? 70 : 80}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: isMobile ? 10 : 12 }}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}/>
                  <Line 
                    type="monotone" 
                    dataKey="capital" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2} 
                    dot={false}
                    activeDot={{ r: 6, strokeWidth: 2, fill: 'hsl(var(--background))', stroke: 'hsl(var(--primary))' }}
                    fillOpacity={1}
                    fill="url(#capitalColor)"
                  />
                </LineChart>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No capital evolution data available.
                </div>
              )}
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Stock Setup Panel */}
        <div ref={setupPanelRef} className={`${isMobile ? 'order-1' : 'md:col-span-1'} bg-card rounded-lg border p-4`}>
          <h3 className="text-base md:text-lg font-medium mb-4">Stock Setup</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="refPriceSelect" className="block text-sm font-medium mb-1 text-muted-foreground">Reference Price</label>
              <Select value={refPrice} onValueChange={value => setRefPrice(value as "open" | "high" | "low" | "close")} disabled={isLoading}>
                <SelectTrigger id="refPriceSelect">
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
              <label htmlFor="entryPercentageInput" className="block text-sm font-medium mb-1 text-muted-foreground">Entry Price (%)</label>
              <div className="flex items-center">
                <Input 
                  id="entryPercentageInput"
                  type="text" 
                  inputMode="decimal"
                  value={entryPercentage !== null && entryPercentage !== undefined ? String(entryPercentage) : ""} 
                  onChange={e => handlePercentageInput(e.target.value, setEntryPercentage)}
                  onBlur={() => handleBlurFormatting(entryPercentage, (val) => setEntryPercentage(val))}
                  disabled={isLoading} 
                  className="flex-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="e.g. 1.50"
                  min="0"
                />
                <span className="ml-2 text-muted-foreground">%</span>
              </div>
            </div>
            
            <div>
              <label htmlFor="stopPercentageInput" className="block text-sm font-medium mb-1 text-muted-foreground">Stop Price (%)</label>
              <div className="flex items-center">
                <Input 
                  id="stopPercentageInput"
                  type="text" 
                  inputMode="decimal"
                  value={stopPercentage !== null && stopPercentage !== undefined ? String(stopPercentage) : ""} 
                  onChange={e => handlePercentageInput(e.target.value, setStopPercentage)}
                  onBlur={() => handleBlurFormatting(stopPercentage, (val) => setStopPercentage(val))}
                  disabled={isLoading} 
                  className="flex-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="e.g. 2.00"
                  min="0"
                />
                <span className="ml-2 text-muted-foreground">%</span>
              </div>
            </div>
            
            <div>
              <label htmlFor="initialCapitalInput" className="block text-sm font-medium mb-1 text-muted-foreground">Initial Capital ($)</label>
              <Input 
                id="initialCapitalInput"
                type="text" 
                inputMode="decimal"
                value={initialCapital !== null && initialCapital !== undefined ? String(initialCapital) : ""} 
                onChange={e => handleCapitalInput(e.target.value)}
                onBlur={() => handleBlurFormatting(initialCapital, (val) => setInitialCapital(val))}
                disabled={isLoading}
                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="e.g. 10000.00"
                min="0"
              />
            </div>
            
            <Button onClick={handleUpdateResults} className="w-full" disabled={isLoading}>
              {isLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...</>
              ) : 'Update Results'}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Stock Details Table */}
      <div className="bg-card rounded-lg border overflow-hidden">
        {/* Apply overflow-x-auto to this container */}
        <div className="overflow-x-auto relative">
          <Table className="min-w-full"> {/* Ensure table takes minimum full width if needed */}
            <TableHeader className="sticky top-0 bg-card z-20">
              <TableRow>
                {/* Cabeçalhos da Tabela - Aplicando flex-col e text-center onde necessário */} 
                <TableHead className="cursor-pointer text-center whitespace-nowrap sticky left-0 bg-inherit z-10 min-w-[100px] px-2 py-3" onClick={() => handleSortChange("date")}>
                  <div className="flex items-center justify-center">Date {getSortIcon("date")}</div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap min-w-[100px] px-2 py-3" onClick={() => handleSortChange("entryPrice")}>
                  <div className="flex items-center justify-center">Open {getSortIcon("entryPrice")}</div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap min-w-[100px] px-2 py-3" onClick={() => handleSortChange("high")}>
                  <div className="flex items-center justify-center">High {getSortIcon("high")}</div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap min-w-[100px] px-2 py-3" onClick={() => handleSortChange("low")}>
                  <div className="flex items-center justify-center">Low {getSortIcon("low")}</div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap min-w-[100px] px-2 py-3" onClick={() => handleSortChange("exitPrice")}>
                  <div className="flex items-center justify-center">Close {getSortIcon("exitPrice")}</div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap min-w-[120px] px-2 py-3" onClick={() => handleSortChange("volume")}>
                  <div className="flex items-center justify-center">Volume {getSortIcon("volume")}</div>
                </TableHead>
                {/* Cabeçalhos com quebra de linha */} 
                <TableHead className="cursor-pointer text-center whitespace-nowrap min-w-[120px] px-2 py-3" onClick={() => handleSortChange("suggestedEntryPrice")}>
                  <div className="flex flex-col items-center justify-center"><span>Suggested</span><span>Entry {getSortIcon("suggestedEntryPrice")}</span></div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap min-w-[120px] px-2 py-3" onClick={() => handleSortChange("actualPrice")}>
                  <div className="flex flex-col items-center justify-center"><span>Actual</span><span>Price {getSortIcon("actualPrice")}</span></div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap min-w-[100px] px-2 py-3" onClick={() => handleSortChange("trade")}>
                  <div className="flex items-center justify-center">Trade {getSortIcon("trade")}</div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap min-w-[100px] px-2 py-3" onClick={() => handleSortChange("lotSize")}>
                  <div className="flex flex-col items-center justify-center"><span>Lot</span><span>Size {getSortIcon("lotSize")}</span></div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap min-w-[120px] px-2 py-3" onClick={() => handleSortChange("stopPrice")}>
                  <div className="flex flex-col items-center justify-center"><span>Stop</span><span>Price {getSortIcon("stopPrice")}</span></div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap min-w-[120px] px-2 py-3" onClick={() => handleSortChange("profitLoss")}>
                   <div className="flex flex-col items-center justify-center"><span>Profit/</span><span>Loss {getSortIcon("profitLoss")}</span></div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap min-w-[150px] px-2 py-3" onClick={() => handleSortChange("currentCapital")}>
                  <div className="flex flex-col items-center justify-center"><span>Current</span><span>Capital {getSortIcon("currentCapital")}</span></div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                 <TableRow>
                  <TableCell colSpan={13} className="text-center py-6 text-muted-foreground h-40">
                    <div className="flex justify-center items-center"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading data...</div>
                  </TableCell>
                </TableRow>
              ) : currentData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-center py-6 text-muted-foreground h-40">
                    No data to display for the current page.
                  </TableCell>
                </TableRow>
              ) : (
                currentData.map((item, index) => (
                  <TableRow 
                    key={`${item.date}-${index}`} 
                    className={`hover:bg-muted/50 ${formatTradeStatus(item.trade) === "Buy" ? "bg-green-50 dark:bg-green-950/20" : formatTradeStatus(item.trade) === "Sell" ? "bg-red-50 dark:bg-red-950/20" : ""}`}
                  >
                    {/* Células da Tabela */} 
                    <TableCell className="text-center whitespace-nowrap sticky left-0 bg-inherit z-10 px-2 py-2">
                      {formatDate(item.date)}
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap px-2 py-2">{formatMixedValue(item.entryPrice)}</TableCell>
                    <TableCell className="text-center whitespace-nowrap px-2 py-2">{formatMixedValue(item.high)}</TableCell>
                    <TableCell className="text-center whitespace-nowrap px-2 py-2">{formatMixedValue(item.low)}</TableCell>
                    <TableCell className="text-center whitespace-nowrap px-2 py-2">{formatMixedValue(item.exitPrice)}</TableCell>
                    <TableCell className="text-center whitespace-nowrap px-2 py-2">{item.volume ? safeNumber(item.volume).toLocaleString('en-US') : "-"}</TableCell>
                    <TableCell className="text-center whitespace-nowrap px-2 py-2">{formatMixedValue(item.suggestedEntryPrice)}</TableCell>
                    <TableCell className="text-center whitespace-nowrap px-2 py-2">{formatMixedValue(item.actualPrice)}</TableCell>
                    <TableCell className={`text-center font-medium whitespace-nowrap px-2 py-2 ${formatTradeStatus(item.trade) === "Buy" ? "text-green-600 dark:text-green-400" : formatTradeStatus(item.trade) === "Sell" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                      {formatTradeStatus(item.trade)}
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap px-2 py-2">{item.lotSize ? safeNumber(item.lotSize).toLocaleString('en-US') : "-"}</TableCell>
                    <TableCell className="text-center whitespace-nowrap px-2 py-2">{formatMixedValue(item.stopPrice)}</TableCell>
                    <TableCell className={`text-center font-medium whitespace-nowrap px-2 py-2 ${(safeNumber(item.profitLoss) || 0) > 0 ? "text-green-600 dark:text-green-400" : (safeNumber(item.profitLoss) || 0) < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                      {formatCurrency(item.profitLoss)} 
                    </TableCell>
                    <TableCell className="text-center font-medium whitespace-nowrap px-2 py-2">
                      {formatCurrency(item.currentCapital)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination */} 
        { totalPages > 1 && (
          <div className="flex flex-col sm:flex-row justify-between items-center p-4 border-t bg-card sticky bottom-0 z-20">
            <div className="flex items-center gap-2 mb-4 sm:mb-0">
              <span className="text-sm text-muted-foreground">Rows per page:</span>
              <select
                className="bg-background border rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    href="#"
                    onClick={(e) => {e.preventDefault(); handlePageChange(currentPage - 1);}}
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    aria-disabled={currentPage === 1}
                  />
                </PaginationItem>
                {paginationLinks()}
                <PaginationItem>
                  <PaginationNext 
                    href="#"
                    onClick={(e) => {e.preventDefault(); handlePageChange(currentPage + 1);}}
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    aria-disabled={currentPage === totalPages}
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

