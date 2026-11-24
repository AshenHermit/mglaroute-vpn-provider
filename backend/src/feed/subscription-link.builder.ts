import { Profile, Protocol } from '../profiles/profile.entity';

const PARAM_KEYS = [
  'security', 'sni', 'fp', 'pbk', 'publicKey', 'sid', 'shortId', 'spx', 'flow',
  'encryption', 'type', 'path', 'host', 'alpn', 'serviceName', 'headerType',
  'mode', 'packetEncoding', 'allowInsecure', 'extra', 'skip-cert-verify',
] as const;

type ParamKey = (typeof PARAM_KEYS)[number];

function text(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map((item) => String(item)).join(',');
  return String(value);
}

function withParams(base: string, params: Record<string, string>, remark: string | null): string {
  const query = new URLSearchParams();
  for (const key of PARAM_KEYS) {
    const value = params[key];
    if (value !== undefined && text(value) !== '') query.set(key === 'publicKey' ? 'pbk' : key === 'shortId' ? 'sid' : key, text(value));
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const fragment = remark ? `#${encodeURIComponent(remark)}` : '';
  return `${base}${suffix}${fragment}`;
}

function transportParams(profile: Profile): Record<string, string> {
  const raw = profile.rawConfig || {};
  const params: Record<string, string> = {
    security: text(raw.security || profile.security || 'none'),
    type: text(profile.network || raw.type || 'tcp'),
    sni: text(profile.sni || raw.sni),
    fp: text(profile.fingerprint || raw.fp),
    pbk: text(raw.pbk || raw.publicKey),
    sid: text(raw.sid || raw.shortId),
    path: text(profile.path || raw.path),
    host: text(profile.host || raw.host),
    flow: text(profile.flow || raw.flow),
  };
  for (const key of PARAM_KEYS as readonly ParamKey[]) {
    if (key in params) continue;
    const value = raw[key];
    if (value !== undefined && value !== null && value !== '') params[key] = text(value);
  }
  return params;
}

function vlessLink(profile: Profile): string | null {
  if (!profile.uuid) return null;
  const params = transportParams(profile);
  return withParams(
    `vless://${encodeURIComponent(profile.uuid)}@${profile.address}:${profile.port}`,
    params,
    profile.remarks || profile.name || null,
  );
}

function vmessLink(profile: Profile): string | null {
  if (!profile.uuid) return null;
  const raw = profile.rawConfig || {};
  const config: Record<string, unknown> = {
    v: '2',
    ps: profile.remarks || profile.name || '',
    add: profile.address,
    port: Number(profile.port),
    id: profile.uuid,
    aid: profile.alterId ?? 0,
    scy: text(profile.security || 'auto'),
    net: text(profile.network || 'tcp'),
  };
  const optional: Record<string, unknown> = {
    type: raw.type,
    host: profile.host || raw.host,
    path: profile.path || raw.path,
    tls: profile.tls || raw.tls,
    sni: profile.sni || raw.sni,
    alpn: profile.alpn || raw.alpn,
    fp: profile.fingerprint || raw.fp,
    'skip-cert-verify': raw['skip-cert-verify'],
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined && value !== null && value !== '') config[key] = value;
  }
  const json = JSON.stringify(config);
  return `vmess://${Buffer.from(json, 'utf8').toString('base64')}`;
}

function shadowsocksLink(profile: Profile): string | null {
  const password = profile.password || text((profile.rawConfig || {}).password);
  if (!password) return null;
  const method = text(profile.security || (profile.rawConfig || {}).method || 'aes-256-gcm');
  const userinfo = Buffer.from(`${method}:${password}`, 'utf8').toString('base64');
  const fragment = profile.remarks || profile.name;
  return `ss://${userinfo}@${profile.address}:${profile.port}${fragment ? `#${encodeURIComponent(fragment)}` : ''}`;
}

function trojanLink(profile: Profile): string | null {
  if (!profile.password) return null;
  const raw = profile.rawConfig || {};
  const params = transportParams(profile);
  params.security = text(raw.security || profile.security || 'tls');
  return withParams(
    `trojan://${encodeURIComponent(profile.password)}@${profile.address}:${profile.port}`,
    params,
    profile.remarks || profile.name || null,
  );
}

export function buildProfileLink(profile: Profile): string | null {
  switch (profile.protocol) {
    case Protocol.VLESS:
      return vlessLink(profile);
    case Protocol.VMESS:
      return vmessLink(profile);
    case Protocol.SHADOWSOCKS:
      return shadowsocksLink(profile);
    case Protocol.TROJAN:
      return trojanLink(profile);
    default:
      return null;
  }
}
