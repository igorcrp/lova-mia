
const ALPHA_VANTAGE_API_KEY = '7DH8ULRRFMATOFC5';
const BASE_URL = 'https://www.alphavantage.co/query';

export interface IndexData {
  symbol: string;
  name: string;
  value: string;
  changePercent: string;
  isNegative: boolean;
}

export interface StockData {
  symbol: string;
  price: string;
  changePercent: string;
}

// Mapear símbolos para nomes mais amigáveis
const INDEX_NAMES: { [key: string]: string } = {
  'SPY': 'S&P 500 (US)',
  'DJI': 'Dow Jones (US)',
  'IXIC': 'Nasdaq (US)',
  'BVSP': 'Ibovespa (Brazil)',
  'UKX': 'FTSE 100 (UK)',
  'DAX': 'DAX (Germany)',
  'CAC': 'CAC 40 (France)',
  'N225': 'Nikkei 225 (Japan)',
  'HSI': 'Hang Seng (Hong Kong)',
  'SHCOMP': 'Shanghai Composite (China)'
};

const MAJOR_INDICES = ['SPY', 'DJI', 'IXIC', 'BVSP', 'UKX', 'DAX', 'CAC', 'N225', 'HSI', 'SHCOMP'];

// Mapear índices para suas principais ações
const INDEX_STOCKS: { [key: string]: string[] } = {
  'SPY': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'BRK.B', 'JNJ', 'V'],
  'DJI': ['AAPL', 'MSFT', 'UNH', 'GS', 'HD', 'MCD', 'CAT', 'AMGN', 'V', 'BA'],
  'IXIC': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'ADBE', 'CRM'],
  'BVSP': ['PETR4.SA', 'VALE3.SA', 'ITUB4.SA', 'BBDC4.SA', 'ABEV3.SA', 'WEGE3.SA', 'RENT3.SA', 'LREN3.SA', 'MGLU3.SA', 'JBSS3.SA'],
  'UKX': ['AZN.L', 'SHEL.L', 'LSEG.L', 'UU.L', 'ULVR.L', 'RKT.L', 'RELX.L', 'BP.L', 'GSK.L', 'DGE.L'],
  'DAX': ['SAP.DE', 'ASME.DE', 'SIE.DE', 'ALV.DE', 'DTE.DE', 'MUV2.DE', 'AIR.DE', 'BAS.DE', 'BMW.DE', 'VOW3.DE'],
  'CAC': ['LVMH.PA', 'TTE.PA', 'ASML.PA', 'OR.PA', 'SAP.PA', 'SAN.PA', 'RMS.PA', 'MC.PA', 'BNP.PA', 'AIR.PA'],
  'N225': ['TYO:7203', 'TYO:6758', 'TYO:6981', 'TYO:9984', 'TYO:6954', 'TYO:8316', 'TYO:8306', 'TYO:7974', 'TYO:4063', 'TYO:6861'],
  'HSI': ['0700.HK', '0941.HK', '3690.HK', '2318.HK', '1299.HK', '0005.HK', '2628.HK', '1398.HK', '3968.HK', '0939.HK'],
  'SHCOMP': ['600036.SS', '000858.SZ', '600519.SS', '000001.SZ', '002415.SZ', '600276.SS', '601318.SS', '000002.SZ', '600887.SS', '601166.SS']
};

