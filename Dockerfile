# One image for the web app and the background worker.
# The Playwright base image includes headless Chromium (for print PDFs) and Node.
# Its version must match the "playwright" package version in package.json.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Dependencies first (cached between deploys unless package files change).
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# App source, then the production (Postgres) Prisma client and the Next.js build.
COPY . .
RUN npm run build:production

ENV NODE_ENV=production
# Render sets PORT; Next.js listens on it.
EXPOSE 10000
# Web service default. The worker service overrides this with: npm run worker
CMD ["npm", "run", "start"]
