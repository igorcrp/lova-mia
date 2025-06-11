import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/services/api";
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface UserStats {
  total: number;
  active: number;
  pending: number;
  inactive: number;
  premium?: number;
  new?: number;
}

interface AssetCount {
  total: number;
}

export default function AdminDashboardPage() {
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [assetCount, setAssetCount] = useState<AssetCount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("30");

  // Example chart data - in a real app, this would come from an API
  const chartData = [
    { date: "6/4", registrations: 1 },
    { date: "7/4", registrations: 1 },
    { date: "8/4", registrations: 4 },
    { date: "9/4", registrations: 1 },
    { date: "10/4", registrations: 1 },
    { date: "11/4", registrations: 0 },
    { date: "13/4", registrations: 3 },
    { date: "15/4", registrations: 2 },
    { date: "16/4", registrations: 4 },
    { date: "17/4", registrations: 2 },
    { date: "18/4", registrations: 1 },
    { date: "20/4", registrations: 4 },
    { date: "22/4", registrations: 2 },
    { date: "24/4", registrations: 1 },
    { date: "26/4", registrations: 4 },
    { date: "28/4", registrations: 2 },
    { date: "30/4", registrations: 3 },
    { date: "1/5", registrations: 3 },
    { date: "2/5", registrations: 2 },
    { date: "3/5", registrations: 3 },
    { date: "4/5", registrations: 2 },
    { date: "5/5", registrations: 2 },
    { date: "6/5", registrations: 1 },
  ];

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        // Mock data since api.users and api.assets don't exist
        const usersData: UserStats = {
          total: 125,
          active: 98,
          pending: 15,
          inactive: 12,
          premium: 45,
          new: 8
        };
        
        const assetsTotal = 250;
        
        // Create a complete UserStats object with all required properties
        // Making sure we provide default values for all required fields
        const completeUserStats: UserStats = {
          total: usersData.total || 0,
          active: usersData.active || 0,
          pending: usersData.pending || 0, // Default to 0 if not provided
          inactive: usersData.inactive || 0, // Default to 0 if not provided
          premium: usersData.premium,
          new: usersData.new
        };
        
        setUserStats(completeUserStats);
        setAssetCount({ total: assetsTotal });
      } catch (error) {
        console.error("Failed to fetch dashboard data", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="loading-circle" />
        <span className="ml-3">Loading...</span>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {userStats?.total ?? 0}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {assetCount?.total ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card className="mb-8">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg">Usuários Registrados</CardTitle>
          <Select 
            defaultValue={timeRange} 
            onValueChange={(value) => setTimeRange(value)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select a range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="14">Últimos 14 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{
                  top: 10,
                  right: 10,
                  left: 0,
                  bottom: 20,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  formatter={(value) => [value, "Registros"]}
                />
                <Bar 
                  dataKey="registrations" 
                  name="Registros" 
                  fill="#818cf8" 
                  radius={[4, 4, 0, 0]} 
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

