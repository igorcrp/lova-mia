
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface IndexData {
  name: string;
  symbol: string;
  value: string;
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
    console.log('Starting indices scraping...');

    const indices: IndexData[] = [];
    
    // Use Yahoo Finance as it's more reliable for scraping
    const indexTargets = [
      { name: 'S&P 500 (US)', symbol: '^GSPC', yahooSymbol: '%5EGSPC' },
      { name: 'Dow Jones (US)', symbol: '^DJI', yahooSymbol: '%5EDJI' },
      { name: 'Nasdaq (US)', symbol: '^IXIC', yahooSymbol: '%5EIXIC' },
      { name: 'Ibovespa (Brazil)', symbol: '^BVSP', yahooSymbol: '%5EBVSP' },
      { name: 'FTSE 100 (UK)', symbol: '^FTSE', yahooSymbol: '%5EFTSE' },
      { name: 'DAX (Germany)', symbol: '^GDAXI', yahooSymbol: '%5EGDAXI' },
      { name: 'CAC 40 (France)', symbol: '^FCHI', yahooSymbol: '%5EFCHI' },
      { name: 'Nikkei 225 (Japan)', symbol: '^N225', yahooSymbol: '%5EN225' },
      { name: 'Hang Seng (Hong Kong)', symbol: '^HSI', yahooSymbol: '%5EHSI' },
      { name: 'Shanghai Composite (China)', symbol: '000001.SS', yahooSymbol: '000001.SS' }
    ];

    // Process indices in smaller batches to avoid CPU timeout
    for (let i = 0; i < indexTargets.length; i += 3) {
      const batch = indexTargets.slice(i, i + 3);
      
      await Promise.all(batch.map(async (target) => {
        try {
          console.log(`Scraping ${target.name}...`);
          
          // Use Yahoo Finance quote API endpoint
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${target.yahooSymbol}`;
          
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
            }
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          
          if (data?.chart?.result?.[0]?.meta) {
            const meta = data.chart.result[0].meta;
            const value = meta.regularMarketPrice || meta.previousClose || 0;
            const change = (meta.regularMarketPrice || 0) - (meta.previousClose || 0);
            const changePercent = meta.previousClose ? (change / meta.previousClose * 100) : 0;
            
            indices.push({
              name: target.name,
              symbol: target.symbol,
              value: value.toFixed(2),
              change: change >= 0 ? `+${change.toFixed(2)}` : change.toFixed(2),
              changePercent: changePercent >= 0 ? `+${changePercent.toFixed(2)}%` : `${changePercent.toFixed(2)}%`,
              isNegative: change < 0
            });
            
            console.log(`Successfully scraped ${target.name}: ${value.toFixed(2)}`);
          } else {
            throw new Error('Invalid response format');
          }

        } catch (error) {
          console.error(`Error scraping ${target.name}:`, error);
          
          // Add fallback data if scraping fails
          indices.push({
            name: target.name,
            symbol: target.symbol,
            value: '0.00',
            change: '0.00',
            changePercent: '0.00%',
            isNegative: false
          });
        }
      }));
      
      // Small delay between batches
      if (i + 3 < indexTargets.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`Scraping completed. Found ${indices.length} indices`);

    return new Response(
      JSON.stringify(indices),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Scraping error:', error);
    
    return new Response(
      JSON.stringify([]),
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
