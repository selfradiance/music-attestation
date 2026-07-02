# Music Attestation Manifest

This repo is a public wax seal for audio files. The audio file itself is not stored here. Instead, each manifest entry records the file hash, a signature, a public key id, and the date the seal was made.

The idea is simple: if a later copy of the audio produces the same SHA-256 hash and the signature verifies with the public key, it matches the sealed bytes.

## Public Key

Current public key id: `ed25519-faa143f9c12cd8a6`

The full public key is committed at `manifest/public-key.json`:

```json
{
  "id": "ed25519-faa143f9c12cd8a6",
  "algorithm": "Ed25519",
  "created": "2026-07-02T16:59:26.197Z",
  "jwk": {
    "crv": "Ed25519",
    "x": "R6XUv8tfoG7_hfJ1Ho_WIPmu9ylIk9P0KyJ9XSGTm2s",
    "kty": "OKP",
    "kid": "ed25519-faa143f9c12cd8a6",
    "alg": "EdDSA",
    "key_ops": [
      "verify"
    ]
  }
}
```

## Manifest

The public manifest is committed at `manifest/manifest.json`. Each entry contains:

- `title`: track title supplied at seal time
- `filename`: original filename only
- `sha256`: SHA-256 hash of the audio file bytes
- `signature`: Ed25519 signature, base64 encoded
- `publicKeyId`: id of the public key used for verification
- `date`: ISO date when the entry was sealed

The static GitHub Pages page at `index.html` fetches `manifest/manifest.json` in the browser and renders it as a table.

## Verify A File

Clone the repo and run:

```sh
node verify.mjs /full/path/to/audio-file.wav
```

A matching file prints `PASS` and the sealed date. A changed file, missing manifest entry, or invalid signature prints `FAIL`.

## Seal A Track

Sealing requires the private key, which is not published. From the repo owner machine:

```sh
node seal.mjs /full/path/to/audio-file.wav "Track Title"
```

This computes the SHA-256 hash, signs that hash, and appends the manifest entry. It never modifies, copies, transcodes, or normalizes the audio file.

On macOS, the generated `Seal Track.app` and `Verify Track.app` droplets can be rebuilt with:

```sh
./make-droplets.sh
```

The compiled `.app` bundles are intentionally gitignored.

## License

MIT. See `LICENSE`.
