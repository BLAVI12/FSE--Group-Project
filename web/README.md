This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Authentication setup

Copy `.env.example` to `.env.local` and provide the Supabase project URL and
publishable key. Never place the service-role key or the Google client secret in
the web application.

Email/password login and Google OAuth are available on `/login`. Google must be
enabled under **Supabase > Authentication > Providers**, and these URLs must be
configured:

- Google authorized redirect URI:
  `https://<project-ref>.supabase.co/auth/v1/callback`
- Supabase local redirect URL: `http://localhost:3000/auth/callback`
- The equivalent HTTPS callback for the production domain

The Next.js proxy refreshes Supabase cookies and redirects unauthenticated
visitors away from `/dashboard`. The dashboard also verifies the user on the
server before rendering.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
