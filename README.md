# AI Engineering Daily

A compact daily digest for high-quality writing and discussions about LLMs,
AI agents, coding agents, software engineering, and AI4SE.

Production: <https://ai.alanzeng.com>

Latest issue: <https://ai.alanzeng.com/today>

Fallback: <https://ai-engineering-daily.alanzeng423.workers.dev>

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

The website renders a cumulative, validated catalog from `content/catalog.json`.
The catalog deterministically combines a curated historical foundation in
`content/baseline.json` with every issue stored in
`content/digests/YYYY-MM-DD.json`. `content/latest.json` remains the exact
latest issue, while `content/index.json` tracks all available digest dates.
The `/today` route renders only `content/latest.json` and includes that issue's
editorial overview as a compact daily summary.

The broad editorial areas overlap and define discovery scope rather than a
fixed taxonomy. Each story uses a concise, content-specific primary topic and
flexible cross-cutting tags. It also records a normalized `sourceType` so the
site can display a recognizable platform icon for papers, posts, repositories,
newsletters, and blogs.

To validate and publish a generated draft:

```bash
npm run digest:validate -- content/inbox/YYYY-MM-DD.json
npm run digest:publish -- content/inbox/YYYY-MM-DD.json
npm run catalog:build
npm test
```

The publish command rebuilds `content/catalog.json` automatically. The daily
automation follows this workflow, checks new candidates against both the
historical baseline and recent issues, commits only the published content
files, and pushes `main`. Cloudflare Workers Builds then deploys that commit.
Its versioned prompt is stored in `automation/daily-digest-prompt.md`.

## Research run archive

Every automation run has a separate, append-only local archive under
`research/runs/YYYY-MM-DD/<run-id>/`. A rerun never reuses the previous run
directory. The archive contains:

- `retrievals/*.json`: one immutable record for every search, feed/API request,
  repository lookup, social lookup, and original-source read;
- `queries.json`: the complete query ledger and its retrieval batch IDs;
- `candidates.json`: the normalized candidate pool, including duplicates;
- `verification.json`: date checks, access results, source metadata, evidence,
  and rejection reasons for every candidate;
- `scores.json`: the score breakdown or an explicit reason why a candidate was
  not scored;
- `selection.json`: all selected and rejected candidate IDs and the constraints
  used for the decision;
- `digest.json`: the exact final digest before publication;
- `checks.json`, `manifest.json`, and `events.ndjson`: command, Git, deployment,
  lifecycle, count, failure, and stage records.

These research artifacts and `content/inbox/` drafts stay local and are ignored
by Git, so they are not exposed by the public repository or website. Published
digests remain versioned in Git.

Initialize and validate a run with:

```bash
npm run research:init -- YYYY-MM-DD
npm run research:validate -- research/runs/YYYY-MM-DD/<run-id>
npm run research:validate -- research/runs/YYYY-MM-DD/<run-id> --complete
```

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
