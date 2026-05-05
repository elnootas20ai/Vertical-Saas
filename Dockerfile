FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/index.js ./index.js
COPY --from=build /app/config ./config
COPY --from=build /app/controllers ./controllers
COPY --from=build /app/middlewares ./middlewares
COPY --from=build /app/routes ./routes
COPY --from=build /app/services ./services
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/docs ./docs
COPY --from=build /app/src/plugin ./src/plugin
EXPOSE 3000
CMD ["node", "index.js"]
