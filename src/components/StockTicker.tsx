
import React, { useEffect, useState } from "react";

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
        // For now, we'll use mock data since the API method doesn't exist
        const mockQuotes: StockQuote[] = [
          { symbol: "AAPL", price: 150.25, change: 2.15 },
          { symbol: "MSFT", price: 285.75, change: -1.25 },
          { symbol: "GOOGL", price: 125.50, change: 0.85 },
          { symbol: "AMZN", price: 95.75, change: -0.50 },
          { symbol: "META", price: 245.30, change: 3.20 }
        ];
        setQuotes(mockQuotes);
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
