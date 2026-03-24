FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist/estacao-meteorologica ./dist/estacao-meteorologica
ENV PORT=4000
EXPOSE 4000
CMD ["node", "dist/estacao-meteorologica/server/server.mjs"]
