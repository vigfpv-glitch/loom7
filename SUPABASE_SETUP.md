# Loom7 admin and newsletter setup

This branch adds an admin page for products and newsletter subscribers. Because the storefront is static, Supabase provides authentication and protected data storage. Subscriber information is not stored in the public repository.

## Set up Supabase

1. Create a Supabase project.
2. In its SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql).
3. Under **Authentication → Users**, create an admin account using your email and a strong password. Disable public account signups if they are not needed.
4. Copy the admin user's UUID and add it to the allowlist from the SQL Editor:

```sql
insert into public.admin_users (user_id)
values ('PASTE_ADMIN_USER_UUID_HERE');
```

Only allowlisted accounts can use admin operations or view subscriber records.

## Configure the admin page

In `admin.html`, replace `YOUR_SUPABASE_PROJECT_URL` and `YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY` with the project URL and publishable (or legacy anon) key from Supabase **Project Settings → API**.

These browser keys are public by design. **Never** put a `service_role` or secret key in `admin.html`, `index.html`, or any public repository file. Database row-level security is essential; keep it enabled.

## Newsletter form and privacy

The public signup form should collect an email (and optionally a name), explain that the person is signing up for Loom7 updates and offers, and require an explicit, unchecked-by-default marketing consent checkbox. The database records the consent timestamp and consent-version marker. Subscriber rows remain admin-only; public visitors can submit signups but cannot list the records.

Before collecting or using subscriber details, confirm the consent wording, privacy notice, data retention, and unsubscribe process meet applicable requirements. This starter does not send email campaigns or implement unsubscribe handling. Add an email marketing provider and suppression/unsubscribe workflow before sending campaigns.

## Publish and test

Deploy a preview of `feature/admin-panel` before merging. Test that public visitors see only visible products and cannot read subscriber data; that the newsletter form requires consent; that an allowlisted admin can sign in and manage products/view subscribers; and that a non-allowlisted account is denied.

## Product image uploads

In the admin product form, choose a JPEG, PNG, or WebP image up to 3 MB. A preview appears before saving. Saving uploads the image to Netlify Blobs and stores its public image URL with the product. Editing a product without choosing a replacement keeps its existing image, including older externally hosted images. Uploads require the existing signed-in, allowlisted Supabase admin account; image files are publicly readable for the storefront.

Netlify installs the dependencies in `package.json` and deploys the image function from `netlify/functions`. Image storage is provisioned automatically and persists across deploys. The upload function uses the same Supabase project as the current admin page; update its project URL too if moving to another Supabase project. No storage bucket or additional secret key is required.

The subscribers list is for newsletter signups, not order/customer records. The current storefront sends product enquiries to Instagram and does not import Instagram messages or customer/order history.
