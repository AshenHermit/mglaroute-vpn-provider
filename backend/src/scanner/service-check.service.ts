import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { DelayProxy } from './xray-delay.service';

@Injectable()
export class ServiceCheckService {
  async check(urls: string[], proxy: DelayProxy, timeoutMs: number): Promise<Set<string>> {
    const results = await Promise.all(
      (urls || []).map(async (url) => {
        try {
          const response = await axios.get(url, {
            proxy,
            timeout: timeoutMs,
            validateStatus: () => true,
          });
          return response.status >= 200 && response.status < 300 ? url : null;
        } catch {
          return null;
        }
      }),
    );

    return new Set(results.filter((url): url is string => url !== null));
  }
}
