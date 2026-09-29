# Stage 1: build the React client into client/dist
FROM node:24-slim AS build
WORKDIR /app

# Copy only the dependency manifests first, so this layer stays cached until
# dependencies change (like copying requirements.txt before the code).
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci

COPY client/ client/
RUN npm run build

# Stage 2: slim runtime image with only the server and the built client
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app

# Server production dependencies only: no React, Vite, or other build tools.
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev --workspace server && npm cache clean --force

# Same folder layout as the repo: server/src/index.js serves ../../client/dist
COPY server/ server/
COPY --from=build /app/client/dist client/dist

# Demo scripts and simulators, so make doctor/bootstrap/simulate work without Node on the host
COPY scripts/ scripts/
COPY simulator/ simulator/

# The official Node image ships an unprivileged "node" user
USER node
EXPOSE 3000

# Run node directly (exec form, not `npm start`) so it receives SIGTERM from
# `docker stop`. docker-compose adds `init: true` for proper signal handling.
CMD ["node", "server/src/index.js"]
