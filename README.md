# Saarly Admin Web

Standalone Next.js admin dashboard for Saarly. It is separate from the Flutter app and ready for Vercel.

## Local Run

```powershell
cd "F:\Workspace\01_Clients\saarly\Saarly\Admin Web"
npm install
copy .env.example .env.local
npm run dev
```

Fill `.env.local` with:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for protected admin write actions

## Vercel Environment Variables

Add the same variables in Vercel Project Settings. `SUPABASE_SERVICE_ROLE_KEY` must stay server-only and must never be exposed as a public key.

## Supabase Auth Redirects

Add the deployed Vercel URL and local URL to Supabase Auth redirect URLs:

- `http://localhost:3000`
- `https://your-admin-domain.vercel.app`
- `https://admin.saarly.app` if used

## Access Model

- `admin` sees all sections.
- `support_agent` sees allowed support sections based on `support_agents.permissions`.
- Sensitive writes go through `/api/admin/action`, which verifies the signed-in user is an admin before using the service role key.

## Database status

The required production database upgrades for this delivered version are already applied. Do not run bundled SQL or migrations again merely when deploying this Admin Web package.

## V9 notes

- Shared admin tables become readable mobile cards below 820px, without horizontal table scrolling.
- Desktop tables remain unchanged.
- Email retry invokes `process-admin-email-events` from the protected server route using the existing Vercel `SUPABASE_SERVICE_ROLE_KEY`.



## V10 notes

- Email history is rendered as complete responsive cards on desktop and mobile, so the monetization email section never needs horizontal scrolling.
- Retrying an email targets only the selected event and invokes the live Supabase email worker immediately.
- The Hostinger SMTP worker auto-detects SMTP configuration and reports the exact missing setting or authentication error instead of the old generic provider message.
