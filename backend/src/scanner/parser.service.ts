import { Injectable } from '@nestjs/common';
import { Profile, Protocol } from '../profiles/profile.entity';

export type ParsedProfile = Partial<Profile> & {
  remarks?: string | null;
  rawConfig: Record<string, any>;
};

const URI_MARKERS = /^(vmess|vless|ss|trojan):\/\//m;
const CLASH_MARKER = /(^|\n)\s*proxies:\s*(\n|$)/;

@Injectable()
export class ParserService {
  parseSubscriptionText(text: string): { profiles: ParsedProfile[]; skipped: number } {
    let source = text;
    try {
      const decoded = Buffer.from(text.trim(), 'base64').toString('utf-8');
      if (URI_MARKERS.test(decoded) || CLASH_MARKER.test(decoded)) source = decoded;
    } catch {
      // not base64 — use the original text
    }

    const lines = [...new Set(source.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
    const profiles: ParsedProfile[] = [];
    let skipped = 0;

    for (const line of lines) {
      try {
        const parsed = this.parseLine(line);
        if (parsed) profiles.push(parsed);
        else skipped++;
      } catch {
        skipped++;
      }
    }

    if (profiles.length === 0 && CLASH_MARKER.test(source)) {
      profiles.push(...this.parseClashYaml(source));
    }

    return { profiles, skipped };
  }

  private parseLine(line: string): ParsedProfile | null {
    if (line.startsWith('vmess://')) return this.parseVmess(line);
    if (line.startsWith('vless://')) return this.parseVless(line);
    if (line.startsWith('ss://')) return this.parseShadowsocks(line);
    if (line.startsWith('trojan://')) return this.parseTrojan(line);
    return null;
  }

  private fragmentInfo(hash: string): { remarks?: string; values: Record<string, string> } {
    if (!hash) return { values: {} };
    const raw = hash.replace(/^#/, '');
    const decoded = (() => {
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    })();
    const values = Object.fromEntries(new URLSearchParams(decoded).entries());
    if (decoded.includes('=') && values.remarks) return { remarks: values.remarks, values };
    if (decoded.includes('=')) return { values };
    return { remarks: decoded, values: {} };
  }

  private mergeFragment(rawConfig: Record<string, any>, values: Record<string, string>): Record<string, any> {
    const merged = { ...rawConfig };
    for (const [key, value] of Object.entries(values)) {
      if (!(key in merged)) merged[key] = value;
    }
    return merged;
  }

  private parseVmess(uri: string): ParsedProfile | null {
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

    const remarks = obj.ps || obj.remarks || null;
    return {
      serverId: obj.id || obj.uuid || `vmess-${obj.add}-${obj.port}`,
      name: obj.ps || `${obj.add}:${obj.port}`,
      remarks,
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

  private parseVless(uri: string): ParsedProfile | null {
    try {
      const url = new URL(uri);
      const params = url.searchParams;
      const uuid = url.username;
      const address = url.hostname;
      const port = Number(url.port);
      if (!uuid || !address || !port) return null;

      const fragment = this.fragmentInfo(url.hash);
      return {
        serverId: `vless-${uuid}-${address}-${port}`,
        name: params.get('name') || `${address}:${port}`,
        remarks: fragment.remarks || null,
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
        rawConfig: this.mergeFragment(Object.fromEntries(params.entries()), fragment.values),
      };
    } catch {
      return null;
    }
  }

  private parseShadowsocks(uri: string): ParsedProfile | null {
    try {
      // ss://base64@host:port#name  or  ss://method:pass@host:port#name
      const hashIdx = uri.indexOf('#');
      const name = hashIdx !== -1 ? decodeURIComponent(uri.slice(hashIdx + 1)) : '';
      const main = hashIdx !== -1 ? uri.slice(0, hashIdx) : uri;
      const atIdx = main.lastIndexOf('@');
      if (atIdx === -1) {
        const encoded = main.slice('ss://'.length);
        const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
        const m = decoded.match(/^(.+?):(.+)@(.+):(\d+)$/);
        if (!m) return null;
        const [, method, password, address, portStr] = m;
        return {
          serverId: `ss-${address}-${portStr}`,
          name: name || `${address}:${portStr}`,
          remarks: name || null,
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
        remarks: name || null,
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

  private parseTrojan(uri: string): ParsedProfile | null {
    try {
      const url = new URL(uri);
      const params = url.searchParams;
      const password = url.username;
      const address = url.hostname;
      const port = Number(url.port);
      if (!password || !address || !port) return null;

      const fragment = this.fragmentInfo(url.hash);
      return {
        serverId: `trojan-${address}-${port}`,
        name: params.get('name') || `${address}:${port}`,
        remarks: fragment.remarks || null,
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
        rawConfig: this.mergeFragment(Object.fromEntries(params.entries()), fragment.values),
      };
    } catch {
      return null;
    }
  }

  private scalar(value: string): any {
    const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
    if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
    if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
    return trimmed;
  }

  private parseClashYaml(text: string): ParsedProfile[] {
    const profiles: ParsedProfile[] = [];
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const start = lines[i].match(/^\s*-\s*name:\s*(.+)$/);
      if (!start) continue;

      const baseIndent = lines[i].match(/^\s*/)?.[0].length ?? 0;
      const config: Record<string, any> = { name: this.scalar(start[1]) };
      i++;
      while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) {
          i++;
          continue;
        }
        const indent = line.match(/^\s*/)?.[0].length ?? 0;
        if (/^\s*-\s*name:/.test(line) || (indent <= baseIndent && !/^\s+/.test(line))) break;
        const kv = line.match(/^\s*([\w-]+):\s*(.*)$/);
        if (kv && indent > baseIndent) config[kv[1]] = this.scalar(kv[2]);
        i++;
      }
      i--;

      const type = String(config.type || '').toLowerCase();
      const protocol =
        type === 'vmess'
          ? Protocol.VMESS
          : type === 'vless'
            ? Protocol.VLESS
            : type === 'ss' || type === 'shadowsocks'
              ? Protocol.SHADOWSOCKS
              : type === 'trojan'
                ? Protocol.TROJAN
                : null;
      if (!protocol) continue;

      const address = String(config.server || config.servername || '');
      const port = Number(config.port);
      if (!address || !port) continue;

      profiles.push({
        serverId: `${type}-${address}-${port}`,
        name: `${address}:${port}`,
        remarks: String(config.name || '') || null,
        protocol,
        address,
        port,
        uuid: config.uuid || undefined,
        password: config.password || undefined,
        security: config.cipher || config.security || undefined,
        network: config.network || 'tcp',
        path: config.path || undefined,
        host: String(config.host || config.Host || config['ws-opts.headers.Host'] || config['ws-opts']?.headers?.Host || '') || undefined,
        tls: config.tls === true ? 'tls' : config.tls ? String(config.tls) : undefined,
        sni: config.sni || config.servername || undefined,
        alpn: Array.isArray(config.alpn) ? config.alpn.join(',') : config.alpn || undefined,
        fingerprint: config.fp || config.fingerprint || undefined,
        rawConfig: config,
      });
    }

    return profiles;
  }
}
