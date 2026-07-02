#!/usr/bin/env node

import { createHash, createPrivateKey, sign } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const privateKeyPath = join(repoRoot, 'keys/private.jwk');
const publicKeyPath = join(repoRoot, 'manifest/public-key.json');
const manifestPath = join(repoRoot, 'manifest/manifest.json');

function usage() {
  console.error('Usage: node seal.mjs <path-to-audio-file> "<Track Title>"');
}

async function sha256File(filePath) {
  const hash = createHash('sha256');

  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolvePromise);
  });

  return hash.digest();
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) {
      return fallback;
    }

    throw error;
  }
}

async function writeJsonAtomic(path, value) {
  const tmpPath = `${path}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tmpPath, path);
}

const [audioPathArg, title] = process.argv.slice(2);

if (!audioPathArg || !title) {
  usage();
  process.exit(1);
}

const audioPath = resolve(audioPathArg);
const audioStat = await stat(audioPath).catch((error) => {
  if (error.code === 'ENOENT') {
    throw new Error(`Audio file not found: ${audioPathArg}`);
  }

  throw error;
});

if (!audioStat.isFile()) {
  throw new Error(`Audio path is not a file: ${audioPathArg}`);
}

const [privateJwk, publicKeyRecord, manifest] = await Promise.all([
  readJson(privateKeyPath),
  readJson(publicKeyPath),
  readJson(manifestPath, []),
]);

if (!Array.isArray(manifest)) {
  throw new Error('manifest/manifest.json must contain a JSON array.');
}

if (!publicKeyRecord?.id || !publicKeyRecord?.jwk) {
  throw new Error('manifest/public-key.json is missing the public key id or JWK.');
}

if (privateJwk.kid && privateJwk.kid !== publicKeyRecord.id) {
  throw new Error(`Private key id ${privateJwk.kid} does not match public key id ${publicKeyRecord.id}.`);
}

const digest = await sha256File(audioPath);
const privateKey = createPrivateKey({ key: privateJwk, format: 'jwk' });
const signature = sign(null, digest, privateKey);

const entry = {
  title,
  filename: basename(audioPath),
  sha256: digest.toString('hex'),
  signature: signature.toString('base64'),
  publicKeyId: publicKeyRecord.id,
  date: new Date().toISOString(),
};

manifest.push(entry);

await mkdir(dirname(manifestPath), { recursive: true });
await writeJsonAtomic(manifestPath, manifest);

console.log(`Sealed: ${entry.title}`);
console.log(`File: ${entry.filename}`);
console.log(`SHA-256: ${entry.sha256}`);
console.log(`Public key id: ${entry.publicKeyId}`);
console.log(`Date: ${entry.date}`);
