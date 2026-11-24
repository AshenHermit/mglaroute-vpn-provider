import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { Loader2, RefreshCw, Play, Save } from 'lucide-react';
import { Alert, AlertDescription } from '../components/ui/alert';

interface ScannerSettings {
  id: string;
  intervalSeconds: number;
  timeoutMs: number;
  concurrency: number;
  latencyThresholdMs: number;
  anycastMinSamples: number;
  anycastThreshold: number | string;
  serviceCheckExpirationSeconds: number;
  enabled: boolean;
  updatedAt: string;
}

interface ScanResult {
  profilesScanned: number;
  succeeded: number;
  failed: number;
}

interface ScannerStatus {
  running: boolean;
  lastScanAt: string | null;
  nextScanAt: string | null;
  lastScanResult: ScanResult | null;
}

type SettingsForm = {
  intervalSeconds: number;
  timeoutMs: number;
  concurrency: number;
  latencyThresholdMs: number;
  anycastMinSamples: number;
  anycastThreshold: number;
  serviceCheckExpirationSeconds: number;
  enabled: boolean;
};

export function SettingsPage() {
  const [settings, setSettings] = useState<ScannerSettings | null>(null);
  const [status, setStatus] = useState<ScannerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState<SettingsForm>({
    intervalSeconds: 300,
    timeoutMs: 5000,
    concurrency: 10,
    latencyThresholdMs: 5000,
    anycastMinSamples: 3,
    anycastThreshold: 0.5,
    serviceCheckExpirationSeconds: 3600,
    enabled: true,
  });

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.get<ScannerStatus>('/api/scanner/status');
      setStatus(data);
      if (!data.running) setScanning(false);
    } catch {
      // Status polling is best-effort; keep the last known state.
    }
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const [settingsData, statusData] = await Promise.all([
        api.get<ScannerSettings>('/api/settings'),
        api.get<ScannerStatus>('/api/scanner/status'),
      ]);
      setSettings(settingsData);
      setStatus(statusData);
      setFormData({
        intervalSeconds: settingsData.intervalSeconds,
        timeoutMs: settingsData.timeoutMs,
        concurrency: settingsData.concurrency,
        latencyThresholdMs: settingsData.latencyThresholdMs,
        anycastMinSamples: settingsData.anycastMinSamples,
        anycastThreshold: Number(settingsData.anycastThreshold),
        serviceCheckExpirationSeconds: Number(settingsData.serviceCheckExpirationSeconds) || 3600,
        enabled: settingsData.enabled,
      });
      setError(null);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSettings();
  }, []);

  useEffect(() => {
    if (!status?.running) return;
    const timer = window.setInterval(() => { void fetchStatus(); }, 2000);
    return () => window.clearInterval(timer);
  }, [status?.running, fetchStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await api.put('/api/settings', formData);
      setSuccess('Settings saved successfully');
      await fetchSettings();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRunScan = async () => {
    setError(null);
    setScanning(true);
    try {
      await api.post('/api/scanner/run');
      setSuccess('Scan started');
      await fetchStatus();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Failed to start scan');
      setScanning(false);
    }
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
          <h1 className="text-3xl font-bold">Scanner Settings</h1>
          <p className="text-muted-foreground">Configure the VPN server scanner</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSettings} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {success && <Alert variant="success"><AlertDescription>{success}</AlertDescription></Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Scanner Configuration</CardTitle>
            <CardDescription>Adjust scanner behavior and thresholds</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="intervalSeconds">Scan Interval (seconds)</Label>
                <Input
                  id="intervalSeconds"
                  type="number"
                  min="60"
                  max="86400"
                  value={formData.intervalSeconds}
                  onChange={(e) => setFormData({ ...formData, intervalSeconds: Number(e.target.value) })}
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="timeoutMs">Scan Timeout (ms)</Label>
                <Input
                  id="timeoutMs"
                  type="number"
                  min="1000"
                  max="300000"
                  value={formData.timeoutMs}
                  onChange={(e) => setFormData({ ...formData, timeoutMs: Number(e.target.value) })}
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="concurrency">Concurrency</Label>
                <Input
                  id="concurrency"
                  type="number"
                  min="1"
                  max="100"
                  value={formData.concurrency}
                  onChange={(e) => setFormData({ ...formData, concurrency: Number(e.target.value) })}
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="latencyThresholdMs">Latency Threshold (ms)</Label>
                <Input
                  id="latencyThresholdMs"
                  type="number"
                  min="100"
                  max="60000"
                  value={formData.latencyThresholdMs}
                  onChange={(e) => setFormData({ ...formData, latencyThresholdMs: Number(e.target.value) })}
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="anycastMinSamples">AnyCast Minimum Samples</Label>
                <Input
                  id="anycastMinSamples"
                  type="number"
                  min="1"
                  max="100"
                  value={formData.anycastMinSamples}
                  onChange={(e) => setFormData({ ...formData, anycastMinSamples: Number(e.target.value) })}
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="anycastThreshold">AnyCast Threshold</Label>
                <Input
                  id="anycastThreshold"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={formData.anycastThreshold}
                  onChange={(e) => setFormData({ ...formData, anycastThreshold: Number(e.target.value) })}
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="serviceCheckExpirationSeconds">Service Check Expiration (seconds)</Label>
                <Input
                  id="serviceCheckExpirationSeconds"
                  type="number"
                  min="60"
                  max="604800"
                  value={formData.serviceCheckExpirationSeconds}
                  onChange={(e) => setFormData({ ...formData, serviceCheckExpirationSeconds: Number(e.target.value) })}
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">
                  How long a service availability result is cached per server before it is rechecked.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="enabled"
                  checked={formData.enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                  disabled={saving}
                />
                <Label htmlFor="enabled" className="mb-0">
                  Scanner Enabled
                </Label>
              </div>

              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scanner Status</CardTitle>
            <CardDescription>Current scanner state and controls</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-3 w-3 rounded-full ${status?.running ? 'bg-green-500' : 'bg-gray-400'}`}
                />
                <span className="font-medium">{status?.running ? 'Running' : 'Idle'}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Last Scan</Label>
              <p className="text-muted-foreground font-mono text-sm">
                {status?.lastScanAt ? new Date(status.lastScanAt).toLocaleString() : 'Never'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Next Scheduled Scan</Label>
              <p className="text-muted-foreground font-mono text-sm">
                {status?.nextScanAt ? new Date(status.nextScanAt).toLocaleString() : 'Not scheduled'}
              </p>
            </div>

            <div className="space-y-2 border-t pt-4">
              <Label>Last Scan Result</Label>
              <div className="flex flex-wrap gap-4 text-sm">
                <span>Scanned: <strong>{status?.lastScanResult?.profilesScanned ?? 0}</strong></span>
                <span>Succeeded: <strong>{status?.lastScanResult?.succeeded ?? 0}</strong></span>
                <span>Failed: <strong>{status?.lastScanResult?.failed ?? 0}</strong></span>
              </div>
            </div>

            <div className="pt-4 border-t">
              <Button onClick={handleRunScan} disabled={saving || scanning || status?.running}>
                {(scanning || status?.running) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Play className="mr-2 h-4 w-4" />
                Run Scan Now
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                This will trigger an immediate scan of all enabled subscriptions and online services.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Settings Information</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Settings are stored as a singleton row (id=singleton) in the database.</p>
          <p>Last updated: {settings?.updatedAt ? new Date(settings.updatedAt).toLocaleString() : 'Never'}</p>
          <p className="font-mono">
            <strong>intervalSeconds:</strong> How often to run automatic scans (cron).<br />
            <strong>timeoutMs:</strong> Maximum time to wait for a single server check.<br />
            <strong>concurrency:</strong> Number of servers to check in parallel.<br />
            <strong>latencyThresholdMs:</strong> Servers above this latency are considered slow.<br />
            <strong>anycastMinSamples:</strong> Minimum samples required before calculating AnyCast confidence score.<br />
            <strong>anycastThreshold:</strong> Confidence threshold for flagging an AnyCast server.<br />
            <strong>serviceCheckExpirationSeconds:</strong> How long a service check result stays valid per server.<br />
            <strong>enabled:</strong> Enable/disable automatic scanning.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
