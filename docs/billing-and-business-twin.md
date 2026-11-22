# Billing and Business Twin

Apply `027_billing_dodo.sql` before starting the updated API. Starter is $49 monthly or $490 annually. Professional is $149 monthly or $1,490 annually. Enterprise appears as Coming soon. Existing Stripe subscriptions continue through their own customer portal and renewal terms.

## Dodo Payments setup

Create recurring USD products in Dodo with a one-month or one-year billing frequency and the exact prices shown above. Set the subscription period for recurring renewals. Keep automatic product discounts and purchasing power parity disabled for these products. The app checks the live Dodo catalog before creating checkout.

Set these server-side environment variables in the local or deployment environment:

| Variable | Purpose |
|---|---|
| `DODO_PAYMENTS_MODE` | `test` for local setup or `live` for production |
| `DODO_PAYMENTS_API_KEY` | API key from the matching Dodo environment |
| `DODO_PAYMENTS_WEBHOOK_KEY` | Signing key for the matching webhook |
| `DODO_STARTER_MONTHLY_PRODUCT_ID` | Dodo product for $49 monthly |
| `DODO_STARTER_ANNUAL_PRODUCT_ID` | Dodo product for $490 annually |
| `DODO_PROFESSIONAL_MONTHLY_PRODUCT_ID` | Dodo product for $149 monthly |
| `DODO_PROFESSIONAL_ANNUAL_PRODUCT_ID` | Dodo product for $1,490 annually |

Register `POST /api/v1/billing/webhook/dodo` on a public HTTPS API URL and subscribe to subscription lifecycle events and `payment.succeeded`. The app confirms a signed event against Dodo's subscription API before changing entitlements. Use test mode to verify an initial payment, renewal, cancellation, and duplicate event delivery before switching environments. Manage Billing opens the corresponding provider portal. Dodo payment receipts are available in that portal.

Use a separate database for production. Open checkouts and Dodo product IDs are environment-specific. Existing paid customers should manage their subscriptions through the original provider before starting a new checkout.

## Capacity

Free includes exactly 500,000,000 bytes of accounted storage. The cap applies across documents and newly uploaded recordings. Historical recordings without recorded sizes need a storage reconciliation if they should be included. Monthly AI token allowances reset in UTC. Chat and embedding calls reserve capacity before provider use. The usage ledger records reported tokens or a conservative estimate when token usage is unavailable. Recorded audio transcription is measured separately. Treat pricing and unit costs as operating inputs and monitor actual provider invoices.

## Business Twin

The market monitor can use public Coinbase Exchange digital-asset quotes and ECB daily FX references via Frankfurter. Set `TWELVE_DATA_API_KEY` on the API server for equities and intraday FX. Enable data access for the exchanges and instruments shown, and verify market data permissions for your deployment. The monitor labels source timestamps and daily references, ignores unavailable quotes, and refreshes about every minute. Users can explicitly apply a recent EUR/USD move to the share of costs denominated in euros.

The simulator starts with labeled example assumptions. Replace them with workspace financial inputs before using a forecast. The cash model includes revenue growth, contribution margin, fixed costs, working capital, one-time spend, and FX exposure. Its stress-test distributions depend on input variation. Export the selected monthly forecast to CSV.
