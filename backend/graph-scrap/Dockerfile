FROM mcr.microsoft.com/playwright:v1.64.1-noble AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY backend/graph-scrap/package.json backend/graph-scrap/package.json
COPY backend/mail-api/package.json backend/mail-api/package.json
COPY database/package.json database/package.json
RUN npm ci --ignore-scripts --workspace @mail-dispatcher/graph-scrap --include-workspace-root
COPY backend/graph-scrap backend/graph-scrap
RUN npm run build -w @mail-dispatcher/graph-scrap

FROM build AS verify
USER pwuser
ENV GRAPH_SCRAP_BROWSER_TESTS=1
CMD ["npm", "run", "test", "-w", "@mail-dispatcher/graph-scrap"]

FROM build AS runtime
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund --workspace @mail-dispatcher/graph-scrap --include-workspace-root
USER pwuser
ENV HOST=0.0.0.0 PORT=3101
EXPOSE 3101
CMD ["node", "backend/graph-scrap/dist/main.js"]
