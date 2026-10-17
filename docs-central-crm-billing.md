# Central CRM billing integration

Maps delegates catalog, price, payment sessions, SePay webhooks and payment
truth to Central CRM. Maps also sends server-side `lead_submitted`,
`order_created` and verified `payment_success` events through the existing
Website Integration.

## Backend environment

Set these in the Maps server environment, never in the Vite bundle:

- `CRM_BASE_URL=https://crm.robusltd.com`
- `CRM_SOURCE_KEY=maps_landing`
- `CRM_WEBSITE_KEY=maps_landing_30f46283e1309857`
- `CRM_CHECKOUT_API_KEY` (secret from Source Registry → Checkout key)
- `CRM_PAYMENT_CONFIG_KEY=maps_landing_manual_bank_transfer`
- `CRM_SKU_BASIC_MONTHLY=maps01`, `CRM_SKU_BASIC_ANNUAL=maps02`
- `CRM_SKU_ADVANCED_MONTHLY=maps03`, `CRM_SKU_ADVANCED_ANNUAL=maps04`
- optional `CRM_CALLBACK_API_KEY` if CRM later enables callback delivery

## CRM configuration

Reuse the existing `maps_landing` Source Registry, payment config, bank
mapping and products. Do not create another Source Registry, payment config,
product or SePay webhook.

Maps reads the public CRM payment-session `statusUrl` every 4 seconds. When
CRM reports `PAID`, the Maps backend verifies the immutable order facts,
fulfills the local account and sends `payment_success`. No browser redirect is
treated as payment proof.

The existing CRM status payload uses `paymentSessionId`, `externalOrderId`,
`sourceKey`, `productSku`, `amount`, `crmTransactionId` and
`paymentReference`; Maps validates these before fulfillment.

## Maps endpoints

- `POST /api/trial/start` creates a server-side trial session.
- `GET /api/billing/config` exposes only non-secret plan/quota display data.
- `POST /api/billing/checkout` creates a CRM payment session.
- `GET /api/billing/orders/:id/status` reads CRM payment status.
- `POST /api/integrations/crm/entitlements` receives idempotent payment completion.
- `GET /api/account/plan` reads the local plan and quota after activation.

No Maps endpoint accepts a client-supplied price, quota, SePay transaction, or
payment-success flag.
