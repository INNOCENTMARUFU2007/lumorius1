FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++ 

COPY package*.json ./
RUN npm install --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S lumorius && adduser -S lumorius -G lumorius

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

USER lumorius

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3001/api/v1/health || exit 1

CMD ["node", "dist/main"]
