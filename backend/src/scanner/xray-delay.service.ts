import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { Profile } from '../profiles/profile.entity';
import { buildDelayConfig, buildXrayOutbound } from './xray-outbound.builder';

const PING_URL = process.env.XRAY_PING_URL || 'https://www.google.com/generate_204';
const INTER_REQUEST_DELAY_MS = 100;

export interface DelayProxy {
  protocol: 'http';
  host: '127.0.0.1';
  port: number;
}

@Injectable()
export class XrayDelayService {
  private readonly logger = new Logger(XrayDelayService.name);

  isAvailable(): boolean {
    return Boolean(this.binaryPath());
  }

  async measureDelay(profile: Profile, timeoutMs: number): Promise<number | null> {
    return this.withProxy(profile, timeoutMs, (proxy) => this.probeDelay(proxy, timeoutMs));
  }

  async withProxy<T>(
    profile: Profile,
    timeoutMs: number,
    callback: (proxy: DelayProxy) => Promise<T>,
  ): Promise<T | null> {
    let configDir: string | null = null;
    let child: childProcess.ChildProcess | null = null;

    try {
      if (!buildXrayOutbound(profile)) return null;
      const binary = this.binaryPath();
      if (!binary) {
        this.logger.warn('xray binary not found; run `pnpm xray:download`');
        return null;
      }

      let port = await this.freePort();
      for (let attempt = 0; attempt < 2; attempt++) {
        configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xray-delay-'));
        const configPath = path.join(configDir, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify(buildDelayConfig(profile, port)));

        child = childProcess.spawn(binary, ['run', '-c', configPath], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stderr = '';
        child.stdout?.on('data', () => undefined);
        child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

        if (await this.waitForPort(port)) break;

        const exitedBadly = typeof child.exitCode === 'number' && child.exitCode !== 0;
        const bindFailure = exitedBadly || /address already in use|failed to listen|bind|permission denied/i.test(stderr);
        if (attempt === 1 || !bindFailure) return null;

        child.kill();
        child = null;
        fs.rmSync(configDir, { recursive: true, force: true });
        configDir = null;
        port = await this.freePort();
      }

      if (!child) return null;

      return await callback({ protocol: 'http', host: '127.0.0.1', port });
    } catch (error: any) {
      this.logger.debug(`xray session failed: ${error?.message || error}`);
      return null;
    } finally {
      if (child && !child.killed) child.kill();
      if (configDir) fs.rmSync(configDir, { recursive: true, force: true });
    }
  }

  async probeDelay(proxy: DelayProxy, timeoutMs: number): Promise<number | null> {
    const samples: number[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = Date.now();
      const response = await axios.get(PING_URL, {
        proxy,
        timeout: timeoutMs,
        validateStatus: () => true,
      });
      const after = Date.now();
      if (response.status === 204 || response.status === 200) samples.push(after - before);
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, INTER_REQUEST_DELAY_MS));
    }

    const positive = samples.filter((value) => value > 0);
    return positive.length ? Math.min(...positive) : null;
  }

  private binaryPath(): string | null {
    const name = process.platform === 'win32' ? 'xray.exe' : 'xray';
    const candidates = [
      process.env.XRAY_BINARY_PATH,
      path.resolve(process.cwd(), 'bin', name),
      path.resolve(__dirname, '..', '..', 'bin', name),
    ].filter(Boolean) as string[];
    return candidates.find((candidate) => fs.existsSync(candidate)) || null;
  }

  private async freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        server.close(() => resolve(port));
      });
    });
  }

  private async waitForPort(port: number): Promise<boolean> {
    const timeoutMs = Number(process.env.XRAY_STARTUP_TIMEOUT_MS || 2000);
    const attempts = Math.max(1, Math.ceil(timeoutMs / 100));
    for (let attempt = 0; attempt < attempts; attempt++) {
      const connected = await new Promise<boolean>((resolve) => {
        const socket = net.connect({ host: '127.0.0.1', port });
        let settled = false;
        const finish = (value: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          socket.destroy();
          resolve(value);
        };
        const timer = setTimeout(() => finish(false), 100);
        socket.once('connect', () => finish(true));
        socket.once('error', () => finish(false));
      });
      if (connected) return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return false;
  }
}
