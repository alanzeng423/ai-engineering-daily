# AI Engineering Daily

A compact daily digest for high-quality writing and discussions about LLMs,
AI agents, coding agents, software engineering, and AI4SE.

The site is designed for a daily publishing workflow: a scheduled task gathers
and verifies the previous day's sources, produces structured digest data, and
publishes it through Git for an automatic site deployment.

## Local development

Requires Node.js 22.13 or later.

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

Run the build and rendered-page checks with:

```bash
npm test
```

## Current status

The website interface is complete and currently uses fixture content. The
scheduled JSON publishing pipeline will be added next.

## Stack

- Next.js-compatible app routing through vinext
- React and TypeScript
- Cloudflare-compatible build output
