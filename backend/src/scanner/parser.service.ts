import { Injectable } from '@nestjs/common';
import { Profile, Protocol } from '../profiles/profile.entity';

@Injectable()
export class ParserService {
  parseSubscriptionText(text: string): { profiles: Partial<Profile>[]; skipped: number } {
    const profiles: Partial<Profile>[] = [];
    let skipped = 0;

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      try {
        const parsed = this.parseLine(line);
        if (parsed) {
          profiles.push(parsed);
        } else {
          skipped++;
        }
      } catch {
        skipped++;
      }
    }

    // Try base64-decode whole content as clash YAML
    if (profiles.length === 0) {
      try {
        const decoded = Buffer.from(text.trim(), 'base64').toString('utf-8');
        if (decoded.includes('proxies:')) {
          const yamlProfiles = this.parseClashYaml(decoded);
          profiles.push(...yamlProfiles);
        }
      } catch {
        // not base64
      }
    }

    return { profiles, skipped };
  }

  private parseLine(line: string): Partial<Profile> | null {
    if (line.startsWith('vmess://')) {
      return this.parseVmess(line);
    }
    if (line.startsWith('vless://')) {
      return this.parseVless(line);
    }
    if (line.startsWith('ss://')) {
      return this.parseShadowsocks(line);
    }
    if (line.startsWith('trojan://')) {
      return this.parseTrojan(line);
    }
    return null;
  }

  private parseVmess(uri: string): Partial<Profile> | null {
    const encoded = uri.slice('vmess://'.length);
    let jsonStr: string;
    try {
      jsonStr = Buffer.from(encoded, 'base64').toString('utf-8');
    } catch {
      jsonStr = encoded;
    }
    let obj: any;
    try {
      obj = JSON.parse(jsonStr);
    } catch {
      try {
        obj = JSON.parse(decodeURIComponent(jsonStr));
      } catch {
        return null;
      }
    }
    if (!obj || !obj.add || !obj.port) return null;

    return {
      serverId: obj.id || obj.uuid || `vmess-${obj.add}-${obj.port}`,
      name: obj.ps || `${obj.add}:${obj.port}`,
      protocol: Protocol.VMESS,
      address: obj.add,
      port: Number(obj.port),
      uuid: obj.id,
      alterId: obj.aid ? Number(obj.aid) : 0,
      security: obj.scy || 'auto',
      network: obj.net || 'tcp',
      path: obj.path || '',
      host: obj.host || '',
      tls: obj.tls || '',
      sni: obj.sni || obj.host || '',
      alpn: obj.alpn || '',
      fingerprint: obj.fp || '',
      rawConfig: obj,
    };
  }

  private parseVless(uri: string): Partial<Profile> | null {
    try {
      const url = new URL(uri);
      const params = url.searchParams;
      const uuid = url.username;
      const address = url.hostname;
      const port = Number(url.port);
      if (!uuid || !address || !port) return null;

      return {
        serverId: `vless-${uuid}-${address}-${port}`,
        name: params.get('name') || `${address}:${port}`,
        protocol: Protocol.VLESS,
        address,
        port,
        uuid,
        security: params.get('security') || 'none',
        network: params.get('type') || 'tcp',
        path: params.get('path') || '',
        host: params.get('host') || '',
        tls: params.get('security') || '',
        sni: params.get('sni') || '',
        alpn: params.get('alpn') || '',
        fingerprint: params.get('fp') || '',
        flow: params.get('flow') || '',
        rawConfig: Object.fromEntries(params.entries()),
      };
    } catch {
      return null;
    }
  }

  private parseShadowsocks(uri: string): Partial<Profile> | null {
    try {
      // ss://base64@host:port#name  or  ss://method:pass@host:port#name
      const hashIdx = uri.indexOf('#');
      const name = hashIdx !== -1 ? decodeURIComponent(uri.slice(hashIdx + 1)) : '';
      const main = hashIdx !== -1 ? uri.slice(0, hashIdx) : uri;
      const atIdx = main.lastIndexOf('@');
      if (atIdx === -1) {
        // base64-only format
        const encoded = main.slice('ss://'.length);
        const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
        const m = decoded.match(/^(.+?):(.+)@(.+):(\d+)$/);
        if (!m) return null;
        const [, method, password, address, portStr] = m;
        return {
          serverId: `ss-${address}-${portStr}`,
          name: name || `${address}:${portStr}`,
          protocol: Protocol.SHADOWSOCKS,
          address,
          port: Number(portStr),
          password,
          security: method,
          rawConfig: { method, password, address, port: portStr },
        };
      }
      const userinfo = main.slice('ss://'.length, atIdx);
      const hostport = main.slice(atIdx + 1);
      const hp = hostport.match(/^(.+):(\d+)$/);
      if (!hp) return null;
      const address = hp[1];
      const port = Number(hp[2]);
      let method = '';
      let password = '';
      if (userinfo.includes(':')) {
        const parts = userinfo.split(':');
        method = parts[0];
        password = parts.slice(1).join(':');
      } else {
        const decoded = Buffer.from(userinfo, 'base64').toString('utf-8');
        const parts = decoded.split(':');
        method = parts[0];
        password = parts.slice(1).join(':');
      }
      if (!address || !port) return null;
      return {
        serverId: `ss-${address}-${port}`,
        name: name || `${address}:${port}`,
        protocol: Protocol.SHADOWSOCKS,
        address,
        port,
        password,
        security: method,
        rawConfig: { method, password, address, port },
      };
    } catch {
      return null;
    }
  }

  private parseTrojan(uri: string): Partial<Profile> | null {
    try {
      const url = new URL(uri);
      const params = url.searchParams;
      const password = url.username;
      const address = url.hostname;
      const port = Number(url.port);
      if (!password || !address || !port) return null;

      return {
        serverId: `trojan-${address}-${port}`,
        name: params.get('name') || `${address}:${port}`,
        protocol: Protocol.TROJAN,
        address,
        port,
        password,
        security: params.get('security') || 'tls',
        network: params.get('type') || 'tcp',
        path: params.get('path') || '',
        host: params.get('host') || '',
        tls: params.get('security') || 'tls',
        sni: params.get('sni') || '',
        alpn: params.get('alpn') || '',
        fingerprint: params.get('fp') || '',
        rawConfig: Object.fromEntries(params.entries()),
      };
    } catch {
      return null;
    }
  }

  private parseClashYaml(text: string): Partial<Profile>[] {
    const profiles: Partial<Profile>[] = [];
    // Simple regex-based extraction of proxy entries
    const proxyRegex = /- name:\s*(.+)\n\s*type:\s*(\w+)\n\s*server:\s*(.+)\n\s*port:\s*(\d+)/g;
    let match;
    while ((match = proxyRegex.exec(text)) !== null) {
      const [, name, type, server, portStr] = match;
      const protocol = type === 'vmess' ? Protocol.VMESS : type === 'vless' ? Protocol.VLESS : type === 'ss' ? Protocol.SHADOWSOCKS : type === 'trojan' ? Protocol.TROJAN : null;
      if (!protocol) continue;
      profiles.push({
        serverId: `${type}-${server}-${portStr}`,
        name: name.trim(),
        protocol,
        address: server.trim(),
        port: Number(portStr),
        rawConfig: { type, server, port: portStr, name },
      });
    }
    return profiles;
  }
}