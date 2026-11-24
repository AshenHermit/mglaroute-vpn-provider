import { ParserService } from './parser.service';

type ParsedProfile = ReturnType<ParserService['parseSubscriptionText']>['profiles'][number] & {
  remarks?: string | null;
};

describe('ParserService', () => {
  const parser = new ParserService();
  const parse = (text: string): ParsedProfile[] => parser.parseSubscriptionText(text).profiles;

  it('extracts vless fragment as remarks and keeps stream settings', () => {
    const profiles = parse(
      'vless://uuid@h:443?type=ws&host=cdn#My%20RU',
    );
    expect(profiles).toHaveLength(1);
    expect(profiles[0].remarks).toBe('My RU');
    expect(profiles[0].name).toBe('h:443');
    expect(profiles[0].rawConfig).toMatchObject({ type: 'ws', host: 'cdn' });
  });

  it('extracts trojan fragment as remarks and sni', () => {
    const profiles = parse(
      'trojan://pw@h:443?sni=x#TrojanName',
    );
    expect(profiles[0].remarks).toBe('TrojanName');
    expect(profiles[0].rawConfig).toMatchObject({ sni: 'x' });
  });

  it('extracts vmess ps as remarks', () => {
    const vmess = Buffer.from(
      JSON.stringify({ v: '2', ps: 'VM Name', add: 'h', port: '443', id: 'uuid', net: 'ws' }),
    ).toString('base64');
    const profiles = parse(`vmess://${vmess}`);
    expect(profiles[0].remarks).toBe('VM Name');
  });

  it('extracts ss fragment as remarks', () => {
    const userInfo = Buffer.from('aes-256-gcm:pass').toString('base64');
    const profiles = parse(`ss://${userInfo}@h:8388#SS%20Name`);
    expect(profiles[0].remarks).toBe('SS Name');
  });

  it('parses Clash YAML proxy fields into rawConfig and remarks', () => {
    const yaml = [
      'proxies:',
      '  - name: ClashRU',
      '    type: vless',
      '    server: h',
      '    port: 443',
      '    uuid: uuid-1',
      '    cipher: auto',
      '    password: pass',
      '    tls: true',
      '    network: ws',
    ].join('\n');
    const profiles = parse(yaml);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].remarks).toBe('ClashRU');
    expect(profiles[0].rawConfig).toMatchObject({
      uuid: 'uuid-1',
      cipher: 'auto',
      password: 'pass',
      tls: true,
      network: 'ws',
    });
  });

  it('defaults Clash network to tcp when the entry omits it', () => {
    const yaml = [
      'proxies:',
      '  - name: ClashNoNetwork',
      '    type: vless',
      '    server: h',
      '    port: 443',
      '    uuid: uuid-1',
    ].join('\n');
    const profiles = parse(yaml);
    expect(profiles[0].network).toBe('tcp');
  });

  it('maps nested Clash ws-opts Host into the host field', () => {
    const yaml = [
      'proxies:',
      '  - name: ClashWS',
      '    type: vless',
      '    server: h',
      '    port: 443',
      '    uuid: uuid-1',
      '    tls: true',
      '    network: ws',
      '    ws-opts:',
      '      path: /ws',
      '      headers:',
      '        Host: cdn.example.com',
    ].join('\n');
    const profiles = parse(yaml);
    expect(profiles[0].path).toBe('/ws');
    expect(profiles[0].host).toBe('cdn.example.com');
  });

  it('decodes a whole-body base64 subscription into URI profiles', () => {
    const body = Buffer.from('vless://uuid@h:443#Body%20Remark').toString('base64');
    const profiles = parse(body);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].remarks).toBe('Body Remark');
  });

  it('deduplicates identical URI lines', () => {
    const line = 'vless://uuid@h:443#Same';
    const profiles = parse(`${line}\n${line}`);
    expect(profiles).toHaveLength(1);
  });
});
