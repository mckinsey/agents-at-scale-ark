## 1. Toggle configuration (chart + pod env)

- [ ] 1.1 Add a `marketplaceInstall.enabled` value to the ark-dashboard chart, defaulting to `false`
- [ ] 1.2 Wire it to a pod env var (e.g. `MARKETPLACE_DIRECT_INSTALL_ENABLED`) on the dashboard deployment
- [ ] 1.3 Add a server-side helper to read the toggle (default disabled when unset/invalid)

## 2. Server route gating

- [ ] 2.1 Gate the install `POST` on the toggle: when disabled, return the command payload and never spawn helm
- [ ] 2.2 When enabled, execute `helm upgrade --install` and return the resulting status (wire the existing direct-exec path)
- [ ] 2.3 Gate the uninstall `DELETE` on the same toggle: command payload when disabled, execute when enabled
- [ ] 2.4 Retire reliance on the `mode` body param — the toggle alone decides execution
- [ ] 2.5 Extend the helm-unavailable / non-zero-exit fallback (command + usable error) to the uninstall path
- [ ] 2.6 Resolve install/uninstall targets only from the namespace `marketplace-sources` catalogue; ignore any client-supplied source (header/body)
- [ ] 2.7 Remove the hardcoded `{ mode: 'command' }` from `lib/services/marketplace.ts` and update `lib/services/marketplace.test.ts`

## 3. Install-policy endpoint

- [ ] 3.1 Add `GET /api/marketplace/install-policy` returning `{ directInstallEnabled }` from the server-side toggle

## 4. Dashboard UI

- [ ] 4.1 Add a client hook to read the install policy (React Query)
- [ ] 4.2 Refactor the card's internal `InstallCommandDialog` (`components/cards/marketplace-item-card.tsx`) into a reusable command dialog serving both install and uninstall (e.g. extract `MarketplaceCommandDialog`)
- [ ] 4.3 Card (`components/cards/marketplace-item-card.tsx`): add uninstall UX (today the card only installs) — execute + progress/result when enabled, command + "disabled by policy" when off
- [ ] 4.4 Detail page (`app/(dashboard)/marketplace/[id]/page.tsx`): bring its existing uninstall and install under the same gate (execute/command + disabled signal)
- [ ] 4.5 Reflect outcome on card and detail (Get ↔ Installed transition, success/failure)

## 5. Tests

- [ ] 5.1 Route tests — `POST`: toggle off returns command and never spawns helm; toggle on executes and returns status; helm missing / non-zero exit falls back to command with a usable error
- [ ] 5.2 Route tests — `DELETE`: toggle off returns command and does not execute; toggle on executes; failure surfaces an error
- [ ] 5.3 Policy endpoint test — reflects the toggle state
- [ ] 5.4 UI tests — install/uninstall in enabled and disabled (disabled-by-policy) flows
- [ ] 5.5 Regression — release name from the item manifest is respected in both modes; Installed badge logic unaffected
- [ ] 5.6 Regression — a client-supplied source (header/body) cannot force install of a chart outside the namespace catalogue

## 6. Documentation

- [ ] 6.1 Document the toggle in the marketplace operations guide (enable/disable, default-off, governance rationale)
- [ ] 6.2 Remove the "No in-dashboard install" limitation bullet captured in PR #2336
- [ ] 6.3 Note the uninstall behavioral change (breaking) for environments where dashboard uninstall works today
