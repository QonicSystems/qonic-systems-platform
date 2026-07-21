# Deploying Qonic Systems

This deploys the whole umbrella from one server and one domain:

```
qonicsystems.com             → umbrella chooser page
consulting.qonicsystems.com  → Qonic Consulting (this Next.js app)
shutterpact.qonicsystems.com → Shutterpact "in development" page
```

The consulting app is a **Next.js server app + PostgreSQL** — not a static site,
so it needs a host that runs Node and a database (a static-file host like Netlify
or GitHub Pages won't work). Everything is packaged as Docker — a single
`docker compose up` runs the router (Caddy), the app, and the database together —
so any Linux box or container platform can host it.

---

## Which server — cheap and best

Two realistic routes. Pick by how much Linux you want to touch.

### Recommended: a small VPS + Docker

| Provider | Plan | RAM | ~Price | Notes |
|---|---|---|---|---|
| **Hetzner Cloud** | **CX22** | 4 GB | **~€4.5 / $5 mo** | **Best value.** EU/US regions. This is the pick. |
| DigitalOcean / Vultr / Linode | Basic | 2–4 GB | $6–12 mo | More polished dashboards, US-friendly. |
| Contabo | VPS S | 8 GB | ~$6 mo | Cheapest RAM, but less reliable — fine for internal use. |

**Why 4 GB:** Next.js plus the Postgres container plus argon2 password hashing
(~19 MB per login) is tight on 2 GB and comfortable on 4. Hetzner's CX22 hits the
sweet spot. The 2 GB CX11 works if money is very tight.

### Alternative: zero-ops PaaS

If you'd rather not manage a Linux box: **Railway** or **Render**. Push the repo,
they build the Docker image and give you a managed Postgres. Expect ~$5/mo app +
~$6/mo database. Slightly pricier than the VPS, but no server to patch and HTTPS
is automatic. Set the same environment variables from `.env.example` in their
dashboard, and point `DATABASE_URL` at their managed database.

> Not Vercel for the whole thing: it hosts the Next.js part beautifully, but you
> still need a separate Postgres, and its serverless model fights the always-on
> database sessions this app relies on. The VPS/PaaS route is simpler here.

---

## Deploy on a VPS (Hetzner) with Docker

### 1. Create the server
Create a **CX22** running **Ubuntu 24.04**. Add your SSH key. Note the IP.

### 2. Install Docker
```bash
ssh root@YOUR_SERVER_IP
curl -fsSL https://get.docker.com | sh
```

### 3. Get the code onto the server
```bash
git clone YOUR_REPO_URL qonic && cd qonic
# (or copy the folder up with rsync/scp if it isn't in a git remote)
```

### 4. Configure secrets
```bash
cp .env.example .env
nano .env
```
Fill in — these are the only ones that matter for the app to run:

- `BOOTSTRAP_CEO_EMAIL`, `BOOTSTRAP_CEO_NAME`, `BOOTSTRAP_CEO_PASSWORD`
  (≥12 chars; you change it at first login)
- `ENCRYPTION_KEY` — generate one:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `SMTP_*` and `CONTACT_*` — only needed for the contact form and password-reset
  emails. Leave as-is if you don't need email yet.

`DATABASE_URL` in `.env` is ignored in Docker — compose points the app at its own
`db` container. But **set a real database password** for that container:
```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" >> .env
```
(`docker/docker-compose.yml` reads `POSTGRES_PASSWORD` for both the database and the
app's connection string.)

### 5. Point DNS at the server *before* starting
The stack includes Caddy, which fetches HTTPS certificates automatically — but it
can only do that once these DNS **A records** all point at your server's IP:

| Record | Points to | Serves |
|---|---|---|
| `qonicsystems.com` | server IP | The umbrella chooser page |
| `www.qonicsystems.com` | server IP | (same) |
| `consulting.qonicsystems.com` | server IP | Qonic Consulting (this app) |
| `shutterpact.qonicsystems.com` | server IP | Shutterpact "in development" page |

If your domain isn't `qonicsystems.com`, do a find-and-replace across three files:
`deploy/Caddyfile` (the hostnames) and the links inside
`deploy/sites/landing/index.html` and `deploy/sites/shutterpact/index.html`.

### 6. Start everything
The compose files live in `docker/`. So you don't repeat the path, set it once
per shell — **run everything from the repo root**:
```bash
export COMPOSE_FILE=docker/docker-compose.yml
docker compose --env-file .env up -d --build
```
(`--env-file .env` makes `${POSTGRES_PASSWORD}` resolve from your repo-root `.env`;
`COMPOSE_FILE` saves adding `-f docker/docker-compose.yml` to every command below.)

This brings up three containers: **caddy** (HTTPS + routing), **app** (Qonic
Consulting), and **db** (Postgres). On first boot the app runs migrations, seeds
roles and permissions, and creates the bootstrap CEO. Watch it:
```bash
docker compose logs -f app     # app startup + migrations
docker compose logs -f caddy   # certificate issuance
```
Once certificates are issued (a few seconds), visit **https://qonicsystems.com** —
you'll get the chooser. **https://consulting.qonicsystems.com** is the app: sign
in as the bootstrap CEO and change the password immediately.
`shutterpact.qonicsystems.com` shows the "still developing" placeholder until that
vertical is ready.

> **How routing works:** everything comes in on ports 80/443 to Caddy, which
> forwards each hostname to the right place (see `deploy/Caddyfile`). The app and
> database have no public ports of their own — the app is bound to `localhost:3000`
> on the server only, for debugging (`curl localhost:3000`).

### The umbrella pages
The chooser and the Shutterpact placeholder are plain static files in
`deploy/sites/` — edit the copy or styling there and `docker compose restart caddy`
to publish. When Shutterpact's web app is ready, change its block in
`deploy/Caddyfile` from serving the static page to `reverse_proxy` (pointed at its
container), exactly like the consulting block.

---

## Everyday operations

With `COMPOSE_FILE=docker/docker-compose.yml` exported (from step 6), and run from
the repo root:

```bash
docker compose logs -f app                       # tail logs
docker compose --env-file .env up -d --build     # deploy a new version (re-runs migrations)
docker compose down                              # stop (database volume is kept)

# Reset a locked-out password from the server:
docker compose exec app npx tsx prisma/set-password.ts founder@qonicsystems.com
```

> Not exported `COMPOSE_FILE`? Add `-f docker/docker-compose.yml` to each command.

### Back up the database
The whole business lives in Postgres (documents are generated on the fly, nothing
else is stored). Back it up regularly:
```bash
docker compose exec db pg_dump -U qonic qonic > backup-$(date +%F).sql
```

---

## Notes

- **Updates re-run migrations safely.** `docker compose up -d --build` applies any
  new migrations on boot; a no-op when there's nothing pending.
- **The `db` container is not exposed to the internet** — only the app reaches it.
- **`.env` is never baked into the image** (it's in `.dockerignore`); secrets are
  injected at run time by compose.
