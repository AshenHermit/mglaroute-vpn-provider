import { EventEmitter } from 'node:events';
import * as childProcess from 'node:child_process';
import * as net from 'node:net';
import * as fs from 'node:fs';
import axios from 'axios';
import { Profile, Protocol } from '../profiles/profile.entity';
import { XrayDelayService } from './xray-delay.service';

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

describe('XrayDelayService', () => {
  let service: XrayDelayService;
  let spawnSpy: jest.SpyInstance;
  let connectSpy: jest.SpyInstance;
  let getSpy: jest.SpyInstance;
  let kill: jest.Mock;
  let nowSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new XrayDelayService();
    kill = jest.fn();
    spawnSpy = jest.spyOn(childProcess, 'spawn').mockImplementation(() => {
      const child = new EventEmitter() as any;
      child.pid = 4242;
      child.kill = kill;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      return child;
    });
    connectSpy = jest.spyOn(net, 'connect').mockImplementation(() => {
      const socket = new EventEmitter() as any;
      socket.destroy = jest.fn();
      socket.setTimeout = jest.fn();
      process.nextTick(() => socket.emit('connect'));
      return socket;
    });
    getSpy = jest.spyOn(axios, 'get').mockResolvedValue({ status: 204, data: '' });
    nowSpy = jest.spyOn(Date, 'now')
      .mockReturnValueOnce(1000) // start
      .mockReturnValueOnce(1010) // before request 1
      .mockReturnValueOnce(1020) // after request 1
      .mockReturnValueOnce(1030) // before request 2
      .mockReturnValueOnce(1040); // after request 2
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.XRAY_STARTUP_TIMEOUT_MS;
  });

  it('returns null without spawning when the profile cannot produce an outbound', async () => {
    const result = await service.measureDelay(makeProfile({ uuid: undefined }), 5000);

    expect(result).toBeNull();
    expect(spawnSpy).not.toHaveBeenCalled();
  });

  it('returns the smallest positive delay and kills the child', async () => {
    const result = await service.measureDelay(makeProfile(), 5000);

    expect(result).toBe(10);
    expect(kill).toHaveBeenCalled();
    expect(getSpy).toHaveBeenCalledTimes(2);
    expect(getSpy.mock.calls[0][1]).toMatchObject({
      proxy: { protocol: 'http', host: '127.0.0.1' },
      timeout: 5000,
    });
    expect(connectSpy).toHaveBeenCalled();
  });

  it('reports binary availability', () => {
    const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(service.isAvailable()).toBe(false);
    existsSpy.mockReturnValue(true);
    expect(service.isAvailable()).toBe(true);
  });

  it('retries with a fresh port when the first core fails to bind', async () => {
    process.env.XRAY_STARTUP_TIMEOUT_MS = '100';
    let connects = 0;
    connectSpy.mockReset().mockImplementation(() => {
      const socket = new EventEmitter() as any;
      socket.destroy = jest.fn();
      socket.setTimeout = jest.fn();
      const failed = ++connects === 1;
      process.nextTick(() => socket.emit(failed ? 'error' : 'connect'));
      return socket;
    });
    let spawns = 0;
    spawnSpy.mockImplementation(() => {
      spawns += 1;
      const child = new EventEmitter() as any;
      child.pid = 4242 + spawns;
      child.kill = kill;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      if (spawns === 1) child.exitCode = 1;
      return child;
    });

    const result = await service.measureDelay(makeProfile(), 5000);

    expect(result).toBe(10);
    expect(spawns).toBe(2);
    expect(kill).toHaveBeenCalled();
  });

  it('returns null when spawn throws', async () => {
    spawnSpy.mockImplementationOnce(() => { throw new Error('spawn failed'); });

    await expect(service.measureDelay(makeProfile(), 5000)).resolves.toBeNull();
    expect(nowSpy).toHaveBeenCalled();
  });
});
