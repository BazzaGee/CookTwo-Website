# CookTwo — Marketing Site (v3)

The marketing website for **CookTwo** — the collaborative adaptive nutrition app for couples.
_"One dinner. Two plates. Zero arguments."_

Live (staging): **https://couples-food-system-v3.pages.dev**
App (PWA): **https://cooktwo.app/PWA** · API: `https://couples-food-system-api.byte-digital.workers.dev`

## Stack
- **Astro 6** (static output) + **Tailwind 3** + `@astrojs/sitemap`
- Deployed to **Cloudflare Pages** (project: `couples-food-system-v3`)
- No frameworks shipped to the browser — just islands of vanilla `<script>` where needed

## Structure
```
src/
├── config.ts                # Site / API / PWA URLs
├── data/                    # Single source of truth (features, faq, comparison, navigation)
├── components/
│   ├── app-mocks/           # HTML/CSS recreations of the real app screens
│   ├── forms/               # EmailOptIn (waitlist → live API → Resend verification)
│   ├── layout/              # BaseHead, Header (dropdown nav), Footer
│   └── sections/            # Pricing, HeroVideo, infographics
├── layouts/BaseLayout.astro
├── pages/                   # index, features/*, how-it-works, compare, about, faq, join, contact
└── styles/global.css
public/images/app/           # Real screenshots of the live app
```

## The email capture flow
`EmailOptIn.astro` POSTs `{ email, joinCode? }` to the live API
`/api/waitlist/subscribe`. The worker sends a verification email via **Resend**;
the user clicks through to verify, then is redirected into the PWA with an
access token. Partner invites pass a 6-digit `joinCode`.

## Commands
| Command | Action |
|---|---|
| `npm run dev` | Dev server at localhost:4321 |
| `npm run build` | Production build → `./dist/` |
| `npm run preview` | Preview the build locally |

## Deploy
```sh
npm run build
npx wrangler pages deploy dist --project-name couples-food-system-v3 --branch main
```

## Notes
- The site is currently `noindex` (pre-launch). Flip `noindex` in `BaseHead.astro`
  and update `robots.txt` + `astro.config.mjs` `site` when moving to the custom domain.
- App screenshots in `public/images/app/` were captured from the live PWA.
