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
  params: StockAnalysisParams & { interval?: string }; // Adicionando 'interval' opcional aos params para clareza
  onUpdateParams: (params: StockAnalysisParams) => void;
  isLoading?: boolean;
}

export function StockDetailsTable({
  result,
  params,
  onUpdateParams,
  isLoading = false
}: StockDetailsTableProps) {

  // Sanitize data on result change
  useEffect(() => {
    if (result?.tradeHistory) {
      result.tradeHistory.forEach(item => {
        // Garante que profitLoss seja número, default 0
        item.profitLoss = Number(item.profitLoss) || 0;
        // Garante que currentCapital seja número ou null/undefined inicialmente
        item.currentCapital = item.currentCapital !== undefined && item.currentCapital !== null ? Number(item.currentCapital) : undefined;
        // Garante que trade seja string, default "-"
        item.trade = typeof item.trade === 'string' ? item.trade.trim() || "-" : "-";
      });
    }
  }, [result]);
  
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

    // Timeout para garantir que o painel tenha renderizado
    const timer = setTimeout(updateHeight, 100);
    window.addEventListener('resize', updateHeight);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  // Data is already filtered at the API level, no need to filter again
  const filteredTradeHistory = result.tradeHistory || [];

  // Calculate sorted data and Current Capital
  const processedData = useMemo(() => {
    if (filteredTradeHistory.length === 0 || initialCapital === null) return [];
    
    // 1. Sort by date ascending to process capital calculations chronologically
    const dateOrdered = [...filteredTradeHistory].sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA.getTime() - dateB.getTime();
    });
    
    // 2. Process Current Capital values based on the rules
    // ** IMPORTANTE: A lógica abaixo assume que 'params.interval' contém "Daytrade", "Weekly", "Monthly" ou "Annual". **
    // ** Verifique se este é o parâmetro correto que define o intervalo/estratégia. **
    const analysisInterval = params.interval || "Daytrade"; // Default para Daytrade se não especificado
    const isDaytrade = analysisInterval === "Daytrade";
    const isWeeklyMonthlyAnnual = ["Weekly", "Monthly", "Annual"].includes(analysisInterval);

    dateOrdered.forEach((item, index) => {
      const currentProfitLoss = Number(item.profitLoss) || 0;
      const tradeStatus = typeof item.trade === 'string' ? item.trade.trim() : "-";

      if (index === 0) {
        // Primeiro dia (mais antigo)
        let firstDayCapital = initialCapital;
        if (tradeStatus === "-") {
          // Regra 1: Se Trade é "-", Capital = Initial Capital
          firstDayCapital = initialCapital;
        } else if (isDaytrade && tradeStatus === "Executed") {
          // Regra 1: Intervalo Daytrade e Trade é "Executed"
          firstDayCapital = initialCapital + currentProfitLoss;
        } else if (isWeeklyMonthlyAnnual && ["Buy", "Sell"].includes(tradeStatus)) {
          // Regra 1: Intervalo Weekly/Monthly/Annual e Trade é "Buy" ou "Sell"
          firstDayCapital = initialCapital + currentProfitLoss;
        } else {
          // Fallback (nenhuma das condições de soma/subtração atendida)
          firstDayCapital = initialCapital;
        }
        item.currentCapital = firstDayCapital;
      } else {
        // Dias subsequentes
        const previousDayCapital = dateOrdered[index - 1].currentCapital;
        // Regra 2: Capital Atual = Capital Dia Anterior + Lucro/Perda Dia Atual
        // Garante que previousDayCapital é um número antes de somar
        item.currentCapital = (Number(previousDayCapital) || initialCapital) + currentProfitLoss;
      }
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

      // Tratamento para outros campos (assumindo que podem ser numéricos ou strings)
      let numA = NaN;
      let numB = NaN;

      if (typeof valA === 'number') numA = valA;
      else if (typeof valA === 'string') numA = parseFloat(valA);
      
      if (typeof valB === 'number') numB = valB;
      else if (typeof valB === 'string') numB = parseFloat(valB);

      // Se ambos são números válidos, compara numericamente
      if (!isNaN(numA) && !isNaN(numB)) {
        return sortDirection === "asc" ? numA - numB : numB - numA;
      }

      // Fallback para comparação de strings se não forem números comparáveis
      const strA = String(valA ?? '').toLowerCase();
      const strB = String(valB ?? '').toLowerCase();
      if (strA < strB) return sortDirection === "asc" ? -1 : 1;
      if (strA > strB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    
    return finalSorted;
  // Adiciona params.interval às dependências se ele for usado
  }, [filteredTradeHistory, sortField, sortDirection, initialCapital, params.interval]); 

  // Capital evolution data is already filtered at the API level
  const filteredCapitalEvolution = result.capitalEvolution || [];

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
      setSortDirection("desc"); // Default to descending when changing fields
    }
    setCurrentPage(1); // Reset page when sorting changes
  };

  // Handle update button click
  const handleUpdateResults = () => {
    // Garante que os valores sejam números antes de enviar
    const cleanParams = {
      ...params,
      referencePrice: refPrice,
      entryPercentage: Number(entryPercentage?.toFixed(2)) || 0,
      stopPercentage: Number(stopPercentage?.toFixed(2)) || 0,
      initialCapital: Number(initialCapital?.toFixed(2)) || 0
    };
    // Remove a propriedade 'interval' se ela foi adicionada apenas para o cálculo interno
    // delete cleanParams.interval; 
    onUpdateParams(cleanParams);
  };

  // Generate pagination links
  const paginationLinks = () => {
    const links = [];
    const maxDisplayLinks = isMobile ? 3 : 5;

    let startPage = Math.max(1, currentPage - Math.floor(maxDisplayLinks / 2));
    const endPage = Math.min(totalPages, startPage + maxDisplayLinks - 1);

    // Adjust startPage if needed to ensure we show maxDisplayLinks if possible
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
    if (amount === undefined || amount === null) return "-";
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD', // TODO: Considerar a moeda dinamicamente se necessário
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Format percentage function (usado nos cabeçalhos ou onde for preciso exibir %)
  const formatPercentageDisplay = (value: number | undefined | null): string => {
    if (value === undefined || value === null) return "-";
    return `${value.toFixed(2)}%`;
  };

  // Format date function
  const formatDate = (dateString: string | undefined | null): string => {
    if (!dateString) return "-";
    try {
      // Tenta criar data, pode ser YYYY-MM-DD ou outro formato ISO
      const date = new Date(dateString + 'T00:00:00'); // Adiciona T00:00:00 para evitar problemas de fuso horário
      if (isNaN(date.getTime())) return dateString; // Retorna original se inválida
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch (e) {
      return dateString; // Retorna original em caso de erro
    }
  };
  
  // Format trade status - Garante que seja string e faz trim
  const formatTradeStatus = (status: string | undefined | null): string => {
    if (status === undefined || status === null) return "-";
    const trimmedStatus = String(status).trim();
    return trimmedStatus === "Not Executed" ? "-" : trimmedStatus || "-";
  };

  // Format values that might be numbers or strings like "-"
  const formatMixedValue = (value: string | number | undefined | null): string => {
    if (value === undefined || value === null || String(value).trim() === "-" || String(value).trim() === "") return "-";
    
    const numValue = Number(value);
    if (!isNaN(numValue)) {
      return numValue.toLocaleString('en-US', { // Usar 'pt-BR' se preferir formato brasileiro
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
    // Se não for número nem "-", retorna como string
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
          {/* Usa a formatação de moeda para o tooltip também */}
          <p className="text-sm font-medium text-alphaquant-500">Capital: {formatCurrency(data.capital)}</p>
        </div>
      );
    }
    return null;
  };

  // Input validation/handling for percentages in setup panel
  const handlePercentageInput = (value: string, setter: (val: number | null) => void) => {
    if (value === "") {
      setter(null);
      return;
    }
    // Regex para permitir números positivos com até 2 casas decimais
    const regex = /^(?:\d+)?(?:\.\d{0,2})?$/;
    if (regex.test(value)) {
      // Permite digitar '.' ou '0.' sem converter imediatamente
      if (value === '.' || value.endsWith('.')) {
        setter(value as any); // Mantém como string temporariamente
      } else {
        const numValue = parseFloat(value);
        // Valida se é número positivo (poderia adicionar max 100 se fizesse sentido)
        if (!isNaN(numValue) && numValue >= 0) {
          setter(numValue);
        }
      }
    } else if (value === '-') {
      // Impede digitar negativo
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
        setInitialCapital(value as any);
      } else {
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue >= 0) {
          setInitialCapital(numValue);
        }
      }
    } else if (value === '-') {
      // Impede digitar negativo
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
    
    // Garante que seja positivo e formata para 2 casas decimais
    const formattedValue = Math.max(0, parseFloat(numValue.toFixed(2)));
    setter(formattedValue);
  };
  
  // Check if we have any data to display
  const hasData = processedData.length > 0;
  
  // Show a message if no data is available for the selected period
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
      <div className={`grid grid-cols-1 ${isMobile ? 'gap-6' : 'md:grid-cols-4 gap-4'}`}>
        {/* Capital Evolution Chart (3/4 width) */}
        <div className={`${isMobile ? 'order-2' : 'md:col-span-3'} bg-card rounded-lg border p-4`} style={{ height: isMobile ? 'auto' : `${chartHeight}px` }}>
          <h3 className="text-base md:text-lg font-medium mb-4">Capital Evolution</h3>
          <div className={isMobile ? 'h-[300px]' : 'h-[calc(100%-40px)]'}>
            <ResponsiveContainer width="100%" height="100%">
              {/* Adiciona verificação se filteredCapitalEvolution tem dados */} 
              {filteredCapitalEvolution.length > 0 ? (
                <LineChart data={filteredCapitalEvolution} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="capitalColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={date => formatDate(date)} // Usa a função formatDate
                    stroke="#64748b"
                    axisLine={false}
                    tickLine={false}
                    padding={{ left: 10, right: 10 }}
                    fontSize={12}
                    tick={{ fontSize: isMobile ? 10 : 12 }}
                  />
                  <YAxis 
                    tickFormatter={value => formatCurrency(value)} // Usa formatCurrency
                    stroke="#64748b"
                    axisLine={false}
                    tickLine={false}
                    fontSize={12}
                    width={isMobile ? 70 : 80} // Aumenta um pouco a largura para caber a formatação
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
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No capital evolution data available.
                </div>
              )}
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Stock Setup Panel (1/4 width) */}
        <div ref={setupPanelRef} className={`${isMobile ? 'order-1' : 'md:col-span-1'} bg-card rounded-lg border p-4`}>
          <h3 className="text-base md:text-lg font-medium mb-4">Stock Setup</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="refPriceSelect" className="block text-sm font-medium mb-1">Reference Price</label>
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
              <label htmlFor="entryPercentageInput" className="block text-sm font-medium mb-1">Entry Price (%)</label>
              <div className="flex items-center">
                <Input 
                  id="entryPercentageInput"
                  type="text" 
                  inputMode="decimal"
                  value={entryPercentage !== null && entryPercentage !== undefined ? String(entryPercentage) : ""} 
                  onChange={e => handlePercentageInput(e.target.value, setEntryPercentage)}
                  onBlur={() => handleBlurFormatting(entryPercentage, setEntryPercentage)}
                  disabled={isLoading} 
                  className="flex-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="e.g. 1.50"
                  min="0"
                />
                <span className="ml-2 text-muted-foreground">%</span>
              </div>
            </div>
            
            <div>
              <label htmlFor="stopPercentageInput" className="block text-sm font-medium mb-1">Stop Price (%)</label>
              <div className="flex items-center">
                <Input 
                  id="stopPercentageInput"
                  type="text" 
                  inputMode="decimal"
                  value={stopPercentage !== null && stopPercentage !== undefined ? String(stopPercentage) : ""} 
                  onChange={e => handlePercentageInput(e.target.value, setStopPercentage)}
                  onBlur={() => handleBlurFormatting(stopPercentage, setStopPercentage)}
                  disabled={isLoading} 
                  className="flex-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="e.g. 2.00"
                  min="0"
                />
                <span className="ml-2 text-muted-foreground">%</span>
              </div>
            </div>
            
            <div>
              <label htmlFor="initialCapitalInput" className="block text-sm font-medium mb-1">Initial Capital ($)</label>
              <Input 
                id="initialCapitalInput"
                type="text" 
                inputMode="decimal"
                value={initialCapital !== null && initialCapital !== undefined ? String(initialCapital) : ""} 
                onChange={e => handleCapitalInput(e.target.value)}
                onBlur={() => handleBlurFormatting(initialCapital, setInitialCapital)}
                disabled={isLoading}
                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="e.g. 10000.00"
                min="0"
              />
            </div>
            
            <Button onClick={handleUpdateResults} className="w-full" disabled={isLoading}>
              {isLoading ? 'Updating...' : 'Update Results'}
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
                {/* Cabeçalhos da Tabela - Adiciona whitespace-nowrap onde necessário */} 
                <TableHead className="cursor-pointer text-center whitespace-nowrap sticky left-0 bg-card z-10" onClick={() => handleSortChange("date")}>
                  <div className="flex items-center justify-center">
                    Date {getSortIcon("date")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap" onClick={() => handleSortChange("entryPrice")}>
                  <div className="flex items-center justify-center">
                    Open {getSortIcon("entryPrice")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap" onClick={() => handleSortChange("high")}>
                  <div className="flex items-center justify-center">
                    High {getSortIcon("high")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap" onClick={() => handleSortChange("low")}>
                  <div className="flex items-center justify-center">
                    Low {getSortIcon("low")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap" onClick={() => handleSortChange("exitPrice")}>
                  <div className="flex items-center justify-center">
                    Close {getSortIcon("exitPrice")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap" onClick={() => handleSortChange("volume")}>
                  <div className="flex items-center justify-center">
                    Volume {getSortIcon("volume")}
                  </div>
                </TableHead>
                {/* Ajuste nos cabeçalhos com duas linhas para melhor leitura */}
                <TableHead className="cursor-pointer text-center whitespace-nowrap" onClick={() => handleSortChange("suggestedEntryPrice")}>
                  <div className="flex flex-col items-center justify-center">
                    <span>Suggested</span>
                    <span>Entry {getSortIcon("suggestedEntryPrice")}</span>
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap" onClick={() => handleSortChange("actualPrice")}>
                  <div className="flex flex-col items-center justify-center">
                    <span>Actual</span>
                    <span>Price {getSortIcon("actualPrice")}</span>
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap" onClick={() => handleSortChange("trade")}>
                  <div className="flex items-center justify-center">
                    Trade {getSortIcon("trade")}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap" onClick={() => handleSortChange("lotSize")}>
                  <div className="flex flex-col items-center justify-center">
                    <span>Lot</span>
                    <span>Size {getSortIcon("lotSize")}</span>
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap" onClick={() => handleSortChange("stopPrice")}>
                  <div className="flex flex-col items-center justify-center">
                    <span>Stop</span>
                    <span>Price {getSortIcon("stopPrice")}</span>
                  </div>
                </TableHead>
                {/* Renomeado para Profit/Loss e ajustado */} 
                <TableHead className="cursor-pointer text-center whitespace-nowrap" onClick={() => handleSortChange("profitLoss")}>
                   <div className="flex flex-col items-center justify-center">
                    <span>Profit/</span>
                    <span>Loss {getSortIcon("profitLoss")}</span>
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer text-center whitespace-nowrap" onClick={() => handleSortChange("currentCapital")}>
                  <div className="flex flex-col items-center justify-center">
                    <span>Current</span>
                    <span>Capital {getSortIcon("currentCapital")}</span>
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentData.length === 0 && !isLoading ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-center py-6 text-muted-foreground">
                    No data to display for the current page.
                  </TableCell>
                </TableRow>
              ) : isLoading ? (
                 <TableRow>
                  <TableCell colSpan={13} className="text-center py-6 text-muted-foreground">
                    Loading data...
                  </TableCell>
                </TableRow>
              ) : (
                currentData.map((item, index) => (
                  <TableRow key={`${item.date}-${index}`} className={formatTradeStatus(item.trade) === "Buy" ? "bg-green-50 dark:bg-green-950/20 hover:bg-green-100 dark:hover:bg-green-900/30" : formatTradeStatus(item.trade) === "Sell" ? "bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-900/30" : "hover:bg-muted/50"}>
                    {/* Células da Tabela - Adiciona sticky left na data */} 
                    <TableCell className="text-center whitespace-nowrap sticky left-0 bg-inherit z-10">
                      {formatDate(item.date)}
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      {formatMixedValue(item.entryPrice)} 
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      {formatMixedValue(item.high)}
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      {formatMixedValue(item.low)}
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      {formatMixedValue(item.exitPrice)}
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      {item.volume ? item.volume.toLocaleString('en-US') : "-"} 
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      {formatMixedValue(item.suggestedEntryPrice)}
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      {formatMixedValue(item.actualPrice)}
                    </TableCell>
                    <TableCell className={`text-center font-medium whitespace-nowrap ${
                      formatTradeStatus(item.trade) === "Buy" 
                        ? "text-green-600 dark:text-green-400" 
                        : formatTradeStatus(item.trade) === "Sell" 
                          ? "text-red-600 dark:text-red-400" 
                          : "text-muted-foreground"
                    }`}>
                      {formatTradeStatus(item.trade)}
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      {item.lotSize ? Number(item.lotSize).toLocaleString('en-US') : "-"} 
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      {formatMixedValue(item.stopPrice)}
                    </TableCell>
                    {/* Usa profitLoss e formatação de moeda */} 
                    <TableCell className={`text-center font-medium whitespace-nowrap ${
                      (Number(item.profitLoss) || 0) > 0 
                        ? "text-green-600 dark:text-green-400" 
                        : (Number(item.profitLoss) || 0) < 0 
                          ? "text-red-600 dark:text-red-400" 
                          : "text-muted-foreground"
                    }`}>
                      {formatCurrency(item.profitLoss)}
                    </TableCell>
                    {/* Usa currentCapital e formatação de moeda */} 
                    <TableCell className="text-center font-medium whitespace-nowrap">
                      {formatCurrency(item.currentCapital)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Fixed Pagination with Items Per Page Selector */}
        { totalPages > 1 && (
          <div className="flex flex-col sm:flex-row justify-between items-center p-4 border-t bg-card">
            <div className="flex items-center gap-2 mb-4 sm:mb-0">
              <span className="text-sm text-muted-foreground">Rows per page:</span>
              <select
                className="bg-card border rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
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
