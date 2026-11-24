import axios from 'axios';
import AdmZip from 'adm-zip';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetNamesFor, parseSha256, selectAsset, verifySha256 } from './xray-assets.mjs';
import { downloadPair } from './download-pair.mjs';
import { getWithFallback } from './http-get.mjs';

const httpGet = (url, options) => axios.get(url, options);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const PLATFORM = process.platform;
const ARCH = process.arch;

function binaryPath() {
  const name = PLATFORM === 'win32' ? 'xray.exe' : 'xray';
  return process.env.XRAY_BINARY_PATH || path.join(REPO_ROOT, 'backend', 'bin', name);
}

function syntheticRelease(tag) {
  const base = `https://github.com/XTLS/Xray-core/releases/download/${tag}`;
  const assets = assetNamesFor(PLATFORM, ARCH).map((name) => ({
    name,
    browser_download_url: `${base}/${name}`,
  }));
  return { tag_name: tag, assets };
}

async function resolveFromRedirect() {
  const response = await getWithFallback(httpGet, 'https://github.com/XTLS/Xray-core/releases/latest', {
    maxRedirects: 0,
    validateStatus: () => true,
    timeout: 60000,
  });
  const location = response.headers.location;
  const match = location && location.match(/\/tag\/([^/?#]+)/);
  if (!match) throw new Error(`Cannot resolve latest xray release from ${location || response.status}`);
  return syntheticRelease(decodeURIComponent(match[1]));
}

async function resolveRelease() {
  if (process.env.XRAY_VERSION) return syntheticRelease(process.env.XRAY_VERSION);
  const base = 'https://api.github.com/repos/XTLS/Xray-core/releases';
  const headers = { Accept: 'application/vnd.github.v3+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const response = await getWithFallback(httpGet, `${base}/latest`, { headers, timeout: 60000 });
    return response.data;
  } catch (error) {
    if (error.response?.status === 403 || error.response?.status === 429) {
      console.warn('GitHub API unavailable (rate limit); using release redirect instead.');
      return resolveFromRedirect();
    }
    throw error;
  }
}

async function downloadBuffer(url) {
  const response = await getWithFallback(httpGet, url, {
    responseType: 'arraybuffer',
    timeout: 120000,
    headers: { Accept: 'application/octet-stream' },
  });
  return Buffer.from(response.data);
}

function extractBinary(zipBuffer) {
  const zip = new AdmZip(zipBuffer);
  const entry = zip.getEntries().find((e) => /(^|\/)xray(\.exe)?$/i.test(e.entryName));
  if (!entry) throw new Error('xray binary not found in downloaded archive');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xray-download-'));
  zip.extractEntryTo(entry, tempDir, false, true);
  return path.join(tempDir, path.basename(entry.entryName));
}

async function main() {
  const release = await resolveRelease();
  const asset = selectAsset(release, PLATFORM, ARCH);

  let zipUrl = process.env.XRAY_DOWNLOAD_URL || asset.browser_download_url;
  let dgstUrl = `${zipUrl}.dgst`;
  if (!process.env.XRAY_DOWNLOAD_URL) {
    const dgstAsset = release.assets?.find((a) => a.name === `${asset.name}.dgst`);
    if (dgstAsset) dgstUrl = dgstAsset.browser_download_url;
  }

  const [zipBuffer, dgstBuffer] = await downloadPair(downloadBuffer, zipUrl, dgstUrl);
  const expected = parseSha256(dgstBuffer.toString('utf8'));
  if (!verifySha256(zipBuffer, expected)) {
    throw new Error(`sha256 mismatch for ${asset.name}: expected ${expected}`);
  }

  const extracted = extractBinary(zipBuffer);
  const destination = binaryPath();
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(extracted, destination);
  if (PLATFORM !== 'win32') fs.chmodSync(destination, 0o755);

  const version = spawnSync(destination, ['-version'], { encoding: 'utf8' });
  if (version.status !== 0) {
    throw new Error(`xray binary failed to run: ${version.stderr || version.stdout || 'unknown error'}`);
  }
  console.log(`Downloaded ${asset.name} to ${destination}`);
  console.log((version.stdout || '').trim());
}

main().catch((error) => {
  console.error(`xray download failed: ${error.message}`);
  process.exit(1);
});
