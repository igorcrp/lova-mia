import React, { useState, useEffect } from 'react';
import { api } from '@/services/api';
import { Asset } from '@/types';
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const assetFormSchema = z.object({
  code: z.string().min(2, {
    message: "Code must be at least 2 characters.",
  }),
  name: z.string().min(2, {
    message: "Name must be at least 2 characters.",
  }),
  country: z.string().min(2, {
    message: "Country must be selected.",
  }),
  stockMarket: z.string().min(2, {
    message: "Stock Market must be selected.",
  }),
  assetClass: z.string().min(2, {
    message: "Asset Class must be selected.",
  }),
})

export default function AdminAssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [stockMarkets, setStockMarkets] = useState<string[]>([]);
  const [assetClasses, setAssetClasses] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedStockMarket, setSelectedStockMarket] = useState<string>('');
  const [selectedAssetClass, setSelectedAssetClass] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [totalAssets, setTotalAssets] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof assetFormSchema>>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: {
      code: "",
      name: "",
      country: "",
      stockMarket: "",
      assetClass: "",
    },
  })

  async function onSubmit(formData: z.infer<typeof assetFormSchema>) {
    try {
      setIsLoading(true);

      const newAsset: Omit<Asset, 'id'> = {
        code: formData.code,
        name: formData.name,
        country: formData.country,
        stock_market: formData.stockMarket,
        asset_class: formData.assetClass,
        status: 'active'
      };

      const createdAsset = await api.assets.createAsset(newAsset);

      setAssets([...assets, createdAsset]);
      toast({
        title: "Asset created successfully.",
        description: "The new asset has been added to the list.",
      })
      form.reset();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error creating asset.",
        description: "There was an error creating the asset. Please try again.",
      })
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const loadCountries = async () => {
      const countries = await api.marketData.getCountries();
      setCountries(countries);
    };

    loadCountries();
  }, []);

  useEffect(() => {
    const loadStockMarkets = async () => {
      if (selectedCountry) {
        const stockMarkets = await api.marketData.getStockMarkets(selectedCountry);
        setStockMarkets(stockMarkets);
      } else {
        setStockMarkets([]);
      }
    };

    loadStockMarkets();
  }, [selectedCountry]);

  useEffect(() => {
    const loadAssetClasses = async () => {
      if (selectedCountry && selectedStockMarket) {
        const assetClasses = await api.marketData.getAssetClasses(selectedCountry, selectedStockMarket);
        setAssetClasses(assetClasses);
      } else {
        setAssetClasses([]);
      }
    };

    loadAssetClasses();
  }, [selectedCountry, selectedStockMarket]);

  useEffect(() => {
    const loadAssets = async () => {
      setIsLoading(true);
      try {
        const result = await api.assets.getAssets(currentPage, searchTerm, selectedCountry, selectedStockMarket, selectedAssetClass);
        setAssets(result.data);
        setTotalAssets(result.total);
      } catch (error) {
        console.error("Error loading assets:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load assets. Please try again."
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadAssets();
  }, [currentPage, searchTerm, selectedCountry, selectedStockMarket, selectedAssetClass]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Admin Assets</h1>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">Create New Asset</h2>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input placeholder="Asset Code" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Asset Name" {...field} />
                    </FormControl>
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
                    <Select onValueChange={(value) => {
                      field.onChange(value)
                      setSelectedCountry(value)
                    }} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a country" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {countries.map((country) => (
                          <SelectItem key={country} value={country}>{country}</SelectItem>
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
                    <Select onValueChange={(value) => {
                      field.onChange(value)
                      setSelectedStockMarket(value)
                    }} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a stock market" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {stockMarkets.map((market) => (
                          <SelectItem key={market} value={market}>{market}</SelectItem>
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an asset class" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {assetClasses.map((assetClass) => (
                          <SelectItem key={assetClass} value={assetClass}>{assetClass}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Creating..." : "Create Asset"}
              </Button>
            </form>
          </Form>
        </div>

        <div className="bg-card p-6 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">Assets List</h2>
          <Table>
            <TableCaption>A list of your assets.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Stock Market</TableHead>
                <TableHead>Asset Class</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="font-medium">{asset.code}</TableCell>
                  <TableCell>{asset.name}</TableCell>
                  <TableCell>{asset.country}</TableCell>
                  <TableCell>{asset.stock_market}</TableCell>
                  <TableCell>{asset.asset_class}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
