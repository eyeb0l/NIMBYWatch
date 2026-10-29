# Private hosting on squiggle

NIMBYWatch runs as the `iris` user service `nimbywatch.service` on squiggle. Open [NIMBYWatch over Tailscale](https://squiggle.spaniel-delta.ts.net:4300) from a device connected to the tailnet.

The production Next.js server listens only on `127.0.0.1:4300`. Tailscale Serve provides HTTPS on port 4300 and forwards to that loopback listener. This is private tailnet access; Tailscale Funnel is not enabled. Existing Serve routes for other applications remain separate.

## Service and data

The installed unit is `/home/iris/.config/systemd/user/nimbywatch.service`; its repository copy is [`ops/nimbywatch.service`](../ops/nimbywatch.service). It uses `/home/iris/NIMBYWatch` as the working directory and starts the existing production build with the absolute Node executable `/home/iris/.local/bin/node`. It is enabled at user-manager startup and restarts after failure. User lingering is enabled on squiggle, so the service remains available without an interactive login.

Next.js loads the server credentials from the ignored `/home/iris/NIMBYWatch/.env.local`. Do not print or commit that file. Local data is persisted in `.data/postgres` unless database configuration overrides it. The current local store is single-process PGlite: do not run a second app server or ingestion CLI against that directory while the service is running. Isolated tests must use their own `PGLITE_DATA_DIR`.

Run these commands as `iris`:

```sh
systemctl --user status nimbywatch.service --no-pager
journalctl --user -u nimbywatch.service -n 50 --no-pager
systemctl --user restart nimbywatch.service
systemctl --user stop nimbywatch.service
systemctl --user start nimbywatch.service
```

The repository unit can be installed or updated with:

```sh
install -m 644 /home/iris/NIMBYWatch/ops/nimbywatch.service /home/iris/.config/systemd/user/nimbywatch.service
systemctl --user daemon-reload
systemctl --user enable --now nimbywatch.service
```

If the unit changed while the service was running, restart it after `daemon-reload`.

## Update or refresh data

Stop this service before changing its build or opening the same PGlite database from a CLI. From `/home/iris/NIMBYWatch`:

```sh
systemctl --user stop nimbywatch.service
npm ci
npm run ingest
npm run build
systemctl --user start nimbywatch.service
```

Only restart after the install, ingestion and build complete successfully. `npm run ingest` is optional when the existing records are sufficient. Back up the `.data/postgres` directory while the service is stopped before performing destructive database work.

## Tailscale route

The task installed the route with:

```sh
sudo -n tailscale serve --bg --https=4300 http://127.0.0.1:4300
```

Inspect it with `tailscale serve status`. If local permissions require it, use `sudo -n tailscale serve status`.

To remove only NIMBYWatch's HTTPS listener:

```sh
sudo -n tailscale serve --https=4300 off
```

Do not reset the whole Serve configuration; this host serves other applications. The application service and Tailscale route are independent: stopping the service leaves the route configured until the application starts again.

## Verify the private URL

Check local and HTTPS readiness:

```sh
curl --fail --silent --output /dev/null http://127.0.0.1:4300/
curl --fail --silent --output /dev/null https://squiggle.spaniel-delta.ts.net:4300/
```

Then exercise the live read-only flows in the existing headless Chromium setup:

```sh
E2E_BASE_URL=https://squiggle.spaniel-delta.ts.net:4300 E2E_ARTIFACT_DIR=artifacts/verification/tailscale npm run test:e2e -- --grep 'real applications|analytics discloses'
```

This runs four desktop/mobile cases against the existing service without starting or stopping it. It exercises the real map, search, filters, detail links, analytics and methodology. Screenshots and browser-health logs are saved in the specified ignored artifact directory. These selected tests do not submit analysis or publish results. See [TESTING.md](TESTING.md) for the full test setup and artifact inspection commands.

Verified on 29 October 2026: the service was active and enabled, HTTPS certificate validation succeeded, and all four desktop/mobile checks above passed in 22.1 seconds. The mobile screenshot was inspected. The analysis API returned `401` without operator credentials. The seven pre-existing Tailscale Serve routes were preserved, and no Funnel route was enabled.
