# Web image: Vite build served by nginx, proxying API/WS to the server.
FROM node:20-bookworm AS build
WORKDIR /web
COPY packages/web/package.json ./
RUN npm install --no-audit --no-fund
COPY packages/web ./
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /web/dist /usr/share/nginx/html
COPY packages/web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
ENV SERVER_HOST=server SERVER_PORT=8080 NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/conf.d
EXPOSE 80
