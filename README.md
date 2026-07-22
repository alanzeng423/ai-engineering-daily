# AI Engineering Daily

A compact daily digest for high-quality writing and discussions about LLMs,
AI agents, coding agents, software engineering, and AI4SE.

Production: <https://ai-engineering-daily.alanzeng423.workers.dev>

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

## Content workflow

The website renders only validated data from `content/latest.json`. Each issue
is also stored in `content/digests/YYYY-MM-DD.json`, while
`content/index.json` tracks the available dates.

To validate and publish a generated draft:

```bash
npm run digest:validate -- content/inbox/YYYY-MM-DD.json
npm run digest:publish -- content/inbox/YYYY-MM-DD.json
npm test
```

The daily automation follows this workflow, commits only the published content
files, and pushes `main`. Cloudflare Workers Builds then deploys that commit.

## Deployment

The Cloudflare Worker is named `ai-engineering-daily`. Its Git build settings
are:

- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npm run deploy`

## Stack

- Next.js-compatible app routing through vinext
- React and TypeScript
- Cloudflare-compatible build output
- Versioned JSON content with validation and atomic publishing
