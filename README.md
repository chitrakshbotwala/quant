# KRONOSPHERE

Browser-based algorithmic trading simulation for KIIT Quant Championship.

## Quick Start

1. Copy env values:
   - Use `.env.example` and set Firebase + JWT values.
2. Fetch market CSVs (optional local):

```bash
cd backend
npm run fetch:data
```

3. Run stack locally:

```bash
docker compose up --build
```

Frontend: http://localhost:8080
Backend health: http://localhost:4000/health

## Server Deployment (Docker)

1. Prepare env file at repository root:
- `cp .env.example .env`
- Fill required secrets (`JWT_SECRET`, Firebase envs, Redis/Upstash envs as needed).

2. Build and run in background:

```bash
docker compose up -d --build
```

3. Check status and logs:

```bash
docker compose ps
docker compose logs -f express-backend
docker compose logs -f react-frontend
```

4. Update deployment:

```bash
docker compose pull
docker compose up -d --build
```

5. Stop stack:

```bash
docker compose down
```

Notes:
- Backend persists SQLite data in Docker volume `backend_data` mounted at `/app/prisma`.
- Frontend is served by Nginx and proxies `/api` and `/ws` to backend.
- Optional seeding on backend startup is controlled by `RUN_SEED_ON_STARTUP` (default `false` in compose).

## Services

- `express-backend` (Node 20 + TS + Prisma + ws)
- `react-frontend` (React 18 + TS + Tailwind + Nginx)

## Notes

- Round state uses Redis keys (`round:{id}:active`, `round:{id}:currentIndex`, `round:{id}:speed`).
- Tick fan-out uses Redis pub/sub channels (`round:{id}:ticks`).
- Auth flow: Firebase ID token -> domain check -> allowlist check -> app JWT.
- Backend enforces server-side parameter validation and round rules.
