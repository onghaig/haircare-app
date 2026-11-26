# Haircare app

The hair-loss forecast: see your future hairline, then prove your plan is working.

Built with Expo (React Native, TypeScript). Performance-critical parts, starting with the
guided head scan, are native Swift modules (Kotlin for Android later).

## Run it locally

### 1. Tests (any machine with Node 22)

```bash
git clone https://github.com/onghaig/haircare-app && cd haircare-app
npm install          # also downloads the two on-device scan models
npm run check        # lint + typecheck + Jest tests
npm run test:swift   # Swift scan-core tests (macOS with Xcode, or Linux with Swift 6)
```

### 2. Quick look in Expo Go (no Mac needed)

```bash
npx expo start --go
```

Scan the QR code with the Expo Go app on your iPhone. Tabs, theme and screens work; the
scan camera shows a "needs a development build" notice because Expo Go cannot load the
custom Swift module.

### 3. Full app with the Swift scan on your iPhone (Mac with Xcode 26)

```bash
npx expo run:ios --device
```

Pick your plugged-in iPhone; Xcode signs with your Apple ID (Xcode > Settings > Accounts).
Use a real phone: the simulator has no front camera. After the first build, `npx expo start`
reloads JS changes instantly; rebuild only when native code changes.

### 4. No Mac: cloud build with EAS

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform ios
```

Installing on a phone needs an Apple Developer account ($99/year); EAS registers your device
and gives you an install link. The same account is used for TestFlight later.

### CI

Every PR runs lint, typecheck and Jest, the Swift core tests on Linux, and (when native code
changes) a full iOS simulator build on macOS with Xcode 26.

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
| `modules/headmap/` | Native Swift scan module: camera, MediaPipe, measurement, quality checks ([README](modules/headmap/README.md)) |
| `__tests__/` | Jest tests |

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
