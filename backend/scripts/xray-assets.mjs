import { createHash } from 'node:crypto';

const CANDIDATES = {
  win32: {
    x64: ['Xray-win7-64.zip', 'Xray-windows-64.zip'],
    arm64: ['Xray-win7-arm64-v8a.zip', 'Xray-windows-arm64-v8a.zip'],
    ia32: ['Xray-win7-32.zip', 'Xray-windows-32.zip'],
  },
  linux: {
    x64: ['Xray-linux-64.zip'],
    arm64: ['Xray-linux-arm64-v8a.zip'],
    arm: ['Xray-linux-arm32-v7a.zip'],
    ia32: ['Xray-linux-32.zip'],
  },
  darwin: {
    x64: ['Xray-macos-64.zip'],
    arm64: ['Xray-macos-arm64-v8a.zip'],
  },
};

export function assetNamesFor(platform, arch) {
  const names = CANDIDATES[platform]?.[arch];
  if (!names) throw new Error(`Unsupported platform/arch: ${platform}/${arch}`);
  return [...names];
}

export function selectAsset(release, platform, arch) {
  const names = assetNamesFor(platform, arch);
  for (const name of names) {
    const asset = release?.assets?.find((a) => a.name === name);
    if (asset) return asset;
  }
  throw new Error(`No xray asset found for ${platform}/${arch}`);
}

export function parseSha256(text) {
  const lines = String(text).split(/\r?\n/);
  const line = lines.find((l) => /^\s*(sha2-256|sha256)\s*[=:]/i.test(l));
  if (line) return line.replace(/^\s*(sha2-256|sha256)\s*[=:]\s*/i, '').trim().split(/\s+/)[0].toLowerCase();
  return String(text).replace(/^sha256:/i, '').trim().split(/\s+/)[0].toLowerCase();
}

export function verifySha256(buffer, expectedHex) {
  const actual = createHash('sha256').update(buffer).digest('hex');
  return actual === parseSha256(expectedHex);
}
