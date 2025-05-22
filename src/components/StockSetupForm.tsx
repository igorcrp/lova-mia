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

interface StockSetupFormProps {
  onSubmit: (params: StockAnalysisParams) => void;
  isLoading?: boolean;
}

export function StockSetupForm({
  onSubmit,
  isLoading = false
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

  // Form setup with react-hook-form
  const form = useForm<StockAnalysisParams>({
    defaultValues: {
      operation: "buy",
      country: "",
      stockMarket: "",
      assetClass: "",
      referencePrice: "close",
      period: "1m",
      entryPercentage: 1,
      stopPercentage: 1,
      initialCapital: 10000,
      comparisonStocks: []
    }
  });

  // Load countries from API on component mount
  useEffect(() => {
    async function loadCountries() {
      setLoadingState(prev => ({ ...prev, countries: true }));
      try {
        const fetchedCountries = await api.marketData.getCountries();
        if (fetchedCountries && fetchedCountries.length > 0) {
          setCountries(fetchedCountries);
          console.log("Loaded countries:", fetchedCountries);
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
    loadCountries();
  }, []);

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

        // Reset dependent fields
        form.setValue("stockMarket", "");
        form.setValue("assetClass", "");
        setDataTableName(null);
        setIsTableValid(null);
        setAssetClasses([]);
        setAvailableAssets([]);
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

        // Reset asset class
        form.setValue("assetClass", "");
        setDataTableName(null);
        setIsTableValid(null);
        setAvailableAssets([]);
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
  }, [form.watch("country"), form.watch("stockMarket"), form.watch("assetClass")]);

  // Handle form submission
  const handleSubmit = form.handleSubmit(data => {
    if (dataTableName) {
      data.dataTableName = dataTableName;
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
  }, [form.watch("comparisonStocks")]);
  
  // Check if any options are loading
  const isOptionsLoading = loadingState.countries || 
                           loadingState.stockMarkets || 
                           loadingState.assetClasses || 
                           loadingState.assets;
  
  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* First row - Operation, Country, Stock Market, Asset Class */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                    <SelectTrigger>
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
                    <SelectTrigger>
                      {loadingState.countries ? (
                        <div className="flex items-center">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          <span>Loading...</span>
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
                    <SelectTrigger>
                      {loadingState.stockMarkets ? (
                        <div className="flex items-center">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          <span>Loading...</span>
                        </div>
                      ) : (
                        <SelectValue placeholder="Select stock market" />
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
                    <SelectTrigger>
                      {loadingState.assetClasses ? (
                        <div className="flex items-center">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          <span>Loading...</span>
                        </div>
                      ) : (
                        <SelectValue placeholder="Select asset class" />
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                    <SelectTrigger>
                      <SelectValue placeholder="Select reference price" />
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
                    <SelectTrigger>
                      <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="1m">1 Month</SelectItem>
                    <SelectItem value="3m">3 Months</SelectItem>
                    <SelectItem value="6m">6 Months</SelectItem>
                    <SelectItem value="1y">1 Year</SelectItem>
                    <SelectItem value="2y">2 Years</SelectItem>
                    <SelectItem value="5y">5 Years</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="entryPercentage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>% Entry Price</FormLabel>
                <FormControl>
                  <div className="flex items-center">
                      <Input 
                        type="text"
                        disabled={isLoading || isOptionsLoading}
                        value={field.value !== undefined && field.value !== null ? field.value.toString() : ""}
                        onChange={(e) => {
                          const inputValue = e.target.value;
                          if (inputValue === "") {
                            field.onChange(null); // Permite campo vazio
                          } else if (/^\d*\.?\d{0,2}$/.test(inputValue)) { // Aceita até 2 casas decimais
                            field.onChange(parseFloat(inputValue));
                          }
                        }}
                        onBlur={() => {
                          if (field.value === null || field.value === undefined) {
                            field.onChange(0); // Define como 0 se estiver vazio ao sair do campo
                          }
                        }}
                        className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    <span className="ml-2">%</span>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="stopPercentage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>% Stop</FormLabel>
                <FormControl>
                  <div className="flex items-center">
                    <Input 
                      type="text" 
                      disabled={isLoading || isOptionsLoading}
                      value={field.value !== null ? field.value.toFixed(2) : ""}
                      onChange={(e) => {
                        const inputValue = e.target.value;
                        if (inputValue === "") {
                          field.onChange(0);
                        } else {
                          const value = parseFloat(inputValue);
                          if (!isNaN(value)) {
                            field.onChange(value);
                          }
                        }
                      }}
                      className="flex-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="ml-2">%</span>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Third row - Initial Capital, Comparison Stocks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="initialCapital"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Initial Capital</FormLabel>
                <FormControl>
                  <Input 
                    type="text"
                    disabled={isLoading || isOptionsLoading}
                    value={field.value !== null ? field.value.toFixed(2) : ""}
                    onChange={(e) => {
                      const inputValue = e.target.value;
                      if (inputValue === "") {
                        field.onChange(0);
                      } else {
                        const value = parseFloat(inputValue);
                        if (!isNaN(value)) {
                          field.onChange(value);
                        }
                      }
                    }}
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                <FormLabel>Comparison Stocks (optional)</FormLabel>
                <div className="relative">
                  <FormControl>
                    <div className="flex flex-wrap gap-1 p-2 border rounded-md min-h-10 bg-background">
                      {selectedStocks.map(stock => (
                        <Badge key={stock} variant="secondary" className="flex items-center gap-1">
                          {stock}
                          <button 
                            type="button" 
                            className="rounded-full hover:bg-muted"
                            onClick={() => removeComparisonStock(stock)}
                          >
                            <X className="h-3 w-3" />
                            <span className="sr-only">Remove {stock}</span>
                          </button>
                        </Badge>
                      ))}
                      <input
                        className={cn(
                          "flex-1 bg-transparent outline-none min-w-20",
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
                          // Delay hiding suggestions to allow for clicks
                          setTimeout(() => setShowSuggestions(false), 200);
                        }}
                        placeholder={selectedStocks.length === 0 ? "E.g. AAPL, MSFT, GOOGL" : ""}
                      />
                    </div>
                  </FormControl>
                  
                  {showSuggestions && filteredStocks.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg">
                      <Command>
                        <CommandList>
                          <CommandEmpty>No stocks found.</CommandEmpty>
                          <CommandGroup>
                            {filteredStocks.slice(0, 10).map((stock) => (
                              <CommandItem
                                key={stock.code}
                                onMouseDown={(e) => {
                                  e.preventDefault(); // Prevent blur from hiding suggestions
                                  addComparisonStock(stock.code);
                                }}
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

        {/* Submit button with updated text and improved validation */}
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
