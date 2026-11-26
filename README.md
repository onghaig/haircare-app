# Haircare app

The hair-loss forecast: see your future hairline, then prove your plan is working.

Built with Expo (React Native, TypeScript). Performance-critical parts, starting with the
guided head scan, are native Swift modules (Kotlin for Android later).

## Getting started

```bash
npm install
npm run check        # lint + typecheck + tests
npx expo run:ios     # development build on a simulator or device (needs Xcode)
```

The app uses native modules, so it runs in a development build, not Expo Go.
Without a Mac, build in the cloud with `npx eas-cli@latest build --profile development --platform ios`.

## Layout

| Path | What it holds |
| --- | --- |
| `src/app/` | Routes (Expo Router). `(tabs)/` holds the five tabs: Today, Scan, Progress, Predict, Ask |
| `src/theme/` | Design tokens (colours, type, spacing) and the contrast checker |
| `src/components/ui/` | Shared UI: `Text`, `Button`, `Card`, `Screen` |
| `src/navigation/tabs.ts` | Tab order, labels, icons and each tab's one job |
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
