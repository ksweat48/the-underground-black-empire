/*
# Track invoice and charge on payment events

1. Modified Tables
- `stripe_payment_events`
  - `invoice_id` (text, nullable): the Stripe invoice a payment or refund belongs to.
  - `charge_id` (text, nullable): the Stripe charge behind the payment, when known.

2. Why
- Refunds and chargebacks must find the exact original payment so all five treasury and
  commission shares can be reversed. Matching by subscription alone was unreliable.

3. Indexes
- Lookup indexes on `invoice_id` and `charge_id`.

4. Security
- No policy changes. Existing data is untouched.
*/

ALTER TABLE public.stripe_payment_events ADD COLUMN IF NOT EXISTS invoice_id text;
ALTER TABLE public.stripe_payment_events ADD COLUMN IF NOT EXISTS charge_id text;

CREATE INDEX IF NOT EXISTS idx_stripe_payment_events_invoice_id ON public.stripe_payment_events (invoice_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payment_events_charge_id ON public.stripe_payment_events (charge_id);
