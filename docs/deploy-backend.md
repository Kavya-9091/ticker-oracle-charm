# Deploy the Backend API

GitHub Pages can host only the static frontend. The stock lookup and chatbot need a backend for:

- `POST /api/chat`
- `POST /api/snapshot`
- `POST /api/search`

This project already builds a Cloudflare Worker backend with those routes.

## Deploy with GitHub Actions

1. Create a Cloudflare API token with Worker deploy permission.
2. In GitHub, open `Settings -> Secrets and variables -> Actions -> Secrets`.
3. Add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. Run the workflow `Deploy Backend API`.
5. Copy the deployed Worker URL, for example:

```text
https://kavya-9091-ticker-oracle-charm.YOUR_SUBDOMAIN.workers.dev
```

6. In GitHub, open `Settings -> Secrets and variables -> Actions -> Variables`.
7. Add repository variable:

```text
VITE_API_URL=https://kavya-9091-ticker-oracle-charm.YOUR_SUBDOMAIN.workers.dev
```

8. Run the `Deploy GitHub Pages` workflow again.

## Deploy Locally

After logging in to Cloudflare Wrangler:

```powershell
npm run deploy:backend
```

Then set the same `VITE_API_URL` repository variable and rerun the GitHub Pages deploy.
