#!/usr/bin/env node

import { generateKeyPairSync, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const privateKeyRelativePath = 'keys/private.jwk';
const privateKeyPath = join(repoRoot, privateKeyRelativePath);
const publicKeyPath = join(repoRoot, 'manifest/public-key.json');
const gitignorePath = join(repoRoot, '.gitignore');

function gitignorePatternCoversPrivateKey(pattern) {
  const normalized = pattern.trim().replace(/^\/+/, '');

  if (!normalized || normalized.startsWith('#') || normalized.startsWith('!')) {
    return false;
  }

  if (normalized === privateKeyRelativePath) {
    return true;
  }

  if (normalized === 'keys' || normalized === 'keys/') {
    return true;
  }

  return privateKeyRelativePath.startsWith(normalized.endsWith('/') ? normalized : `${normalized}/`);
}

async function assertPrivateKeyIsIgnored() {
  if (!existsSync(gitignorePath)) {
    throw new Error('.gitignore must exist before generating private key material.');
  }

  const gitCheck = spawnSync('git', ['check-ignore', '-q', privateKeyRelativePath], {
    cwd: repoRoot,
    stdio: 'ignore',
  });

  if (gitCheck.status === 0) {
    return 'git check-ignore';
  }

  const gitignore = await readFile(gitignorePath, 'utf8');
  const matchingPattern = gitignore
    .split(/\r?\n/)
    .find((line) => gitignorePatternCoversPrivateKey(line));

  if (!matchingPattern) {
    throw new Error(`${privateKeyRelativePath} is not covered by .gitignore.`);
  }

  return `.gitignore pattern "${matchingPattern.trim()}"`;
}

function publicKeyId(publicJwk) {
  const material = JSON.stringify({
    crv: publicJwk.crv,
    kty: publicJwk.kty,
    x: publicJwk.x,
  });

  return `ed25519-${createHash('sha256').update(material).digest('hex').slice(0, 16)}`;
}

const ignoreCheck = await assertPrivateKeyIsIgnored();

if (existsSync(privateKeyPath)) {
  throw new Error(`${privateKeyRelativePath} already exists. Move it aside before generating a new keypair.`);
}

if (existsSync(publicKeyPath)) {
  throw new Error('manifest/public-key.json already exists. Move it aside before generating a new keypair.');
}

const created = new Date().toISOString();
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const exportedPublicJwk = publicKey.export({ format: 'jwk' });
const exportedPrivateJwk = privateKey.export({ format: 'jwk' });
const id = publicKeyId(exportedPublicJwk);

const publicJwk = {
  ...exportedPublicJwk,
  kid: id,
  alg: 'EdDSA',
  key_ops: ['verify'],
};

const privateJwk = {
  ...exportedPrivateJwk,
  kid: id,
  alg: 'EdDSA',
  key_ops: ['sign'],
};

const publicKeyRecord = {
  id,
  algorithm: 'Ed25519',
  created,
  jwk: publicJwk,
};

await mkdir(join(repoRoot, 'keys'), { recursive: true, mode: 0o700 });
await mkdir(join(repoRoot, 'manifest'), { recursive: true });
await writeFile(privateKeyPath, `${JSON.stringify(privateJwk, null, 2)}\n`, {
  mode: 0o600,
  flag: 'wx',
});
await writeFile(publicKeyPath, `${JSON.stringify(publicKeyRecord, null, 2)}\n`, {
  flag: 'wx',
});

console.log(`Verified ${privateKeyRelativePath} is ignored via ${ignoreCheck}.`);
console.log(`Wrote ${privateKeyRelativePath}.`);
console.log('Wrote manifest/public-key.json.');
console.log(`Public key id: ${id}`);
