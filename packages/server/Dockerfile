# Server image: Go backend (REST + WebSocket + plugin/marketplace hosting).
FROM golang:1.23-bookworm AS build
WORKDIR /src
COPY packages/integrations ./packages/integrations
COPY packages/server ./packages/server
RUN cd packages/server && go mod download && go build -o /out/drawboard-server ./cmd/server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates wget \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /out/drawboard-server ./drawboard-server
COPY packages/server/marketplace ./packages/server/marketplace
ENV ADDR=:8080 \
    DATA_DIR=data \
    MARKETPLACE_DIR=packages/server/marketplace \
    WEB_DIR=""
EXPOSE 8080
VOLUME /app/data
CMD ["./drawboard-server"]
