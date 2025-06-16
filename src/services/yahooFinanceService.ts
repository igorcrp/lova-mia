// Yahoo Finance API service for fetching real-time financial data
export interface IndexData {
  name: string;
  symbol: string;
  value: string;
  change: string;
  changePercent: string;
  isNegative: boolean;
}

export interface StockData {
  symbol: string;
  name: string;
  price: string;
  change: string;
  changePercent: string;
  isNegative: boolean;
}

export interface EconomicData {
  country: string;
  gdp: string;
  inflation: string;
  interest: string;
  currency: string;
}

// Yahoo Finance API endpoints (using public API)
const YAHOO_FINANCE_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_FINANCE_V2_BASE = 'https://query2.finance.yahoo.com/v8/finance/chart';

// Index symbols mapping - reorganized in the requested order
export const INDEX_SYMBOLS = {
  'S&P 500 (US)': '^GSPC',
  'Dow Jones (US)': '^DJI',
  'Nasdaq (US)': '^IXIC',
  'Ibovespa (Brazil)': '^BVSP',
  'FTSE 100 (UK)': '^FTSE',
  'DAX (Germany)': '^GDAXI',
  'CAC 40 (France)': '^FCHI',
  'Nikkei 225 (Japan)': '^N225',
  'Hang Seng (Hong Kong)': '^HSI',
  'Shanghai Composite (China)': '000001.SS'
};

// Stock symbols for each index - updated with proper stocks for each index
export const INDEX_STOCKS = {
  '^GSPC': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM', 'JNJ', 'V'],
  '^DJI': ['AAPL', 'MSFT', 'UNH', 'GS', 'HD', 'MCD', 'CAT', 'V', 'AXP', 'IBM'],
  '^IXIC': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'ADBE', 'CRM'],
  '^BVSP': ['PETR4.SA', 'VALE3.SA', 'ITUB4.SA', 'B3SA3.SA', 'BBDC4.SA', 'WEGE3.SA', 'RENT3.SA', 'LREN3.SA', 'MGLU3.SA', 'ABEV3.SA'],
  '^FTSE': ['SHEL', 'AZN', 'LSEG', 'BP.L', 'ULVR.L', 'GSK.L', 'RIO.L', 'HSBA.L', 'DGE.L', 'VOD.L'],
  '^GDAXI': ['SAP.DE', 'ASML.AS', 'SIE.DE', 'DTE.DE', 'ALV.DE', 'MUV2.DE', 'AIR.PA', 'BAS.DE', 'BMW.DE', 'VOW3.DE'],
  '^FCHI': ['MC.PA', 'ASML.AS', 'OR.PA', 'SAP.DE', 'TTE.PA', 'SAN.PA', 'AIR.PA', 'BNP.PA', 'EL.PA', 'CA.PA'],
  '^N225': ['7203.T', '6758.T', '9984.T', '6861.T', '9433.T', '8306.T', '4063.T', '6367.T', '9020.T', '8035.T'],
  '^HSI': ['700.HK', '9988.HK', '9618.HK', '3690.HK', '1299.HK', '2318.HK', '1398.HK', '939.HK', '2020.HK', '1109.HK'],
  '000001.SS': ['600519.SS', '000858.SZ', '300750.SZ', '000001.SZ', '600036.SS', '600887.SS', '002594.SZ', '000002.SZ', '600276.SS', '002415.SZ']
};

export const fetchIndexData = async (): Promise<IndexData[]> => {
  try {
    const indices = Object.entries(INDEX_SYMBOLS);
    const data = await Promise.all(
      indices.map(async ([name, symbol]) => {
        try {
          // Try Yahoo Finance V2 first, fallback to V1
          let response = await fetch(`${YAHOO_FINANCE_V2_BASE}/${symbol}`);
          if (!response.ok) {
            response = await fetch(`${YAHOO_FINANCE_BASE}/${symbol}`);
          }
          
          const result = await response.json();
          
          if (result.chart?.result?.[0]) {
            const quote = result.chart.result[0];
            const meta = quote.meta;
            const currentPrice = meta.regularMarketPrice || 0;
            const previousClose = meta.previousClose || 0;
            const change = currentPrice - previousClose;
            const changePercent = ((change / previousClose) * 100);
            
            return {
              name,
              symbol,
              value: currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
              change: change.toFixed(2),
              changePercent: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
              isNegative: change < 0
            };
          }
        } catch (error) {
          console.error(`Error fetching ${symbol}:`, error);
        }
        
        // Fallback data if API fails
        return {
          name,
          symbol,
          value: '0.00',
          change: '0.00',
          changePercent: '0.00%',
          isNegative: false
        };
      })
    );
    
    return data;
  } catch (error) {
    console.error('Error fetching index data:', error);
    return [];
  }
};

export const fetchStocksForIndex = async (indexSymbol: string): Promise<{ gainers: StockData[], losers: StockData[] }> => {
  try {
    const stockSymbols = INDEX_STOCKS[indexSymbol] || [];
    const stockData = await Promise.all(
      stockSymbols.map(async (symbol) => {
        try {
          // Try Yahoo Finance V2 first, fallback to V1
          let response = await fetch(`${YAHOO_FINANCE_V2_BASE}/${symbol}`);
          if (!response.ok) {
            response = await fetch(`${YAHOO_FINANCE_BASE}/${symbol}`);
          }
          
          const result = await response.json();
          
          if (result.chart?.result?.[0]) {
            const quote = result.chart.result[0];
            const meta = quote.meta;
            const currentPrice = meta.regularMarketPrice || 0;
            const previousClose = meta.previousClose || 0;
            const change = currentPrice - previousClose;
            const changePercent = ((change / previousClose) * 100);
            
            return {
              symbol,
              name: meta.symbol || symbol,
              price: currentPrice.toFixed(2),
              change: change.toFixed(2),
              changePercent: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
              isNegative: change < 0
            };
          }
        } catch (error) {
          console.error(`Error fetching stock ${symbol}:`, error);
        }
        
        return {
          symbol,
          name: symbol,
          price: '0.00',
          change: '0.00',
          changePercent: '0.00%',
          isNegative: false
        };
      })
    );
    
    // Sort by change percentage
    const sorted = stockData.sort((a, b) => {
      const aChange = parseFloat(a.changePercent.replace(/[+%]/g, ''));
      const bChange = parseFloat(b.changePercent.replace(/[+%]/g, ''));
      return bChange - aChange;
    });
    
    return {
      gainers: sorted.slice(0, 5),
      losers: sorted.slice(-5).reverse()
    };
  } catch (error) {
    console.error('Error fetching stocks for index:', error);
    return { gainers: [], losers: [] };
  }
};

export const fetchEconomicData = (): EconomicData[] => {
  // Economic indicators - these would typically come from various APIs
  // For now, using recent data as these change less frequently
  return [
    {
      country: "USA",
      gdp: "2.3% (est.)",
      inflation: "3.1%",
      interest: "5.25-5.50%",
      currency: "USD 1.00"
    },
    {
      country: "Eurozone",
      gdp: "1.5%",
      inflation: "2.8%",
      interest: "4.50%",
      currency: "EUR 0.92"
    },
    {
      country: "China",
      gdp: "5.0%",
      inflation: "2.5%",
      interest: "3.45%",
      currency: "CNY 7.10"
    },
    {
      country: "Japan",
      gdp: "1.2%",
      inflation: "2.3%",
      interest: "-0.10%",
      currency: "JPY 153.00"
    },
    {
      country: "Brazil",
      gdp: "2.18%",
      inflation: "5.44%",
      interest: "14.75%",
      currency: "BRL 5.53"
    }
  ];
};
