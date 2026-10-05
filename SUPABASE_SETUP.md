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

The admin collection also displays Roots 01–04 directly from the existing storefront, including their uploaded images and descriptions. These website products participate in search, visibility filtering, and collection counts, and are marked read-only with a link to the website. They are not copied into the database, so deploying this change does not require importing or re-uploading them. Existing database products retain their edit and delete controls; matching names and image URLs are shown only once. If either source fails to load, the other remains available with a warning and a reload button.

In the admin product form, choose a cover photo, multiple additional photos, and optionally one MP4/WebM video. New media is uploaded to the public Supabase `product_images` bucket and is managed by the signed-in, allowlisted admin account.

The legacy Netlify image function remains for older integrations; current product media uploads use Supabase Storage.

The subscribers list is for newsletter signups, not order/customer records. The current storefront sends product enquiries to Instagram and does not import Instagram messages or customer/order history.

## Editable Hero Section

The repository is a static HTML/JavaScript website, not a React/Vite application. The existing design and admin sign-in flow have been retained.

1. In your existing Supabase dashboard, open **SQL Editor** and run the entire contents of `supabase/hero.sql`. If you installed the Hero Section before, run the updated script again to add the `image_urls` column. If setting up a fresh project, run `supabase/schema.sql` first; the Hero policies reuse its `is_loom7_admin()` function and `admin_users` allowlist.
2. The script creates or updates `hero_content` and the public `hero_images` storage bucket. It is rerunnable and does not reset saved content. No separate bucket creation or terminal command is needed. This dashboard step is required; deploying website files does not execute Supabase SQL automatically.
3. Sign in to `admin.html` with an existing allowlisted admin account and select **Hero Section**. Edit Title, Subtitle, Button Text, and Button Link. Add one or more JPEG, PNG, or WebP images up to 5 MB each. Remove images from the preview to exclude them, then select **Save Hero Section** to publish the ordered slideshow.
4. Reload the storefront to see the published content. Images crossfade every 4.5 seconds and loop continuously. With an empty table, a failed fetch, or an unavailable Supabase script, the default text and slideshow remain visible. A failed custom image is skipped, and an empty subtitle intentionally hides the subtitle text.

The Hero is a single record with UUID `00000000-0000-4000-8000-000000000001`; a database constraint prevents multiple competing Hero records. The `image_urls` array stores the ordered slideshow images, while `image_url` remains synchronized to the first image for compatibility. The admin uses an upsert so the first save creates the record and later saves update it. No seed row is needed. Public visitors can read Hero content and view public images, but only allowlisted admins can change content or upload/manage files. Button links only accept HTTP or HTTPS URLs.

Each uploaded image receives a unique filename to avoid stale browser/CDN caches. Leaving the upload field empty preserves the current slideshow. Failed saves attempt to remove newly uploaded files, while previously published images are retained to avoid breaking cached pages. Unused older images can be removed manually from **Storage → hero_images** after checking that their URLs are no longer used.

Verify an empty-table fallback, first save, text-only updates, adding and removing multiple slideshow images, an invalid upload, a failed image URL, and sign-out/sign-in. Also verify that an anonymous visitor and a signed-in account not present in `admin_users` cannot modify `hero_content` or upload/delete objects in `hero_images`. The bucket is public: do not upload private or sensitive images. Existing broad Storage policies can grant additional access, so review any pre-existing policies that apply to all buckets.

## Editable About Section

To edit the homepage About section, run the entire `supabase/about.sql` script in the Supabase SQL Editor after `supabase/schema.sql`. The script creates the `about_content` table, the public `about_images` bucket, and row-level security policies for public reads and allowlisted-admin writes. It is safe to rerun and does not overwrite saved content.

Sign in to `admin.html`, select **About Section**, edit the label, headline, paragraph, Instagram button text/link, image, and image alt text, then select **Save About Section**. Image uploads accept JPEG, PNG, or WebP up to 5 MB. Leave the image field empty to keep the current image. Reload the homepage to see saved changes. Until an About record is saved, the current static About content and image remain as the fallback.

Only allowlisted admins can change About content or upload files. The image bucket is public so visitors can load the image; do not upload private or sensitive files. Replaced images are retained so cached pages are not broken; remove old files from **Storage → about_images** only after confirming their URLs are no longer used.

## Editing products

Every product in the admin collection, including the built-in Roots 01–04 cards, has an **Edit** button. It opens a dialog where you can change the product title, description, optional INR price, available sizes, and media. Check or uncheck S, M, L, and XL to control which sizes customers can select. Visibility is changed directly from the product table using the toggle under **Status**. Move a product to **Trash** from its row actions; Trash lets you restore it or permanently delete it and its stored media.

1. In the Supabase **SQL Editor**, run the entire contents of `supabase/products.sql` (after `schema.sql`). It is rerunnable and preserves saved product order. Run the updated script again to add product gallery and video fields, Trash/restore/permanent deletion fields, and allow image/video assets in the `product_images` bucket. The bucket accepts JPEG, PNG, WebP, MP4, and WebM files up to 25 MB (the admin limits each image to 3 MB). It also supports the shared product order, `website_key`, optional INR `price`, `available_sizes` (defaults to S, M, L, and XL), the `hidden_website_product_keys()` function, and admin-only storage writes.
2. Cover images, gallery photos, and product videos are uploaded to the `product_images` bucket. Replaced or removed media is deleted after the database update succeeds. If saving fails, newly uploaded files are cleaned up. Images uploaded earlier through Netlify Blobs keep working and are left in place.
3. When you edit a built-in Roots card for the first time, a matching product record is created with its `website_key` (for example `roots-01`). From then on, the storefront shows the edited title, description, and image for that card, or hides it when the Status toggle is set to Hidden. Moving it to Trash removes it from the storefront; restoring it returns it to the collection. Permanently deleting a built-in card retains a hidden database tombstone so the original static card does not reappear.

Use the up/down arrows in the admin collection to change the order of active products. Uploaded products can be moved above or between the Roots products. The positions are saved to Supabase and applied by the storefront on its next load. Trashed products are excluded from the storefront and active collection ordering. If Supabase is unavailable, the original static collection remains visible.
