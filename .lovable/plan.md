# Deliver NovaChat source as a ZIP

## What
Package the complete NovaChat project source into a single ZIP file and deliver it as a downloadable file.

## Included
- `src/` — all app code (routes, components, lib functions, integrations)
- `public/` — static assets (logo, favicon, robots.txt, llms.txt)
- `supabase/config.toml` — backend configuration
- Root config files: `package.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `prettier` files, `components.json`, `bunfig.toml`

## Excluded
- `node_modules/` and any build output (not source; restored with `bun install`)
- `.env` — contains private keys, must never be shared
- `.git/` metadata and `.lovable/` internal tooling files
- `dist/`, `.nitro/`, generated output

## Steps
1. Stage the source into a clean folder under `/tmp`, excluding the items above.
2. Verify the file listing (including hidden files) contains no secrets or generated junk.
3. Create `NovaChat-source.zip` in `/tmp`, inspect its entries, then copy it to Files.
4. Present the ZIP as a downloadable attachment in chat.

## Notes for the user
- After unzipping, running `bun install` (or `npm install`) restores dependencies.
- The app will need its environment keys configured wherever it is deployed; those are not included in the ZIP for security.
