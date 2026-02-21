# --- Stage 1: Base & Dependencies ---
FROM node:20-alpine AS deps
WORKDIR /app    
RUN apk add --no-cache openssl-dev python3 make g++

COPY package.json yarn.lock ./
COPY prisma ./prisma
# Running install triggers prisma generate automatically via your postinstall script
RUN yarn install --frozen-lockfile

# --- Stage 2: Builder ---
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl-dev

COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
# Generate the client again to ensure it matches the source code
RUN npx prisma generate
# Build the TS code. Since rootDir is ./src, output will be directly in ./dist
RUN yarn build

# --- Stage 3: Production Dependencies ---
FROM node:20-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache openssl-dev

COPY package.json yarn.lock ./
COPY prisma ./prisma 
RUN yarn install --frozen-lockfile --production --ignore-optional

# --- Stage 4: Runtime Image ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache libssl3 libstdc++

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist/src ./dist
COPY --from=builder /app/dist/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/data ./data
COPY --from=builder /app/entrypoint.sh ./entrypoint.sh
COPY ./prisma.config.ts prisma.config.ts
COPY ./prisma/schema.prisma ./prisma/schema.prisma
COPY ./prisma/migrations ./prisma/migrations
RUN chmod +x ./entrypoint.sh
USER node
EXPOSE 3000

CMD ["./entrypoint.sh"]