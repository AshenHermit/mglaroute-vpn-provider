import test from 'node:test';
import assert from 'node:assert/strict';
import { getWithFallback } from './http-get.mjs';

const url = 'https://api.github.com/repos/XTLS/Xray-core/releases/latest';

test('getWithFallback retries directly when the proxied TLS connection drops', async () => {
  const proxies = [];
  const get = async (_url, options) => {
    proxies.push(options.proxy);
    if (options.proxy !== false) throw new Error('Client network socket disconnected before secure TLS connection was established');
    return { status: 200, data: { tag_name: 'v1' } };
  };

  const response = await getWithFallback(get, url, { timeout: 1000 });

  assert.equal(response.data.tag_name, 'v1');
  assert.deepEqual(proxies, [undefined, false]);
});

test('getWithFallback does not retry HTTP error responses', async () => {
  let calls = 0;
  const get = async () => {
    calls += 1;
    throw Object.assign(new Error('403 forbidden'), { response: { status: 403 } });
  };

  await assert.rejects(() => getWithFallback(get, url, {}), /403 forbidden/);
  assert.equal(calls, 1);
});

test('getWithFallback does not retry when proxy is already disabled', async () => {
  let calls = 0;
  const get = async () => {
    calls += 1;
    throw new Error('socket hang up');
  };

  await assert.rejects(() => getWithFallback(get, url, { proxy: false }), /socket hang up/);
  assert.equal(calls, 1);
});
