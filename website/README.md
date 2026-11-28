# Fuller website

The marketing site and the pages the app stores need: home, privacy policy, terms of service and support.
Plain HTML, CSS and JS with no build step. Brand tokens come from the Fuller brand book.

```
website/
  index.html      home: hero + waitlist, Fuller Scan, Two Futures, features, privacy, FAQ
  privacy.html    privacy policy (draft for legal review)
  terms.html      terms of service, including Apple's required EULA terms (draft for legal review)
  support.html    support, subscriptions and refunds, data deletion
  404.html
  assets/         site.css, site.js, brand marks, app screenshots
```

## Preview locally

```bash
cd website && python3 -m http.server 8080   # then open http://localhost:8080
```

## Before launch

1. **Placeholders.** Everything highlighted in orange (`mark.fill` / `a.fill`) needs a real value:
   company legal name, address, governing law, publish date.
2. **Email and waitlist.** Set `CONTACT_EMAIL` and `WAITLIST_ENDPOINT` at the top of `assets/site.js`.
   The endpoint takes a POST with an `email` field, for example a free Formspree form URL.
   Until it's set, the form opens an email to `CONTACT_EMAIL`.
3. **Store badges.** Swap the "Coming soon" pills for Apple's and Google's official badges, linked to the listings.
4. **Legal review.** The policy and terms were drafted from how the app works today. A lawyer should review them,
   especially the callouts marked "Lawyer to check".

## Deploy

`.github/workflows/website.yml` publishes this folder to GitHub Pages on every push to `main` that touches it.
One-time setup in the repo: Settings > Pages > Source: **GitHub Actions**. The site is then at
`https://onghaig.github.io/haircare-app/`. For a custom domain (e.g. getfuller.app), add it under Settings > Pages and
point the domain's DNS at GitHub; all links are relative, so nothing else changes.
