# Haircare app

The hair-loss forecast: see your future hairline, then prove your plan is working.

Built with Expo (React Native, TypeScript). Performance-critical parts, starting with the
guided head scan, are native Swift modules (Kotlin for Android later).

## Run it locally

You don't need a Mac or a paid Apple Developer account. Everything that needs a Mac runs in
GitHub Actions on macOS runners.

### 1. Tests (Windows, macOS or Linux with Node 22)

```bash
git clone https://github.com/onghaig/haircare-app && cd haircare-app
npm install          # also downloads the two on-device scan models
npm run check        # lint + typecheck + Jest tests
```

The Swift scan-core tests (`npm run test:swift`) need Swift 6 (macOS or Linux). On Windows,
rely on CI, which runs them on Linux and macOS for every PR.

### 2. Quick look in Expo Go (free, instant)

```bash
npx expo start --go
```

Install Expo Go from the App Store and scan the QR code with the iPhone camera (phone and PC
on the same Wi-Fi; add `--tunnel` if that doesn't connect). Tabs, theme and all other JS
screens work, and edits reload instantly. The scan camera shows a "needs a
development build" notice, because Expo Go can't load the custom Swift module.

### 3. Free: sideload the full app, Swift scan included

GitHub builds an unsigned `.ipa`; you sign it with your free Apple ID while installing it.

1. On GitHub: **Actions > iOS sideload build > Run workflow**. Pick a variant:
   - `standalone`: the JS is bundled in, so the app runs on its own anywhere. Use this to try it.
   - `dev-client`: the app loads JS live from your PC, so JS edits show up without a rebuild.
2. After about 10 to 15 minutes, download the `Haircare-...-ipa` artifact from the run page
   and unzip it to get the `.ipa`.
3. Install it with [Sideloadly](https://sideloadly.io) (Windows: install iTunes and iCloud
   from apple.com, not the Microsoft Store versions) or [AltStore](https://altstore.io).
   Plug in the iPhone, drop in the `.ipa`, and sign in with a free Apple ID.
4. On the iPhone: turn on **Settings > Privacy & Security > Developer Mode**, then trust your
   Apple ID under **Settings > General > VPN & Device Management**.

For the `dev-client` variant, run `npx expo start --dev-client` on your PC, open the app, and
pick your PC's server from the list (same Wi-Fi; allow Local Network access when asked).

Free Apple ID limits: the app stops opening after **7 days**, so re-install it with
Sideloadly, or let AltStore refresh it (it does that over Wi-Fi while AltServer runs on your
PC). You can have at most 3 sideloaded apps at once. Push notifications and some other
capabilities aren't available with a free account; nothing in the app needs them yet.

Only rebuild the `.ipa` when native code changes (anything in `modules/`, or a new package
with native code). For JS-only changes, use Expo Go or the `dev-client` variant.

### Later, when you have a paid Apple Developer account ($99/year)

You'll need one for TestFlight and the App Store. EAS builds and signs in the cloud, so you
still don't need a Mac:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform ios   # signed dev build, install link
npx eas-cli@latest build --profile production --platform ios --auto-submit   # TestFlight
```

### With a Mac (optional)

`npx expo run:ios --device` builds and installs on a plugged-in iPhone with Xcode 26.

### CI

Every PR runs lint, typecheck and Jest, plus the Swift core tests on Linux. When app or
native code changes, a macOS runner also runs the Swift core tests, builds the full Release
app with Xcode 26, and runs the end-to-end flows in `e2e/` with
[Maestro](https://maestro.mobile.dev) on an iPhone simulator. The run is recorded: download the `demo-video` artifact to watch it,
and the screenshots are in `e2e-results`. The simulator has no camera, so CI builds include an
illustrated demo face (`e2e/assets/demo_face.jpg`) that goes through the real on-device
analysis. Device builds never include it, and real photo capture is only checked on a phone. When native iOS code changes, the sideload `.ipa` is rebuilt too.

## Layout

| Path | What it holds |
| --- | --- |
| `src/app/` | Routes (Expo Router). `(tabs)/` holds the five tabs: Today, Scan, Progress, Predict, Ask |
| `src/theme/` | Design tokens (colours, type, spacing) and the contrast checker |
| `src/components/ui/` | Shared UI: `Text`, `Button`, `Card`, `Screen` |
| `src/navigation/tabs.ts` | Tab order, labels, icons and each tab's one job |
| `src/forecast/` | On-device forecast engine (port of the Python v0 model) |
| `src/scan/` | Scan session state machine, guidance copy, voice coach, change detection, local scan storage |
| `src/app/scan/` | Guided scan (full-screen) and scan result screens |
| `src/app/onboarding/` | Welcome and the nine onboarding questions |
| `src/app/reveal/`, `src/reveal/` | Analysing screen and the free reveal with the blurred future look; runs the forecast on device |
| `src/app/paywall.tsx`, `src/paywall/` | Paywall, plans and prices, the purchase interface (test purchases until StoreKit is connected) |
| `src/app/(tabs)/index.tsx`, `src/app/massage.tsx`, `src/app/log.tsx`, `src/plan/` | Today: daily plan, streak and adherence, guided scalp massage, quick log, local reminders |
| `src/app/(tabs)/progress.tsx`, `src/app/verdict.tsx`, `src/progress/` | Progress: baseline vs latest, hairline trend with the no-real-change band, plan consistency, the monthly verdict story |
| `src/profile/` | Hair profile: answers, on-device storage, onboarding rules, mapping to the forecast |
| `src/components/head/`, `src/components/family/` | Drawn heads with tappable zones; the family tree and relative cards |
| `modules/headmap/` | Native Swift scan module: camera, MediaPipe, measurement, quality checks ([README](modules/headmap/README.md)) |
| `__tests__/` | Jest tests |
| `e2e/` | Maestro end-to-end flows, run on an iOS simulator in CI |

## Milestones

Each milestone is one PR with its own tests.

1. App skeleton: tabs, design tokens, tests, lint, CI
2. Forecast engine in TypeScript, checked against the Python v0 model
3. Native Swift scan module: camera, on-device face and hair detection, quality checks, hairline measurement
4. Guided scan flow: 5 views, ghost overlay, haptics, voice, quality score
5. Onboarding: questionnaire, tap-the-head, family tree
6. Analysing screen and reveal
7. Paywall
8. Today tab: daily plan, reminders, quick log, massage guide
9. Progress tab: dashboard and monthly verdict
10. Predict tab and share card

## Design

Dark, clinical-premium look with one accent colour (hairline green), large numbers, and calm
motion everywhere except the scan. Tokens live in `src/theme/tokens.ts`; tests check every
text and accent colour pair against WCAG AA contrast.
