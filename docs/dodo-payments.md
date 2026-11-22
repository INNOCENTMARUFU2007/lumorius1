# Dodo Payments setup

Lumorius sells Starter, Growth and Professional plans through Dodo Payments (Merchant of Record). Checkout turns on only when the API key, the plan product IDs **and** the webhook signing secret are set, because plan upgrades are applied from verified webhooks, never from the return URL.

All settings live in the root `.env` (git-ignored). Never commit them.

| Setting | What it is |
|---|---|
| `DODO_PAYMENTS_MODE` | `test` until go-live, then `live` (production refuses test mode) |
| `DODO_PAYMENTS_API_KEY` | Server API key with write access (`dodo_test_…` or `dodo_live_…`) |
| `DODO_PAYMENTS_WEBHOOK_KEY` | Signing secret (`whsec_…`) of the webhook endpoint that delivers to this API |
| `DODO_<PLAN>_<MONTHLY\|ANNUAL>_PRODUCT_ID` | Product IDs (`pdt_…`) for each plan and interval |

Products must match the plan exactly or checkout refuses them: USD, $49/$99/$199 a month and $490/$990/$1,990 a year, billed every 1 month or 1 year, no discount, no purchasing power parity. Set the subscription period to 20 years so subscriptions renew until cancelled (a 1-month period would end a monthly plan after one month).

Webhook route: `POST /api/v1/billing/webhook/dodo`. Signatures are verified on the raw body (Standard Webhooks, `webhook-id`, `webhook-timestamp`, `webhook-signature`); events older than five minutes are rejected; duplicates are ignored by `webhook-id`.

## Local testing (test mode)

Dodo cannot reach `localhost`, so use the forwarder:

```bash
pnpm dodo:webhooks
```

It runs Dodo's official CLI (`dodopayments-cli`, pinned) with the test key from `.env`. On first run the CLI registers a test-mode webhook endpoint on Dodo's relay (`https://wsserver.dodopayments.tech/`) and forwards every event, with Dodo's signature headers, to the local webhook route. Keep it running while you test.

Then put that endpoint's signing secret in `DODO_PAYMENTS_WEBHOOK_KEY` (Dashboard, test mode: **Developer > Webhooks**, open the endpoint whose URL is the relay, copy the signing secret) and restart the API. The billing page's Upgrade buttons turn on.

Test cards (expiry 06/32, CVC 123): `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` is declined.

## Production (live mode)

1. Finish KYC in the Dodo dashboard.
2. Create a `dodo_live_` key with write access and set `DODO_PAYMENTS_MODE=live`.
3. Recreate the six products in live mode (IDs do not carry over) and update the product IDs.
4. Create a live webhook endpoint at `https://<your-api-domain>/api/v1/billing/webhook/dodo` with the subscription and payment events, and set `DODO_PAYMENTS_WEBHOOK_KEY` to its secret.
5. Make one real low-value purchase and refund before announcing.
