# Army of OpenClaw — Strategies

Named execution approaches for orders. Orders can carry an optional `strategy` field so the dispatcher and receiving node know how to execute the task. See [OPENCLAW_ARMY_OF_OPENCLAW.md](OPENCLAW_ARMY_OF_OPENCLAW.md) §4 and §4.1.

**Last updated:** February 2026

---

## Strategy list

| Strategy | Description | Addressee / routing | Payload interpretation |
|----------|-------------|--------------------|-------------------------|
| **default** | Generic task execution. Omit `strategy` or set to `"default"`. | By order addressee (gatewayId, unit, role). | Task text or JSON as-is. |
| **research** | Research task: gather, synthesize, report. Use for questions or topics. | Typically `{ "role": "research" }` or node with skill `research`. | Question or topic; optional params (e.g. depth, sources) in payload. |
| **attack** | (Placeholder) Tactical or “attack” style task. Same routing as today; behavior TBD. | By order addressee. | Task text or JSON as-is. |

---

## Usage

- **Issue order:** Set `strategy` in the order body (e.g. `strategy: "research"`). Mission Control Issue order form and `POST /army/orders` accept optional `strategy`.
- **Receiving node:** The order is delivered as a mesh memory message; the value includes `strategy`. SOUL/agent can branch on strategy (e.g. research → use research procedure, default → execute generically).
- **No protocol change:** Strategy is metadata on the order; OpenClaw gateway and agent protocol are unchanged.
