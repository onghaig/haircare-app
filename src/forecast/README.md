# Forecast engine (v0, TypeScript)

A port of `forecast-model-v0/model.py`: a small Bayesian progression model that turns age,
scans, old photos, family history, ancestry and treatment into a year-by-year Norwood forecast
with a 10th to 90th percentile range, the chance of reaching Norwood 3+ and 5+, and a
"with treatment" line.

- `data/priors.json` and `data/trained-params.json` are copied unchanged from the Python model.
  Edit there, not in code.
- `rng.ts` is a seeded PRNG, so the same inputs always give the same forecast.
- Runs fully on device. A 200k-sample forecast takes about 1 to 2 seconds in Jest; the
  analysing screen (8 to 12 seconds) covers it.

## Parity with Python

`__tests__/forecast/python-v0-examples.json` is the Python model's output for four personas.
The tests require every stage quantile within 0.1 stages, every probability within 2.5 points
and the effective sample size within 15%. The two use different random streams, so exact
equality is not expected.

The parity test caught one real difference during the port: Python defaults ancestry to
"white", and the first TS draft defaulted to the "unknown" shift.

An estimate for a wellness product, not a medical prediction.

## Forecast by action (v0.1)

Treatments are no longer one "rate reduction" each. There are two kinds of action
(`effects.ts`, numbers in `data/treatment-effects.json`):

- **Slows loss** (finasteride, dutasteride): scales the rate of progression, so the line
  flattens and the gap to "do nothing" grows every year. These are the stopping power.
- **Grows hair** (topical and oral minoxidil, scalp massage): a lift of a fraction of a stage
  while used. It ramps up over about 6 months, holds while you keep going and fades over about
  4 months if you stop. The slope doesn't change. Previously the model treated minoxidil as
  slowing loss by 35%, which overstated its effect on the 10-year odds.

Slowers don't stack (the strongest counts); lifts within a group don't stack (topical plus oral
minoxidil), and different groups add. Each effect has a low, mid and high value, and a plan's
band runs from the strongest to the weakest case, so the forecast shows evidence spread as well
as person-to-person spread. `withTreatment` keeps the mid case, which matches the Python model
for finasteride; the parity tests still pass.

"Your plan" is built from the daily log (`src/options/plan.ts`): each item at the share of days
it was really done in the last 4 weeks. Extra paths (for comparing options) run on the same
simulated people through `forecast(u, { paths })`.

**Every number in `treatment-effects.json` is an unverified assumption** (`"verified": false`).
They need checking against the trial papers before launch. The user's current stage already
includes whatever their existing treatment has done; v0.1 doesn't try to separate that out.
