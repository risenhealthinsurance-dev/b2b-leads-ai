# Dual-Priority Lead Intelligence Task Contract

## Scope

Extend the existing lead search flow so each Serper business result receives structured OpenRouter analysis for payment processing, digital marketing, and Amazon business-supply opportunities. Render the new intelligence in the existing result cards.

## Non-goals

- No changes to API-key names or environment configuration.
- No changes to Serper search behavior or website filtering semantics.
- No changes to Google Sheets persistence beyond carrying the existing lead fields.
- No new dependencies unless the existing implementation cannot support the required behavior.

## File boundaries

Allowed to change:

- `lib/ai.js`
- `app/api/search/route.js`
- `app/page.jsx`
- `docs/task-contracts/dual-priority-lead-intelligence.md`

## Acceptance criteria

- OpenRouter receives the dual-domain analyst instructions and is required to return the specified JSON shape.
- Each returned lead includes `priority_1_marketing_and_processing` and `priority_2_amazon_supplies_inference`.
- The analysis uses available business name, address, phone, rating, website, and any available review metadata.
- Missing, invalid, or partial analysis does not crash the full search; safe defaults are returned and rendered.
- The UI visibly renders payment setup, processing opportunity, marketing flaws, marketing pitch, Amazon category, order-volume tier, SKUs, and supply pitch for each lead.
- Existing lead search, website filtering, and save-to-Sheets behavior remain intact.
- `npm run build` exits successfully.
- `git diff --check` exits successfully.

## Ordered execution plan

1. Add reusable dual-priority analysis and schema normalization in `lib/ai.js`.
2. Invoke analysis for returned leads in `app/api/search/route.js`, preserving existing lead fields and adding normalized intelligence.
3. Render both priority sections in `app/page.jsx` with safe empty-state handling.
4. Run build and diff validation; inspect the running app if the build succeeds.

## QA commands

- `npm run build`
- `git diff --check`
- Verify the local app responds on `http://localhost:3000` after restart.

## Data integrity

Treat processor, marketing, and purchasing details as inferences unless directly supported by supplied business data or inspected website signals.

