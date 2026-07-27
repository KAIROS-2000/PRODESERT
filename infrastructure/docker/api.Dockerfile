FROM node:22-alpine AS dependencies
WORKDIR /workspace
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages ./packages
RUN for attempt in 1 2 3; do npm ci --workspace=@pro-dessert/api --include-workspace-root && exit 0; test "$attempt" = 3 && exit 1; sleep 5; done

FROM dependencies AS builder
COPY apps/api ./apps/api
COPY tsconfig.json turbo.json ./
RUN npm run build --workspace=@pro-dessert/contracts
RUN for attempt in 1 2 3; do npm run prisma:generate --workspace=@pro-dessert/api && exit 0; test "$attempt" = 3 && exit 1; sleep 5; done
RUN npm run build --workspace=@pro-dessert/api

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /workspace/node_modules ./node_modules
COPY --from=builder --chown=app:app /workspace/apps/api/dist ./dist
COPY --from=builder --chown=app:app /workspace/apps/api/prisma ./prisma
COPY --from=builder --chown=app:app /workspace/apps/api/package.json ./package.json
USER app
EXPOSE 4000
CMD ["node", "dist/main.js"]
