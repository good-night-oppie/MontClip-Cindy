# Media gateway (offline core)

Work for #106. This folder holds the part of the gateway plugin that was written for it. It is not a complete plugin yet.

## What is here

| File | What it does |
|---|---|
| `gateway-core.cjs` | Job ledger shared by the three providers: quote before submit, confirmation bound to one quote, budget cap, one submit per request id, "pending reconcile" when a reply is lost, checked download that never overwrites. Makes no network call and starts no process. |
| `capcut-draft.cjs` | Writes an editable CapCut desktop draft folder from local media into the gateway staging folder. No network, no account. |
| `worker.cjs` | Node worker. Dreamina reads go through the pinned official CLI (checked by SHA-256 before every run). Flow and CapCut generation return a fixed local code. Paid submission is compiled out (`SPENDING_ENABLED = false`). |
| `test-gateway-offline.cjs` | 15 offline checks with stand-in providers and synthetic files. |

## What is not here

- The plugin entry (`main.js`), `ghost.json`, settings page, locales, icon and licence files. They come from the official Art plugin 1.15.7; only `main.js` and `ghost.json` were changed. They are in development package 0.2.2 (SHA-256 `03f1fe710efc3f14d2b8e4244c302aee8efc17cbec5e799c98517cfcb84eaf24`), which has not been installed or published.
- The Dreamina CLI binary. `worker.cjs` only runs `dreamina-canvas.exe` 1.4.0 with SHA-256 `1f764bc64fc7d43d451547b664cd0f6ebd4b1e74013a98fdee8a4acb0ba15876`.

## Run the tests

```
node media-gateway/test-gateway-offline.cjs media-gateway
```

Expected: 15 lines starting with `PASS`, no `FAIL`. Needs Node 22.

## Not verified

- No real generation has run for any provider. No account was connected and nothing was charged.
- The ledger is only tested against stand-in providers. Dreamina submit and download are not wired to it.
- The CapCut draft has not been opened in CapCut desktop. On CapCut mobile 20.1.0 (Android emulator) only the normal route was tested: a video placed in the gallery opens in a new project, plays, saves and reopens. Opening a prepared draft on mobile was not tested.
- Flow has no verified official route. The only known one drives a signed-in browser through a third-party CLI and is not approved.
- The budget can only be set from code; the settings page has no field for it.
