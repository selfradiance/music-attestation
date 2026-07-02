#!/usr/bin/env node

import { createHash, createPublicKey, verify } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const publicKeyPath = join(repoRoot, 'manifest/public-key.json');
const manifestPath = join(repoRoot, 'manifest/manifest.json');

function usage() {
  console.error('Usage: node verify.mjs <path-to-audio-file>');
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

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function printFail(message, date = 'not sealed') {
  console.log(`FAIL sealed date: ${date}`);
  console.error(message);
  process.exit(1);
}

const [audioPathArg] = process.argv.slice(2);

if (!audioPathArg) {
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

const [publicKeyRecord, manifest] = await Promise.all([
  readJson(publicKeyPath),
  readJson(manifestPath),
]);

if (!publicKeyRecord?.id || !publicKeyRecord?.jwk) {
  throw new Error('manifest/public-key.json is missing the public key id or JWK.');
}

if (!Array.isArray(manifest)) {
  throw new Error('manifest/manifest.json must contain a JSON array.');
}

const digest = await sha256File(audioPath);
const sha256 = digest.toString('hex');
const candidates = manifest.filter((entry) => entry?.sha256 === sha256);

if (candidates.length === 0) {
  printFail(`No manifest entry found for SHA-256 ${sha256}.`);
}

const publicKey = createPublicKey({ key: publicKeyRecord.jwk, format: 'jwk' });
const matchingKeyEntries = candidates.filter((entry) => entry.publicKeyId === publicKeyRecord.id);

for (const entry of matchingKeyEntries) {
  const signature = Buffer.from(entry.signature, 'base64');

  if (verify(null, digest, publicKey, signature)) {
    console.log(`PASS sealed date: ${entry.date}`);
    process.exit(0);
  }
}

const firstCandidate = candidates[0];
const reason = matchingKeyEntries.length === 0
  ? `Found manifest entry for SHA-256 ${sha256}, but not for public key id ${publicKeyRecord.id}.`
  : `Signature check failed for SHA-256 ${sha256}.`;

printFail(reason, firstCandidate.date ?? 'unknown');
