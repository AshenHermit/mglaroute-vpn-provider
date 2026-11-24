import { useEffect, useState } from 'react';
import { api, getErrorMessage } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Loader2, RefreshCw, BarChart2, AlertTriangle, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription } from '../components/ui/alert';

interface AnycastEntry {
  id: string;
  profileId: string;
  profileName: string;
  resolvedIp: string;
  score: number;
  sampleCount: number;
  lastUpdated: string;
  createdAt: string;
}

export function AnycastPage() {
  const [entries, setEntries] = useState<AnycastEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const result = await api.get<AnycastEntry[]>('/api/servers/anycast');
      const list = Array.isArray(result) ? result : [];
      setEntries(list.map((entry) => ({ ...entry, score: Number(entry.score) })));
      setTotal(list.length);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load AnyCast data'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-100 text-green-800';
    if (score >= 0.5) return 'bg-yellow-100 text-yellow-800';
    if (score >= 0.2) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
  };

  const getScoreIcon = (score: number) => {
    if (score >= 0.8) return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (score >= 0.5) return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    return <AlertTriangle className="h-4 w-4 text-red-500" />;
  };

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
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart2 className="h-8 w-8 text-primary" />
            AnyCast Availability Score
          </h1>
          <p className="text-muted-foreground">Score from service availability during fresh checks (0.0 - 1.0)</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchEntries} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
            <BarChart2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Score (≥0.8)</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {entries.filter((e) => e.score >= 0.8).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Medium Score (0.5-0.8)</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {entries.filter((e) => e.score >= 0.5 && e.score < 0.8).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Score ({"<"}0.5)</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {entries.filter((e) => e.score < 0.5).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Profile</TableHead>
                <TableHead>Resolved IP</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Samples</TableHead>
                <TableHead>Last Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No AnyCast data available. Run a scan to populate.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">{entry.profileName}</TableCell>
                    <TableCell className="font-mono text-sm">{entry.resolvedIp}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getScoreIcon(entry.score)}
                        <Badge className={getScoreColor(entry.score)}>
                          {entry.score.toFixed(2)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">{entry.sampleCount}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.lastUpdated ? formatDateTime(entry.lastUpdated) : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About AnyCast Scoring</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p><strong>AnyCast Score (0.0 - 1.0):</strong> Share of the last 10 fresh service checks in which at least one enabled service was unreachable. Stable servers score near 0.0.</p>
          <p><strong>Name override:</strong> If remarks or name contains <code>anycast</code> or <code>auto</code>, the score is forced to 1.0.</p>
          <p><strong>Reset:</strong> Changing service settings (URLs, added/removed/disabled services) clears the accumulated window.</p>
          <p><strong>Sample Count:</strong> Accumulated fresh checks in the window, maximum 10.</p>
        </CardContent>
      </Card>
    </div>
  );
}