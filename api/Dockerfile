# Multi-stage build - API (NestJS + Prisma)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

EXPOSE 3000
# Migracije se puste PRIJE starta u produkciji (npx prisma migrate deploy),
# namjerno ne u CMD-u da restart kontejnera ne pokusava migraciju svaki put.
CMD ["node", "dist/main.js"]
