
import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, ArrowUpDown, Filter } from "lucide-react";
import { AnalysisResult } from "@/types";
import { useSubscription } from "@/hooks/useSubscription";

interface ResultsTableProps {
  results: AnalysisResult[];
  onViewDetails: (assetCode: string) => void;
  isLoading: boolean;
}

export function ResultsTable({ results, onViewDetails, isLoading }: ResultsTableProps) {
  const { isFree } = useSubscription();
  const [sortField, setSortField] = useState<keyof AnalysisResult>("profit");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [filterProfit, setFilterProfit] = useState<"all" | "positive" | "negative">("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Apply sorting, filtering, and searching
  const processedResults = useMemo(() => {
    let filtered = [...results];

    // Apply search filter (disabled for free users)
    if (!isFree && searchTerm) {
      filtered = filtered.filter(result => 
        result.assetCode.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply profit filter (disabled for free users)
    if (!isFree && filterProfit !== "all") {
      filtered = filtered.filter(result => {
        if (filterProfit === "positive") return (result.profit || 0) > 0;
        if (filterProfit === "negative") return (result.profit || 0) < 0;
        return true;
      });
    }

    // Apply sorting (disabled for free users)
    if (!isFree) {
      filtered.sort((a, b) => {
        const aValue = a[sortField] || 0;
        const bValue = b[sortField] || 0;
        
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
        }
        
        const aStr = String(aValue).toLowerCase();
        const bStr = String(bValue).toLowerCase();
        return sortDirection === "asc" 
          ? aStr.localeCompare(bStr) 
          : bStr.localeCompare(aStr);
      });
    }

    // Limit results for free users (only first 10)
    if (isFree) {
      filtered = filtered.slice(0, 10);
    }

    return filtered;
  }, [results, sortField, sortDirection, filterProfit, searchTerm, isFree]);

  const handleSort = (field: keyof AnalysisResult) => {
    if (isFree) return; // Disable sorting for free users
    
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const formatCurrency = (value: number | undefined): string => {
    if (value === undefined || value === null) return "$0.00";
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatPercentage = (value: number | undefined): string => {
    if (value === undefined || value === null) return "0.00%";
    return `${value.toFixed(2)}%`;
  };

  const getProfitBadgeVariant = (profit: number | undefined) => {
    if (!profit) return "secondary";
    return profit > 0 ? "default" : "destructive";
  };

  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">No results available. Run an analysis to see data.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Analysis Results</CardTitle>
          <div className="flex items-center space-x-2">
            {isFree && (
              <Badge variant="secondary" className="text-xs">
                Showing 10 of {results.length} results (Free Plan)
              </Badge>
            )}
            {!isFree && (
              <Badge variant="outline" className="text-xs">
                {processedResults.length} results
              </Badge>
            )}
          </div>
        </div>
        
        {/* Filters - disabled for free users */}
        {!isFree && (
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by asset code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <Select value={filterProfit} onValueChange={setFilterProfit}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by profit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Results</SelectItem>
                <SelectItem value="positive">Positive Only</SelectItem>
                <SelectItem value="negative">Negative Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("assetCode")}
                    className={`h-auto p-0 font-semibold ${isFree ? 'cursor-not-allowed opacity-50' : ''}`}
                    disabled={isFree}
                  >
                    Asset Code
                    {!isFree && sortField === "assetCode" && (
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    )}
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("trades")}
                    className={`h-auto p-0 font-semibold ${isFree ? 'cursor-not-allowed opacity-50' : ''}`}
                    disabled={isFree}
                  >
                    Trades
                    {!isFree && sortField === "trades" && (
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    )}
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("profit")}
                    className={`h-auto p-0 font-semibold ${isFree ? 'cursor-not-allowed opacity-50' : ''}`}
                    disabled={isFree}
                  >
                    Profit/Loss
                    {!isFree && sortField === "profit" && (
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    )}
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("successRate")}
                    className={`h-auto p-0 font-semibold ${isFree ? 'cursor-not-allowed opacity-50' : ''}`}
                    disabled={isFree}
                  >
                    Success Rate
                    {!isFree && sortField === "successRate" && (
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    )}
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("finalCapital")}
                    className={`h-auto p-0 font-semibold ${isFree ? 'cursor-not-allowed opacity-50' : ''}`}
                    disabled={isFree}
                  >
                    Final Capital
                    {!isFree && sortField === "finalCapital" && (
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    )}
                  </Button>
                </TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {processedResults.map((result) => (
                <TableRow key={result.assetCode}>
                  <TableCell className="font-medium">
                    {result.assetCode}
                  </TableCell>
                  <TableCell className="text-right">
                    {result.trades || 0}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={getProfitBadgeVariant(result.profit)}>
                      {formatCurrency(result.profit)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPercentage(result.successRate)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(result.finalCapital)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onViewDetails(result.assetCode)}
                      disabled={isLoading}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        
        {isFree && results.length > 10 && (
          <div className="mt-4 text-center text-sm text-muted-foreground">
            Showing 10 of {results.length} results. 
            <span className="ml-1 font-medium">Upgrade to Premium to see all results and use filters.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
