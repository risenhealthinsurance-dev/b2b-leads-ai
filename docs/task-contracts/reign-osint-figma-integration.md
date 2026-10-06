# REIGN OSINT Figma Integration Contract

## Scope

- Port the approved Figma Make intelligence-layer experience into the existing Next.js app.
- Preserve the existing OpenRouter, Serper, website inspection, and Google Sheets integrations.
- Add ZIP/quadrant/rep context to the existing search request and response.
- Replace manager-console and field-execution UI language with discovery, enrichment, coverage, and sales-intelligence language.
- Keep persistence session-based and Google Sheets-backed; do not add a database in this change.

## Non-goals

- No route optimization, visit execution, dispatch workflow, manager approval workflow, or field-sales mobile application.
- No new external database, authentication system, or migration.
- No replacement of the existing OpenRouter or Serper providers.
- No private purchasing-history or Amazon Business account inference.

## File boundaries

Allowed to change:

- `app/page.jsx`
- `app/globals.css`
- `app/layout.jsx`
- `app/api/search/route.js`
- `lib/ai.js`
- `lib/serper.js`
- `package.json`
- `test/**`
- `docs/task-contracts/reign-osint-figma-integration.md`

## Acceptance criteria

- The default UI is the REIGN OSINT intelligence workspace with no Manager Console navigation or manager-only language.
- The search bar submits natural-language prompts to the existing `POST /api/search` endpoint.
- Search requests carry ZIP, quadrant, and rep context without breaking `{ prompt }` callers.
- The AI extraction contract returns location/category plus optional ZIP, quadrant, rep, coverage intent, and supply categories.
- Returned leads include stable identifiers, quadrant context, enrichment status, source/freshness metadata, and existing intelligence fields.
- The UI shows list-first results, a visible map panel, coverage progress, loading/error/empty states, and a profile drawer.
- Observed facts, inferred signals, recommendations, and unknown values remain visually distinct.
- No UI claims exhaustive coverage when the response cannot verify it.
- Google Sheets saving remains functional.
- Automated tests, serial production build, `git diff --check`, and browser QA pass.

## Ordered execution plan

1. Add failing unit tests for request extraction, response normalization, and coverage-state safety.
2. Implement the search contract and safe normalization in AI/search helpers.
3. Refactor the page and styles to the approved Figma intelligence-layer layout.
4. Preserve and verify Google Sheets export behavior.
5. Run automated checks, build, and browser visual QA at desktop and narrow widths.
6. Prepare the branch for GitHub PR and Vercel preview validation.

## QA commands

- `npm test`
- `npm run build`
- `git diff --check`

## Rulings

- Coverage is session-based in this merge because the repository has no durable database. The API must expose measured counts and an explicit unknown state instead of inventing completeness.
- The existing prototype changes are treated as intentional design input and will be refactored in place; no destructive reset is permitted.
