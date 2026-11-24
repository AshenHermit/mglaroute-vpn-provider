import { useEffect, useState } from 'react';
import { api, getErrorMessage } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Loader2, Plus, Edit, Trash2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '../components/ui/alert';

interface OnlineService {
  id: string;
  name: string;
  testUrls: string[];
  isEnabled: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export function OnlineServicesPage() {
  const [services, setServices] = useState<OnlineService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<OnlineService | null>(null);
  const [formData, setFormData] = useState({ name: '', urls: '', enabled: true });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const fetchServices = async () => {
    try {
      setLoading(true);
      const result = await api.get<OnlineService[]>('/api/online-services');
      setServices(Array.isArray(result) ? result : []);
      setError(null);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load online services'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  const openCreateDialog = () => {
    setEditingService(null);
    setFormData({ name: '', urls: '', enabled: true });
    setFormError('');
    setDialogOpen(true);
  };

  const openEditDialog = (service: OnlineService) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      urls: (service.testUrls || []).join('\n'),
      enabled: service.isEnabled,
    });
    setFormError('');
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name || !formData.urls.trim()) {
      setFormError('Name and at least one URL are required');
      return;
    }

    const urls = formData.urls.split('\n').map((u) => u.trim()).filter(Boolean);
    if (urls.length === 0) {
      setFormError('At least one valid URL is required');
      return;
    }

    setSubmitting(true);
    try {
      const payload = { name: formData.name, testUrls: urls, isEnabled: formData.enabled };
      if (editingService) {
        await api.put(`/api/online-services/${editingService.id}`, payload);
      } else {
        await api.post('/api/online-services', payload);
      }
      setDialogOpen(false);
      fetchServices();
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, 'Failed to save online service'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this online service?')) return;
    try {
      await api.delete(`/api/online-services/${id}`);
      fetchServices();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to delete online service'));
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
          <h1 className="text-3xl font-bold">Online Services</h1>
          <p className="text-muted-foreground">Manage online service profiles</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchServices} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add Service
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingService ? 'Edit Online Service' : 'New Online Service'}</DialogTitle>
                <DialogDescription>Enter the service details (one URL per line)</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="grid gap-4 py-4">
                  {formError && (
                    <Alert variant="destructive" className="col-span-2">
                      <AlertDescription>{formError}</AlertDescription>
                    </Alert>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="My Service"
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="urls">URLs (one per line)</Label>
                    <textarea
                      id="urls"
                      value={formData.urls}
                      onChange={(e) => setFormData({ ...formData, urls: e.target.value })}
                      placeholder="https://example.com/api/servers&#10;https://another.com/vpn"
                      className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={submitting}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="enabled"
                      type="checkbox"
                      checked={formData.enabled}
                      onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    />
                    <Label htmlFor="enabled" className="mb-0">
                      Enabled
                    </Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingService ? 'Update' : 'Create'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>URLs</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No online services yet. Click "Add Service" to get started.
                  </TableCell>
                </TableRow>
              ) : (
                services.map((service) => (
                  <TableRow key={service.id}>
                    <TableCell className="font-medium">{service.name}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[400px]">
                      <div className="flex flex-wrap gap-1">
                        {(service.testUrls || []).map((url, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 bg-muted rounded truncate max-w-[150px]">
                            {url}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          service.isEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {service.isEnabled ? 'Enabled' : 'Disabled'}
                        {service.isDefault && ' · Default'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(service)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(service.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}