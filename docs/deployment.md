# Deployment

ResearchOS is designed to run locally, but you can deploy it to a server for remote access.

## Production Build

### Backend

```bash
cd backend
uv sync --no-dev
uv run uvicorn app:app --host 0.0.0.0 --port 8000
```

No build step — FastAPI serves directly. For production, add `--workers 2` (single user, no need for many) or put it behind gunicorn:

```bash
uv run gunicorn app:app -w 2 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Frontend

```bash
cd frontend
npm install
npm run build
```

This produces `frontend/dist/` — static files that any web server can serve.

## Environment Variables

The backend reads from `backend/.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Your Supabase project URL (e.g. `https://abc.supabase.co`) |
| `SUPABASE_KEY` | Yes | Supabase publishable (anon) key |
| `OPENAI_API_KEY` | No | OpenAI API key. AI features disabled without it. |

## Supabase Setup

1. Create a [Supabase](https://supabase.com) project (free tier works for personal use)
2. Go to SQL Editor and run `backend/migrations/schema.sql`
3. Go to Storage and verify the `pdfs` bucket exists (created by the migration)
4. Copy the project URL and anon key from Project Settings > API

The free tier includes 500MB database, 1GB storage, and 50,000 monthly active users (irrelevant for single-user).

## Deployment Options

### VPS (Recommended)

Run both backend and frontend on a single VPS behind a reverse proxy.

**Nginx config:**

```nginx
server {
    listen 80;
    server_name research.yourdomain.com;

    # Frontend static files
    location / {
        root /path/to/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Use systemd or supervisord to keep the backend running. Add HTTPS via Let's Encrypt.

### Docker

No official Dockerfile yet, but the setup is straightforward:

```dockerfile
# Backend
FROM python:3.11-slim
RUN pip install uv
WORKDIR /app
COPY backend/ .
RUN uv sync --no-dev
CMD ["uv", "run", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]

# Frontend
FROM node:18-alpine AS build
WORKDIR /app
COPY frontend/ .
RUN npm install && npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

### Vercel + Railway / Render

- **Frontend on Vercel:** point to `frontend/` directory, build command `npm run build`, output `dist/`. Add a rewrite rule: `/api/:path*` -> `https://your-backend.railway.app/api/:path*`
- **Backend on Railway/Render:** deploy `backend/` with start command `uv run uvicorn app:app --host 0.0.0.0 --port $PORT`. Set environment variables in the dashboard.

## Security Notes

ResearchOS has **no authentication**. It's designed for single-user local use. If you deploy it publicly:

- Put it behind HTTP Basic Auth or a VPN
- Never expose the Supabase service role key (use the anon key)
- RLS is disabled on all tables — the anon key has full access
- Consider restricting CORS origins in `backend/app.py` to your domain

## Data Backup

Your data lives in Supabase. Backup options:

- **Supabase dashboard:** Project Settings > Database > Backups (automatic daily on paid plans)
- **pg_dump:** Connect to the database directly and dump with `pg_dump`
- **API export:** Use the BibTeX export endpoint to export your library, or query the API for full data
