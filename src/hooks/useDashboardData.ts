
import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchIndexDataViaScraping, fetchStocksForIndexViaScraping, type IndexData, type StockData } from '@/services/scrapingService';
import { fetchEconomicData } from '@/services/yahooFinanceService';

// Cache global para evitar recarregamentos desnecessários
const globalCache = {
  indices: [] as IndexData[],
  stocks: {} as Record<string, { gainers: StockData[], losers: StockData[] }>,
  lastUpdate: 0,
  isInitialized: false
};

export const useDashboardData = () => {
  const [indices, setIndices] = useState<IndexData[]>(globalCache.indices);
  const [selectedIndex, setSelectedIndex] = useState<string>('^GSPC');
  const [stocks, setStocks] = useState<{ gainers: StockData[], losers: StockData[] }>(
    globalCache.stocks['^GSPC'] || { gainers: [], losers: [] }
  );
  const [economicData] = useState(fetchEconomicData());
  const [loading, setLoading] = useState(!globalCache.isInitialized);
  const [stocksLoading, setStocksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Ordem fixa dos índices para evitar reordenação
  const FIXED_INDEX_ORDER = [
    '^GSPC', '^DJI', '^IXIC', '^BVSP', '^FTSE', 
    '^GDAXI', '^FCHI', '^N225', '^HSI', '000001.SS'
  ];

  const loadIndices = useCallback(async (showLoading = false) => {
    console.log('Loading indices data via web scraping...');
    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await fetchIndexDataViaScraping();
      console.log('Indices loaded:', data.length, data);
      
      // Manter ordem fixa dos índices
      const sortedIndices = FIXED_INDEX_ORDER.map(symbol => 
        data.find(idx => idx.symbol === symbol)
      ).filter(Boolean) as IndexData[];
      
      // Adicionar qualquer índice extra que não esteja na ordem fixa
      const extraIndices = data.filter(idx => !FIXED_INDEX_ORDER.includes(idx.symbol));
      const finalIndices = [...sortedIndices, ...extraIndices];
      
      // Atualizar cache global
      globalCache.indices = finalIndices;
      globalCache.lastUpdate = Date.now();
      globalCache.isInitialized = true;
      
      setIndices(finalIndices);
      
      // Definir índice padrão apenas se não estiver definido
      if (!selectedIndex && finalIndices.length > 0) {
        const defaultIndex = finalIndices.find(idx => idx.symbol === '^GSPC') || finalIndices[0];
        setSelectedIndex(defaultIndex.symbol);
      }
    } catch (error) {
      console.error('Error loading indices:', error);
      setError('Failed to load indices data');
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [selectedIndex]);

  const loadStocks = useCallback(async (indexSymbol: string, showLoading = false) => {
    console.log(`Loading stocks for index: ${indexSymbol} via web scraping...`);
    if (showLoading) {
      setStocksLoading(true);
    }
    try {
      const stockData = await fetchStocksForIndexViaScraping(indexSymbol);
      console.log('Stocks loaded:', stockData);
      
      // Ordenar stocks por maiores altas e maiores baixas
      const sortedGainers = stockData.gainers
        .sort((a, b) => {
          const aPercent = parseFloat(a.changePercent.replace(/[+%]/g, ''));
          const bPercent = parseFloat(b.changePercent.replace(/[+%]/g, ''));
          return bPercent - aPercent; // Ordem decrescente para maiores altas
        })
        .slice(0, 5);

      const sortedLosers = stockData.losers
        .sort((a, b) => {
          const aPercent = parseFloat(a.changePercent.replace(/[+%-]/g, ''));
          const bPercent = parseFloat(b.changePercent.replace(/[+%-]/g, ''));
          const aIsNegative = a.changePercent.includes('-');
          const bIsNegative = b.changePercent.includes('-');
          
          // Priorizar negativos e ordenar por maior queda
          if (aIsNegative && !bIsNegative) return -1;
          if (!aIsNegative && bIsNegative) return 1;
          if (aIsNegative && bIsNegative) return aPercent - bPercent; // Maior queda primeiro
          return aPercent - bPercent; // Menor positivo primeiro
        })
        .slice(0, 5);

      const finalStockData = {
        gainers: sortedGainers,
        losers: sortedLosers
      };
      
      // Atualizar cache global
      globalCache.stocks[indexSymbol] = finalStockData;
      
      setStocks(finalStockData);
    } catch (error) {
      console.error('Error loading stocks:', error);
      setStocks({ gainers: [], losers: [] });
    } finally {
      if (showLoading) {
        setStocksLoading(false);
      }
    }
  }, []);

  // Função para atualizar dados automaticamente
  const updateData = useCallback(async () => {
    console.log('Auto-updating data...');
    await Promise.all([
      loadIndices(false), // Não mostrar loading na atualização automática
      loadStocks(selectedIndex, false)
    ]);
  }, [selectedIndex, loadIndices, loadStocks]);

  // Inicialização e setup do intervalo de atualização
  useEffect(() => {
    // Se os dados já estão no cache, usar eles
    if (globalCache.isInitialized) {
      setIndices(globalCache.indices);
      setLoading(false);
      
      // Se temos stocks em cache para o índice selecionado, usar eles
      if (globalCache.stocks[selectedIndex]) {
        setStocks(globalCache.stocks[selectedIndex]);
      }
    } else {
      // Primeira carga
      loadIndices(true);
    }

    // Configurar intervalo de atualização automática a cada 5 minutos
    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
    }
    
    updateIntervalRef.current = setInterval(updateData, 5 * 60 * 1000); // 5 minutos
    
    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [updateData, selectedIndex, loadIndices]);

  // Carregar stocks quando o índice selecionado muda
  useEffect(() => {
    if (selectedIndex) {
      // Se temos stocks em cache, usar eles, senão carregar
      if (globalCache.stocks[selectedIndex]) {
        setStocks(globalCache.stocks[selectedIndex]);
      } else {
        loadStocks(selectedIndex, true);
      }
    }
  }, [selectedIndex, loadStocks]);

  const handleIndexClick = useCallback((symbol: string) => {
    console.log(`Index clicked: ${symbol}`);
    if (symbol !== selectedIndex) {
      setSelectedIndex(symbol);
      // Carregar stocks imediatamente sem mostrar loading se já temos cache
      if (globalCache.stocks[symbol]) {
        setStocks(globalCache.stocks[symbol]);
      } else {
        // Se não temos cache, carregar imediatamente
        loadStocks(symbol, true);
      }
    }
  }, [selectedIndex, loadStocks]);

  return {
    indices,
    stocks,
    economicData,
    selectedIndex,
    loading,
    stocksLoading,
    error,
    handleIndexClick
  };
};
