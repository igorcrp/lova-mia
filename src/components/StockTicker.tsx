
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
        // Mock data for now since getLiveQuotes doesn't exist in the API
        const mockQuotes: StockQuote[] = [
          { symbol: "AAPL", price: 173.50, change: 1.2 },
          { symbol: "MSFT", price: 337.25, change: -0.8 },
          { symbol: "GOOGL", price: 126.75, change: 2.1 },
          { symbol: "AMZN", price: 144.30, change: -1.5 },
          { symbol: "META", price: 298.80, change: 0.9 }
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
