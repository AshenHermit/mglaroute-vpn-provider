import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class ReachabilityService {
  async checkUrls(urls: string[], timeoutMs: number): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    await Promise.all(
      urls.map(async (url) => {
        try {
          await axios.get(url, { timeout: timeoutMs, proxy: false, validateStatus: () => true });
          results[url] = true;
        } catch {
          results[url] = false;
        }
      }),
    );
    return results;
  }
}