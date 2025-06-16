
import { useState, useEffect, useCallback } from 'react';
import { fetchIndexData, fetchStocksForIndex, fetchEconomicData, type IndexData, type StockData } from '@/services/alphaVantageService';

export const useDashboardData = () => {
  const [indices, setIndices] = useState<IndexData[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<string>('SPY');
  const [stocks, setStocks] = useState<{ gainers: StockData[], losers: StockData[] }>({ gainers: [], losers: [] });
  const [economicData] = useState(fetchEconomicData());
  const [loading, setLoading] = useState(true);
  const [stocksLoading, setStocksLoading] = useState(false);

  const loadIndices = useCallback(async () => {
    console.log('Loading indices data...');
    setLoading(true);
    try {
      const data = await fetchIndexData();
      console.log('Indices loaded:', data.length);
      setIndices(data);
    } catch (error) {
      console.error('Error loading indices:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStocks = useCallback(async (indexSymbol: string) => {
    console.log(`Loading stocks for index: ${indexSymbol}`);
    setStocksLoading(true);
    try {
      const stockData = await fetchStocksForIndex(indexSymbol);
      console.log('Stocks loaded:', stockData);
      setStocks(stockData);
    } catch (error) {
      console.error('Error loading stocks:', error);
      setStocks({ gainers: [], losers: [] });
    } finally {
      setStocksLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIndices();
  }, [loadIndices]);

  useEffect(() => {
    if (selectedIndex) {
      loadStocks(selectedIndex);
    }
  }, [selectedIndex, loadStocks]);

  const handleIndexClick = useCallback((symbol: string) => {
    console.log(`Index clicked: ${symbol}`);
    setSelectedIndex(symbol);
  }, []);

  return {
    indices,
    stocks,
    economicData,
    selectedIndex,
    loading,
    stocksLoading,
    handleIndexClick
  };
};
