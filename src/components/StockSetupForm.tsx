
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { StockAnalysisParams, StockInfo } from "@/types";
import { api } from "@/services/api";
import { toast } from "@/components/ui/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/contexts/SubscriptionContext";

interface StockSetupFormProps {
  onSubmit: (params: StockAnalysisParams) => void;
  isLoading?: boolean;
  initialParams?: StockAnalysisParams | null;
}

export function StockSetupForm({
  onSubmit,
  isLoading = false,
  initialParams = null
}: StockSetupFormProps) {
  // State for options loaded from Supabase
  const [countries, setCountries] = useState<string[]>([]);
  const [stockMarkets, setStockMarkets] = useState<string[]>([]);
  const [assetClasses, setAssetClasses] = useState<string[]>([]);
  const [availableAssets, setAvailableAssets] = useState<StockInfo[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [dataTableName, setDataTableName] = useState<string | null>(null);
  const [isTableValid, setIsTableValid] = useState<boolean | null>(null);
  const [loadingState, setLoadingState] = useState<{
    countries: boolean;
    stockMarkets: boolean;
    assetClasses: boolean;
    assets: boolean;
  }>({
    countries: false,
    stockMarkets: false,
    assetClasses: false,
    assets: false
  });

  // Estados para o autocomplete
  const [comparisonStockInput, setComparisonStockInput] = useState("");
  const [selectedStocks, setSelectedStocks] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isEntryPriceFocused, setIsEntryPriceFocused] = useState(false);
  const [isStopPriceFocused, setIsStopPriceFocused] = useState(false);

  // Form setup with react-hook-form
  const form = useForm<StockAnalysisParams>({
    defaultValues: initialParams || {
      operation: "buy",
      country: "",
      stockMarket: "",
      assetClass: "",
      referencePrice: "close",
      period: "1m",
      entryPercentage: 1.00,
      stopPercentage: 1.00,
      initialCapital: 10000.00,
      initialInvestment: 10000.00,
      stopLoss: 1.00,
      profitTarget: 1.00,
      riskFactor: 1.00,
      comparisonStocks: []
    }
  });

  // Load countries from API on component mount and reload dependent data if initial params exist
  useEffect(() => {
    async function loadCountries() {
      setLoadingState(prev => ({ ...prev, countries: true }));
      try {
        const fetchedCountries = await api.marketData.getCountries();
        if (fetchedCountries && fetchedCountries.length > 0) {
          setCountries(fetchedCountries);
          console.log("Loaded countries:", fetchedCountries);
          
          // If we have initial params, load dependent data
          if (initialParams?.country) {
            await loadDependentData();
          }
        } else {
          console.error("No countries returned from API");
          toast({
            variant: "destructive",
            title: "Failed to load countries",
            description: "No countries found in the database."
          });
        }
      } catch (error) {
        console.error("Error loading countries:", error);
        toast({
          variant: "destructive",
          title: "Failed to load countries",
          description: "There was an error loading the available countries."
        });
      } finally {
        setLoadingState(prev => ({ ...prev, countries: false }));
      }
    }

    async function loadDependentData() {
      if (!initialParams) return;
      
      // Load stock markets if country exists
      if (initialParams.country) {
        try {
          setLoadingState(prev => ({ ...prev, stockMarkets: true }));
          const fetchedMarkets = await api.marketData.getStockMarkets(initialParams.country);
          if (fetchedMarkets && fetchedMarkets.length > 0) {
            setStockMarkets(fetchedMarkets);
          }
        } catch (error) {
          console.error("Error loading stock markets for initial params:", error);
        } finally {
          setLoadingState(prev => ({ ...prev, stockMarkets: false }));
        }
      }
      
      // Load asset classes if stock market exists
      if (initialParams.country && initialParams.stockMarket) {
        try {
          setLoadingState(prev => ({ ...prev, assetClasses: true }));
          const fetchedAssetClasses = await api.marketData.getAssetClasses(initialParams.country, initialParams.stockMarket);
          if (fetchedAssetClasses && fetchedAssetClasses.length > 0) {
            setAssetClasses(fetchedAssetClasses);
          }
        } catch (error) {
          console.error("Error loading asset classes for initial params:", error);
        } finally {
          setLoadingState(prev => ({ ...prev, assetClasses: false }));
        }
      }
      
      // Load assets if all criteria exist
      if (initialParams.country && initialParams.stockMarket && initialParams.assetClass) {
        try {
          setLoadingState(prev => ({ ...prev, assets: true }));
          const tableName = await api.marketData.getDataTableName(initialParams.country, initialParams.stockMarket, initialParams.assetClass);
          if (tableName) {
            setDataTableName(tableName);
            const tableExists = await api.marketData.checkTableExists(tableName);
            if (tableExists) {
              const stocksData = await api.analysis.getAvailableStocks(tableName);
              setAvailableAssets(stocksData);
              setIsTableValid(true);
            } else {
              setIsTableValid(false);
            }
          }
        } catch (error) {
          console.error("Error loading assets for initial params:", error);
          setIsTableValid(false);
        } finally {
          setLoadingState(prev => ({ ...prev, assets: false }));
        }
      }
    }

    loadCountries();
  }, [initialParams]);

  // Load stock markets when country changes
  useEffect(() => {
    const country = form.watch("country");
    if (!country) {
      setStockMarkets([]);
      return;
    }
    
    async function loadStockMarkets() {
      setLoadingState(prev => ({ ...prev, stockMarkets: true }));
      try {
        const fetchedMarkets = await api.marketData.getStockMarkets(country);
        
        if (fetchedMarkets && fetchedMarkets.length > 0) {
          setStockMarkets(fetchedMarkets);
          console.log("Loaded stock markets:", fetchedMarkets);
        } else {
          console.error("No stock markets returned for country:", country);
          toast({
            variant: "destructive",
            title: "No stock markets found",
            description: `No stock markets found for ${country}.`
          });
        }

        // Only reset dependent fields if not loading initial params
        if (!initialParams || country !== initialParams.country) {
          form.setValue("stockMarket", "");
          form.setValue("assetClass", "");
          setDataTableName(null);
          setIsTableValid(null);
          setAssetClasses([]);
          setAvailableAssets([]);
        }
      } catch (error) {
        console.error("Error loading stock markets:", error);
        toast({
          variant: "destructive",
          title: "Failed to load stock markets",
          description: "There was an error loading the available stock markets."
        });
      } finally {
        setLoadingState(prev => ({ ...prev, stockMarkets: false }));
      }
    }
    loadStockMarkets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.watch("country")]);

  // Load asset classes when stock market changes
  useEffect(() => {
    const country = form.watch("country");
    const stockMarket = form.watch("stockMarket");
    if (!country || !stockMarket) {
      setAssetClasses([]);
      return;
    }
    
    async function loadAssetClasses() {
      setLoadingState(prev => ({ ...prev, assetClasses: true }));
      try {
        const fetchedAssetClasses = await api.marketData.getAssetClasses(country, stockMarket);
        
        if (fetchedAssetClasses && fetchedAssetClasses.length > 0) {
          setAssetClasses(fetchedAssetClasses);
          console.log("Loaded asset classes:", fetchedAssetClasses);
        } else {
          console.error("No asset classes returned for:", country, stockMarket);
          toast({
            variant: "destructive",
            title: "No asset classes found",
            description: `No asset classes found for ${stockMarket} in ${country}.`
          });
        }

        // Only reset asset class if not loading initial params  
        if (!initialParams || stockMarket !== initialParams.stockMarket) {
          form.setValue("assetClass", "");
          setDataTableName(null);
          setIsTableValid(null);
          setAvailableAssets([]);
        }
      } catch (error) {
        console.error("Error loading asset classes:", error);
        toast({
          variant: "destructive",
          title: "Failed to load asset classes",
          description: "There was an error loading the available asset classes."
        });
      } finally {
        setLoadingState(prev => ({ ...prev, assetClasses: false }));
      }
    }
    loadAssetClasses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.watch("country"), form.watch("stockMarket")]);

  // Load assets when asset class changes
  useEffect(() => {
    const country = form.watch("country");
    const stockMarket = form.watch("stockMarket");
    const assetClass = form.watch("assetClass");
    if (!country || !stockMarket || !assetClass) {
      setAvailableAssets([]);
      return;
    }
    
    async function loadAssets() {
      setLoadingState(prev => ({ ...prev, assets: true }));
      try {
        // Get the data table name
        const tableName = await api.marketData.getDataTableName(country, stockMarket, assetClass);
        
        if (!tableName) {
          console.error("No data table found for the selected criteria");
          toast({
            variant: "destructive",
            title: "Data source not found",
            description: "No data source found for the selected criteria."
          });
          setDataTableName(null);
          setIsTableValid(false);
          setAvailableAssets([]);
          return;
        }
        
        // Save table name for later use
        setDataTableName(tableName);
        console.log(`Found data table: ${tableName}`);
        
        // Check if the table exists before trying to access it
        const tableExists = await api.marketData.checkTableExists(tableName);
        
        if (!tableExists) {
          console.error(`The table ${tableName} does not exist`);
          toast({
            variant: "destructive",
            title: "Table not found",
            description: `The data table ${tableName} does not exist in the database.`
          });
          setIsTableValid(false);
          setAvailableAssets([]);
          return;
        }
        
        try {
          // Fetch assets directly from the dynamic table
          const stocksData = await api.analysis.getAvailableStocks(tableName);
          setAvailableAssets(stocksData);
          setIsTableValid(true);
        } catch (stockError) {
          console.error(`Error accessing table ${tableName}:`, stockError);
          toast({
            variant: "destructive",
            title: "Data access error",
            description: `Could not access ${tableName} data. Please contact support.`
          });
          setIsTableValid(false);
          setAvailableAssets([]);
        }
      } catch (error) {
        console.error("Error in asset loading process:", error);
        toast({
          variant: "destructive",
          title: "Failed to load assets",
          description: "There was an error loading the available assets."
        });
        setAvailableAssets([]);
        setIsTableValid(false);
      } finally {
        setLoadingState(prev => ({ ...prev, assets: false }));
      }
    }
    loadAssets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.watch("country"), form.watch("stockMarket"), form.watch("assetClass")]);

  // Handle form submission
  const handleSubmit = form.handleSubmit(data => {
    if (dataTableName) {
      data.dataTableName = dataTableName;
      // Garante que os valores percentuais sejam números antes de enviar
      data.entryPercentage = Number(data.entryPercentage) || 0;
      data.stopPercentage = Number(data.stopPercentage) || 0;
      data.initialCapital = Number(data.initialCapital) || 0;
      data.initialInvestment = Number(data.initialInvestment) || 0;
      data.stopLoss = Number(data.stopLoss) || 0;
      data.profitTarget = Number(data.profitTarget) || 0;
      data.riskFactor = Number(data.riskFactor) || 0;
      onSubmit(data);
    } else {
      // If we don't have the table name, try to get it again
      (async () => {
        const tableName = await api.marketData.getDataTableName(
          data.country,
          data.stockMarket,
          data.assetClass
        );
        
        if (tableName) {
          data.dataTableName = tableName;
          // Garante que os valores percentuais sejam números antes de enviar
          data.entryPercentage = Number(data.entryPercentage) || 0;
          data.stopPercentage = Number(data.stopPercentage) || 0;
          data.initialCapital = Number(data.initialCapital) || 0;
          data.initialInvestment = Number(data.initialInvestment) || 0;
          data.stopLoss = Number(data.stopLoss) || 0;
          data.profitTarget = Number(data.profitTarget) || 0;
          data.riskFactor = Number(data.riskFactor) || 0;
          onSubmit(data);
        } else {
          toast({
            variant: "destructive",
            title: "Missing data source",
            description: "Could not determine the data source. Please try again."
          });
        }
      })();
    }
  });

  // Format stock name display
  const formatStockDisplay = (stock: StockInfo) => {
    return stock.fullName ? `${stock.code} - ${stock.fullName}` : stock.code;
  };

  // Adicionar um stock ao estado de comparação
  const addComparisonStock = (stockCode: string) => {
    if (!selectedStocks.includes(stockCode)) {
      const newSelectedStocks = [...selectedStocks, stockCode];
      setSelectedStocks(newSelectedStocks);
      form.setValue("comparisonStocks", newSelectedStocks);
      setComparisonStockInput("");
      setShowSuggestions(false);
    }
  };

  // Remover um stock da comparação
  const removeComparisonStock = (stockCode: string) => {
    const newSelectedStocks = selectedStocks.filter(code => code !== stockCode);
    setSelectedStocks(newSelectedStocks);
    form.setValue("comparisonStocks", newSelectedStocks);
  };

  // Filtrar stocks disponíveis com base no input
  const filteredStocks = comparisonStockInput === ""
    ? []
    : availableAssets.filter((stock) =>
        stock.code.toLowerCase().includes(comparisonStockInput.toLowerCase()) ||
        (stock.fullName && stock.fullName.toLowerCase().includes(comparisonStockInput.toLowerCase()))
      );

  // Atualizar os stocks selecionados quando os comparisonStocks mudarem no form
  useEffect(() => {
    const stocks = form.watch("comparisonStocks");
    if (stocks && Array.isArray(stocks)) {
      setSelectedStocks(stocks);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.watch("comparisonStocks")]);
  
  // Check if any options are loading
  const isOptionsLoading = loadingState.countries || 
                           loadingState.stockMarkets || 
                           loadingState.assetClasses || 
                           loadingState.assets;

   // Função auxiliar para lidar com a entrada de números decimais positivos (atualizada)
  const handleDecimalInputChange = (value: string, onChange: (val: string | null) => void) => {
    if (value === "") {
      onChange(null); // Permite campo vazio
      return;
    }

    // Impede números negativos
    if (value.startsWith('-')) {
      return; // Não atualiza, impede digitação do '-'
    }

    // Regex para permitir números positivos (incluindo 0) com até 2 casas decimais.
    // Permite: 1, 1., 1.0, 1.05, 0, 0., 0.0, 0.05, .5, .05
    const regex = /^\d*(\.\d{0,2})?$/;

    if (regex.test(value)) {
      // Passa o valor como string para permitir digitação (ex: "1.", ".0")
      onChange(value);
    }
    // Se não passar no regex (ex: "1.055", "abc"), não chama onChange,
    // impedindo a atualização do input com valor inválido.
  };

  // Função específica para Initial Capital com separador de milhares
  const handleInitialCapitalChange = (value: string, onChange: (val: number) => void) => {
    if (value === "") {
      onChange(0);
      return;
    }

    // Remove pontos existentes para validação
    const cleanValue = value.replace(/\./g, '');

    // Impede números negativos
    if (cleanValue.startsWith('-')) {
      return;
    }

    // Permite apenas números inteiros
    const regex = /^\d*$/;

    if (regex.test(cleanValue)) {
      const numValue = parseInt(cleanValue) || 0;
      onChange(numValue);
    }
  };

  // Função para formatar com separador de milhares
  const formatWithThousandsSeparator = (value: number): string => {
    if (!value || value === 0) return '';
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace(/,/g, '.');
  };

  // Função auxiliar para formatar no blur
  const handleBlurFormatting = (value: number | string | null | undefined, onChange: (val: number) => void) => {
    let numValue = 0;
    if (typeof value === 'string') {
      numValue = parseFloat(value) || 0;
    } else if (typeof value === 'number') {
      numValue = value;
    }
    // Garante que seja positivo e formata
    onChange(Math.max(0, parseFloat(numValue.toFixed(2))));
  };
  
  const { isSubscribed } = useSubscription();

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* First row - Operation, Country, Stock Market, Asset Class */}
        {/* Desktop: 4 columns, Mobile: 2 columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {/* First row fields */}
          <FormField
            control={form.control}
            name="operation"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Operation</FormLabel>
                 <Select 
                   disabled={isLoading || isOptionsLoading} 
                   onValueChange={field.onChange}
                   defaultValue={field.value}
                 >
                   <FormControl>
                     <SelectTrigger className="h-9 text-sm">
                       <SelectValue placeholder="Select operation" />
                     </SelectTrigger>
                   </FormControl>
                  <SelectContent>
                    <SelectItem value="buy">Buy</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="country"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Country</FormLabel>
                <Select 
                  disabled={isLoading || loadingState.countries || countries.length === 0} 
                  onValueChange={field.onChange}
                  value={field.value}
                >
                   <FormControl>
                     <SelectTrigger className="h-9 text-sm">
                       {loadingState.countries ? (
                         <div className="flex items-center">
                           <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                           <span className="text-sm">Loading...</span>
                         </div>
                       ) : (
                         <SelectValue placeholder="Select country" />
                       )}
                     </SelectTrigger>
                   </FormControl>
                  <SelectContent>
                    {countries.map(country => (
                      <SelectItem key={country} value={country}>
                        {country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="stockMarket"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Stock Market</FormLabel>
                <Select 
                  disabled={isLoading || loadingState.stockMarkets || stockMarkets.length === 0 || !form.watch("country")} 
                  onValueChange={field.onChange}
                  value={field.value}
                >
                   <FormControl>
                     <SelectTrigger className="h-9 text-sm">
                       {loadingState.stockMarkets ? (
                         <div className="flex items-center">
                           <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                           <span className="text-sm">Loading...</span>
                         </div>
                       ) : (
                         <SelectValue placeholder="Select stock..." />
                       )}
                     </SelectTrigger>
                   </FormControl>
                  <SelectContent>
                    {stockMarkets.map(market => (
                      <SelectItem key={market} value={market}>
                        {market}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="assetClass"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Asset Class</FormLabel>
                <Select 
                  disabled={isLoading || loadingState.assetClasses || assetClasses.length === 0 || !form.watch("stockMarket")} 
                  onValueChange={field.onChange}
                  value={field.value}
                >
                   <FormControl>
                     <SelectTrigger className="h-9 text-sm">
                       {loadingState.assetClasses ? (
                         <div className="flex items-center">
                           <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                           <span className="text-sm">Loading...</span>
                         </div>
                       ) : (
                         <SelectValue placeholder="Select asset..." />
                       )}
                     </SelectTrigger>
                   </FormControl>
                  <SelectContent>
                    {assetClasses.map(assetClass => (
                      <SelectItem key={assetClass} value={assetClass}>
                        {assetClass}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Second row - Reference Price, Period, Entry %, Stop % */}
        {/* Desktop: 4 columns, Mobile: 2 columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {/* Second row fields */}
          <FormField
            control={form.control}
            name="referencePrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reference Price</FormLabel>
                <Select 
                  disabled={isLoading || isOptionsLoading} 
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                   <FormControl>
                     <SelectTrigger className="h-9 text-sm">
                       <SelectValue placeholder="Reference price" />
                     </SelectTrigger>
                   </FormControl>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="close">Close</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="period"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Period</FormLabel>
                <Select 
                  disabled={isLoading || isOptionsLoading} 
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                   <FormControl>
                     <SelectTrigger className="h-9 text-sm">
                       <SelectValue placeholder="Period" />
                     </SelectTrigger>
                   </FormControl>
                  <SelectContent>
                    <SelectItem value="1m">1 Month</SelectItem>
                    <SelectItem value="3m" disabled={!isSubscribed} className={!isSubscribed ? "opacity-50 cursor-not-allowed" : ""}>
                      3 Months
                    </SelectItem>
                    <SelectItem value="6m" disabled={!isSubscribed} className={!isSubscribed ? "opacity-50 cursor-not-allowed" : ""}>
                      6 Months
                    </SelectItem>
                    <SelectItem value="1y" disabled={!isSubscribed} className={!isSubscribed ? "opacity-50 cursor-not-allowed" : ""}>
                      1 Year
                    </SelectItem>
                    <SelectItem value="2y" disabled={!isSubscribed} className={!isSubscribed ? "opacity-50 cursor-not-allowed" : ""}>
                      2 Years
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Campo % Entry Price Corrigido com controle de foco */}
          <FormField
            control={form.control}
            name="entryPercentage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>% Entry Price</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input 
                      type="text" // Usar text para controle manual
                      inputMode="decimal" // Ajuda teclados mobile
                      disabled={isLoading || isOptionsLoading}
                      // VALUE: Show formatted value only when NOT focused
                      value={isEntryPriceFocused 
                             ? (field.value === null || field.value === undefined ? '' : String(field.value)) 
                             : (typeof field.value === 'number' ? field.value.toFixed(2) : '')}
                      onChange={(e) => handleDecimalInputChange(e.target.value, field.onChange)}
                      onFocus={() => setIsEntryPriceFocused(true)}
                      onBlur={() => {
                        handleBlurFormatting(field.value, field.onChange); // Format and update state first
                        setIsEntryPriceFocused(false); // Then update focus state
                      }}
                       className="pr-8 h-9 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min="0" // Atributo HTML para semântica e validação básica
                    />
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">%</span>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Campo % Stop Corrigido com controle de foco */}
          <FormField
            control={form.control}
            name="stopPercentage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>% Stop</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input 
                      type="text" // Usar text para controle manual
                      inputMode="decimal" // Ajuda teclados mobile
                      disabled={isLoading || isOptionsLoading}
                      // VALUE: Show formatted value only when NOT focused
                      value={isStopPriceFocused 
                             ? (field.value === null || field.value === undefined ? '' : String(field.value)) 
                             : (typeof field.value === 'number' ? field.value.toFixed(2) : '')}
                      onChange={(e) => handleDecimalInputChange(e.target.value, field.onChange)}
                      onFocus={() => setIsStopPriceFocused(true)}
                      onBlur={() => {
                        handleBlurFormatting(field.value, field.onChange); // Format and update state first
                        setIsStopPriceFocused(false); // Then update focus state
                      }}
                      className="pr-8 h-9 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min="0" // Atributo HTML para semântica e validação básica
                    />
                    <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">%</span>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Third row - Initial Capital, Comparison Stocks */}
        {/* Desktop: 2 columns, Mobile: 2 columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 items-start">
          <FormField
            control={form.control}
            name="initialCapital"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Initial Capital</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none h-9 text-sm"
                    disabled={isLoading || isOptionsLoading || !isTableValid}
                    value={field.value ? formatWithThousandsSeparator(field.value) : ''}
                    onChange={(e) => handleInitialCapitalChange(e.target.value, field.onChange)}
                    onBlur={() => {
                      // No-op - o valor já foi atualizado no onChange
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="comparisonStocks"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Compare assets (opt.)</FormLabel>
                <div className="relative">
                  <FormControl>
                    <div className="flex flex-wrap gap-1 p-2 border rounded-md min-h-9 bg-background items-center text-sm">
                      {selectedStocks.map(stock => (
                        <Badge key={stock} variant="secondary" className="flex items-center gap-1">
                          {stock}
                          <button 
                            type="button" 
                            className="rounded-full hover:bg-muted p-0.5"
                            onClick={() => removeComparisonStock(stock)}
                            aria-label={`Remove ${stock}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                      <input
                        className={cn(
                          "flex-1 bg-transparent outline-none min-w-20 h-full",
                          selectedStocks.length > 0 && "ml-1"
                        )}
                        disabled={isLoading || loadingState.assets || !isTableValid}
                        value={comparisonStockInput}
                        onChange={(e) => {
                          setComparisonStockInput(e.target.value);
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={() => {
                          setTimeout(() => setShowSuggestions(false), 200);
                        }}
                        placeholder={selectedStocks.length === 0 ? "E.g. AAPL, MSFT" : ""}
                      />
                    </div>
                  </FormControl>
                  
                  {showSuggestions && filteredStocks.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-lg">
                      <Command>
                        <CommandList>
                          <CommandEmpty>No stocks found.</CommandEmpty>
                          <CommandGroup>
                            {filteredStocks.slice(0, 10).map((stock) => (
                              <CommandItem
                                key={stock.code}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  addComparisonStock(stock.code);
                                }}
                                className="cursor-pointer"
                              >
                                {formatStockDisplay(stock)}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </div>
                  )}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Submit button with white background */}
        <Button 
          type="submit" 
          className="w-full"
          disabled={
            isLoading || 
            isOptionsLoading || 
            !form.watch("country") || 
            !form.watch("stockMarket") || 
            !form.watch("assetClass") || 
            isTableValid === false
          }
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span>Processing...</span>
            </>
          ) : "Show Results"}
        </Button>
        
        {isTableValid === false && (
          <div className="text-sm text-destructive">
            The selected data source could not be accessed. Please select a different combination or contact support.
          </div>
        )}
      </form>
    </Form>
  );
}
