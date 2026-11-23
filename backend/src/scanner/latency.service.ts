import { Injectable } from '@nestjs/common';
import * as net from 'net';

@Injectable()
export class LatencyService {
  async measureLatency(host: string, port: number, timeoutMs: number): Promise<number | null> {
    return new Promise((resolve) => {
      const start = Date.now();
      const socket = new net.Socket();
      let done = false;

      const finish = (value: number | null) => {
        if (done) return;
        done = true;
        socket.destroy();
        resolve(value);
      };

      socket.setTimeout(timeoutMs);
      socket.connect(port, host, () => {
        const latency = Date.now() - start;
        finish(latency);
      });
      socket.on('error', () => finish(null));
      socket.on('timeout', () => finish(null));
    });
  }
}