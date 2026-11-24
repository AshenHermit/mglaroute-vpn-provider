import { useEffect, useState } from 'react';
import { api, getErrorMessage } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { Alert, AlertDescription } from '../components/ui/alert';

interface Server {
  id: string;
  name: string;
  remarks: string | null;
  address: string;
  port: number;
  protocol: string;
  latency: number | null;
  reachable: boolean | null;
  anycastConfidence: number | null;
  anycastSampleCount: number;
  services: string[];
  servicesCheckedAt: string | null;
  lastScannedAt: string | null;
}

interface EnabledService {
  id: string;
  name: string;
}

interface ServersResponse {
  servers?: Server[];
  data?: Server[];
  total: number;
  page: number;
  limit?: number;
}

const SORT_COLUMNS: Record<string, string> = {
  name: 'name',
  host: 'address',
  port: 'port',
  protocol: 'protocol',
  latency: 'latency',
  anycastScore: 'confidence',
};

export function ServersPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [enabledServices, setEnabledServices] = useState<EnabledService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [filters, setFilters] = useState({
    search: '',
    protocol: '',
    reachable: '',
    service: '',
    sortBy: 'latency',
    sortOrder: 'asc' as 'asc' | 'desc',
  });

  const protocols = ['vless', 'vmess', 'trojan', 'shadowsocks', 'ss', 'wireguard', 'openvpn'];

  const fetchServers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', pageSize.toString());
      if (filters.search) params.set('search', filters.search);
      if (filters.protocol) params.set('protocol', filters.protocol);
      if (filters.reachable) params.set('reachable', filters.reachable);
      if (filters.service) params.append('services[]', filters.service);
      const sortColumn = SORT_COLUMNS[filters.sortBy] || 'latency';
      params.set('sort', `${sortColumn}_${filters.sortOrder}`);

      const result = await api.get<ServersResponse>(`/api/servers?${params.toString()}`);
      const rows = Array.isArray(result?.servers) ? result.servers : Array.isArray(result?.data) ? result.data : [];
      setServers(rows.map((server) => ({
        ...server,
        anycastConfidence: server.anycastConfidence === null || server.anycastConfidence === undefined
          ? null
          : Number(server.anycastConfidence),
      })));
      setTotal(result?.total || 0);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load servers'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchEnabledServices = async () => {
      try {
        const rows = await api.get<EnabledService[]>('/api/online-services/enabled');
        setEnabledServices(Array.isArray(rows) ? rows : []);
      } catch {
        // Service labels are best-effort; raw IDs are rendered as fallback.
      }
    };
    void fetchEnabledServices();
  }, []);

  const serviceNames = new Map(enabledServices.map((service) => [service.id, service.name]));

  useEffect(() => {
    fetchServers();
  }, [page, pageSize, filters.search, filters.protocol, filters.reachable, filters.service, filters.sortBy, filters.sortOrder]);

  const handleSort = (column: string) => {
    setFilters((prev) => ({
      ...prev,
      sortBy: column,
      sortOrder: prev.sortBy === column && prev.sortOrder === 'asc' ? 'desc' : 'asc',
    }));
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (filters.sortBy !== column) return <ChevronDown className="h-4 w-4 text-muted-foreground" />;
    return filters.sortOrder === 'asc' ? (
      <ChevronUp className="h-4 w-4" />
    ) : (
      <ChevronDown className="h-4 w-4" />
    );
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
          <h1 className="text-3xl font-bold">Servers</h1>
          <p className="text-muted-foreground">Browse and filter VPN servers</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchServers} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Search by remarks, name, host..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="protocol">Protocol</Label>
              <Select value={filters.protocol} onValueChange={(v) => setFilters({ ...filters, protocol: v })}>
                <SelectTrigger id="protocol">
                  <SelectValue placeholder="All protocols" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  {protocols.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reachable">Reachable</Label>
              <Select value={filters.reachable} onValueChange={(v) => setFilters({ ...filters, reachable: v })}>
                <SelectTrigger id="reachable">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="service">Service</Label>
              <Select value={filters.service} onValueChange={(v) => setFilters({ ...filters, service: v })}>
                <SelectTrigger id="service">
                  <SelectValue placeholder="All services" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  {enabledServices.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pageSize">Page Size</Label>
              <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger id="pageSize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
                  <div className="flex items-center gap-1">
                    Name <SortIcon column="name" />
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('host')}>
                  <div className="flex items-center gap-1">
                    Address <SortIcon column="host" />
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('port')}>
                  <div className="flex items-center gap-1">
                    Port <SortIcon column="port" />
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('protocol')}>
                  <div className="flex items-center gap-1">
                    Protocol <SortIcon column="protocol" />
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('latency')}>
                  <div className="flex items-center gap-1">
                    Latency (ms) <SortIcon column="latency" />
                  </div>
                </TableHead>
                <TableHead>Reachable</TableHead>
                <TableHead>Services</TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('anycastScore')}>
                  <div className="flex items-center gap-1">
                    AnyCast <SortIcon column="anycastScore" />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No servers found. Adjust filters or run a scan.
                  </TableCell>
                </TableRow>
              ) : (
                servers.map((server) => (
                  <TableRow key={server.id}>
                    <TableCell className="font-medium max-w-[200px] truncate" title={server.remarks || server.name}>
                      <div className="truncate">{server.remarks || server.name}</div>
                      {server.remarks && (
                        <div className="text-xs font-normal text-muted-foreground truncate">{server.name}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{server.address}:{server.port}</TableCell>
                    <TableCell className="font-mono text-sm">{server.port}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{(server.protocol || '').toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      {server.latency !== null && server.latency !== undefined ? `${server.latency}ms` : '-'}
                    </TableCell>
                    <TableCell>
                      {server.reachable === true ? (
                        <Badge variant="success">Yes</Badge>
                      ) : server.reachable === false ? (
                        <Badge variant="destructive">No</Badge>
                      ) : (
                        <Badge variant="secondary">Unknown</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {server.services?.length ? (
                        <div className="flex flex-wrap gap-1 max-w-[240px]">
                          {server.services.map((id) => (
                            <Badge key={id} variant="outline" title={id}>
                              {serviceNames.get(id) ?? id}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {server.anycastConfidence !== null && server.anycastConfidence !== undefined ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono">{server.anycastConfidence.toFixed(2)}</span>
                          <span className="text-xs text-muted-foreground">({server.anycastSampleCount} samples)</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {total > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, total)} of {total} servers
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              Previous
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page * pageSize >= total}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}