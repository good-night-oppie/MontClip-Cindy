# Media gateway (0.2.2 offline plugin source)

Work for [#106](https://github.com/good-night-oppie/MontClip-Cindy/issues/106). This folder holds the full offline plugin source corresponding byte-for-byte to development package `art-media-gateway-dev-0.2.2.cindy` (SHA-256 `03f1fe710efc3f14d2b8e4244c302aee8efc17cbec5e799c98517cfcb84eaf24`, not installed or published; `.cindy` archive itself is not committed).

Security boundaries, credential isolation, CLI verification, download rules and open gaps are documented in [ADR-006](../docs/decisions/ADR-006-media-gateway-security-and-provider-boundaries.md).

## What is here

| File / Folder | What it does |
|---|---|
| `main.js`, `ghost.json` | Plugin entry and manifest derived from official `cindy-art` `1.15.7`, keeping the 4 legacy Art tools intact and forwarding Dreamina / Flow / CapCut calls to `worker.cjs`. |
| `gateway-core.cjs` | Job ledger shared by the three providers: quote before submit, confirmation bound to one quote, budget cap, one submit per request id, "pending reconcile" when a reply is lost, checked download that never overwrites. Makes no network call and starts no process. |
| `capcut-draft.cjs` | Writes an editable CapCut desktop draft folder from local media into the gateway staging folder (`~/.cindy-media-gateway-dev/capcut-drafts/`). No network, no account. |
| `worker.cjs` | Node worker. Dreamina reads go through the pinned official CLI (checked by SHA-256 before every run). Flow and CapCut generation return a fixed local code (`OFFICIAL_AGENT_INTERFACE_UNVERIFIED`). Paid submission is compiled out (`SPENDING_ENABLED = false`). |
| `settings.html`, `settings.js`, `settings-icons.js`, `SETTINGS-SOURCE.md`, `locales/`, `assets/icon.png`, `LICENSE`, `NOTICE`, `THIRD-PARTY-LICENSES.txt`, `TRADEMARKS*.md` | Unmodified Art `1.15.7` settings UI, locales, icon and licence/trademark files from development package `0.2.2`. |
| `test-gateway-offline.cjs` | 15 offline checks for the ledger, fake-credential redaction scan, and CapCut draft writer with stand-in providers and synthetic files. |
| `test-art-gateway.cjs` | End-to-end offline check of `main.js` + `ghost.json` + `worker.cjs` against an official `cindy-art` `1.15.7` baseline (plus optional real CLI check when the vendor binary is supplied). |

## What is not here

- The `.cindy` package archive itself (kept out of Git per repository policy).
- The Dreamina CLI binary. `worker.cjs` pins `dreamina-canvas.exe` `1.4.0` (`68e27033`) with expected SHA-256 `1f764bc64fc7d43d451547b664cd0f6ebd4b1e74013a98fdee8a4acb0ba15876`, which is **not present on this machine** and still awaits independent second-party hash verification.

## Run the tests

```
node media-gateway/test-gateway-offline.cjs media-gateway
```

Expected: 15 lines starting with `PASS`, no `FAIL`. Needs Node 22.

With a local official `cindy-art` `1.15.7` directory `<art-1.15.7-dir>`:

```
node media-gateway/test-art-gateway.cjs media-gateway "<art-1.15.7-dir>"
```

Expected: 1 `PASS:` summary line, exit code `0` (optional 3rd argument for verified `dreamina-canvas.exe` omitted when the binary is absent).

## Not verified

- No real generation has run for any provider. No account was connected and nothing was charged (G1–G4 open).
- The ledger is only tested against stand-in providers. Dreamina submit and download are not wired to it, and the Dreamina CLI `1.4.0` SHA-256 awaits independent second-party verification.
- CapCut desktop sandbox installation is deferred per owner direction (mobile-first). The CapCut draft has not been opened in CapCut desktop or mobile. On CapCut mobile `20.1.0` (Android emulator, signed out) only the normal gallery route was tested: a synthetic video placed in the gallery opens in a new project, plays, saves and reopens.
- Flow and CapCut generation have no verified official third-party route (FL0 / CG0 blocked).
- The package has not been installed in Cindy (G5 / G6 not verified), and the settings page has no owner budget input yet.
