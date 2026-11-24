import 'reflect-metadata';
import { Profile, Protocol } from '../profiles/profile.entity';
import { buildProfileLink } from './subscription-link.builder';

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p-1',
    protocol: Protocol.VLESS,
    name: 'node-1',
    remarks: 'Node 1',
    address: 'example.com',
    port: 443,
    uuid: 'uuid-1',
    password: null,
    alterId: 0,
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
    ...overrides,
  } as unknown as Profile;
}

describe('buildProfileLink — vless', () => {
  it('preserves REALITY and xhttp parameters', () => {
    const link = buildProfileLink(profile({
      network: 'xhttp',
      sni: 'sni.example.com',
      fingerprint: 'firefox',
      flow: 'xtls-rprx-vision',
      rawConfig: {
        security: 'reality',
        pbk: 'public-key',
        sid: 'short-id',
        type: 'xhttp',
        path: '/api/v1/upload',
        host: 'host.example.com',
        alpn: 'h2,http/1.1',
        encryption: 'none',
        allowInsecure: true,
      },
    }))!;

    const url = new URL(link);
    expect(url.protocol).toBe('vless:');
    expect(url.username).toBe('uuid-1');
    expect(url.hostname).toBe('example.com');
    expect(url.searchParams.get('security')).toBe('reality');
    expect(url.searchParams.get('pbk')).toBe('public-key');
    expect(url.searchParams.get('sid')).toBe('short-id');
    expect(url.searchParams.get('flow')).toBe('xtls-rprx-vision');
    expect(url.searchParams.get('type')).toBe('xhttp');
    expect(url.searchParams.get('path')).toBe('/api/v1/upload');
    expect(url.searchParams.get('fp')).toBe('firefox');
    expect(url.searchParams.get('alpn')).toBe('h2,http/1.1');
    expect(url.searchParams.get('encryption')).toBe('none');
    expect(url.searchParams.get('allowInsecure')).toBe('true');
    expect(decodeURIComponent(url.hash.slice(1))).toBe('Node 1');
  });

  it('does not emit empty query values', () => {
    const link = buildProfileLink(profile({ remarks: null, name: '' }))!;
    const url = new URL(link);
    for (const value of url.searchParams.values()) {
      expect(value).not.toBe('');
    }
    expect(url.hash).toBe('');
  });

  it('returns null without uuid', () => {
    expect(buildProfileLink(profile({ uuid: undefined }))).toBeNull();
  });
});

describe('buildProfileLink — vmess', () => {
  it('emits base64 JSON with canonical fields', () => {
    const link = buildProfileLink(profile({
      protocol: Protocol.VMESS,
      remarks: 'RU Node',
      alterId: 2,
      security: 'auto',
      network: 'ws',
      path: '/ws',
      host: 'ws.example.com',
      tls: 'tls',
      uuid: 'vmess-id',
    }))!;

    expect(link.startsWith('vmess://')).toBe(true);
    const json = JSON.parse(Buffer.from(link.slice(8), 'base64').toString('utf-8'));
    expect(json).toMatchObject({
      v: '2',
      ps: 'RU Node',
      add: 'example.com',
      port: 443,
      id: 'vmess-id',
      aid: 2,
      scy: 'auto',
      net: 'ws',
      path: '/ws',
      host: 'ws.example.com',
      tls: 'tls',
    });
  });
});

describe('buildProfileLink — ss', () => {
  it('encodes method and password as base64 userinfo', () => {
    const link = buildProfileLink(profile({
      protocol: Protocol.SHADOWSOCKS,
      security: 'aes-256-gcm',
      password: 'p@ss:word',
      remarks: 'SS node',
    }))!;

    const url = new URL(link);
    expect(url.protocol).toBe('ss:');
    expect(Buffer.from(url.username, 'base64').toString('utf-8')).toBe('aes-256-gcm:p@ss:word');
    expect(decodeURIComponent(url.hash.slice(1))).toBe('SS node');
  });

  it('returns null without password', () => {
    expect(buildProfileLink(profile({ protocol: Protocol.SHADOWSOCKS, password: undefined }))).toBeNull();
  });
});

describe('buildProfileLink — trojan', () => {
  it('puts password in userinfo and transport settings in query', () => {
    const link = buildProfileLink(profile({
      protocol: Protocol.TROJAN,
      password: 'secret',
      sni: 'tls.example.com',
      network: 'grpc',
      path: 'svc',
      fingerprint: 'chrome',
      rawConfig: { security: 'tls', allowInsecure: false },
    }))!;

    const url = new URL(link);
    expect(url.protocol).toBe('trojan:');
    expect(url.username).toBe('secret');
    expect(url.searchParams.get('sni')).toBe('tls.example.com');
    expect(url.searchParams.get('type')).toBe('grpc');
    expect(url.searchParams.get('path')).toBe('svc');
    expect(url.searchParams.get('fp')).toBe('chrome');
    expect(url.searchParams.get('security')).toBe('tls');
  });

  it('returns null without password', () => {
    expect(buildProfileLink(profile({ protocol: Protocol.TROJAN, password: undefined }))).toBeNull();
  });
});
