# Vercel deployment

1. Put this source in the Git repository connected to the existing Vercel project, or connect it with `vercel link` from an authenticated Vercel CLI. No repository or project IDs are assumed.
2. Use the Next.js framework preset, Node.js 22+, install `npm ci`, build `npm run build`, output automatic.
3. Keep `PAYMENTS_ENABLED=false` and both source release gates false. Preview deployment can work without Supabase or Whop credentials.
4. Deploy a Vercel preview and inspect it on a WebGL2-capable desktop browser and a real phone. Check all ten jacket patches, rotate to the back, check all five gear patches, compare list and patch prices, and check pointer drag versus click. Test 360° rotation, reset, fallback, reduced motion, keyboard access and mobile scroll. These GPU checks could not be completed in the provided cloud browser.
5. After this frontend passes, promote the preview to the existing project and attach `sendmesomewhere.veridianapi.com`. Follow the exact DNS record Vercel returns. Do not modify the parent `veridianapi.com` site's records.
6. For live database reads, create a dedicated Supabase project, execute the migration and configure `SUPABASE_URL` / `SUPABASE_SECRET_KEY` as server-only values. Preserve `preview` campaign status and null timestamps.
7. Configure Whop only after the merchant workflow in PAYMENTS.md is verified. Deploying the frontend does not authorize starting the auction.

Needed to deploy from a future working session: authenticated access to the existing Vercel project or its connected Git repository. Database and Whop credentials are only needed for connecting those services, not for the initial frontend preview.
