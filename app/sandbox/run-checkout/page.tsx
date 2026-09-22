import 'server-only';
import {POST as createSandboxCheckout} from '@/app/api/sandbox/wildcard-checkout/route';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SandboxCheckoutRunner() {
  const isAllowed =
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'backend/prelaunch-database' &&
    process.env.WHOP_SANDBOX_E2E_ENABLED === 'true';

  if (!isAllowed) {
    return <main><h1>Sandbox checkout closed</h1></main>;
  }

  const token = process.env.WHOP_SANDBOX_TEST_TOKEN;
  if (!token) {
    return <main><h1>Sandbox token unavailable</h1></main>;
  }

  const unsigned = await createSandboxCheckout(
    new Request('http://sandbox.local/api/sandbox/wildcard-checkout', {method: 'POST'}),
  );

  const response = await createSandboxCheckout(
    new Request('http://sandbox.local/api/sandbox/wildcard-checkout', {
      method: 'POST',
      headers: {authorization: `Bearer ${token}`},
    }),
  );

  if (!response.ok) {
    return (
      <main>
        <h1>Sandbox checkout failed</h1>
        <p>Unsigned request status: {unsigned.status}</p>
        <p>Authorized request status: {response.status}</p>
      </main>
    );
  }

  const payload = (await response.json()) as {url: string};

  return (
    <main>
      <h1>Sandbox Wildcard checkout ready</h1>
      <p>Unsigned request status: {unsigned.status}</p>
      <p>Authorized request status: {response.status}</p>
      <a href={payload.url}>Open Whop Sandbox checkout</a>
    </main>
  );
}
