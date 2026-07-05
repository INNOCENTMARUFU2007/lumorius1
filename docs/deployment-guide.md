# Lumorius Deployment Guide

## Prerequisites

| Requirement | Version |
|---|---|
| Docker | ≥ 24.0 |
| Docker Compose | v2 |
| Domain | With DNS pointing to your server |
| SSL Certificate | Let's Encrypt or custom |

## Step-by-Step Production Deploy

### 1. Server Setup (Ubuntu 22.04+)

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt-get install docker-compose-plugin
```

### 2. Clone & Configure

```bash
git clone <your-repo> /opt/lumorius
cd /opt/lumorius
cp .env.example .env
nano .env   # Fill in all values
```

### 3. SSL with Nginx + Certbot

Replace `infra/nginx/nginx.conf` with an HTTPS-enabled config:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location /api/ {
        proxy_pass http://api:3001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://web:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

### 4. Database Migrations

```bash
# Wait for postgres to be healthy, then run:
docker compose -f infra/docker/docker-compose.yml exec -T postgres \
  psql -U lumorius -d lumorius_db < database/schema/001_create_all_tables.sql

docker compose -f infra/docker/docker-compose.yml exec -T postgres \
  psql -U lumorius -d lumorius_db < database/seeds/001_billing_plans.sql
```

### 5. Launch

```bash
docker compose -f infra/docker/docker-compose.yml up -d --build
```

### 6. Set Up Stripe Webhooks

1. Go to Stripe Dashboard → Webhooks → Add Endpoint
2. URL: `https://your-domain.com/api/v1/billing/webhook`
3. Events to listen for:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the webhook secret → add to `.env` as `STRIPE_WEBHOOK_SECRET`

## Monitoring

### View logs

```bash
# All services
docker compose -f infra/docker/docker-compose.yml logs -f

# API only
docker compose -f infra/docker/docker-compose.yml logs -f api

# Check health
curl https://your-domain.com/api/v1/health
```

### Health endpoint response

```json
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "checks": {
    "database": "ok",
    "redis": "ok"
  }
}
```

## Backup

```bash
# Backup PostgreSQL
docker compose -f infra/docker/docker-compose.yml exec postgres \
  pg_dump -U lumorius lumorius_db | gzip > lumorius_backup_$(date +%Y%m%d).sql.gz

# Restore
gunzip < lumorius_backup_YYYYMMDD.sql.gz | \
  docker compose -f infra/docker/docker-compose.yml exec -T postgres \
  psql -U lumorius lumorius_db
```

## Scaling

To scale the API horizontally:

```bash
docker compose -f infra/docker/docker-compose.yml up -d --scale api=3
```

Make sure to have a load balancer (Nginx upstream / AWS ALB) in front.
