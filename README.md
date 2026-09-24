# EcoWorld portal deployment

## Current state

- The backend is deployed to the Supabase project **Ecoworld** (`lhqgdqqxmjemeahumelt`).
- `management@ecoworld.com` is active as Management. Its password stays in Supabase Auth.
- The portal is a static website. `index.html`, `css/`, `js/`, and `assets/` are its hosting files. The `supabase/` folder is source code for future backend changes; it is not needed on the website host.
- This setup starts fresh. No old browser submissions or drawings were imported.

## Publish the website

Recommended host: **Cloudflare Pages Direct Upload**. In Cloudflare, open **Workers & Pages → Create application → Get started → Drag and drop your files**. Upload `ecoworld-site.zip`, enter a project name, and deploy. Cloudflare will give you an HTTPS `pages.dev` address. The ZIP has `index.html` at its root and needs no build step. See [Cloudflare's Direct Upload guide](https://developers.cloudflare.com/pages/get-started/direct-upload/).

Once you have the public URL, open the Ecoworld Supabase dashboard → **Authentication → URL Configuration** and set **Site URL** to that exact HTTPS address. Add the same address to **Redirect URLs** if you later use email invitations or password reset links. See [Supabase's redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls).

## First use

1. Sign in as `management@ecoworld.com` with the password you set in Supabase Auth.
2. Open **Add/Edit** and add consultant accounts. Each new consultant needs a real email, a temporary password of at least eight characters, and an assigned project. Share credentials with consultants through your normal private channel.
3. Consultants sign in at the same website address. Their submissions and uploaded drawings are saved in Supabase.

## Backend layout

- `public.portal_profiles`: active roles and consultant project assignments.
- `public.portal_settings`: shared portal configuration.
- `public.portal_submissions`: submission data, versions, and edit permissions.
- Private Storage bucket `ecoworld-drawings`: uploaded PDFs and images.
- Edge Function `ecoworld-portal`: checks the signed-in user and handles database changes.

Browser access to the three portal tables is restricted. The browser includes only the public Supabase publishable key in `js/config.js`; do not place a secret or service-role key there. Keep the `supabase/` folder for maintenance and future migrations.

## Verified and remaining check

Verified on 24 September 2026: Management login, page refresh/session restore, saving a Pile Reference setting to Supabase, and rejection of an unauthenticated backend request. The site itself has not been published yet. A consultant account, a completed submission, and a drawing upload have not been tested end to end because the project starts without a consultant. Check that flow after adding the first real consultant.
