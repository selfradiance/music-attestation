# Project Notes

- Use Node.js standard library only unless the user explicitly approves a dependency.
- Never modify, move, copy, transcode, or normalize source audio files.
- Keep private key material under `keys/`, which must remain gitignored.
- Keep public verification material under `manifest/` so a fresh clone can verify sealed tracks.
- Prefer simple, static files for GitHub Pages; no framework or build step.
