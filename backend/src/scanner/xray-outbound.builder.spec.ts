import { Profile, Protocol } from '../profiles/profile.entity';
import { buildDelayConfig, buildXrayOutbound } from './xray-outbound.builder';

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    subscriptionId: 's1',
    serverId: 'server-1',
    name: 'test',
    remarks: null,
    protocol: Protocol.VLESS,
    address: 'example.com',
    port: 443,
    uuid: 'uuid-1',
    password: null,
    alterId: null,
    security: 'none',
    network: 'tcp',
    path: '',
    host: '',
    tls: '',
    sni: '',
    alpn: '',
    fingerprint: '',
    flow: '',
    rawConfig: {},
    lastLatencyMs: null,
    lastReachable: null,
    anycastScore: null,
    anycastSamples: 0,
    present: true,
    lastScannedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Profile;
}

describe('buildXrayOutbound', () => {
  it('builds a vless ws+tls outbound with allowInsecure', () => {
    const profile = makeProfile({
      protocol: Protocol.VLESS,
      network: 'ws',
      tls: 'tls',
      sni: 'sni.example.com',
      path: '/ws',
      host: 'host.example.com',
      flow: 'xtls-rprx-vision',
      rawConfig: { allowInsecure: true, encryption: 'none' },
    });

    const outbound = buildXrayOutbound(profile);

    expect(outbound?.protocol).toBe('vless');
    expect(outbound?.settings.vnext[0].users[0]).toMatchObject({
      id: 'uuid-1',
      flow: 'xtls-rprx-vision',
      encryption: 'none',
    });
    expect(outbound?.streamSettings).toMatchObject({ network: 'ws', security: 'tls' });
    expect(outbound?.streamSettings.wsSettings).toMatchObject({ path: '/ws', headers: { Host: 'host.example.com' } });
    expect(outbound?.streamSettings.tlsSettings).toMatchObject({
      serverName: 'sni.example.com',
      allowInsecure: true,
    });
  });

  it('builds a vmess outbound with alterId', () => {
    const outbound = buildXrayOutbound(makeProfile({
      protocol: Protocol.VMESS,
      alterId: 0,
      security: 'auto',
    }));

    expect(outbound?.protocol).toBe('vmess');
    expect(outbound?.settings.vnext[0].users[0]).toMatchObject({ id: 'uuid-1', alterId: 0, security: 'auto' });
  });

  it('builds a shadowsocks outbound', () => {
    const outbound = buildXrayOutbound(makeProfile({
      protocol: Protocol.SHADOWSOCKS,
      security: 'aes-256-gcm',
      password: 'secret',
    }));

    expect(outbound?.protocol).toBe('shadowsocks');
    expect(outbound?.settings.servers[0]).toMatchObject({
      address: 'example.com', port: 443, method: 'aes-256-gcm', password: 'secret',
    });
  });

  it('builds a trojan outbound', () => {
    const outbound = buildXrayOutbound(makeProfile({
      protocol: Protocol.TROJAN,
      password: 'secret',
      tls: 'tls',
      sni: 'sni.example.com',
    }));

    expect(outbound?.protocol).toBe('trojan');
    expect(outbound?.settings.servers[0]).toMatchObject({ address: 'example.com', port: 443, password: 'secret' });
    expect(outbound?.streamSettings.tlsSettings.serverName).toBe('sni.example.com');
  });

  it('maps reality publicKey and shortId from rawConfig', () => {
    const outbound = buildXrayOutbound(makeProfile({
      security: 'reality',
      rawConfig: { security: 'reality', pbk: 'pub-key', sid: 'short-id' },
    }));

    expect(outbound?.streamSettings.security).toBe('reality');
    expect(outbound?.streamSettings.realitySettings).toMatchObject({
      publicKey: 'pub-key', shortId: 'short-id', serverName: 'example.com',
    });
  });

  it('rejects a non-transport network value from Clash type', () => {
    const outbound = buildXrayOutbound(makeProfile({
      network: 'vless',
      rawConfig: { type: 'vless' },
    }));
    expect(outbound?.streamSettings.network).toBe('tcp');
  });

  it('returns null when credentials are missing', () => {
    expect(buildXrayOutbound(makeProfile({ uuid: undefined }))).toBeNull();
    expect(buildXrayOutbound(makeProfile({ protocol: Protocol.TROJAN, password: undefined }))).toBeNull();
  });
});

describe('buildDelayConfig', () => {
  it('wraps the outbound with a loopback mixed inbound and a direct outbound', () => {
    const profile = makeProfile();
    const outbound = buildXrayOutbound(profile)!;
    const config = buildDelayConfig(profile, 10801);

    expect(config.log.loglevel).toBe('warning');
    expect(config.inbounds[0]).toMatchObject({
      tag: 'delay-in', port: 10801, listen: '127.0.0.1', protocol: 'mixed', settings: { auth: 'noauth' },
    });
    expect(config.outbounds[0]).toEqual(outbound);
    expect(config.outbounds[1]).toMatchObject({ protocol: 'freedom', tag: 'direct' });
  });
});
