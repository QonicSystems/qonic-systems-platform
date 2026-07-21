# QONIC

The platform behind **Qonic Systems** and its ventures. One codebase, one domain:

```
qonicsystems.com             → Qonic Systems — the umbrella site (static)
consulting.qonicsystems.com  → Qonic Consulting — the internal operating platform (this app)
shutterpact.qonicsystems.com → Shutterpact — in development
```

**Qonic Consulting** is a full internal operating system for a freelance
consulting & recruitment firm: role-based login, an admin-controlled permission
matrix, contract letters, HR & leave, clients/projects/timesheets, an ATS,
invoicing & expenses, reporting, and 2FA/GDPR compliance. Built with **Next.js 16,
React 19, TypeScript, Tailwind, Prisma 7 + PostgreSQL**.

## Documentation

| Doc | What it's for |
|---|---|
| [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) | **Start here.** Step-by-step operator's guide — run the whole business end to end. Credentials at the top. |
| [docs/FEATURE.md](docs/FEATURE.md) | Every feature as a Given/When/Then test you can check by hand. |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Hosting recommendation and Docker deployment (app + database + router). |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Architecture decisions and the phased build. |

## Quick start (local dev)

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL, BOOTSTRAP_CEO_*, ENCRYPTION_KEY
npm run db:setup              # migrate + seed roles, permissions, bootstrap CEO
npm run db:seed:demo          # optional: one demo account per role (dev only)
npm run db:seed:holidays      # public holidays, so leave counting is correct
npm run dev                   # http://localhost:3000  → sign in at /login
```

## Run the full stack in Docker

Mirrors production — the app, PostgreSQL, and the Caddy router with all three
sites, one command:

```bash
docker compose -f docker/docker-compose.local.yml up -d --build
# → http://consulting.qonicsystems.localhost   (the app)
# → http://qonicsystems.localhost              (the umbrella site)
```

See [docs/DEPLOY.md](docs/DEPLOY.md) for production hosting.

## Checks

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm test              # unit + component (vitest)
npm run test:e2e      # end-to-end (playwright) — needs: npm run db:setup:test
```
