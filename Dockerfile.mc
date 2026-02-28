# Mission Control proxy — build from repo root: docker build -f Dockerfile.mc -t mission-control .
FROM node:20-alpine
WORKDIR /app
COPY mission-control/proxy/package*.json ./
RUN npm ci --omit=dev
COPY mission-control/proxy/server.js ./
COPY mission-control ./mission-control
ENV PORT=3080
ENV MISSION_CONTROL_DIR=/app/mission-control
EXPOSE 3080
CMD ["node", "server.js"]
