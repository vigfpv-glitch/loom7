# LOOM Ai on Cloudflare

LOOM Ai sends chat requests to the same-origin `/api/chat` Pages Function. The
function loads the current public catalogue from Supabase and calls Cloudflare
Workers AI using the `@cf/meta/llama-4-scout-17b-16e-instruct` model. It does not need an
AI provider API key.

## Enable the Workers AI binding

Cloudflare Pages requires this binding to be added in the dashboard:

1. Open **Workers & Pages** and select the `loom7` Pages project.
2. Go to **Settings → Functions → Workers AI bindings**.
3. Select **Add binding** and set the variable name to `AI`.
4. Save the binding for the **Production** environment. Add the same binding to
   **Preview** if preview deployments should support chat.
5. Trigger a new deployment so the Pages Function receives the binding.

Without the `AI` binding the chat panel remains visible but reports that AI is
not connected. The endpoint also needs Supabase's existing public product-read
access to retrieve the currently visible catalogue.

## Set and share stock counts

Before using the inventory fields in the admin panel, run the updated
`supabase/products.sql` in the Supabase SQL Editor. This adds `stock_by_size`
with zero counts by default. Then deploy the site. In the admin product form,
enter the on-hand quantity for each size; save confirmed orders by reducing the
count, and use `0` for sold-out sizes. LOOM Ai reads the latest counts from
Supabase for each chat request and tells shoppers to confirm before ordering.

The endpoint validates same-origin requests, limits message sizes and
conversation length, applies a per-isolate request limit, and sends only the
recent chat messages plus visible product details to Workers AI. It does not
store chat conversations.
