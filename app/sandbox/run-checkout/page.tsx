import 'server-only';
import {whopRequestWith} from '@/lib/whop.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BASE = 'https://sandbox-api.whop.com/api/v1';
const CHECKOUT_ID = 'ch_yH6hURWqDJE9TZD';

export default async function SandboxCheckoutRunner() {
  const isAllowed =
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'backend/prelaunch-database' &&
    process.env.WHOP_SANDBOX_E2E_ENABLED === 'true';

  const key = process.env.WHOP_SANDBOX_API_KEY;
  const account = process.env.WHOP_SANDBOX_ACCOUNT_ID;
  const plan = process.env.WHOP_SANDBOX_WILDCARD_PLAN_ID;

  if (!isAllowed || !key || !account || !plan) {
    return <main><h1>Sandbox checkout closed</h1></main>;
  }

  const config = await whopRequestWith(
    BASE,
    key,
    `/checkout_configurations/${CHECKOUT_ID}`,
  );

  const purchaseUrl = new URL(config.purchase_url);
  const valid =
    config.id === CHECKOUT_ID &&
    config.account_id === account &&
    config.plan?.id === plan &&
    config.plan?.plan_type === 'one_time' &&
    config.plan?.currency === 'usd' &&
    Math.round(Number(config.plan?.initial_price) * 100) === 25000 &&
    purchaseUrl.protocol === 'https:' &&
    (purchaseUrl.hostname === 'sandbox.whop.com' ||
      purchaseUrl.hostname.endsWith('.sandbox.whop.com'));

  if (!valid) {
    return <main><h1>Sandbox checkout verification failed</h1></main>;
  }

  return (
    <main>
      <h1>Sandbox Wildcard checkout ready</h1>
      <p>Checkout identity verified against the Sandbox API.</p>
      <p>Wildcard · $250 · one-time · fake money only</p>
      <a href={purchaseUrl.href}>Open Whop Sandbox checkout</a>
    </main>
  );
}
