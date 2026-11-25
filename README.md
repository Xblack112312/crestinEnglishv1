This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Content management and video setup

Course content is stored as one `Content` document per course (modules and lessons
are embedded) and published content is an immutable `CourseRelease` snapshot.
All content-management mutations use POST; read endpoints use GET.

Configure the server-only Mux variables in `.env.example`. `MUX_TOKEN_ID` and
`MUX_TOKEN_SECRET` authorize server calls, `MUX_SIGNING_KEY_ID` and
`MUX_SIGNING_PRIVATE_KEY` create short-lived signed-playback tokens, and
`MUX_WEBHOOK_SECRET` verifies `POST /api/webhooks/mux`. Configure that URL in
Mux. `APP_ORIGIN` must match the browser origin used for Direct Upload CORS.

Videos are uploaded directly from the admin browser to Mux; the application
server never receives the media bytes. Videos use signed playback IDs only.
Mux generated captions/transcripts are enabled for English assets and are
stored with timestamped segments when Mux reports the generated track ready.
Arabic transcription needs a separate Arabic-capable transcription provider;
it is intentionally not faked by this implementation.

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
