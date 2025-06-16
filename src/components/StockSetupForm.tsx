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
  isLoading?: boolean; // Prop to indicate if the parent component is processing
}

export function StockSetupForm({
  onSubmit,
  isLoading = false // Default to false if not provided
}: StockSetupFormProps) {
  // State for options loaded from API
  const [countries, setCountries] = useState<string[]>([]);
  const [stockMarkets, setStockMarkets] = useState<string[]>([]);
  const [assetClasses, setAssetClasses] = useState<string[]>([]);
  const [availableAssets, setAvailableAssets] = useState<StockInfo[]>([]);
  // dataTableName stores the resolved name of the table for selected criteria
  const [dataTableName, setDataTableName] = useState<string | null>(null);
  // isTableValid indicates if the resolved dataTableName is accessible
  const [isTableValid, setIsTableValid] = useState<boolean | null>(null);

  // Granular loading states for each dropdown
  const [loadingState, setLoadingState] = useState<{
    countries: boolean;
    stockMarkets: boolean;
    assetClasses: boolean;
    assets: boolean; // For loading available assets for comparison
  }>({
    countries: false,
    stockMarkets: false,
    assetClasses: false,
    assets: false
  });

  // State for comparison stocks autocomplete
  const [comparisonStockInput, setComparisonStockInput] = useState("");
  const [selectedStocks, setSelectedStocks] = useState<string[]>([]); // Stores codes of selected comparison stocks
  const [showSuggestions, setShowSuggestions] = useState(false);

  // State for focused inputs to manage decimal formatting display
  const [isEntryPriceFocused, setIsEntryPriceFocused] = useState(false);
  const [isStopPriceFocused, setIsStopPriceFocused] = useState(false);

  // Form setup with react-hook-form, using StockAnalysisParams for typings
  const form = useForm<StockAnalysisParams>({
    defaultValues: {
      operation: "buy",
      country: "",
      stockMarket: "",
      assetClass: "",
      referencePrice: "close", // Default reference price
      period: "1m", // Default period
      entryPercentage: 1.00, // Default entry percentage with two decimal places
      stopPercentage: 1.00,  // Default stop percentage with two decimal places
      initialCapital: 10000.00, // Default initial capital
      comparisonStocks: [] // Default empty array for comparison stocks
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
        } else {
          console.warn("No countries returned from API or empty array.");
          // User feedback is important if countries list is empty
          toast({
            variant: "default", // Not necessarily destructive, could be informational
            title: "No Countries Available",
            description: "Could not find any countries in the database."
          });
        }
      } catch (error) {
        console.error("Error loading countries:", error);
        toast({
          variant: "destructive",
          title: "Failed to Load Countries",
          description: "There was an error loading the available countries. Please try again later."
        });
      } finally {
        setLoadingState(prev => ({ ...prev, countries: false }));
      }
    }
    loadCountries();
  }, []); // Empty dependency array ensures this runs only once on mount

  // Load stock markets when country changes
  useEffect(() => {
    const country = form.watch("country");
    // Reset and return if no country is selected
    if (!country) {
      setStockMarkets([]);
      form.setValue("stockMarket", ""); // Reset form value
      setAssetClasses([]);
      form.setValue("assetClass", ""); // Reset form value
      setAvailableAssets([]);
      setDataTableName(null);
      setIsTableValid(null);
      return;
    }
    
    async function loadStockMarkets() {
      setLoadingState(prev => ({ ...prev, stockMarkets: true }));
      try {
        const fetchedMarkets = await api.marketData.getStockMarkets(country);
        if (fetchedMarkets && fetchedMarkets.length > 0) {
          setStockMarkets(fetchedMarkets);
        } else {
          setStockMarkets([]); // Ensure empty array if none found
          console.warn("No stock markets returned for country:", country);
          toast({
            variant: "default",
            title: "No Stock Markets Found",
            description: `No stock markets found for ${country}. Select another country or check data sources.`
          });
        }
      } catch (error) {
        console.error("Error loading stock markets for country " + country + ":", error);
        toast({
          variant: "destructive",
          title: "Failed to Load Stock Markets",
          description: "There was an error loading stock markets. Please try again."
        });
        setStockMarkets([]); // Reset on error
      } finally {
        // Reset dependent fields regardless of success or failure of fetching markets
        form.setValue("stockMarket", "");
        form.setValue("assetClass", "");
        setDataTableName(null);
        setIsTableValid(null);
        setAssetClasses([]);
        setAvailableAssets([]);
        setLoadingState(prev => ({ ...prev, stockMarkets: false }));
      }
    }
    loadStockMarkets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.watch("country")]); // Rerun when country field changes

  // Load asset classes when stock market or country changes
  useEffect(() => {
    const country = form.watch("country");
    const stockMarket = form.watch("stockMarket");
    // Reset and return if no country or stock market selected
    if (!country || !stockMarket) {
      setAssetClasses([]);
      form.setValue("assetClass", ""); // Reset form value
      setAvailableAssets([]);
      setDataTableName(null);
      setIsTableValid(null);
      return;
    }
    
    async function loadAssetClasses() {
      setLoadingState(prev => ({ ...prev, assetClasses: true }));
      try {
        const fetchedAssetClasses = await api.marketData.getAssetClasses(country, stockMarket);
        if (fetchedAssetClasses && fetchedAssetClasses.length > 0) {
          setAssetClasses(fetchedAssetClasses);
        } else {
          setAssetClasses([]);
          console.warn("No asset classes returned for:", country, stockMarket);
          toast({
            variant: "default",
            title: "No Asset Classes Found",
            description: `No asset classes found for ${stockMarket} in ${country}.`
          });
        }
      } catch (error) {
        console.error(`Error loading asset classes for ${country} - ${stockMarket}:`, error);
        toast({
          variant: "destructive",
          title: "Failed to Load Asset Classes",
          description: "There was an error loading asset classes. Please try again."
        });
        setAssetClasses([]);
      } finally {
        // Reset dependent fields
        form.setValue("assetClass", "");
        setDataTableName(null);
        setIsTableValid(null);
        setAvailableAssets([]);
        setLoadingState(prev => ({ ...prev, assetClasses: false }));
      }
    }
    loadAssetClasses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.watch("country"), form.watch("stockMarket")]); // Rerun when country or stockMarket changes

  // Load available assets and validate table when asset class (or its dependencies) changes
  useEffect(() => {
    const country = form.watch("country");
    const stockMarket = form.watch("stockMarket");
    const assetClass = form.watch("assetClass");

    // Reset if any prerequisite is missing
    if (!country || !stockMarket || !assetClass) {
      setAvailableAssets([]);
      setDataTableName(null);
      setIsTableValid(null);
      return;
    }
    
    async function loadAssetsAndValidateTable() {
      setLoadingState(prev => ({ ...prev, assets: true }));
      setIsTableValid(null); // Reset validation status while loading
      setDataTableName(null);
      setAvailableAssets([]);

      try {
        const tableName = await api.marketData.getDataTableName(country, stockMarket, assetClass);
        if (!tableName) {
          console.error("Data table name not found for selected criteria.");
          toast({
            variant: "destructive",
            title: "Data Source Configuration Error",
            description: "Could not determine the data table for the selected options. Please check the market data source configuration."
          });
          setIsTableValid(false);
          return; // Exit if no table name
        }
        setDataTableName(tableName);
        console.log(`Data table identified: ${tableName}`);

        const tableExists = await api.marketData.checkTableExists(tableName);
        if (!tableExists) {
          console.error(`Data table "${tableName}" does not exist.`);
          toast({
            variant: "destructive",
            title: "Data Table Not Found",
            description: `The required data table (${tableName}) was not found in the database.`
          });
          setIsTableValid(false);
          return; // Exit if table doesn't exist
        }
        
        // If table exists, try to fetch assets
        const stocksData = await api.analysis.getAvailableStocks(tableName);
        setAvailableAssets(stocksData || []); // Ensure availableAssets is an array
        setIsTableValid(true); // Table is valid and assets are loaded (or empty if none)
        if (!stocksData || stocksData.length === 0) {
            console.warn(`No assets found in table ${tableName}, but table is valid.`);
            // Inform user that no specific assets are listed, but they can proceed if applicable
            toast({
                title: "No Specific Assets Listed",
                description: `The data source (${tableName}) is valid, but no individual assets were found. Analysis might run on the entire class if supported.`,
                variant: "default"
            });
        }

      } catch (error: any) { // Catch errors from any await point above
        console.error("Error during asset loading or table validation:", error.message);
        toast({
          variant: "destructive",
          title: "Error Accessing Asset Data",
          description: error.message || "An unexpected error occurred while trying to load asset data and validate the source."
        });
        setIsTableValid(false); // Set table as invalid on any error in this process
      } finally {
        setLoadingState(prev => ({ ...prev, assets: false }));
      }
    }
    loadAssetsAndValidateTable();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.watch("country"), form.watch("stockMarket"), form.watch("assetClass")]);


  // Handle form submission
  const handleFormSubmit = async (data: StockAnalysisParams) => {
    // Ensure dataTableName is current, especially if not set via useEffect (e.g., rapid changes)
    let currentDataTableName = dataTableName;
    if (!currentDataTableName) {
        console.log("Data table name not yet set, attempting to fetch it now.");
        currentDataTableName = await api.marketData.getDataTableName(
            data.country, data.stockMarket, data.assetClass
        );
        if (!currentDataTableName) {
            toast({
                variant: "destructive",
                title: "Cannot Submit: Missing Data Source",
                description: "Could not determine the data source. Please ensure all selections are valid."
            });
            return;
        }
        setDataTableName(currentDataTableName); // Update state
    }

    // Ensure isTableValid is checked before submission, even if dataTableName might be stale
    if (isTableValid === false) {
         toast({
            variant: "destructive",
            title: "Cannot Submit: Invalid Data Source",
            description: "The selected data source is invalid or inaccessible. Please change your selections."
        });
        return;
    }

    const paramsToSubmit: StockAnalysisParams = {
      ...data,
      dataTableName: currentDataTableName,
      // Ensure numeric fields are correctly typed as numbers
      entryPercentage: Number(data.entryPercentage) || 0,
      stopPercentage: Number(data.stopPercentage) || 0,
      initialCapital: Number(data.initialCapital) || 0,
      comparisonStocks: selectedStocks, // Ensure this uses the state `selectedStocks`
    };
    console.log("Submitting analysis with params:", paramsToSubmit);
    onSubmit(paramsToSubmit);
  };

  // Format stock name display for suggestions
  const formatStockDisplay = (stock: StockInfo): string => {
    // Assuming StockInfo might have 'name' or 'fullName', prefer 'fullName' or 'name', fallback to 'code'
    return stock.fullName || stock.name || stock.code;
  };

  // Add a stock to the comparison list
  const addComparisonStock = (stockCode: string) => {
    if (!selectedStocks.includes(stockCode)) {
      const newSelectedStocks = [...selectedStocks, stockCode];
      setSelectedStocks(newSelectedStocks);
      form.setValue("comparisonStocks", newSelectedStocks, { shouldValidate: true });
      setComparisonStockInput(""); // Clear input
      setShowSuggestions(false); // Hide suggestions
    }
  };

  // Remove a stock from the comparison list
  const removeComparisonStock = (stockCode: string) => {
    const newSelectedStocks = selectedStocks.filter(code => code !== stockCode);
    setSelectedStocks(newSelectedStocks);
    form.setValue("comparisonStocks", newSelectedStocks, { shouldValidate: true });
  };

  // Filter available stocks for comparison based on user input
  const filteredStocks = comparisonStockInput === ""
    ? [] // No suggestions if input is empty
    : availableAssets.filter((stock) => {
        const term = comparisonStockInput.toLowerCase();
        return stock.code.toLowerCase().includes(term) ||
               (stock.name && stock.name.toLowerCase().includes(term)) ||
               (stock.fullName && stock.fullName.toLowerCase().includes(term));
      });

  // Synchronize selectedStocks state with form value if it changes externally
  useEffect(() => {
    const formStocks = form.watch("comparisonStocks");
    if (formStocks && Array.isArray(formStocks) && JSON.stringify(formStocks) !== JSON.stringify(selectedStocks)) {
      setSelectedStocks(formStocks);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.watch("comparisonStocks")]); // Watch for changes in form's comparisonStocks
  
  // Determine if any dropdown options are currently loading
  const isAnyDropDownLoading = loadingState.countries ||
                               loadingState.stockMarkets ||
                               loadingState.assetClasses ||
                               loadingState.assets;

   // Handles decimal input change, allowing up to 2 decimal places and preventing negative numbers.
  const handleDecimalInputChange = (value: string, fieldOnChange: (val: string | null) => void) => {
    if (value === "") {
      fieldOnChange(null); // Allow empty field, will be handled by validation or blur
      return;
    }
    // Prevent negative numbers
    if (value.startsWith('-')) {
      return; // Do not update, effectively preventing typing '-'
    }
    // Regex to allow positive numbers (including 0) with up to 2 decimal places.
    // Allows: 1, 1., 1.0, 1.05, 0, 0., 0.0, 0.05, .5, .05
    const regex = /^\d*(\.\d{0,2})?$/;
    if (regex.test(value)) {
      fieldOnChange(value); // Pass string to allow intermediate states like "1."
    }
    // If regex fails (e.g., "1.055", "abc"), onChange is not called, preventing invalid input.
  };

  // Formats the input value on blur to a number with 2 decimal places.
  const handleBlurFormatting = (
    currentValue: number | string | null | undefined,
    fieldOnChange: (val: number) => void // RHF's onChange for number fields
  ) => {
    let numValue = 0;
    if (typeof currentValue === 'string') {
      numValue = parseFloat(currentValue) || 0; // Default to 0 if parse fails
    } else if (typeof currentValue === 'number') {
      numValue = currentValue;
    }
    // Ensure the value is non-negative and formatted to two decimal places
    fieldOnChange(Math.max(0, parseFloat(numValue.toFixed(2))));
  };
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        {/* First row - Operation, Country, Stock Market, Asset Class */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <FormField
            control={form.control}
            name="operation"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Operation</FormLabel>
                <Select
                  disabled={isLoading || isAnyDropDownLoading}
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
                  onValueChange={(value) => {
                    field.onChange(value);
                    // Reset dependent fields when country changes
                    form.setValue("stockMarket", "");
                    form.setValue("assetClass", "");
                    setStockMarkets([]);
                    setAssetClasses([]);
                    setAvailableAssets([]);
                    setDataTableName(null);
                    setIsTableValid(null);
                  }}
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
                   onValueChange={(value) => {
                    field.onChange(value);
                    // Reset dependent fields when stock market changes
                    form.setValue("assetClass", "");
                    setAssetClasses([]);
                    setAvailableAssets([]);
                    setDataTableName(null);
                    setIsTableValid(null);
                  }}
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
                   onValueChange={(value) => {
                    field.onChange(value);
                     // Reset dependent fields when asset class changes
                    setAvailableAssets([]);
                    setDataTableName(null);
                    setIsTableValid(null);
                  }}
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
                  disabled={isLoading || isAnyDropDownLoading}
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
                  disabled={isLoading || isAnyDropDownLoading}
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

          {/* Entry Percentage field with focus and blur handling for formatting */}
          <FormField
            control={form.control}
            name="entryPercentage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>% Entry Price</FormLabel>
                <FormControl>
                  <div className="flex items-center">
                    <Input
                      type="text" // Use text for manual control over formatting
                      inputMode="decimal" // Hint for mobile keyboards
                      disabled={isLoading || isAnyDropDownLoading}
                      // VALUE: Show formatted value only when NOT focused
                      value={isEntryPriceFocused
                             ? (field.value === null || field.value === undefined ? '' : String(field.value))
                             : (typeof field.value === 'number' ? field.value.toFixed(2) : '')}
                      onChange={(e) => handleDecimalInputChange(e.target.value, field.onChange as any)}
                      onFocus={() => setIsEntryPriceFocused(true)}
                      onBlur={() => {
                        handleBlurFormatting(field.value, field.onChange as any);
                        setIsEntryPriceFocused(false);
                      }}
                      className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min="0" // HTML attribute for semantics and basic validation
                    />
                    <span className="ml-2">%</span>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Stop Percentage field with focus and blur handling for formatting */}
          <FormField
            control={form.control}
            name="stopPercentage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>% Stop</FormLabel>
                <FormControl>
                  <div className="flex items-center">
                    <Input
                      type="text" // Use text for manual control
                      inputMode="decimal" // Hint for mobile keyboards
                      disabled={isLoading || isAnyDropDownLoading}
                      value={isStopPriceFocused
                             ? (field.value === null || field.value === undefined ? '' : String(field.value))
                             : (typeof field.value === 'number' ? field.value.toFixed(2) : '')}
                      onChange={(e) => handleDecimalInputChange(e.target.value, field.onChange as any)}
                      onFocus={() => setIsStopPriceFocused(true)}
                      onBlur={() => {
                        handleBlurFormatting(field.value, field.onChange as any);
                        setIsStopPriceFocused(false);
                      }}
                      className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min="0"
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
          {/* Initial Capital field, similar formatting to percentage fields */}
          <FormField
            control={form.control}
            name="initialCapital"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Initial Capital</FormLabel>
                <FormControl>
                  <Input
                    type="number" // While type is number, actual input can be controlled like text for formatting
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    min="0"
                    disabled={isLoading || isAnyDropDownLoading || isTableValid === false}
                    {...field} // Spread field props
                     onChange={(e) => handleDecimalInputChange(e.target.value, (val) => field.onChange(val === null ? null : Number(val)))}
                    onBlur={() => handleBlurFormatting(field.value, (val) => field.onChange(val))}
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
                    <div className="flex flex-wrap gap-1 p-2 border rounded-md min-h-10 bg-background items-center">
                      {selectedStocks.map(stock => (
                        <Badge key={stock} variant="secondary" className="flex items-center gap-1">
                          {stock}
                          <button
                            type="button"
                            className="rounded-full hover:bg-muted p-0.5"
                            onClick={() => removeComparisonStock(stock)}
                            aria-label={`Remove ${stock} from comparison`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                      <input
                        className={cn(
                          "flex-1 bg-transparent outline-none min-w-20 h-full",
                          selectedStocks.length > 0 && "ml-1" // Add margin if stocks are present
                        )}
                        disabled={isLoading || loadingState.assets || isTableValid === false || availableAssets.length === 0}
                        value={comparisonStockInput}
                        onChange={(e) => {
                          setComparisonStockInput(e.target.value);
                          if (e.target.value) setShowSuggestions(true); else setShowSuggestions(false);
                        }}
                        onFocus={() => { if (comparisonStockInput) setShowSuggestions(true);}}
                        onBlur={() => {
                          // Delay hiding suggestions to allow click on suggestion item
                          setTimeout(() => setShowSuggestions(false), 150);
                        }}
                        placeholder={selectedStocks.length === 0 ? "E.g. AAPL, MSFT" : ""}
                      />
                    </div>
                  </FormControl>

                  {showSuggestions && filteredStocks.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-lg">
                      <Command>
                        <CommandList>
                          <CommandEmpty>No stocks found matching your search.</CommandEmpty>
                          <CommandGroup heading="Suggestions">
                            {filteredStocks.slice(0, 10).map((stock) => ( // Limit suggestions shown
                              <CommandItem
                                key={stock.code}
                                onMouseDown={(e) => { // Use onMouseDown to trigger before onBlur
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

        {/* Submit button */}
        <Button
          type="submit"
          className="w-full"
          disabled={
            isLoading || // Parent component loading state
            isAnyDropDownLoading || // Internal loading state for dropdowns
            !form.watch("country") ||
            !form.watch("stockMarket") ||
            !form.watch("assetClass") ||
            isTableValid === false // Explicitly disable if table is known to be invalid
          }
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span>Processing...</span>
            </>
          ) : "Show Results"}
        </Button>

        {/* Feedback message if the selected data source is invalid */}
        {isTableValid === false && (
          <div className="text-sm text-destructive text-center">
            The selected data source is invalid or could not be accessed. Please adjust your selections.
          </div>
        )}
      </form>
    </Form>
  );
}
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

          {/* Campo % Entry Price Corrigido com controle de foco */}
          <FormField
            control={form.control}
            name="entryPercentage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>% Entry Price</FormLabel>
                <FormControl>
                  <div className="flex items-center">
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
                      className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min="0" // Atributo HTML para semântica e validação básica
                    />
                    <span className="ml-2">%</span>
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
                  <div className="flex items-center">
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
                      className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min="0" // Atributo HTML para semântica e validação básica
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
          {/* Campo Initial Capital Corrigido (similar aos percentuais) */}
          <FormField
            control={form.control}
            name="initialCapital"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Initial Capital</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    min="0"
                    disabled={isLoading || isOptionsLoading || !isTableValid}
                    {...field}
                    onChange={(e) => handleDecimalInputChange(e.target.value, field.onChange)}
                    onBlur={() => handleBlurFormatting(field.value, field.onChange)}
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
                    <div className="flex flex-wrap gap-1 p-2 border rounded-md min-h-10 bg-background items-center">
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
                          // Delay hiding suggestions to allow for clicks
                          setTimeout(() => setShowSuggestions(false), 200);
                        }}
                        placeholder={selectedStocks.length === 0 ? "E.g. AAPL, MSFT, GOOGL" : ""}
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
                                  e.preventDefault(); // Prevent blur from hiding suggestions
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