// Dados mock para fallback quando a API falha
const MOCK_INDEX_DATA: IndexData[] = [
  { symbol: 'SPY', name: 'S&P 500 (US)', value: '5,870.62', changePercent: '0.25%', isNegative: false },
  { symbol: 'DJI', name: 'Dow Jones (US)', value: '43,487.19', changePercent: '0.42%', isNegative: false },
  { symbol: 'IXIC', name: 'Nasdaq (US)', value: '18,884.43', changePercent: '0.83%', isNegative: false },
  { symbol: 'BVSP', name: 'Ibovespa (Brazil)', value: '124,218.61', changePercent: '1.15%', isNegative: false },
  { symbol: 'UKX', name: 'FTSE 100 (UK)', value: '8,184.74', changePercent: '0.31%', isNegative: false },
  { symbol: 'DAX', name: 'DAX (Germany)', value: '19,461.63', changePercent: '0.64%', isNegative: false },
  { symbol: 'CAC', name: 'CAC 40 (France)', value: '7,334.93', changePercent: '0.28%', isNegative: false },
  { symbol: 'N225', name: 'Nikkei 225 (Japan)', value: '39,180.30', changePercent: '0.19%', isNegative: false },
  { symbol: 'HSI', name: 'Hang Seng (Hong Kong)', value: '19,846.88', changePercent: '1.32%', isNegative: false },
  { symbol: 'SHCOMP', name: 'Shanghai Composite (China)', value: '3,367.50', changePercent: '0.76%', isNegative: false }
];

const MOCK_STOCKS_DATA: { [key: string]: { gainers: StockData[], losers: StockData[] } } = {
  'SPY': {
    gainers: [
      { symbol: 'NVDA', price: '140.15', changePercent: '+3.45%' },
      { symbol: 'TSLA', price: '248.98', changePercent: '+2.87%' },
      { symbol: 'META', price: '563.27', changePercent: '+2.12%' },
      { symbol: 'GOOGL', price: '175.35', changePercent: '+1.78%' },
      { symbol: 'AAPL', price: '229.87', changePercent: '+1.23%' }
    ],
    losers: [
      { symbol: 'JNJ', price: '148.73', changePercent: '-1.87%' },
      { symbol: 'V', price: '298.45', changePercent: '-1.34%' },
      { symbol: 'BRK.B', price: '465.21', changePercent: '-0.98%' },
      { symbol: 'MSFT', price: '429.86', changePercent: '-0.65%' },
      { symbol: 'AMZN', price: '195.43', changePercent: '-0.32%' }
    ]
  },
  'DJI': {
    gainers: [
      { symbol: 'AAPL', price: '229.87', changePercent: '+2.14%' },
      { symbol: 'MSFT', price: '429.86', changePercent: '+1.67%' },
      { symbol: 'CAT', price: '385.92', changePercent: '+1.45%' },
      { symbol: 'HD', price: '412.83', changePercent: '+1.22%' },
      { symbol: 'UNH', price: '598.74', changePercent: '+0.98%' }
    ],
    losers: [
      { symbol: 'BA', price: '178.45', changePercent: '-2.15%' },
      { symbol: 'MCD', price: '294.67', changePercent: '-1.43%' },
      { symbol: 'GS', price: '567.89', changePercent: '-1.12%' },
      { symbol: 'AMGN', price: '267.34', changePercent: '-0.87%' },
      { symbol: 'V', price: '298.45', changePercent: '-0.56%' }
    ]
  }
};

// Função para verificar se a resposta indica rate limit
const isRateLimited = (data: any): boolean => {
  return data && data.Information && data.Information.includes('rate limit');
};

// Função para verificar se a resposta está vazia ou inválida
const isInvalidResponse = (data: any): boolean => {
  return !data || Object.keys(data).length === 0 || !data['Global Quote'];
};

