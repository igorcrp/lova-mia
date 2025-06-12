import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUp, ArrowDown, Clock, TrendingUp, Globe, Calendar } from "lucide-react";
export default function AppHomePage() {
  // Dados mockados para os índices financeiros
  const indices = [{
    name: "S&P 500",
    value: "6.022,24",
    change: "-0,27%",
    max: "6.059,40",
    min: "6.002,32",
    negative: true
  }, {
    name: "Dow Jones",
    value: "42.865,77",
    change: "0,00%",
    max: "43.115,69",
    min: "42.738,62",
    negative: false
  }, {
    name: "Nasdaq Composite",
    value: "19.615,88",
    change: "-0,50%",
    max: "19.800,46",
    min: "19.551,35",
    negative: true
  }, {
    name: "FTSE 100",
    value: "8.882,68",
    change: "+0,21%",
    max: "8.886,76",
    min: "8.836,75",
    negative: false
  }, {
    name: "DAX (Alemanha)",
    value: "23.751,87",
    change: "-0,94%",
    max: "23.811,00",
    min: "23.616,69",
    negative: true
  }, {
    name: "Nikkei 225 (Japão)",
    value: "38.173,09",
    change: "-0,65%",
    max: "38.407,57",
    min: "38.102,05",
    negative: true
  }, {
    name: "Hang Seng (Hong Kong)",
    value: "24.035,38",
    change: "-1,36%",
    max: "24.288,76",
    min: "24.002,42",
    negative: true
  }, {
    name: "Ibovespa (Brasil)",
    value: "137.128",
    change: "+0,51%",
    max: "137.531",
    min: "135.628",
    negative: false
  }];

  // Dados mockados para indicadores econômicos
  const economies = [{
    country: "EUA",
    gdp: "2,3% (est.)",
    inflation: "3,1%",
    interest: "5,25-5,50%",
    currency: "USD 1,00"
  }, {
    country: "Zona Euro",
    gdp: "1,5%",
    inflation: "2,8%",
    interest: "4,50%",
    currency: "EUR 0,92"
  }, {
    country: "China",
    gdp: "5,0%",
    inflation: "2,5%",
    interest: "3,45%",
    currency: "CNY 7,10"
  }, {
    country: "Japão",
    gdp: "1,2%",
    inflation: "2,3%",
    interest: "-0,10%",
    currency: "JPY 153,00"
  }, {
    country: "Brasil",
    gdp: "2,18%",
    inflation: "5,44%",
    interest: "14,75%",
    currency: "BRL 5,53"
  }];

  // Dados mockados para notícias
  const news = ["Negociações comerciais EUA-China em Londres", "Medida Provisória sobre IOF no Brasil", "Expectativas de inflação nos EUA", "Produção de petróleo americano sob nova administração"];
  const marketStatus = [{
    region: "Asiático",
    status: "Fechado",
    color: "bg-red-100 text-red-800"
  }, {
    region: "Europeu",
    status: "Aberto",
    color: "bg-green-100 text-green-800"
  }, {
    region: "Americano",
    status: "Aberto",
    color: "bg-green-100 text-green-800"
  }];
  return <div>
      
      
      <div className="space-y-6">
        {/* Status dos Mercados - Movido para cima */}
        

        {/* Seção 1: Principais Índices Financeiros Globais - Convertido para Cards */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Principais Índices Financeiros Globais (em tempo real)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-3">
              {indices.map((index, i) => <div key={i} className="p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    {index.name}
                  </div>
                  <div className="text-sm font-bold mb-1">
                    {index.value}
                  </div>
                  <div className={`flex items-center gap-1 text-xs ${index.negative ? 'text-red-600' : 'text-green-600'}`}>
                    {index.negative ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                    {index.change}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    
                    
                  </div>
                </div>)}
            </div>
          </CardContent>
        </Card>

        {/* Seção 2: Indicadores Econômicos Globais */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Indicadores Econômicos Globais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <h3 className="text-lg font-semibold mb-4">Principais Economias</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>País</TableHead>
                  <TableHead>Cresc. PIB 2025</TableHead>
                  <TableHead>Inflação</TableHead>
                  <TableHead>Taxa de Juros</TableHead>
                  <TableHead>Moeda (Câmbio)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {economies.map((economy, i) => <TableRow key={i}>
                    <TableCell className="font-medium">{economy.country}</TableCell>
                    <TableCell>{economy.gdp}</TableCell>
                    <TableCell>{economy.inflation}</TableCell>
                    <TableCell>{economy.interest}</TableCell>
                    <TableCell>{economy.currency}</TableCell>
                  </TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Seção 3: Notícias e Alertas do Mercado */}
        <div className="">
          

          
        </div>
      </div>
    </div>;
}