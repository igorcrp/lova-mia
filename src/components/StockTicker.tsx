
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
        // The API is expecting a string array for stock symbols
        const stockSymbols: string[] = ["AAPL", "MSFT", "GOOGL", "AMZN", "META"];
        const data = await api.analysis.getLiveQuotes(stockSymbols);
        setQuotes(data);
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
            <span 
              className={`ml-2 ${quote.change >= 0 ? 'text-green-500' : 'text-red-500'}`}
            >
              {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
