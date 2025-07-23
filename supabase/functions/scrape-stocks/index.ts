
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface StockData {
  symbol: string;
  name: string;
  price: string;
  change: string;
  changePercent: string;
  isNegative: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { indexSymbol } = await req.json();
    console.log(`Starting stocks scraping for index: ${indexSymbol}`);

    // Map index symbols to sector ETFs for better stock data
    const sectorMapping = {
      '^GSPC': ['XLF', 'XLK', 'XLV', 'XLI', 'XLE', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE'],
      '^DJI': ['DIA', 'XLF', 'XLK', 'XLV', 'XLI'],
      '^IXIC': ['QQQ', 'XLK', 'XLY', 'XLV', 'XLF'],
      '^BVSP': ['EWZ', 'VALE', 'ITUB', 'PBR', 'BBD'],
      '^FTSE': ['EWU', 'HSBA', 'BP', 'SHEL', 'AZN'],
      '^GDAXI': ['EWG', 'SAP', 'ASML', 'NTES', 'UG'],
      '^FCHI': ['EWQ', 'MC', 'OR', 'SAN', 'TTE'],
      '^N225': ['EWJ', 'TSM', 'TM', 'SONY', 'NTT'],
      '^HSI': ['EWH', 'BABA', 'TSM', 'JD', 'BIDU'],
      '000001.SS': ['MCHI', 'BABA', 'TSM', 'JD', 'BIDU']
    };

    const symbols = sectorMapping[indexSymbol] || sectorMapping['^GSPC'];
    const stocks: StockData[] = [];

    // Fetch data for each symbol
    for (const symbol of symbols) {
      try {
        console.log(`Fetching data for ${symbol}...`);
        
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          }
        });

        if (!response.ok) {
          console.log(`Failed to fetch ${symbol}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        
        if (data?.chart?.result?.[0]?.meta) {
          const meta = data.chart.result[0].meta;
          const value = meta.regularMarketPrice || meta.previousClose || 0;
          const change = (meta.regularMarketPrice || 0) - (meta.previousClose || 0);
          const changePercent = meta.previousClose ? (change / meta.previousClose * 100) : 0;
          
          stocks.push({
            symbol: symbol,
            name: meta.longName || symbol,
            price: value.toFixed(2),
            change: change >= 0 ? `+${change.toFixed(2)}` : change.toFixed(2),
            changePercent: changePercent >= 0 ? `+${changePercent.toFixed(2)}%` : `${changePercent.toFixed(2)}%`,
            isNegative: change < 0
          });
          
          console.log(`Successfully fetched ${symbol}: ${value.toFixed(2)} (${changePercent.toFixed(2)}%)`);
        }

      } catch (error) {
        console.error(`Error fetching ${symbol}:`, error);
      }
    }

    // Sort stocks by change percent for proper gainers/losers identification
    stocks.sort((a, b) => {
      const aPercent = parseFloat(a.changePercent.replace(/[+%]/g, ''));
      const bPercent = parseFloat(b.changePercent.replace(/[+%]/g, ''));
      return bPercent - aPercent; // Descending order
    });

    // Get top 5 gainers (highest positive changes)
    const gainers = stocks.filter(stock => !stock.isNegative).slice(0, 5);
    
    // Get top 5 losers (biggest negative changes, then smallest positive)
    const negativeStocks = stocks.filter(stock => stock.isNegative);
    const positiveStocks = stocks.filter(stock => !stock.isNegative);
    
    // For losers: prioritize biggest negative changes, then fill with smallest positive
    const losers = [
      ...negativeStocks.slice(0, 5), // Biggest losses first
      ...positiveStocks.slice(-5).reverse() // Smallest gains if needed
    ].slice(0, 5);

    console.log(`Scraping completed. Found ${gainers.length} gainers and ${losers.length} losers`);
    console.log('Gainers:', gainers.map(g => `${g.symbol}: ${g.changePercent}`));
    console.log('Losers:', losers.map(l => `${l.symbol}: ${l.changePercent}`));

    return new Response(
      JSON.stringify({ gainers, losers }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Stock scraping error:', error);
    
    return new Response(
      JSON.stringify({ 
        gainers: [], 
        losers: []
      }),
      { 
        status: 200,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
