# Whop integration: intentionally locked

Reviewed against Whop's current documentation on 2026-09-18:

- https://docs.whop.com/api-reference/beta/checkout-configurations/create-a-checkout-configuration
- https://docs.whop.com/api-reference/beta/payments/retrieve-payment
- https://docs.whop.com/developer/guides/webhooks

The REST adapter and webhook expect API version `2026-09-15`, v1 envelope, `account_id`, monetary objects with decimal USD strings, `status=paid` and `substatus=succeeded`. Do not mix these with the older legacy SDK/payment schema. Verify these fields using real sandbox payloads before releasing the gate.

## Implemented flow

1. The server checks the hard release gate, environment flag and request origin.
2. The database validates the auction window, enforces a per-client reservation limit, locks the position and allows only unowned opening purchases.
3. The server creates a Whop checkout configuration for the preverified plan, using reservation ID as idempotency key and metadata. It verifies the returned account, plan, one-time type, USD currency and exact opening price.
4. The configuration ID is bound to the reservation before the purchase URL is returned.
5. The webhook validates raw-body HMAC and timestamp, checks account/version, retrieves the payment directly from Whop and validates eligibility.
6. A single database transaction validates reservation, configuration, plan, price and paid-at window; creates the ledger entry; changes ownership; doubles the next price; and creates public activity.
7. Repeated event IDs or payment IDs do nothing. Mismatches are recorded for review, without granting ownership. A payment redirect never grants ownership.

## Why takeovers remain disabled

A Whop checkout configuration is reusable. A reservation alone cannot prevent a previously opened checkout from being paid again. The database prevents double ownership, but duplicate real charges still require payment-side controls and reconciliation. A production launch therefore remains blocked by source, not just environment.

Before any live payment:

- Verify the merchant accepts physical/event sponsorship sales and the 72-hour campaign terms.
- Confirm each existing one-time USD plan and account ID, including discounts, taxes, adaptive pricing and allowed payment methods. Only exact undiscounted base prices are supported by the current adapter.
- Test authentic signatures with the actual webhook secret; current manual HMAC handling follows the published full `ws_` key guidance. Do not infer success from local test signatures alone.
- Resolve reuse, link deletion, abandoned reservations, late payments and duplicate charges in sandbox. Reservations are deliberately not automatically released; releasing one without invalidating and reconciling its remote checkout risks multiple payments.
- Add a verified checkout-expiry/cancellation reconciliation worker and durable webhook inbox/worker before live operation. The current handler is synchronous; temporary failures return 503 for retries, but latency must be measured against Whop's delivery deadline.
- Verify public sponsor identity/brand moderation and logo submission. Current display uses the supplied public sponsor name as text only, never arbitrary HTML or image URLs.
- Verify refunds, disputes, fees and previous-owner compensation. None is automatically issued, promised, or calculated in this release.
- Exercise pending/failed/refunded/duplicate/late-payment cases against Whop's sandbox and the hosted database, then obtain explicit launch approval.

## Totals

`totalCents` currently sums only successfully applied sponsorship principal. It excludes held/review payments, taxes and payment fees. Because takeovers and refunds are disabled, there is no ambiguous gross-versus-refunded total. Define the appropriate net accounting before enabling either.

## Secrets

Use server-only `WHOP_API_KEY`, `WHOP_ACCOUNT_ID`, `WHOP_WEBHOOK_SECRET`, `WHOP_PLAN_IDS_JSON`, `RATE_LIMIT_SALT`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `SITE_URL`. `.env.example` has placeholders only. No credentials or checkout URLs are embedded in the frontend.
