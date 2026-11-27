# Visualize: the AI "future you" preview, hairstyle try-on and transplant preview

One Cloudflare Worker. The app sends one downscaled front photo (768 px JPEG) plus the forecast's
median Norwood stage and the number of years; the Worker asks Google's Gemini image model to
restyle only the hair and returns the image. The prompt is built here from those two numbers
(`src/prompt.ts`), so callers can't send their own prompts.

The same Worker also takes `{ image, kind: 'style', style, stage }` (a hairstyle from the fixed list in
`src/styles.ts`, hairline and density kept as they are) and `{ image, kind: 'restore', stage }` (a
realistic transplant result, less full at later stages). Prompts for both are built here too.

**Privacy.** The photo exists only in memory for that one request: no storage, no logging of
bodies (Workers observability is off). Use a **paid** Gemini API project: Google's terms say paid
tier content isn't used to improve their products (the free tier's is). The app asks for consent
before the first upload, never offers it to under-18s, saves results only on the phone, and
labels them as illustrations, not medical predictions.

**Cost.** About $0.03 to $0.07 per image depending on the model and size
(`gemini-3.1-flash-image` at 0.5K is about $0.045). The app only generates the year on screen
and caches it, so a typical user costs a few images. Cloudflare's free plan covers the Worker.

## Deploy (about 5 minutes)

1. Create a Google AI Studio API key on a project with billing turned on
   (aistudio.google.com > Get API key). Set a monthly budget alert in Google Cloud.
2. Create a free Cloudflare account, then from this folder:

   ```bash
   npx wrangler login
   npx wrangler secret put GEMINI_API_KEY     # paste the key; it never touches the repo or the app
   npx wrangler deploy                         # prints https://haircare-visualize.<you>.workers.dev
   ```

3. Put that URL in `app.json` under `expo.extra.visualizeEndpoint` and rebuild the app.
   Until then, the app shows the drawn illustration instead.

To try another model, set `GEMINI_IMAGE_MODEL` in the Worker's settings. To use another provider,
replace `handle` in `src/handler.ts`; the app only depends on the request and response shape.
