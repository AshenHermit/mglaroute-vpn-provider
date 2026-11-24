import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assetNamesFor, selectAsset, parseSha256, verifySha256 } from './xray-assets.mjs';

const release = {
  assets: [
    { name: 'Xray-win7-64.zip', browser_download_url: 'https://example.test/Xray-win7-64.zip' },
    { name: 'Xray-win7-64.zip.dgst', browser_download_url: 'https://example.test/Xray-win7-64.zip.dgst' },
    { name: 'Xray-win7-arm64-v8a.zip', browser_download_url: 'https://example.test/Xray-win7-arm64-v8a.zip' },
    { name: 'Xray-linux-64.zip', browser_download_url: 'https://example.test/Xray-linux-64.zip' },
    { name: 'Xray-linux-arm64-v8a.zip', browser_download_url: 'https://example.test/Xray-linux-arm64-v8a.zip' },
    { name: 'Xray-macos-64.zip', browser_download_url: 'https://example.test/Xray-macos-64.zip' },
    { name: 'Xray-macos-arm64-v8a.zip', browser_download_url: 'https://example.test/Xray-macos-arm64-v8a.zip' },
  ],
};

test('assetNamesFor lists candidates without network access', () => {
  assert.deepEqual(assetNamesFor('win32', 'x64'), ['Xray-win7-64.zip', 'Xray-windows-64.zip']);
});

test('selectAsset picks the windows x64 zip', () => {
  assert.equal(selectAsset(release, 'win32', 'x64').name, 'Xray-win7-64.zip');
});

test('selectAsset picks the linux x64 zip', () => {
  assert.equal(selectAsset(release, 'linux', 'x64').name, 'Xray-linux-64.zip');
});

test('selectAsset picks the macOS arm64 zip', () => {
  assert.equal(selectAsset(release, 'darwin', 'arm64').name, 'Xray-macos-arm64-v8a.zip');
});

test('selectAsset throws on unsupported platform', () => {
  assert.throws(() => selectAsset(release, 'freebsd', 'x64'), /Unsupported platform/);
});

test('parseSha256 strips the digest prefix and whitespace', () => {
  assert.equal(parseSha256('sha256:abc123\n'), 'abc123');
});

test('parseSha256 reads SHA2-256 from a GitHub .dgst file', () => {
  const dgst = 'MD5= 1111\nSHA1= 2222\nSHA2-256= abc123\nSHA2-512= 3333\n';
  assert.equal(parseSha256(dgst), 'abc123');
});

test('verifySha256 accepts the matching digest and rejects a wrong one', () => {
  const data = Buffer.from('xray');
  const digest = createHash('sha256').update(data).digest('hex');
  assert.equal(verifySha256(data, digest), true);
  assert.equal(verifySha256(data, 'deadbeef'), false);
});
