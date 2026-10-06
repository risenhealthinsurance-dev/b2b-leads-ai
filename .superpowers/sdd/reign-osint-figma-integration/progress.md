# SDD ledger — plan: docs/task-contracts/reign-osint-figma-integration.md

Setup: feature branch `feat/reign-osint-figma-integration` created from the current working tree. Existing `app/page.jsx` and `app/globals.css` modifications preserved.

Pre-flight: shared interfaces are the `/api/search` request/response consumed by `app/page.jsx`, and the AI extraction/normalization helpers consumed by `app/api/search/route.js`. Coverage persistence is intentionally session-only per contract.

Task 1: complete — search contract tests pass; request/response normalization, prompt fallback, bounded OpenRouter calls, and quadrant-aware Serper scope implemented.
Task 2: complete — Figma intelligence-layer UI integrated into Next.js; manager-console and field-execution UI removed; list/map/profile/coverage states implemented.
Task 3: complete — serial tests, lint, build, diff validation, live API verification, and desktop browser QA completed.

Ruling: Keep coverage totals unknown unless the source measures them — prevents the UI from claiming exhaustive ZIP coverage based only on a bounded Serper result set.
Ruling: Use deterministic prompt extraction when OpenRouter returns safety text or empty required fields — preserves live search availability while keeping model-derived enrichment confidence-labeled.
