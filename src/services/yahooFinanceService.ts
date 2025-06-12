
// Yahoo Finance service for fetching real-time market data
export interface MarketIndex {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
}

export interface StockData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

export interface EconomicIndicator {
  country: string;
  gdpGrowth: string;
  inflation: string;
  interestRate: string;
  currency: string;
}

// Market indices symbols for different regions
export const MARKET_INDICES = {
  'S&P 500': '^GSPC',
  'Dow Jones': '^DJI',
  'Nasdaq': '^IXIC',
  'FTSE 100': '^FTSE',
  'DAX': '^GDAXI',
  'Nikkei 225': '^N225',
  'Hang Seng': '^HSI',
  'Bovespa': '^BVSP'
};

// Stocks for each index (simplified for demo)
export const INDEX_STOCKS = {
  '^GSPC': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM', 'JNJ', 'V'],
  '^DJI': ['AAPL', 'MSFT', 'UNH', 'GS', 'HD', 'CAT', 'AMGN', 'MCD', 'CRM', 'V'],
  '^IXIC': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'ADBE', 'PYPL'],
  '^FTSE': ['SHEL', 'AZN', 'LSEG', 'UU', 'VODJ', 'BP', 'RIO', 'HSBA', 'DGE', 'GSK'],
  '^GDAXI': ['SAP', 'ASML', 'SIE', 'DTE', 'MUV2', 'ALV', 'AIR', 'BAS', 'VOW3', 'BMW'],
  '^N225': ['TYO:7203', 'TYO:6758', 'TYO:9984', 'TYO:6861', 'TYO:8306', 'TYO:9432', 'TYO:4502', 'TYO:8031', 'TYO:6367', 'TYO:9983'],
  '^HSI': ['0700.HK', '0941.HK', '2318.HK', '1299.HK', '0388.HK', '3690.HK', '2020.HK', '1810.HK', '0883.HK', '2382.HK'],
  '^BVSP': ['PETR4.SA', 'VALE3.SA', 'ITUB4.SA', 'BBDC4.SA', 'ABEV3.SA', 'BBAS3.SA', 'WEGE3.SA', 'RENT3.SA', 'LREN3.SA', 'MGLU3.SA']
};

class YahooFinanceService {
  private baseUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/';
  private quoteUrl = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=';

  async fetchMarketIndex(symbol: string): Promise<MarketIndex | null> {
    try {
      const response = await fetch(`${this.quoteUrl}${symbol}`);
      const data = await response.json();
      
      if (data.quoteResponse?.result?.[0]) {
        const quote = data.quoteResponse.result[0];
        return {
          symbol: quote.symbol,
          name: quote.longName || quote.shortName || symbol,
          price: quote.regularMarketPrice || 0,
          change: quote.regularMarketChange || 0,
          changePercent: quote.regularMarketChangePercent || 0,
          high: quote.regularMarketDayHigh || 0,
          low: quote.regularMarketDayLow || 0
        };
      }
      return null;
    } catch (error) {
      console.error(`Error fetching data for ${symbol}:`, error);
      return null;
    }
  }

  async fetchMultipleQuotes(symbols: string[]): Promise<StockData[]> {
    try {
      const symbolString = symbols.join(',');
      const response = await fetch(`${this.quoteUrl}${symbolString}`);
      const data = await response.json();
      
      if (data.quoteResponse?.result) {
        return data.quoteResponse.result.map((quote: any) => ({
          symbol: quote.symbol,
          name: quote.shortName || quote.symbol,
          price: quote.regularMarketPrice || 0,
          change: quote.regularMarketChange || 0,
          changePercent: quote.regularMarketChangePercent || 0
        }));
      }
      return [];
    } catch (error) {
      console.error('Error fetching multiple quotes:', error);
      return [];
    }
  }

  async getAllMarketIndices(): Promise<MarketIndex[]> {
    const symbols = Object.values(MARKET_INDICES);
    const names = Object.keys(MARKET_INDICES);
    const promises = symbols.map(symbol => this.fetchMarketIndex(symbol));
    
    const results = await Promise.all(promises);
    return results
      .map((result, index) => result ? { ...result, name: names[index] } : null)
      .filter((item): item is MarketIndex => item !== null);
  }

  async getTopStocksForIndex(indexSymbol: string): Promise<{ gainers: StockData[], losers: StockData[] }> {
    const stocks = INDEX_STOCKS[indexSymbol as keyof typeof INDEX_STOCKS] || [];
    
    if (stocks.length === 0) {
      return { gainers: [], losers: [] };
    }

    const stockData = await this.fetchMultipleQuotes(stocks);
    
    // Sort by percentage change
    const sorted = stockData.sort((a, b) => b.changePercent - a.changePercent);
    
    return {
      gainers: sorted.slice(0, 5),
      losers: sorted.slice(-5).reverse()
    };
  }
}

export const yahooFinanceService = new YahooFinanceService();

// Economic indicators (static data as Yahoo Finance doesn't provide this directly)
export const getEconomicIndicators = (): EconomicIndicator[] => [
  {
    country: "USA",
    gdpGrowth: "2.3% (est.)",
    inflation: "3.1%",
    interestRate: "5.25-5.50%",
    currency: "USD 1.00"
  },
  {
    country: "Eurozone",
    gdpGrowth: "1.5%",
    inflation: "2.8%",
    interestRate: "4.50%",
    currency: "EUR 0.92"
  },
  {
    country: "China",
    gdpGrowth: "5.0%",
    inflation: "2.5%",
    interestRate: "3.45%",
    currency: "CNY 7.10"
  },
  {
    country: "Japan",
    gdpGrowth: "1.2%",
    inflation: "2.3%",
    interestRate: "-0.10%",
    currency: "JPY 153.00"
  },
  {
    country: "Brazil",
    gdpGrowth: "2.18%",
    inflation: "5.44%",
    interestRate: "14.75%",
    currency: "BRL 5.53"
  }
];
