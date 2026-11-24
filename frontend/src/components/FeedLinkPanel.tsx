import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Link2, AlertTriangle } from 'lucide-react';
import { API_BASE_URL, api } from '../lib/api';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface EnabledService {
  id: string;
  name: string;
}

type FeedForm = {
  format: 'subscription' | 'json';
  protocol: string;
  reachable: string;
  anycast: string;
  sort: string;
  search: string;
  limit: number;
  services: string[];
};

const SORTS = [
  'latency_asc', 'latency_desc',
  'confidence_asc', 'confidence_desc',
  'name_asc', 'name_desc',
  'address_asc', 'address_desc',
  'port_asc', 'port_desc',
  'protocol_asc', 'protocol_desc',
];

const INITIAL_FORM: FeedForm = {
  format: 'subscription',
  protocol: '',
  reachable: '',
  anycast: '',
  sort: 'latency_asc',
  search: '',
  limit: 200,
  services: [],
};

export function FeedLinkPanel() {
  const [form, setForm] = useState<FeedForm>(INITIAL_FORM);
  const [enabledServices, setEnabledServices] = useState<EnabledService[]>([]);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get<EnabledService[]>('/api/online-services/enabled')
      .then((data) => setEnabledServices(Array.isArray(data) ? data : []))
      .catch(() => setEnabledServices([]));
  }, []);

  const buildLink = () => {
    const params = new URLSearchParams();
    params.set('format', form.format);
    if (form.search.trim()) params.set('search', form.search.trim());
    if (form.protocol) params.set('protocol', form.protocol);
    if (form.reachable) params.set('reachable', form.reachable);
    if (form.anycast) params.set('anycast', form.anycast);
    if (form.services.length) params.set('services', form.services.join(','));
    params.set('sort', form.sort);
    params.set('limit', String(form.limit));
    setLink(`${API_BASE_URL}/api/feed?${params.toString()}`);
    setCopied(false);
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const toggleService = (id: string) => {
    setForm((current) => ({
      ...current,
      services: current.services.includes(id)
        ? current.services.filter((service) => service !== id)
        : [...current.services, id],
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" /> Public Server Feed
        </CardTitle>
        <CardDescription>
          Build a link that returns servers collected from all active subscriptions. No token required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-2">
            <Label htmlFor="feed-format">Format</Label>
            <Select
              value={form.format}
              onValueChange={(v) => setForm({ ...form, format: v as FeedForm['format'] })}
            >
              <SelectTrigger id="feed-format"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="subscription">Subscription URL</SelectItem>
                <SelectItem value="json">JSON with scan details</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="feed-protocol">Protocol</Label>
            <Select value={form.protocol} onValueChange={(v) => setForm({ ...form, protocol: v })}>
              <SelectTrigger id="feed-protocol"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                <SelectItem value="vless">VLESS</SelectItem>
                <SelectItem value="vmess">VMess</SelectItem>
                <SelectItem value="ss">SS</SelectItem>
                <SelectItem value="trojan">Trojan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="feed-reachable">Reachable</Label>
            <Select value={form.reachable} onValueChange={(v) => setForm({ ...form, reachable: v })}>
              <SelectTrigger id="feed-reachable"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="feed-anycast">Anycast</Label>
            <Select value={form.anycast} onValueChange={(v) => setForm({ ...form, anycast: v })}>
              <SelectTrigger id="feed-anycast"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="feed-sort">Sort</Label>
            <Select value={form.sort} onValueChange={(v) => setForm({ ...form, sort: v })}>
              <SelectTrigger id="feed-sort"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SORTS.map((sort) => (
                  <SelectItem key={sort} value={sort}>{sort}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="feed-limit">Limit</Label>
            <Input
              id="feed-limit"
              type="number"
              min={1}
              max={1000}
              value={form.limit}
              onChange={(e) => setForm({ ...form, limit: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="feed-search">Search</Label>
          <Input
            id="feed-search"
            placeholder="Remarks, name or address"
            value={form.search}
            onChange={(e) => setForm({ ...form, search: e.target.value })}
          />
        </div>

        {enabledServices.length > 0 && (
          <div className="space-y-2">
            <Label>Online services (all selected must be reachable)</Label>
            <div className="flex flex-wrap gap-2">
              {enabledServices.map((service) => {
                const active = form.services.includes(service.id);
                return (
                  <Button
                    key={service.id}
                    type="button"
                    size="sm"
                    variant={active ? 'default' : 'outline'}
                    onClick={() => toggleService(service.id)}
                  >
                    {active && <Check className="mr-1 h-3 w-3" />}
                    {service.name}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={buildLink}>Generate link</Button>
          <Button type="button" variant="outline" onClick={copyLink} disabled={!link}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button type="button" variant="outline" onClick={() => window.open(link, '_blank')} disabled={!link}>
            <ExternalLink className="mr-2 h-4 w-4" /> Open
          </Button>
        </div>

        {link && (
          <div className="space-y-2">
            <Label htmlFor="feed-link">Public link</Label>
            <Input id="feed-link" readOnly value={link} onFocus={(e) => e.target.select()} />
          </div>
        )}

        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Anyone with this link can read the feed. It exposes server connections without authentication — share carefully.
        </p>
      </CardContent>
    </Card>
  );
}
