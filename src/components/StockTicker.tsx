import React, { useEffect, useState } from "react";
import { api } from "@/services/api";

interface StockQuote {
  symbol: string;
  price: number;
  change: number;
}

export function StockTicker() {
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchQuotes = async () => {
      try {
        // Dados de exemplo já que a API não tem o método getLiveQuotes
        const mockData: StockQuote[] = [
          { symbol: "AAPL", price: 182.63, change: 0.75 },
          { symbol: "MSFT", price: 417.88, change: -0.32 },
          { symbol: "GOOGL", price: 175.09, change: 1.24 },
          { symbol: "AMZN", price: 186.45, change: 0.89 },
          { symbol: "META", price: 478.22, change: -0.45 },
        ];

        setQuotes(mockData);
      } catch (error) {
        console.error("Failed to fetch quotes", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuotes();

    // In a real app, we would set up a websocket or polling
    const interval = setInterval(fetchQuotes, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="h-12 bg-sidebar/50 border-b border-border flex items-center px-4">
        <span className="text-muted-foreground text-sm">Loading quotes...</span>
      </div>
    );
  }

  return (
    <div className="h-12 bg-sidebar/50 border-b border-border overflow-hidden">
      <div className="flex items-center px-4 h-full animate-ticker">
        {quotes.map((quote) => (
          <div key={quote.symbol} className="flex items-center mr-6">
            <span className="font-medium">{quote.symbol}</span>
            <span className="ml-2">${quote.price.toFixed(2)}</span>
            <span className={`ml-2 ${quote.change >= 0 ? "text-green-500" : "text-red-500"}`}>
              {quote.change >= 0 ? "+" : ""}
              {quote.change.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
