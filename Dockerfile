# Drawboard: all-in-one image — builds the Go backend and the Vite/React
# frontend, then serves both from a single binary process.
FROM golang:1.23-bookworm AS gobuild
WORKDIR /src
COPY packages/integrations ./packages/integrations
COPY packages/server ./packages/server
RUN cd packages/server && go mod download && go build -o /out/drawboard ./cmd/server

FROM node:20-bookworm AS webbuild
WORKDIR /web
COPY packages/web/package.json packages/web/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY packages/web ./
RUN npm run build

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=gobuild /out/drawboard ./drawboard
COPY --from=webbuild /web/dist ./packages/web/dist
COPY packages/server/marketplace ./packages/server/marketplace
ENV ADDR=:8080 WEB_DIR=packages/web/dist DATA_DIR=data MARKETPLACE_DIR=packages/server/marketplace
EXPOSE 8080
VOLUME /app/data
CMD ["./drawboard"]
