# Mesh Request/Response Over Bridge (FR-1.4)

Optional convention for **requesting** a memory key or skill by name over the existing bridge, and **responding** with the value. No central server; discovery is best-effort via the bridge.

## Message types

### Request

| Field   | Type   | Required | Description |
|---------|--------|----------|-------------|
| `type`  | string | yes      | `mesh_request` |
| `requestId` | string | yes  | Unique id for matching response |
| `kind`  | string | yes      | `memory` or `skill` |
| `scope` | string | no       | For memory: `node` \| `mesh` \| `user:<id>` |
| `key`   | string | no       | For memory: key to request |
| `name`  | string | no       | For skill: skill name to request |
| `nodeId`| string | yes      | Requester node id |
| `ts`    | number | no       | Unix timestamp |

- For **memory**: include `scope` and `key`.
- For **skill**: include `name`.

### Response

| Field   | Type   | Required | Description |
|---------|--------|----------|-------------|
| `type`  | string | yes      | `mesh_response` |
| `requestId` | string | yes  | Same as request |
| `kind`  | string | yes      | `memory` or `skill` |
| `nodeId`| string | yes      | Responder node id |
| `found` | boolean| yes      | Whether the node had the value |
| `value` | any    | no       | For memory: the value (if found) |
| `content` | string | no     | For skill: content or URL (if found) |
| `ts`    | number | no       | Unix timestamp |

- If `found` is false, `value`/`content` may be omitted.
- Receivers should match `requestId` to the original request and then ingest or use the response (e.g. write to local cache).

## Flow

1. Node A sends a `mesh_request` on the bridge (e.g. “request memory mesh:user.preferences” or “request skill triage”).
2. Any node (e.g. Node B) that has the requested memory/skill may reply with `mesh_response` on the bridge.
3. Node A (and others) can ingest the response into their local cache if desired.

## Example (JSON)

**Request (memory):**

```json
{
  "type": "mesh_request",
  "requestId": "req-abc-1",
  "kind": "memory",
  "scope": "mesh",
  "key": "user.preferences",
  "nodeId": "ceo",
  "ts": 1739123456
}
```

**Response:**

```json
{
  "type": "mesh_response",
  "requestId": "req-abc-1",
  "kind": "memory",
  "nodeId": "sec",
  "found": true,
  "value": { "shortAnswers": true, "useMetric": true },
  "ts": 1739123457
}
```

**Request (skill):**

```json
{
  "type": "mesh_request",
  "requestId": "req-xyz-2",
  "kind": "skill",
  "name": "triage",
  "nodeId": "sec",
  "ts": 1739123460
}
```

Implementations may wrap these in a bridge-specific envelope (e.g. Telegram/Discord message text or webhook body). Parsers should look for these fields inside the payload or in a known `mesh` sub-field.
