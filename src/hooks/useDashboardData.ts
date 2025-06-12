
import { useState, useEffect } from 'react';
import { yahooFinanceService, MarketIndex, StockData, getEconomicIndicators, MARKET_INDICES } from '@/services/yahooFinanceService';

export const useDashboardData = () => {
  const [marketIndices, setMarketIndices] = useState<MarketIndex[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<string>('^GSPC'); // Default to S&P 500
  const [topStocks, setTopStocks] = useState<{ gainers: StockData[], losers: StockData[] }>({ gainers: [], losers: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load market indices
  useEffect(() => {
    const loadMarketData = async () => {
      try {
        setLoading(true);
        const indices = await yahooFinanceService.getAllMarketIndices();
        setMarketIndices(indices);
        setError(null);
      } catch (err) {
        setError('Failed to load market data');
        console.error('Error loading market data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadMarketData();
    
    // Refresh data every 5 minutes
    const interval = setInterval(loadMarketData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Load top stocks when selected index changes
  useEffect(() => {
    const loadTopStocks = async () => {
      try {
        const stocks = await yahooFinanceService.getTopStocksForIndex(selectedIndex);
        setTopStocks(stocks);
      } catch (err) {
        console.error('Error loading top stocks:', err);
      }
    };

    if (selectedIndex) {
      loadTopStocks();
    }
  }, [selectedIndex]);

  const handleIndexClick = (indexName: string) => {
    const symbol = MARKET_INDICES[indexName as keyof typeof MARKET_INDICES];
    if (symbol) {
      setSelectedIndex(symbol);
    }
  };

  const economicIndicators = getEconomicIndicators();

  const marketStatus = [
    { region: "Asian", status: "Closed", color: "bg-red-100 text-red-800" },
    { region: "European", status: "Open", color: "bg-green-100 text-green-800" },
    { region: "American", status: "Open", color: "bg-green-100 text-green-800" }
  ];

  const news = [
    "US-China trade negotiations in London",
    "Provisional Measure on IOF in Brazil", 
    "Inflation expectations in the US",
    "American oil production under new administration"
  ];

  return {
    marketIndices,
    selectedIndex,
    topStocks,
    loading,
    error,
    handleIndexClick,
    economicIndicators,
    marketStatus,
    news
  };
};
