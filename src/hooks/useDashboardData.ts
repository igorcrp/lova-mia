
import { useState, useEffect } from 'react';
import { fetchIndexData, fetchStocksForIndex, fetchEconomicData, type IndexData, type StockData, type EconomicData } from '@/services/yahooFinanceService';

export const useDashboardData = () => {
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<string>('^GSPC');
  const [stocks, setStocks] = useState<{ gainers: StockData[], losers: StockData[] }>({ gainers: [], losers: [] });
  const [economicData] = useState<EconomicData[]>(fetchEconomicData());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadIndices = async () => {
      setLoading(true);
      const data = await fetchIndexData();
      setIndices(data);
      setLoading(false);
    };

    loadIndices();
    
    // Refresh data every 30 seconds
    const interval = setInterval(loadIndices, 30000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadStocks = async () => {
      if (selectedIndex) {
        const stockData = await fetchStocksForIndex(selectedIndex);
        setStocks(stockData);
      }
    };

    loadStocks();
  }, [selectedIndex]);

  const handleIndexClick = (symbol: string) => {
    setSelectedIndex(symbol);
  };

  return {
    indices,
    stocks,
    economicData,
    selectedIndex,
    loading,
    handleIndexClick
  };
};
