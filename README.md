# CiobyTakashi — Cloudflare starter package

A minimalist editorial + product-discovery website with a private publishing dashboard.

**Brand:** CiobyTakashi  
**Tagline:** Things Worth Checking Out  
**Administrator allowlist:** `cioby.takashi@gmail.com`

## Important security architecture

The admin UI is at `/admin/`. Protect this path and the admin API paths `/api/admin/*` with a Cloudflare Access self-hosted application and an **Allow** policy that includes only `cioby.takashi@gmail.com`. Do not create a public registration flow.

The Worker additionally verifies the Cloudflare Access JWT and checks its email against `ADMIN_EMAIL`. Set these Worker secrets/vars:
- `ADMIN_EMAIL=cioby.takashi@gmail.com`
- `CF_ACCESS_TEAM_DOMAIN=https://YOUR-TEAM.cloudflareaccess.com`
- `CF_ACCESS_AUD=YOUR_ACCESS_APPLICATION_AUD_TAG`

The admin interface is not secure until Access is configured and the two `CF_ACCESS_*` values are set. The app deliberately denies admin API access if they are missing.

## Cloudflare resources

Create:
1. A D1 database named `ciobytakashi-db`.
2. An R2 bucket named `ciobytakashi-images`.
3. A Cloudflare Access application covering the admin URL/path and `/api/admin/*`, with only the email above allowed.

Update `wrangler.jsonc`:
- Replace `REPLACE_WITH_D1_DATABASE_ID` with the ID returned by `wrangler d1 create`.
- Keep the R2 bucket name in sync with the bucket you create.
- Set the Access team domain and application audience in Worker variables.

## Deploy (computer/terminal required)

This ZIP is the source project. It is not a direct-upload static ZIP: the backend requires Wrangler deployment and Cloudflare resource bindings.

1. Install Node.js on a computer.
2. Extract this ZIP and open a terminal in the extracted folder.
3. Run `npm install`.
4. Run `npx wrangler login`.
5. Create D1: `npx wrangler d1 create ciobytakashi-db`; copy the returned database ID into `wrangler.jsonc`.
6. Create R2: `npx wrangler r2 bucket create ciobytakashi-images`.
7. Apply schema: `npx wrangler d1 migrations apply ciobytakashi-db --remote`.
8. Configure the Cloudflare Access application and its allow policy.
9. Set Worker variables `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` in Cloudflare, then deploy with `npm run deploy`.

## Admin publishing

After deployment and Access configuration, visit `/admin/` and sign in with the allowed email. Cloudflare Access One-time PIN can be used as the login method. There is no in-app sign-up or account creation.

The admin dashboard supports drafts, publishing, editing, deleting, categories, affiliate URLs, and image uploads (JPG/PNG/WEBP/GIF up to 5 MB).

## Current scope / notes

- Posts are stored in D1; uploaded images are stored in R2 and served through `/media/`.
- Public visitors can only read published posts.
- This starter does not include rich-text editing, analytics, comments, or search yet.
- Review and customize the privacy and affiliate disclosure copy before launch.
- Configure a custom domain in Cloudflare when ready.
- Do not put passwords, API tokens, or secrets in public files or commit them to source control.
