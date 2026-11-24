import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadPair } from './download-pair.mjs';

test('downloadPair finishes the first download before starting the second', async () => {
  let active = 0;
  let maxActive = 0;
  const download = async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    return Buffer.from('payload');
  };

  const [zip, digest] = await downloadPair(download, 'https://example.test/xray.zip', 'https://example.test/xray.zip.dgst');

  assert.equal(maxActive, 1);
  assert.equal(zip.toString(), 'payload');
  assert.equal(digest.toString(), 'payload');
});
