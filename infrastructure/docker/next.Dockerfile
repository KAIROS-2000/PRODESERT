FROM node:22-alpine AS dependencies
ARG APP_NAME
WORKDIR /workspace
COPY package.json package-lock.json* ./
COPY apps/${APP_NAME}/package.json apps/${APP_NAME}/package.json
COPY packages ./packages
RUN npm install --workspace=@pro-dessert/${APP_NAME} --include-workspace-root

FROM dependencies AS builder
ARG APP_NAME
ENV NEXT_TELEMETRY_DISABLED=1
COPY apps/${APP_NAME} apps/${APP_NAME}
COPY tsconfig.json turbo.json ./
RUN npm run build --workspace=@pro-dessert/${APP_NAME}

FROM node:22-alpine AS runner
ARG APP_NAME
ENV APP_NAME=${APP_NAME}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
COPY --from=builder --chown=nextjs:nextjs /workspace/apps/${APP_NAME}/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /workspace/apps/${APP_NAME}/.next/static ./apps/${APP_NAME}/.next/static
COPY --from=builder --chown=nextjs:nextjs /workspace/apps/${APP_NAME}/public ./apps/${APP_NAME}/public
USER nextjs
EXPOSE 3000
CMD ["sh", "-c", "node apps/${APP_NAME}/server.js"]
