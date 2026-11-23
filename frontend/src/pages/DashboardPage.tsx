import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Loader2, Database, Globe, Server, Activity, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button';

interface DashboardStats {
  totalSubscriptions: number;
  totalProfiles: number;
  totalServers: number;
  lastScan: string | null;
  anycastCount: number;
}

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const [subs, servers, scannerStatus] = await Promise.all([
        api.get<{ data: unknown[] }>('/api/subscriptions'),
        api.get<{ data: unknown[] }>('/api/servers?limit=1'),
        api.get<{ lastRun: string | null }>('/api/scanner/status'),
      ]);

      const subsData = subs as unknown as { data: unknown[] };
      const serversData = servers as unknown as { data: unknown[] };
      const scannerData = scannerStatus as unknown as { lastRun: string | null };

      setStats({
        totalSubscriptions: subsData.data?.length || 0,
        totalProfiles: 0,
        totalServers: serversData.data?.length || 0,
        lastScan: scannerData.lastRun,
        anycastCount: 0,
      });
      setError(null);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError(error.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const statCards = [
    { title: 'Subscriptions', value: stats?.totalSubscriptions || 0, icon: Database, color: 'text-blue-500' },
    { title: 'Online Services', value: stats?.totalProfiles || 0, icon: Globe, color: 'text-green-500' },
    { title: 'Servers', value: stats?.totalServers || 0, icon: Server, color: 'text-purple-500' },
    { title: 'AnyCast Servers', value: stats?.anycastCount || 0, icon: Activity, color: 'text-orange-500' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Last Scan</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {stats?.lastScan ? new Date(stats.lastScan).toLocaleString() : 'No scans performed yet'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}