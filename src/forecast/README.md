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
