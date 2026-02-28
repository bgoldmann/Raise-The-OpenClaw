# Mesh message signing and verification

Optional **signing** of mesh memory and skill messages for integrity and origin verification (e.g. untrusted or multi-tenant bridge, federation). See [ENTERPRISE_EXPAND.md](ENTERPRISE_EXPAND.md) §5.

---

## 1. Payload format

- Each mesh message (memory or skill) may include a **`sig`** field (base64-encoded Ed25519 signature).
- **Canonical form** (what is signed): deterministic JSON with sorted keys, **excluding** `sig` and `signature`.
  - Memory: `type`, `scope`, `key`, `value`, `nodeId`, `ts` (and any other fields present).
  - Skill: `type`, `name`, `sourceNode`, `content`, `ts` (and any other fields present).
- **Signing:** `sig = base64(Ed25519_sign(canonicalMessage(msg), privateKey))`.
- **Verification:** `Ed25519_verify(canonicalMessage(msg), publicKey, base64decode(sig))`.

Implementation: [mesh/signing.js](../mesh/signing.js) — `signMessage(msg, privateKey)`, `verifyMessage(msg, publicKey)`.

---

## 2. Key distribution

- **Out-of-band:** Share public keys (PEM or path) with recipients; keep private keys on the sending node or hub.
- **Per-mesh (federation):** Each external mesh has a `publicKey` (PEM string or path) in hub config for verifying their inbound messages; the hub has its own key pair for signing outbound.
- **Registry:** Optional small service or config file that maps `nodeId` or `meshId` to public key PEM; not implemented in this repo.

---

## 3. Where to use

| Component | Sign | Verify |
|-----------|------|--------|
| **Bridge adapter** | When your app sends a mesh message over the bridge, call `signing.signMessage(msg, privateKey)` before posting. | When verification is required, call `signing.verifyMessage(msg, publicKey)` before ingest; reject if false. |
| **Federation hub** | Optional: sign outbound messages (config `signOutbound`, `privateKeyPath` or `privateKeyEnv`). | Optional: verify inbound per mesh (config `verifyInbound`, `externalMeshes[].publicKey`); reject if invalid. |

---

## 4. Key generation

```bash
# Ed25519 key pair (Node.js)
node -e "
const crypto = require('crypto');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
console.log('Private key (keep secret):'); console.log(privateKey);
console.log('Public key:'); console.log(publicKey);
"
```

Store the private key in a file or env var (e.g. `FEDERATION_HUB_PRIVATE_KEY`); distribute the public key to peers.