export const fetchIndexData = async (): Promise<IndexData[]> => {
  console.log('Fetching index data from Alpha Vantage...');
  
  try {
    // Tentar buscar dados reais primeiro, mas com timeout
    const promises = MAJOR_INDICES.slice(0, 3).map(async (symbol) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const url = `${BASE_URL}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`;
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        const data = await response.json();
        
        if (isRateLimited(data)) {
          console.warn(`Rate limit reached for ${symbol}, using mock data`);
          return null;
        }
        
        if (isInvalidResponse(data)) {
          console.warn(`Invalid response for ${symbol}, using mock data`);
          return null;
        }

        const quote = data['Global Quote'];
        const price = parseFloat(quote['05. price']) || 0;
        const changePercent = parseFloat(quote['10. change percent']?.replace('%', '')) || 0;
        
        return {
          symbol,
          name: INDEX_NAMES[symbol] || symbol,
          value: price.toFixed(2),
          changePercent: `${Math.abs(changePercent).toFixed(2)}%`,
          isNegative: changePercent < 0
        };
      } catch (error) {
        console.warn(`Error fetching ${symbol}:`, error);
        return null;
      }
    });

    const results = await Promise.all(promises);
    const validResults = results.filter(result => result !== null) as IndexData[];
    
    // Se conseguiu menos de 2 resultados válidos, usar dados mock
    if (validResults.length < 2) {
      console.log('Using mock data due to API limitations');
      return MOCK_INDEX_DATA;
    }
    
    // Completar com dados mock para os índices que falharam
    const fetchedSymbols = validResults.map(r => r.symbol);
    const mockDataForMissing = MOCK_INDEX_DATA.filter(mock => !fetchedSymbols.includes(mock.symbol));
    
    return [...validResults, ...mockDataForMissing].slice(0, 10);
    
  } catch (error) {
    console.error('Error fetching index data, using mock data:', error);
    return MOCK_INDEX_DATA;
  }
};

export const fetchStocksForIndex = async (indexSymbol: string = 'SPY'): Promise<{ gainers: StockData[], losers: StockData[] }> => {
  console.log(`Fetching stocks for index: ${indexSymbol}`);
  
  try {
    const stocks = INDEX_STOCKS[indexSymbol] || INDEX_STOCKS['SPY'];
    
    // Tentar buscar apenas as primeiras 3 ações para evitar rate limit
    const limitedStocks = stocks.slice(0, 3);
    
    const promises = limitedStocks.map(async (stock) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const url = `${BASE_URL}?function=GLOBAL_QUOTE&symbol=${stock}&apikey=${ALPHA_VANTAGE_API_KEY}`;
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        const data = await response.json();
        
        if (isRateLimited(data) || isInvalidResponse(data)) {
          return null;
        }

        const quote = data['Global Quote'];
        const price = parseFloat(quote['05. price']) || 0;
        const changePercent = parseFloat(quote['10. change percent']?.replace('%', '')) || 0;
        
        return {
          symbol: stock,
          price: price.toFixed(2),
          changePercent: quote['10. change percent'] || '0.00%',
          changeValue: changePercent
        };
      } catch (error) {
        console.warn(`Error fetching stock ${stock}:`, error);
        return null;
      }
    });

    const results = await Promise.all(promises);
    const validStocks = results.filter(result => result !== null) as (StockData & { changeValue: number })[];
    
    // Se não conseguiu dados válidos suficientes, usar mock data
    if (validStocks.length < 2) {
      console.log(`Using mock stock data for ${indexSymbol}`);
      return MOCK_STOCKS_DATA[indexSymbol] || MOCK_STOCKS_DATA['SPY'];
    }
    
    // Ordenar por mudança percentual
    validStocks.sort((a, b) => b.changeValue - a.changeValue);
    
    const gainers = validStocks.filter(s => s.changeValue > 0).slice(0, 5).map(stock => ({
      symbol: stock.symbol,
      price: stock.price,
      changePercent: stock.changePercent
    }));
    
    const losers = validStocks.filter(s => s.changeValue < 0).slice(-5).reverse().map(stock => ({
      symbol: stock.symbol,
      price: stock.price,
      changePercent: stock.changePercent
    }));

    // Se não há dados suficientes, completar com mock
    if (gainers.length === 0 && losers.length === 0) {
      return MOCK_STOCKS_DATA[indexSymbol] || MOCK_STOCKS_DATA['SPY'];
    }

    return { gainers, losers };
  } catch (error) {
    console.error('Error fetching stocks data, using mock data:', error);
    return MOCK_STOCKS_DATA[indexSymbol] || MOCK_STOCKS_DATA['SPY'];
  }
};

export const fetchEconomicData = () => {
  return [
    { name: "GDP Growth", value: "2.1%", trend: "up" },
    { name: "Unemployment", value: "3.7%", trend: "down" },
    { name: "Inflation", value: "3.2%", trend: "up" },
    { name: "Interest Rate", value: "5.25%", trend: "stable" }
  ];
};
