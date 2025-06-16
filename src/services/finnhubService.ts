
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
  'QQQ': 'Nasdaq (US)',
  'EWZ': 'Ibovespa (Brazil)',
  'EWU': 'FTSE 100 (UK)',
  'EWG': 'DAX (Germany)',
  'EWQ': 'CAC 40 (France)',
  'EWJ': 'Nikkei 225 (Japan)',
  'EWH': 'Hang Seng (Hong Kong)',
  'ASHR': 'Shanghai Composite (China)'
};

const MAJOR_INDICES = ['SPY', 'DJI', 'QQQ', 'EWZ', 'EWU', 'EWG', 'EWQ', 'EWJ', 'EWH', 'ASHR'];

// Mapear índices para suas principais ações
const INDEX_STOCKS: { [key: string]: string[] } = {
  'SPY': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM', 'JNJ', 'V'],
  'DJI': ['AAPL', 'MSFT', 'UNH', 'GS', 'HD', 'MCD', 'CAT', 'V', 'AXP', 'IBM'],
  'QQQ': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'ADBE', 'CRM'],
  'EWZ': ['VALE', 'ITUB', 'BBD', 'PBR', 'ABEV', 'SBS', 'UGP', 'ERJ', 'CBD', 'BRFS'],
  'EWU': ['AZN', 'SHEL', 'ASML', 'BP', 'ULVR', 'GSK', 'RIO', 'HSBA', 'DGE', 'VOD'],
  'EWG': ['SAP', 'ASML', 'SIE', 'DTE', 'ALV', 'MUV2', 'AIR', 'BAS', 'BMW', 'VOW3'],
  'EWQ': ['MC', 'ASML', 'OR', 'SAP', 'TTE', 'SAN', 'AIR', 'BNP', 'EL', 'CA'],
  'EWJ': ['TSM', 'SONY', 'TM', 'SMFG', 'MUFG', 'NTT', 'SFT', 'KO', 'HTHIY', 'NVO'],
  'EWH': ['TCEHY', 'BABA', 'JD', 'BIDU', 'NIO', 'PDD', 'NTES', 'TME', 'VIPS', 'LI'],
  'ASHR': ['BABA', 'JD', 'BIDU', 'NIO', 'PDD', 'NTES', 'TME', 'VIPS', 'LI', 'XPEV']
};

export const fetchIndexData = async (): Promise<IndexData[]> => {
  console.log('Fetching index data from Finnhub...');
  
  try {
    const promises = MAJOR_INDICES.map(async (symbol) => {
      try {
        const url = `${BASE_URL}/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`Data for ${symbol}:`, data);
        
        if (data.c && data.pc) {
          const currentPrice = data.c;
          const previousClose = data.pc;
          const change = currentPrice - previousClose;
          const changePercent = (change / previousClose) * 100;
          
          return {
            symbol,
            name: INDEX_NAMES[symbol] || symbol,
            value: currentPrice.toFixed(2),
            changePercent: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
            isNegative: change < 0
          };
        } else {
          console.warn(`Invalid data structure for ${symbol}:`, data);
          return null;
        }
      } catch (error) {
        console.error(`Error fetching ${symbol}:`, error);
        return null;
      }
    });

    const results = await Promise.all(promises);
    const validResults = results.filter(result => result !== null) as IndexData[];
    
    console.log('Valid results:', validResults);
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
    
    const promises = stocks.map(async (stock) => {
      try {
        const url = `${BASE_URL}/quote?symbol=${stock}&token=${FINNHUB_API_KEY}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.c && data.pc) {
          const currentPrice = data.c;
          const previousClose = data.pc;
          const change = currentPrice - previousClose;
          const changePercent = (change / previousClose) * 100;
          
          return {
            symbol: stock,
            price: currentPrice.toFixed(2),
            changePercent: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
            changeValue: changePercent
          };
        } else {
          console.warn(`Invalid data structure for ${stock}:`, data);
          return null;
        }
      } catch (error) {
        console.warn(`Error fetching stock ${stock}:`, error);
        return null;
      }
    });

    const results = await Promise.all(promises);
    const validStocks = results.filter(result => result !== null) as (StockData & { changeValue: number })[];
    
    if (validStocks.length === 0) {
      return { gainers: [], losers: [] };
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
