import { Profile, Protocol } from '../profiles/profile.entity';

type Outbound = Record<string, any>;

function streamSettings(profile: Profile): Record<string, any> {
  const raw = profile.rawConfig || {};
  const requested = [profile.tls, profile.security, raw.security]
    .map((value) => String(value || '').toLowerCase())
    .find((value) => value === 'tls' || value === 'reality');
  const security = requested || 'none';
  const transports = ['tcp', 'ws', 'h2', 'http', 'grpc', 'quic'];
  const requestedNetwork = String(profile.network || '').toLowerCase();
  const rawType = String(raw.type || '').toLowerCase();
  const network = transports.includes(requestedNetwork)
    ? requestedNetwork
    : transports.includes(rawType) ? rawType : 'tcp';
  const stream: Record<string, any> = { network, security };

  if (network === 'ws') {
    stream.wsSettings = {
      path: profile.path || '/',
      headers: profile.host ? { Host: profile.host } : {},
    };
  } else if (network === 'grpc') {
    stream.grpcSettings = { serviceName: profile.path || '' };
  } else if (network === 'h2' || network === 'http') {
    stream.httpSettings = {
      path: profile.path || '/',
      host: profile.host ? [profile.host] : [],
    };
  }

  const serverName = profile.sni || profile.address;
  if (security === 'tls') {
    stream.tlsSettings = {
      serverName,
      allowInsecure: Boolean(raw.allowInsecure),
      ...(profile.fingerprint ? { fingerprint: profile.fingerprint } : {}),
      ...(profile.alpn ? { alpn: String(profile.alpn).split(',') } : {}),
    };
  } else if (security === 'reality') {
    stream.realitySettings = {
      serverName,
      publicKey: String(raw.pbk || raw.publicKey || ''),
      shortId: String(raw.sid || raw.shortId || ''),
    };
  }

  return stream;
}

export function buildXrayOutbound(profile: Profile): Outbound | null {
  const raw = profile.rawConfig || {};

  if (profile.protocol === Protocol.VLESS || profile.protocol === Protocol.VMESS) {
    if (!profile.uuid) return null;
    const user: Record<string, any> = { id: profile.uuid };
    if (profile.protocol === Protocol.VLESS) {
      user.flow = profile.flow || raw.flow || undefined;
      user.encryption = raw.encryption || 'none';
      user.security = raw.security || profile.security || 'auto';
    } else {
      user.alterId = profile.alterId ?? 0;
      user.security = profile.security || 'auto';
    }
    return {
      protocol: profile.protocol,
      settings: { vnext: [{ address: profile.address, port: profile.port, users: [user] }] },
      streamSettings: streamSettings(profile),
    };
  }

  if (profile.protocol === Protocol.SHADOWSOCKS) {
    if (!profile.password) return null;
    return {
      protocol: 'shadowsocks',
      settings: {
        servers: [{
          address: profile.address,
          port: profile.port,
          method: profile.security || raw.method || 'aes-256-gcm',
          password: profile.password,
        }],
      },
    };
  }

  if (profile.protocol === Protocol.TROJAN) {
    if (!profile.password) return null;
    return {
      protocol: 'trojan',
      settings: {
        servers: [{
          address: profile.address,
          port: profile.port,
          password: profile.password,
          ...(profile.flow || raw.flow ? { flow: profile.flow || raw.flow } : {}),
        }],
      },
      streamSettings: streamSettings(profile),
    };
  }

  return null;
}

export function buildDelayConfig(profile: Profile, port: number): Record<string, any> {
  return {
    log: { loglevel: 'warning' },
    inbounds: [{
      tag: 'delay-in',
      port,
      listen: '127.0.0.1',
      protocol: 'mixed',
      settings: { auth: 'noauth' },
    }],
    outbounds: [
      buildXrayOutbound(profile),
      { protocol: 'freedom', tag: 'direct' },
    ],
  };
}
