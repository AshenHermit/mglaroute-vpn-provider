import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { Loader2, RefreshCw, Play, Save } from 'lucide-react';
import { Alert, AlertDescription } from '../components/ui/alert';

interface ScannerSettings {
  id: number;
  scanIntervalMinutes: number;
  scanTimeoutSeconds: number;
  scanConcurrency: number;
  latencyThresholdMs: number;
  anycastMinSamples: number;
  enabled: boolean;
  updatedAt: string;
}

interface ScannerStatus {
  running: boolean;
  lastRun: string | null;
  nextRun: string | null;
}

export function SettingsPage() {
  const [settings, setSettings] = useState<ScannerSettings | null>(null);
  const [status, setStatus] = useState<ScannerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    scanIntervalMinutes: 60,
    scanTimeoutSeconds: 30,
    scanConcurrency: 10,
    latencyThresholdMs: 5000,
    anycastMinSamples: 5,
    enabled: true,
  });

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const [settingsRes, statusRes] = await Promise.all([
        api.get<ScannerSettings>('/api/settings'),
        api.get<ScannerStatus>('/api/scanner/status'),
      ]);
      const settingsData = settingsRes as unknown as ScannerSettings;
      const statusData = statusRes as unknown as ScannerStatus;
      setSettings(settingsData);
      setStatus(statusData);
      setFormData({
        scanIntervalMinutes: settingsData.scanIntervalMinutes,
        scanTimeoutSeconds: settingsData.scanTimeoutSeconds,
        scanConcurrency: settingsData.scanConcurrency,
        latencyThresholdMs: settingsData.latencyThresholdMs,
        anycastMinSamples: settingsData.anycastMinSamples,
        enabled: settingsData.enabled,
      });
      setError(null);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError(error.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await api.put('/api/settings', formData);
      setSuccess('Settings saved successfully');
      fetchSettings();
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError(error.message || 'Failed to save settings');
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
      fetchSettings();
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError(error.message || 'Failed to start scan');
    } finally {
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
                <Label htmlFor="scanIntervalMinutes">Scan Interval (minutes)</Label>
                <Input
                  id="scanIntervalMinutes"
                  type="number"
                  min="1"
                  max="1440"
                  value={formData.scanIntervalMinutes}
                  onChange={(e) => setFormData({ ...formData, scanIntervalMinutes: Number(e.target.value) })}
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="scanTimeoutSeconds">Scan Timeout (seconds)</Label>
                <Input
                  id="scanTimeoutSeconds"
                  type="number"
                  min="5"
                  max="300"
                  value={formData.scanTimeoutSeconds}
                  onChange={(e) => setFormData({ ...formData, scanTimeoutSeconds: Number(e.target.value) })}
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="scanConcurrency">Concurrency</Label>
                <Input
                  id="scanConcurrency"
                  type="number"
                  min="1"
                  max="100"
                  value={formData.scanConcurrency}
                  onChange={(e) => setFormData({ ...formData, scanConcurrency: Number(e.target.value) })}
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
              <Label>Last Run</Label>
              <p className="text-muted-foreground font-mono text-sm">
                {status?.lastRun ? new Date(status.lastRun).toLocaleString() : 'Never'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Next Scheduled Run</Label>
              <p className="text-muted-foreground font-mono text-sm">
                {status?.nextRun ? new Date(status.nextRun).toLocaleString() : 'Not scheduled'}
              </p>
            </div>

            <div className="pt-4 border-t">
              <Button onClick={handleRunScan} disabled={scanning || status?.running}>
                {scanning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
          <p>Settings are stored as a singleton row (id=1) in the database.</p>
          <p>Last updated: {settings?.updatedAt ? new Date(settings.updatedAt).toLocaleString() : 'Never'}</p>
          <p className="font-mono">
            <strong>scanIntervalMinutes:</strong> How often to run automatic scans (cron).<br />
            <strong>scanTimeoutSeconds:</strong> Maximum time to wait for a single server check.<br />
            <strong>scanConcurrency:</strong> Number of servers to check in parallel.<br />
            <strong>latencyThresholdMs:</strong> Servers above this latency are considered slow.<br />
            <strong>anycastMinSamples:</strong> Minimum samples required before calculating AnyCast confidence score.<br />
            <strong>enabled:</strong> Enable/disable automatic scanning.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}