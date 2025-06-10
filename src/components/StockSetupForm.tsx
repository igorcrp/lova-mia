import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, X } from "lucide-react"; // X icon for badges
import { StockAnalysisParams, StockInfo } from "@/types";
import { api } from "@/services/api";
import { toast } from "@/components/ui/use-toast"; // Assuming this is sonner via shadcn
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm, Controller } from "react-hook-form"; // Controller for custom components
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Props for the StockSetupForm component.
 */
interface StockSetupFormProps {
  /**
   * Callback function executed when the form is submitted with valid data.
   * @param params The stock analysis parameters gathered from the form.
   */
  onSubmit: (params: StockAnalysisParams) => void;
  /**
   * Optional flag to indicate if the form submission is currently in progress.
   * Defaults to `false`.
   */
  isLoading?: boolean;
}

/**
 * StockSetupForm component allows users to configure parameters for stock analysis.
 * It fetches market data dynamically based on user selections (country, stock market, asset class),
 * populates dropdowns, and handles form submission.
 *
 * @param {StockSetupFormProps} props The component props.
 */
export function StockSetupForm({
  onSubmit,
  isLoading = false, // Prop to indicate submission loading state from parent
}: StockSetupFormProps) {
  // State for options loaded from API
  const [countries, setCountries] = useState<string[]>([]);
  const [stockMarkets, setStockMarkets] = useState<string[]>([]);
  const [assetClasses, setAssetClasses] = useState<string[]>([]);
  const [availableAssets, setAvailableAssets] = useState<StockInfo[]>([]);

  // State for the resolved data table name and its validity
  const [dataTableName, setDataTableName] = useState<string | null>(null);
  const [isTableValid, setIsTableValid] = useState<boolean | null>(null); // null = not checked, false = invalid, true = valid

  // Granular loading states for each dropdown/data fetching step
  const [loadingStates, setLoadingStates] = useState<{
    countries: boolean;
    stockMarkets: boolean;
    assetClasses: boolean;
    assets: boolean; // For loading stock codes/assets
  }>({
    countries: false,
    stockMarkets: false,
    assetClasses: false,
    assets: false,
  });

  // State for the comparison stocks autocomplete input
  const [comparisonStockInput, setComparisonStockInput] = useState("");
  const [selectedStocks, setSelectedStocks] = useState<string[]>([]); // Tracks codes of selected stocks for comparison
  const [showSuggestions, setShowSuggestions] = useState(false); // Controls visibility of stock suggestions dropdown

  // State to manage focus for number inputs to allow better UX with formatting
  const [isEntryPriceFocused, setIsEntryPriceFocused] = useState(false);
  const [isStopPriceFocused, setIsStopPriceFocused] = useState(false);
  const [isInitialCapitalFocused, setIsInitialCapitalFocused] = useState(false);

  const form = useForm<StockAnalysisParams>({
    // TODO: Consider adding a Zod resolver here for schema-based validation
    // resolver: zodResolver(stockAnalysisSchema),
    defaultValues: {
      operation: "buy",
      country: "",
      stockMarket: "",
      assetClass: "",
      referencePrice: "close",
      period: "1m", // Default period
      entryPercentage: 1.0,
      stopPercentage: 1.0,
      initialCapital: 10000.0,
      comparisonStocks: [], // Initialize as empty array
    },
  });

  const watchedCountry = form.watch("country");
  const watchedStockMarket = form.watch("stockMarket");
  const watchedAssetClass = form.watch("assetClass");

  // Effect to load countries from API on component mount
  useEffect(() => {
    async function loadCountries() {
      setLoadingStates((prev) => ({ ...prev, countries: true }));
      try {
        const fetchedCountries = await api.marketData.getCountries();
        if (fetchedCountries && fetchedCountries.length > 0) {
          setCountries(fetchedCountries);
        } else {
          // console.error("No countries returned from API"); // Replaced by toast
          toast({
            variant: "destructive",
            title: "Failed to load countries",
            description: "No countries found. Please check data sources.",
          });
        }
      } catch (error: any) {
        console.error("Error loading countries:", error.message);
        toast({
          variant: "destructive",
          title: "Failed to load countries",
          description: error.message || "An unexpected error occurred.",
        });
      } finally {
        setLoadingStates((prev) => ({ ...prev, countries: false }));
      }
    }
    loadCountries();
  }, []); // Empty dependency array means this runs once on mount

  // Effect to load stock markets when country changes
  useEffect(() => {
    if (!watchedCountry) {
      setStockMarkets([]);
      setAssetClasses([]); // Clear dependent dropdowns
      setAvailableAssets([]);
      form.resetField("stockMarket"); // Reset form value
      form.resetField("assetClass");
      form.resetField("comparisonStocks");
      setDataTableName(null);
      setIsTableValid(null);
      return;
    }

    async function loadStockMarkets() {
      setLoadingStates((prev) => ({ ...prev, stockMarkets: true }));
      // Reset downstream fields before loading new ones
      setAssetClasses([]);
      setAvailableAssets([]);
      form.resetField("assetClass");
      form.resetField("comparisonStocks");
      setDataTableName(null);
      setIsTableValid(null);

      try {
        const fetchedMarkets = await api.marketData.getStockMarkets(watchedCountry);
        if (fetchedMarkets && fetchedMarkets.length > 0) {
          setStockMarkets(fetchedMarkets);
        } else {
          setStockMarkets([]); // Ensure it's an empty array if none found
          toast({
            variant: "default", // Using default as it's informational
            title: "No stock markets found",
            description: `No stock markets available for ${watchedCountry}.`,
          });
        }
      } catch (error: any) {
        console.error(`Error loading stock markets for ${watchedCountry}:`, error.message);
        toast({
          variant: "destructive",
          title: "Failed to load stock markets",
          description: error.message || "An unexpected error occurred.",
        });
        setStockMarkets([]); // Ensure empty on error
      } finally {
        setLoadingStates((prev) => ({ ...prev, stockMarkets: false }));
        // Resetting form.setValue("stockMarket", "") here would fight with user selection if they re-select same country
      }
    }
    loadStockMarkets();
  }, [watchedCountry, form]); // form added for form.resetField

  // Effect to load asset classes when stock market changes
  useEffect(() => {
    if (!watchedCountry || !watchedStockMarket) {
      setAssetClasses([]);
      setAvailableAssets([]);
      form.resetField("assetClass");
      form.resetField("comparisonStocks");
      setDataTableName(null);
      setIsTableValid(null);
      return;
    }

    async function loadAssetClasses() {
      setLoadingStates((prev) => ({ ...prev, assetClasses: true }));
      setAvailableAssets([]); // Reset assets
      form.resetField("comparisonStocks");
      setDataTableName(null);
      setIsTableValid(null);

      try {
        const fetchedAssetClasses = await api.marketData.getAssetClasses(
          watchedCountry,
          watchedStockMarket
        );
        if (fetchedAssetClasses && fetchedAssetClasses.length > 0) {
          setAssetClasses(fetchedAssetClasses);
        } else {
          setAssetClasses([]);
          toast({
            variant: "default",
            title: "No asset classes found",
            description: `No asset classes for ${watchedStockMarket} in ${watchedCountry}.`,
          });
        }
      } catch (error: any) {
        console.error(
          `Error loading asset classes for ${watchedCountry} - ${watchedStockMarket}:`,
          error.message
        );
        toast({
          variant: "destructive",
          title: "Failed to load asset classes",
          description: error.message || "An unexpected error occurred.",
        });
        setAssetClasses([]);
      } finally {
        setLoadingStates((prev) => ({ ...prev, assetClasses: false }));
      }
    }
    loadAssetClasses();
  }, [watchedCountry, watchedStockMarket, form]);

  // Effect to load available assets (stock codes) when asset class changes
  useEffect(() => {
    if (!watchedCountry || !watchedStockMarket || !watchedAssetClass) {
      setAvailableAssets([]);
      setDataTableName(null);
      setIsTableValid(null);
      form.resetField("comparisonStocks");
      return;
    }

    async function loadAssets() {
      setLoadingStates((prev) => ({ ...prev, assets: true }));
      setDataTableName(null); // Reset table name while fetching new one
      setIsTableValid(null); // Reset table validity
      form.resetField("comparisonStocks"); // Reset selected comparison stocks

      try {
        const tableName = await api.marketData.getDataTableName(
          watchedCountry,
          watchedStockMarket,
          watchedAssetClass
        );
        if (!tableName) {
          toast({
            variant: "destructive",
            title: "Data source configuration error",
            description: "Could not determine the data table for the selected criteria.",
          });
          setDataTableName(null);
          setIsTableValid(false);
          setAvailableAssets([]);
          return; // Exit if no table name
        }

        setDataTableName(tableName); // Store the resolved table name

        const tableExists = await api.marketData.checkTableExists(tableName);
        if (!tableExists) {
          toast({
            variant: "destructive",
            title: "Data table not found",
            description: `The table '${tableName}' does not exist or is inaccessible.`,
          });
          setIsTableValid(false);
          setAvailableAssets([]);
          return; // Exit if table doesn't exist
        }

        // If table exists, mark as valid and try to fetch stocks
        setIsTableValid(true);
        const stocksData = await api.analysis.getAvailableStocks(tableName);
        if (stocksData && stocksData.length > 0) {
          setAvailableAssets(stocksData);
        } else {
          setAvailableAssets([]);
          toast({
            variant: "default",
            title: "No stocks found",
            description: `No stocks available in table '${tableName}'.`,
          });
        }
      } catch (error: any) {
        console.error("Error during asset loading process:", error.message);
        toast({
          variant: "destructive",
          title: "Failed to load stock list",
          description: error.message || "An unexpected error occurred.",
        });
        setAvailableAssets([]);
        setIsTableValid(false); // Mark as invalid on error
      } finally {
        setLoadingStates((prev) => ({ ...prev, assets: false }));
      }
    }
    loadAssets();
  }, [watchedCountry, watchedStockMarket, watchedAssetClass, form]);

  /**
   * Handles the form submission process.
   * It ensures all parameters are correctly formatted and then calls the parent's onSubmit.
   * @param {StockAnalysisParams} data The form data.
   */
  const handleFormSubmit = async (data: StockAnalysisParams) => {
    // Ensure dataTableName is current before submission
    let currentDataTableName = dataTableName;
    if (!currentDataTableName) {
      // Attempt to fetch it if somehow not set (should be prevented by disabled button logic)
      if (data.country && data.stockMarket && data.assetClass) {
        currentDataTableName = await api.marketData.getDataTableName(
          data.country,
          data.stockMarket,
          data.assetClass
        );
      }
    }

    if (currentDataTableName) {
      const paramsToSubmit: StockAnalysisParams = {
        ...data,
        dataTableName: currentDataTableName,
        // Ensure numeric fields are indeed numbers, with fallbacks.
        entryPercentage: parseFloat(String(data.entryPercentage)) || 0,
        stopPercentage: parseFloat(String(data.stopPercentage)) || 0,
        initialCapital: parseFloat(String(data.initialCapital)) || 0,
        // Use the state variable `selectedStocks` which is the source of truth for comparisonStocks
        comparisonStocks: selectedStocks,
      };
      onSubmit(paramsToSubmit);
    } else {
      toast({
        variant: "destructive",
        title: "Data Source Error",
        description:
          "Could not determine the data source table. Please re-check selections or wait for options to load.",
      });
    }
  };

  /**
   * Formats the display of a stock item, showing code and name if available.
   * Uses `stock.name` which might be the same as `stock.code` or a more descriptive name.
   * @param {StockInfo} stock The stock information object.
   * @returns {string} A formatted string for display (e.g., "AAPL (Apple Inc.)" or "PETR4").
   */
  const formatStockDisplay = (stock: StockInfo): string => {
    // Check if name is present and different from code to avoid "CODE (CODE)"
    return stock.name && stock.name !== stock.code ? `${stock.code} (${stock.name})` : stock.code;
  };

  /**
   * Adds a stock to the list of comparison stocks.
   * Updates both local component state (`selectedStocks`) and the react-hook-form state.
   * @param {string} stockCode The code of the stock to add.
   */
  const addComparisonStock = useCallback(
    (stockCode: string) => {
      if (!selectedStocks.includes(stockCode) && selectedStocks.length < 10) {
        // Example limit
        const newSelectedStocks = [...selectedStocks, stockCode];
        setSelectedStocks(newSelectedStocks);
        form.setValue("comparisonStocks", newSelectedStocks, {
          shouldValidate: true,
          shouldDirty: true,
        });
        setComparisonStockInput("");
        setShowSuggestions(false);
      } else if (selectedStocks.length >= 10) {
        toast({
          title: "Selection Limit",
          description: "You can select up to 10 stocks for comparison.",
          variant: "default",
        });
      }
    },
    [selectedStocks, form]
  );

  /**
   * Removes a stock from the list of comparison stocks.
   * Updates both local component state (`selectedStocks`) and the react-hook-form state.
   * @param {string} stockCode The code of the stock to remove.
   */
  const removeComparisonStock = useCallback(
    (stockCode: string) => {
      const newSelectedStocks = selectedStocks.filter((code) => code !== stockCode);
      setSelectedStocks(newSelectedStocks);
      form.setValue("comparisonStocks", newSelectedStocks, {
        shouldValidate: true,
        shouldDirty: true,
      });
    },
    [selectedStocks, form]
  );

  // Memoized list of filtered stocks for the autocomplete dropdown.
  // Filters `availableAssets` based on `comparisonStockInput`.
  const filteredStocks = React.useMemo(() => {
    if (comparisonStockInput.trim() === "") return [];
    return availableAssets.filter(
      (stock) =>
        stock.code.toLowerCase().includes(comparisonStockInput.toLowerCase()) ||
        (stock.name && stock.name.toLowerCase().includes(comparisonStockInput.toLowerCase()))
    );
  }, [comparisonStockInput, availableAssets]);

  // Effect to synchronize `selectedStocks` state if `form.watch("comparisonStocks")` changes externally.
  // This ensures consistency if the form value is manipulated from outside this component's direct user interactions.
  useEffect(() => {
    const formWatchedStocks = form.watch("comparisonStocks");
    if (formWatchedStocks && Array.isArray(formWatchedStocks)) {
      // Avoid unnecessary updates if the arrays are identical in content and order.
      if (JSON.stringify(formWatchedStocks) !== JSON.stringify(selectedStocks)) {
        setSelectedStocks(formWatchedStocks);
      }
    }
  }, [form.watch("comparisonStocks"), selectedStocks]);

  // Derived state to determine if any dropdown options are currently being loaded.
  const isAnyDropdownLoading =
    loadingStates.countries ||
    loadingStates.stockMarkets ||
    loadingStates.assetClasses ||
    loadingStates.assets;

  /**
   * Handles changes to decimal input fields, allowing only valid positive decimal numbers up to two decimal places.
   * Updates the react-hook-form field with the raw string value if valid, or null if empty,
   * allowing react-hook-form to manage the actual state that will be coerced/validated on blur/submit.
   * @param {string} value The input value from the event.
   * @param {(val: string | null) => void} rhfOnChange The onChange callback from react-hook-form's `field`.
   */
  const handleDecimalInputChange = (value: string, rhfOnChange: (val: string | null) => void) => {
    if (value === "") {
      rhfOnChange(null);
      return;
    }
    if (value.startsWith("-")) {
      return;
    }
    const regex = /^\d*(\.\d{0,2})?$/;
    if (regex.test(value)) {
      rhfOnChange(value);
    }
  };

  /**
   * Formats the value of a decimal input field on blur.
   * Converts the string input (or existing number) to a number, ensures it's positive,
   * formats to two decimal places, and updates the react-hook-form field state.
   * @param {string | number | null | undefined} value The current value of the input field (can be string from input, or number from state).
   * @param {keyof StockAnalysisParams} fieldName The name of the form field to update using `form.setValue`.
   */
  const handleBlurFormatting = (
    value: string | number | null | undefined,
    fieldName: keyof StockAnalysisParams
  ) => {
    let numValue = 0; // Default to 0 if parsing fails or input is empty/invalid
    if (typeof value === "string") {
      if (value.trim() === "" || value === ".") {
        // Handle cases like empty or just a decimal point
        numValue = 0;
      } else {
        numValue = parseFloat(value);
        if (isNaN(numValue)) numValue = 0;
      }
    } else if (typeof value === "number") {
      numValue = value;
    }
    // Ensure the value is non-negative and then format to two decimal places.
    // Update the form state with the processed number.
    form.setValue(fieldName, Math.max(0, parseFloat(numValue.toFixed(2))), {
      shouldValidate: true,
      shouldDirty: true,
    });
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
                    {countries.map((country) => (
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
                  disabled={
                    isLoading ||
                    loadingState.stockMarkets ||
                    stockMarkets.length === 0 ||
                    !form.watch("country")
                  }
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
                    {stockMarkets.map((market) => (
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
                  disabled={
                    isLoading ||
                    loadingState.assetClasses ||
                    assetClasses.length === 0 ||
                    !form.watch("stockMarket")
                  }
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
                    {assetClasses.map((assetClass) => (
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
                      value={
                        isEntryPriceFocused
                          ? field.value === null || field.value === undefined
                            ? ""
                            : String(field.value)
                          : typeof field.value === "number"
                            ? field.value.toFixed(2)
                            : ""
                      }
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
                      value={
                        isStopPriceFocused
                          ? field.value === null || field.value === undefined
                            ? ""
                            : String(field.value)
                          : typeof field.value === "number"
                            ? field.value.toFixed(2)
                            : ""
                      }
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
                      {selectedStocks.map((stock) => (
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
          ) : (
            "Show Results"
          )}
        </Button>

        {isTableValid === false && (
          <div className="text-sm text-destructive">
            The selected data source could not be accessed. Please select a different combination or
            contact support.
          </div>
        )}
      </form>
    </Form>
  );
}
