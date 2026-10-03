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

The storefront and admin page share the existing public Supabase configuration in `assets/supabase-config.js`. If moving to a different project, update the project URL and publishable (or legacy anon) key there using Supabase **Project Settings → API**.

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

## Editable Hero Section

The repository is a static HTML/JavaScript website, not a React/Vite application. The existing design and admin sign-in flow have been retained.

1. In your existing Supabase dashboard, open **SQL Editor** and run the entire contents of `supabase/hero.sql`. If setting up a fresh project, run `supabase/schema.sql` first; the Hero policies reuse its `is_loom7_admin()` function and `admin_users` allowlist.
2. The script creates `hero_content` and the public `hero_images` storage bucket. It is rerunnable and does not reset saved content. No separate bucket creation or terminal command is needed. This dashboard step is required; deploying website files does not execute Supabase SQL automatically.
3. Sign in to `admin.html` with an existing allowlisted admin account and select **Hero Section**. Edit Title, Subtitle, Button Text, and Button Link. Optionally select a JPEG, PNG, or WebP image up to 5 MB, then select **Save Hero Section**.
4. Reload the storefront to see the published content. With an empty table, a failed fetch, or an unavailable Supabase script, the original text and image remain visible. A failed custom image falls back to `assets/hero-static.webp`. An empty subtitle intentionally hides the subtitle text.

The Hero is a single record with UUID `00000000-0000-4000-8000-000000000001`; a database constraint prevents multiple competing Hero records. The admin uses an upsert so the first save creates the record and later saves update it. No seed row is needed. Public visitors can read Hero content and view public images, but only allowlisted admins can change content or upload/manage files. Button links only accept HTTP or HTTPS URLs.

Each image replacement receives a unique filename to avoid stale browser/CDN caches. Leaving the upload field empty preserves the current image. Failed saves attempt to remove the newly uploaded file, while previously published images are retained to avoid breaking cached pages. Unused older images can be removed manually from **Storage → hero_images** after checking that their URLs are no longer used.

Verify an empty-table fallback, first save, text-only updates, image replacement, an invalid upload, a failed image URL, and sign-out/sign-in. Also verify that an anonymous visitor and a signed-in account not present in `admin_users` cannot modify `hero_content` or upload/delete objects in `hero_images`. The bucket is public: do not upload private or sensitive images. Existing broad Storage policies can grant additional access, so review any pre-existing policies that apply to all buckets.
