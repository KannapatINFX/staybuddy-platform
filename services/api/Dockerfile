FROM node:22.22.0-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @staybuddy/api... build \
  && pnpm --filter @staybuddy/api deploy --prod /release

FROM node:22.22.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /release/ ./
USER node
EXPOSE 4000
CMD ["node", "--import", "./dist/instrumentation.js", "dist/main.js"]
