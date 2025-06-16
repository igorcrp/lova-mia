
const FINNHUB_API_KEY = 'd182ba9r01ql1b4lc0r0d182ba9r01ql1b4lc0rg';
const BASE_URL = 'https://finnhub.io/api/v1';

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

const MAJOR_INDICES = ['SPY', 'DJI', 'QQQ', 'EWZ', 'EWU', 'EWG', 'EWQ', 'EWJ', 'EWH', 'ASHR'];

// Mapear índices para suas principais ações
const INDEX_STOCKS: { [key: string]: string[] } = {
  'SPY': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM', 'JNJ', 'V'],
  'DJI': ['AAPL', 'MSFT', 'UNH', 'GS', 'HD', 'MCD', 'CAT', 'AMGN', 'V', 'BA'],
  'QQQ': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'ADBE', 'CRM'],
  'EWZ': ['PETR4.SA', 'VALE3.SA', 'ITUB4.SA', 'BBDC4.SA', 'ABEV3.SA', 'WEGE3.SA', 'RENT3.SA', 'LREN3.SA', 'MGLU3.SA', 'JBSS3.SA'],
  'EWU': ['AZN.L', 'SHEL.L', 'LSEG.L', 'UU.L', 'ULVR.L', 'RKT.L', 'RELX.L', 'BP.L', 'GSK.L', 'DGE.L'],
  'EWG': ['SAP.DE', 'ASME.DE', 'SIE.DE', 'ALV.DE', 'DTE.DE', 'MUV2.DE', 'AIR.DE', 'BAS.DE', 'BMW.DE', 'VOW3.DE'],
  'EWQ': ['LVMH.PA', 'TTE.PA', 'ASML.PA', 'OR.PA', 'SAP.PA', 'SAN.PA', 'RMS.PA', 'MC.PA', 'BNP.PA', 'AIR.PA'],
  'EWJ': ['TYO:7203', 'TYO:6758', 'TYO:6981', 'TYO:9984', 'TYO:6954', 'TYO:8316', 'TYO:8306', 'TYO:7974', 'TYO:4063', 'TYO:6861'],
  'EWH': ['0700.HK', '0941.HK', '3690.HK', '2318.HK', '1299.HK', '0005.HK', '2628.HK', '1398.HK', '3968.HK', '0939.HK'],
  'ASHR': ['600036.SS', '000858.SZ', '600519.SS', '000001.SZ', '002415.SZ', '600276.SS', '601318.SS', '000002.SZ', '600887.SS', '601166.SS']
};

export const fetchIndexData = async (): Promise<IndexData[]> => {
  console.log('Fetching index data from Finnhub...');
  
  try {
    const promises = MAJOR_INDICES.map(async (symbol) => {
      try {
        const url = `${BASE_URL}/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data || data.c === 0) {
          console.warn(`No data available for ${symbol}`);
          return null;
        }

        const price = data.c || 0;
        const change = data.d || 0;
        const changePercent = data.dp || 0;
        
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
    
    console.log('Index data loaded:', validResults.length);
    return validResults;
    
  } catch (error) {
    console.error('Error fetching index data:', error);
    return [];
  }
};

export const fetchStocksForIndex = async (indexSymbol: string = 'SPY'): Promise<{ gainers: StockData[], losers: StockData[] }> => {
  console.log(`Fetching stocks for index: ${indexSymbol}`);
  
  try {
    const stocks = INDEX_STOCKS[indexSymbol] || INDEX_STOCKS['SPY'];
    
    const promises = stocks.slice(0, 10).map(async (stock) => {
      try {
        const url = `${BASE_URL}/quote?symbol=${stock}&token=${FINNHUB_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data || data.c === 0) {
          return null;
        }

        const price = data.c || 0;
        const changePercent = data.dp || 0;
        
        return {
          symbol: stock,
          price: price.toFixed(2),
          changePercent: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
          changeValue: changePercent
        };
      } catch (error) {
        console.warn(`Error fetching stock ${stock}:`, error);
        return null;
      }
    });

    const results = await Promise.all(promises);
    const validStocks = results.filter(result => result !== null) as (StockData & { changeValue: number })[];
    
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

    return { gainers, losers };
  } catch (error) {
    console.error('Error fetching stocks data:', error);
    return { gainers: [], losers: [] };
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
