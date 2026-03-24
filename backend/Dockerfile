FROM node:20-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

FROM node:20-bookworm-slim AS build
WORKDIR /app

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY src ./src
COPY nasdaq_ohlcv.csv ./nasdaq_ohlcv.csv
COPY aapl_ohlcv.csv ./aapl_ohlcv.csv

RUN npx prisma generate
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=4000
ENV RUN_SEED_ON_STARTUP=false

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/nasdaq_ohlcv.csv ./nasdaq_ohlcv.csv
COPY --from=build /app/aapl_ohlcv.csv ./aapl_ohlcv.csv

EXPOSE 4000
CMD ["sh", "-c", "npx prisma db push && if [ \"$RUN_SEED_ON_STARTUP\" = \"true\" ]; then npm run seed || true; fi && node dist/src/index.js"]
