import {notFound} from 'next/navigation';
import {whopRequestWith} from '@/lib/whop.mjs';

export const dynamic = 'force-dynamic';

const BASE = 'https://sandbox-api.whop.com/api/v1';
const PRODUCT_ID = 'prod_y7RgTUQea79j8';

export default async function SandboxPlanInfoPage() {
  if (process.env.VERCEL_ENV !== 'preview') notFound();

  const key = process.env.WHOP_SANDBOX_API_KEY;
  if (!key) return <main>Sandbox key is not configured.</main>;

  try {
    const response = await whopRequestWith(
      BASE,
      key,
      `/plans?product_ids=${PRODUCT_ID}`,
    );
    const plans = Array.isArray(response?.data)
      ? response.data
      : Array.isArray(response)
        ? response
        : [];
    const plan = plans.find(
      (candidate: any) =>
        candidate.product_id === PRODUCT_ID ||
        candidate.product?.id === PRODUCT_ID,
    );

    if (!plan) return <main>Sandbox plan not found.</main>;

    return (
      <main>
        <h1>Sandbox Wildcard plan</h1>
        <dl>
          <dt>Plan ID</dt>
          <dd>{plan.id}</dd>
          <dt>Product ID</dt>
          <dd>{PRODUCT_ID}</dd>
          <dt>Type</dt>
          <dd>{plan.plan_type}</dd>
          <dt>Currency</dt>
          <dd>{plan.currency}</dd>
          <dt>Initial price</dt>
          <dd>{String(plan.initial_price)}</dd>
        </dl>
      </main>
    );
  } catch {
    return <main>Sandbox plan lookup failed.</main>;
  }
}
