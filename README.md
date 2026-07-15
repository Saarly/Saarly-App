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

## Optional Supabase Migration

Apply:

`F:\Workspace\01_Clients\saarly\Saarly-App\supabase\migrations\20260715120000_saarly_admin_web_readable_views.sql`

It adds extra readable views for Admin Web without changing existing app behavior.

