# Deployment — Raise The OpenClaw

How to run Mission Control (with optional proxy), the bridge webhook, and optional mesh store in Docker or on a single host.

---

## 1. Docker Compose

Example stack: Mission Control proxy (dashboard + WebSocket proxy), bridge webhook, and optional mesh store API. Gateways and tokens are in env or mounted config.

Create a directory and add the following. Replace placeholders with your values.

**docker-compose.yml** (context: repo root)

```yaml
version: '3.8'
services:
  mission-control:
    build:
      context: .
      dockerfile: Dockerfile.mc
    ports:
      - "3080:3080"
    environment:
      PORT: "3080"
      OPENCLAW_MC_GATEWAYS: '[{"id":"ceo","name":"CEO","wsUrl":"ws://host.docker.internal:18789","token":"${CEO_TOKEN}"},{"id":"sec","name":"Sec","wsUrl":"ws://192.168.1.60:18789","token":"${SEC_TOKEN}"}]'
    restart: unless-stopped

  bridge:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - ./bridge:/app
      - openclaw-cache:/root/.openclaw
    command: node webhook-server.js 4077
    ports:
      - "4077:4077"
    environment:
      PORT: "4077"
      OPENCLAW_HOME: "/root/.openclaw"
      BRIDGE_AUTH_BEARER: "${BRIDGE_AUTH_BEARER}"
    restart: unless-stopped

volumes:
  openclaw-cache:
```

**Dockerfile.mc** is at the repo root; see [Dockerfile.mc](Dockerfile.mc). It copies the proxy and mission-control static files and sets `MISSION_CONTROL_DIR`.

Run:

```bash
export CEO_TOKEN=your-ceo-gateway-token
export SEC_TOKEN=your-sec-gateway-token
export BRIDGE_AUTH_BEARER=your-bridge-secret
docker compose up -d
```

- Dashboard: http://localhost:3080/
- Bridge webhook: http://localhost:4077/ (POST /ingest, POST /bridge; send `Authorization: Bearer your-bridge-secret`).

Adjust `OPENCLAW_MC_GATEWAYS` and `wsUrl` so the proxy can reach your gateways (e.g. `host.docker.internal` for a gateway on the host, or LAN IP for NAS).

---

## 2. Kubernetes

Run the same services as deployments and expose with Services (and optional Ingress).

- **Mission Control:** Deployment with env from Secret for `OPENCLAW_MC_GATEWAYS` (or ConfigMap + Secret for tokens). Service type ClusterIP or LoadBalancer; Ingress with TLS for HTTPS.
- **Bridge:** Deployment mounting the bridge code (or a custom image), env from Secret for `BRIDGE_AUTH_BEARER` and `OPENCLAW_HOME` (or use a PVC for cache). Service to expose port 4077.

Example minimal Deployment (bridge):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: openclaw-bridge
spec:
  replicas: 1
  selector:
    matchLabels:
      app: openclaw-bridge
  template:
    metadata:
      labels:
        app: openclaw-bridge
    spec:
      containers:
        - name: bridge
          image: node:20-alpine
          command: ["node", "webhook-server.js", "4077"]
          workingDir: /app
          volumeMounts:
            - name: bridge-code
              mountPath: /app
            - name: cache
              mountPath: /root/.openclaw
          env:
            - name: PORT
              value: "4077"
            - name: OPENCLAW_HOME
              value: "/root/.openclaw"
            - name: BRIDGE_AUTH_BEARER
              valueFrom:
                secretKeyRef:
                  name: bridge-secret
                  key: bearer
          ports:
            - containerPort: 4077
      volumes:
        - name: bridge-code
          configMap:
            name: bridge-code
        - name: cache
          emptyDir: {}
```

Use a ConfigMap for the bridge JS files or build a custom image that copies the bridge directory.

---

## 3. Single-host (no Docker)

- **Mission Control:** `cd mission-control && npx serve .` (direct) or `cd mission-control/proxy && npm i && node server.js` (proxy on 3080).
- **Bridge:** `node bridge/webhook-server.js 4077`. Optionally put behind nginx/Caddy with TLS.

See [GETTING_STARTED.md](GETTING_STARTED.md) and [ENTERPRISE_SECURITY.md](ENTERPRISE_SECURITY.md).
