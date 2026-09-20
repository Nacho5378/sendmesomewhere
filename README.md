# Send Me Somewhere — Next.js rebuild

An original interactive sponsorship showroom for Mission 01: Addis Ababa → Dubai, GITEX Global 2026.

## Current status

Implemented and build-tested. **Not deployed. Not approved for live payments.**

- Next.js 16 App Router, React 19, React Three Fiber / Three.js.
- Original parametric 3D racing jacket with contrasting panels, collar, zipper, seams and attached raycastable sponsor patches. The model is real mesh geometry, not the old rotated image. It is a stylized custom garment, not a photoreal scanned garment.
- Full horizontal rotation, inertial drag, smooth view transitions, front/back/gear selectors and keyboard-accessible rotation buttons.
- Five original 3D gear objects: laptop, backpack, luggage, cap and Wildcard badge.
- Scene lighting, shadows, platform, grid and animated travel arc.
- All 15 exact opening prices; owner/price hover cards; details panels; sponsor filters; How It Works; truthful empty activity.
- Responsive CSS, reduced motion preference, WebGL fallback, lazy-loaded 3D, bounded pixel ratio and focus-trapped accessible dialogs.
- Fixed database auction timestamps; no timer starts on a visit.
- Database-backed state and 15-second polling when configured. Without a database, the site explicitly displays a pre-launch explorer.
- Whop checkout adapter and signature-verified webhook route, atomic initial ownership updates and doubled next prices.
- Server-side release lock. No takeover execution or refund automation.

## Run

Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open the localhost URL printed by Next.js. No credentials are required to explore the frontend.

```sh
npm run build
npm run typecheck
npm test
node scripts/smoke.mjs
```

The development wrapper translates preview tooling's `--host` flag to Next.js's `--hostname`. Production output is `.next`; development output is separate in `.next-dev`.

## Database

Use a dedicated Supabase PostgreSQL project. Execute `db/001_campaign.sql` once. This creates all 15 empty positions and a campaign in `preview` status with null start/end timestamps. It does not launch anything. Configure the server-only variables from `.env.example`. Never put the service-role key in a `NEXT_PUBLIC_` variable.

All database tables use RLS with no anonymous policies. Only the server's service role may invoke the narrow RPCs. Financial identifiers and checkout reservations are not exposed by the public snapshot.

## Payments

See `docs/PAYMENTS.md`. `lib/release.ts` contains `RELEASE_APPROVED = false` and `TAKEOVERS_APPROVED = false`. The checkout endpoint returns HTTP 423 even if someone sets `PAYMENTS_ENABLED=true`. Changing this source gate requires explicit campaign-owner approval after the remaining integration checks.

The website must not reuse the bare Whop product link as a unique position claim. The server must bind a reservation to its checkout configuration, verify payment with Whop, and then perform an atomic database update.

## Deployment

See `docs/DEPLOYMENT.md`. Vercel configuration and a reproducible npm lockfile are included. Deploy the non-transacting preview first. No Vercel token or connected project was available during this build.

## Verification limits

Build and TypeScript checks passed. Six database subtests and nine domain/payment tests passed (16 reported tests including the database parent test). Sponsor filters, all 15 list entries, Wildcard prices, locked checkout, help and Escape dismissal were checked in the cloud browser.

The cloud browser returned no WebGL2 context, so it displayed the working fallback. Actual GPU rendering, model hover/drag, and touch interactions still need a WebGL-capable browser. Responsive CSS is implemented, but a mobile-device browser pass remains pending. No real Whop payment, merchant secret, hosted database, or Vercel deployment was tested.

## Originality

The prior v3 archive was inspected and rebuilt. No Marc Lou assets, code, branding or exact design were copied. His public page was read, but the interactive reference could not be loaded in the inspection browser. All scene geometry and graphics in this source are original. Google Fonts supplies Barlow Condensed and DM Sans; the font stack includes system fallbacks.
