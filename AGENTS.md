# Aum Manage Stocks — Agent Guide

Retail shop back-office stock management platform (NestJS API + Next.js web, pnpm monorepo: `api/`, `web/`). Ground truth for all business rules is `SRS - Aum Manage Stocks.docx` — when this guide, the DBML, or the endpoint spreadsheet disagree with it, the SRS wins; flag the conflict instead of silently picking one.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) + TypeScript, Tailwind CSS, TanStack Query, shadcn/ui |
| Backend | NestJS + TypeScript, Prisma ORM, PostgreSQL |
| Realtime | Socket.io |
| AI | Ollama (every AI feature today) — `@anthropic-ai/sdk` is installed but not wired up yet |
| LINE | LINE Login (OAuth) + LINE Messaging API |
| Auth | JWT (access + refresh token), bcrypt, TOTP 2FA, Google + LINE OAuth |
| Payments | Stripe (PaymentIntents + Payment Element, no webhook) |
| Mail | Brevo transactional email HTTP API |
| File/Image storage | Cloudinary |
| Barcode scan | html5-qrcode (QR + EAN-13) |
| Deployment | Vercel (web) + Railway (api + PostgreSQL) — see Deployment below |

## Repo map

- `api/` — NestJS backend. `api/prisma/design/schema.dbml` is the reviewed ER diagram (source of truth for the data model, kept in sync with the SRS). `api/prisma/schema.prisma` is the actual Prisma schema — update both together when the model changes.
- `api/prisma/design/erd.drawio` — full ER diagram (every table, column and FK), generated from `schema.prisma`. Update it in the same PR whenever the schema changes.
- `web/` — Next.js frontend.
- **This file is the single source of team rules.** `api/` and `web/` each carry a thin `AGENTS.md` + `CLAUDE.md` that do nothing but `@`-import this one, so opening `api/` or `web/` on its own still loads the full guide. Add rules here, never to the stubs.
- `web/AGENTS.md` also holds a Next.js block between `BEGIN:nextjs-agent-rules` and `END:nextjs-agent-rules`. **`next dev` rewrites that block** — never edit inside it; team content goes below the end marker.

## Library versions

This is a **team project** — everyone installs from the committed `pnpm-lock.yaml`, which is the real pin. The table below is the intended version of each library; **update it in the same PR whenever you bump a dependency**, so nobody (human or agent) writes code against a different major.

Toolchain: **Node 24.x**, **pnpm 11.8.0** — pinned in `.nvmrc`, in the `engines` field of both `package.json` files, and enforced by `engine-strict=true` in `.npmrc`. An install on the wrong Node version **fails rather than warns**; run `nvm use` (it reads `.nvmrc`) instead of overriding it.

### `api/` — NestJS 11 + Prisma 7

| Library | Version | Purpose |
|---|---|---|
| `@nestjs/common` / `core` / `platform-express` | `^11.0.1` | framework |
| `@nestjs/config` | `^4.0.4` | env config |
| `@nestjs/jwt` | `^11.0.2` | access + refresh token |
| `@nestjs/mapped-types` | `^2.1.1` | `PartialType` for update DTOs |
| `prisma` / `@prisma/client` / `@prisma/adapter-pg` | `^7.9.1` | ORM (v7 requires a driver adapter) |
| `bcrypt` | `^6.0.0` | password hashing |
| `class-validator` / `class-transformer` | `^0.15.1` / `^0.5.1` | DTO validation (auth, users, admin, payments) |
| `nestjs-zod` | `5.5.0` (exact) | Zod DTOs + `ZodValidationPipe` (every other module) |
| `zod` | `^4.4.3` | runtime schema validation (LLM output, tool args) |
| `cloudinary` | `^2.10.0` | image upload |
| `google-auth-library` | `^11.0.2` | Google OAuth |
| `stripe` | `^22.5.0` | payments |
| `@nestjs/websockets` / `@nestjs/platform-socket.io` | `^11.2.1` | realtime gateway |
| `socket.io` | `^4.8.3` | realtime transport |
| `@nestjs/schedule` | `^6.1.3` | cron jobs (subscription expiry, unpaid-payment expiry) |
| `@anthropic-ai/sdk` | `^0.117.1` | Claude API — installed, **no code calls it yet** |
| `ollama` | `^0.6.3` | LLM client used by the chatbot parser and AI recommendations |
| `otplib` | `^13.4.1` | TOTP 2FA |
| `qrcode` (+ `@types/qrcode` `^1.5.6` dev) | `^1.5.4` | 2FA setup QR |
| `@types/multer` (dev) | `^2.2.0` | types for `Express.Multer.File` (image upload) |
| `@line/bot-sdk` | `^11.2.0` | LINE Messaging API |
| `typescript` | `^5.7.3` | — |

### `web/` — Next.js 16 + React 19

| Library | Version | Purpose |
|---|---|---|
| `next` / `eslint-config-next` | `16.3.1` (exact) | App Router |
| `react` / `react-dom` | `19.2.8` (exact) | — |
| `next-auth` | `5.0.0-beta.32` (exact) | installed but **not used** — sessions are our own httpOnly cookies set by route handlers (`web/src/lib/session-cookies.ts`) |
| `react-hook-form` / `@hookform/resolvers` | `^7.85.0` / `^5.9.0` | forms |
| `zod` | `^4.4.3` | shared schema language with the API |
| `@stripe/stripe-js` / `@stripe/react-stripe-js` | `^9.13.0` / `^6.8.1` | payments |
| `google-auth-library` | `^11.0.2` | Google OAuth |
| `lucide-react` | `^1.32.0` | icons (shadcn's default set) |
| `@tanstack/react-query` | `^5.101.4` | data fetching / cache |
| `socket.io-client` | `^4.8.3` | realtime |
| `html5-qrcode` | `^2.3.8` | barcode scanning (QR + EAN-13) |
| `leaflet` (+ `@types/leaflet` dev) | `^1.9.4` | shop location picker (OpenStreetMap tiles, no API key) — used directly, not through `react-leaflet` (unresolved StrictMode double-mount bug upstream) |
| `shadcn` (CLI) + `@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css` | see lockfile | UI components — installed by `shadcn init` |
| `tailwindcss` / `@tailwindcss/postcss` | `^4` | styling (Tailwind v4 — CSS-first config, no `tailwind.config.js`) |
| `typescript` | `^5` | — |

## Git workflow — non-negotiable

`main` is the release branch and `dev` is the integration branch. Both are protected by team rule.

1. **Never commit, push, merge, or rebase directly onto `main`. No exceptions.** Not even a one-line fix, not even a hotfix, not even "just this once". `main` only ever changes through an approved pull request.
2. **Never commit directly to `dev` either.** All work happens on a `feature/<resource>-resource` branch (see the ownership table below) and reaches `dev` through a pull request.
3. **Every merge into `dev` requires a pull request with at least one approving review from a teammate.** Do not merge your own PR without that approval, and never use admin override or force-merge to bypass it.
4. `main` receives changes **only** by pull request from `dev`, at release time, with team approval.
5. **Never force-push** (`--force`, `--force-with-lease`) to `main` or `dev`, and never rewrite history that has already been pushed to a shared branch.

### For agents working in this repo

- Check the current branch (`git branch --show-current`) before making commits. If it is `main` or `dev`, **stop and tell the user** — create or switch to the correct `feature/*` branch first, don't commit where you are.
- Only commit or push when the user explicitly asks. Opening a PR is an outward-facing action — confirm with the user before running `gh pr create`.
- Never merge a PR on the user's behalf; approval is a human step by a teammate.
- Branch naming: `feature/<resource>-resource`. Match the ownership table — don't invent a new branch name for work that already has one.

### Shared files — coordinate before touching

These sit on everyone's critical path, so a careless edit becomes a merge conflict for the whole team. Each has its own rule:

| File | Rule |
|---|---|
| `api/prisma/schema.prisma` | **Own PR, straight to `dev`, merged before anyone builds on it.** Never bundle a schema change inside a feature PR. Announce it — everyone must then pull `dev`, run `pnpm install` (regenerates the Prisma client), and `pnpm prisma db push`. |
| `api/prisma/design/schema.dbml` | Update in the **same PR** as `schema.prisma`. The two must never disagree. |
| `api/src/app.module.ts` | Add only your own module's import line. Don't reorder or reformat the file — that turns a one-line addition into a whole-file conflict. |
| Shared guards / decorators / interceptors / `PrismaService` | Owned by `feature/auth-resource` (แพรว). Need a change? Ask, don't fork a local copy. |
| `package.json` + `pnpm-lock.yaml` (both apps) | Dependency changes go in their **own small PR to `dev`**, early. Never bury them in a large feature PR. |
| `web/src/app/globals.css`, `web/components.json` | Theme is already set (see Design system). Only change with team agreement. |

**This project runs every command through pnpm.** Use `pnpm prisma …`, `pnpm exec …`, `pnpm <script>` — never `npx` or `npm run`. `npx` can resolve a different Prisma version than the one in `pnpm-lock.yaml`, which is how a client and a schema quietly drift apart.

**Schema workflow — the team uses `db push`, not `migrate dev`:**

- Sync your own database with **`pnpm prisma db push`**. Do not run `pnpm prisma migrate dev`, and do not add folders to `prisma/migrations/` during feature work.
- **Every time you pull `dev` and `schema.prisma` changed, run `pnpm prisma db push` again.** Nothing reminds you — a database that silently lags behind the schema is the failure mode of this workflow.
- Changing `schema.prisma` is still a **coordinated change**: own PR, announce it, everyone pulls and re-pushes.
- `prisma/sql/*.sql` holds constraints Prisma cannot express (e.g. the partial unique index on `products(owner_id, barcode)`). `db push` does **not** apply them, so `SqlScriptsRunner` runs every file on API boot and records it in `_sql_scripts`. Files must be re-runnable (`IF NOT EXISTS` / `ON CONFLICT`); put `-- @manual` at the top of a file to skip it and run it by hand.

> **Known debt — migrations.** `prisma/migrations/` holds two sets. The 6 `202608*` folders are the old history and **do not** build the current schema. The 6 `202609*` folders (from `20260902000000_baseline`) are อั้ม's rebuild from the current `schema.prisma`, the set the Railway database was built with. The old set is kept for the record, but both sets create the same tables, so `prisma migrate deploy` **fails** while both are present: on an empty database the baseline collides with the old tables, and on the Railway database Prisma tries to apply the 6 old folders it has never seen. Decide as a team before running `migrate deploy` from this repo; `db push` (daily work) and CI are unaffected.

## Deployment

- **Web** runs on Vercel, **API + PostgreSQL** on Railway. As of 2026-11-01 both are built from อั้ม's copy, `Aum40/aum_manage_stock` (`main` at `9fe519d`), not from this repo. Its database files (the rebuilt migrations and `api/scripts/seed-test-users.sql`) are now copied here. Still only in อั้ม's copy: a LINE webhook error-message fix (`643c27e`, `line-webhook.service.ts`), `APP_URL` in `web/.env.example`, and `.vscode/settings.json`. Only here: the landing-nav fix `c0c6cc9` and the README. Once the two match, point Vercel and Railway at this repo so there is one source of truth.
- `api/scripts/seed-test-users.sql` creates one account per role, **including `SUPER_ADMIN`, all with the same password written in the file**. Never run it on a database real users can reach. If it was run on the Railway database, delete those accounts or change their passwords.
- Production needs `APP_URL` on Vercel (the public origin used for OAuth redirect URIs) and `FRONTEND_URL` on Railway, and the two must match exactly.
- Step-by-step setup is in `README.md` → Deploy.

## Continuous integration

`.github/workflows/ci.yml` runs on every PR into `dev`/`main`: install with `--frozen-lockfile`, then lint, test and build for `api/`, and lint and build for `web/` (the web app has no tests yet). It never touches a database.

- `--frozen-lockfile` fails when `package.json` and `pnpm-lock.yaml` disagree, i.e. someone added a dependency without committing the lockfile. Commit both.
- **Make CI a required status check** in Settings → Branches, otherwise a red build can still be merged.
- If CI is red, fix the branch — never merge around it.

**After pulling `dev`, always run `pnpm install` in `api/`** — its `postinstall` runs `prisma generate`, and a stale client is the most common "it builds on my machine" failure here. If `pnpm install` reports "Already up to date" it skips `postinstall` too, so when the schema changed but your build still complains about missing models, run `pnpm prisma generate` directly.

## Module ownership & branches

Work is split by resource module, one feature branch each. **Stay inside your own module's files** — if a task needs a change in someone else's module, flag it rather than editing across the boundary, and coordinate before touching shared files (`schema.prisma`, `app.module.ts`, shared guards/decorators).

Branch naming: `feature/<resource>-resource`.

| Owner | Branch | Modules |
|---|---|---|
| แพรว | `feature/auth-resource` | `AuthModule`, `UsersModule` |
| แพรว | `feature/auth-resource (admin)` | `AdminModule` |
| แพรว | `feature/payments-resource` | `PaymentsModule` |
| พี่ปาน | `feature/subscriptions-resource` | `SubscriptionsModule` |
| พี่ปาน | `feature/shops-resource` | `ShopsModule` |
| อั้ม | `feature/staff-resource` | `StaffModule` |
| อั้ม | `feature/categories-resource` | `CategoriesModule` |
| เซิ่น | `feature/products-resource` | `ProductsModule` |
| เซิ่น | `feature/shop-products-resource` | `ShopProductsModule` |
| พี่ดิว | `feature/stock-movements-resource` | `StockMovementsModule` |
| พี่ดิว | `feature/sales-resource` | `SalesModule` |
| พี่ดิว | `feature/stock-movements-resource` | `StockModule` (adjust / transfer / recent, `StockLotsService`) |
| อั้ม | `feature/chatbot-resource` | `ChatModule`, `ChatCommandModule`, `LineModule` |
| อั้ม | `feature/ai-recommendations-resource` | `AiRecommendationsModule` (+ Socket.io gateway) |
| เซิ่น | `feature/notifications-resource` | `NotificationsModule` |
| เซิ่น | `feature/stock-lots` | lot-based cost (`stock_lots`, FIFO) |
| **ยังไม่ระบุ** (เขียนโดย git `zernpany-fs`) | `feature/dashboard-resource` | `DashboardModule` |
| **ยังไม่ระบุ** (เขียนโดย git `Parnellye`) | — | `UploadsModule` (Cloudinary image upload) |

Every module above is implemented. Owners for chatbot, AI recommendations, notifications and stock lots come from the `[ชื่อ]` tags in `schema.prisma` and the git history. `DashboardModule` and `UploadsModule` have **no agreed owner** — confirm one so someone answers for their bugs.

**The per-endpoint detail lives in `aum-manage-stocks.xlsx` (sheet `endpoint`), not here** — 98 rows of method/path/body/note that change as work progresses. Read that sheet before implementing an endpoint; treat it as the API contract and this table as the ownership map. Don't copy the endpoint list into this file — a stale copy is worse than no copy.

## Subscription model — fixed 3-tier, no à la carte quota

Free / Plus / Pro only. **Upgrading a plan is the only way to get more quota — there is no separate purchase of extra shops, products, or staff slots**, in any plan. Don't add features that let a user top up quota outside a plan upgrade.

| Plan | Price/yr | Shops | Active products | Staff quota | Chatbot | Barcode | AI Recommendations |
|---|---|---|---|---|---|---|---|
| Free | ฿0 | 1 | 100 | 0 | ✗ | ✗ | ✗ |
| Plus | ฿2,499 | 3 | 3,000 | 6 | ✓ | ✓ | ✗ |
| Pro | ฿3,499 | 5 | 5,000 | 10 | ✓ | ✓ | ✓ |

Notes:
- AI Chat (chatbot) is Plus **and** Pro. AI Recommendations is Pro **only** — these are not the same gate, don't conflate them.
- `staff_quota` is counted at the **account level**, not per shop: one staff member assigned to multiple shops of the same owner still counts as 1.
- When a paid plan expires, all of that owner's shops go **read-only** (viewable, not editable) until renewal. Free plan never expires and never goes read-only. Read-only is a computed state (from `status`/`expires_at`), not a stored column. `isSubscriptionReadOnly()` (`subscriptions/subscription-quota.util.ts`) computes it and `AccountContextService.assertNotReadOnly()` enforces it. There is no global guard, so **every write path must call it**. Products and categories both go through `AccountContextService.assertCanManageCatalog()`, which checks the staff `can_manage_product` permission and read-only together.

## Naming conventions — apply to new code, fix old code only when you touch it

Different people started different modules, so the codebase is not yet consistent. From here on, one rule per layer:

| Layer | Convention | Example |
|---|---|---|
| Prisma model | **PascalCase, singular** | `model Product`, `model ShopProduct` |
| Database table | snake_case, plural — via `@@map` | `@@map("products")`, `@@map("shop_products")` |
| Database column | snake_case — via `@map` | `ownerId String @map("owner_id")` |
| Prisma field | camelCase | `sellPrice`, `lowStockThreshold` |
| NestJS module dir | kebab-case, plural | `src/shop-products/` |
| NestJS class | PascalCase + role suffix | `ShopProductsService`, `ShopProductsController` |
| DTO file / class | kebab-case `.dto.ts` / PascalCase + `Dto` | `create-shop-product.dto.ts` → `CreateShopProductDto` |
| API path | kebab-case, plural nouns | `/shops/:shopId/shop-products` |
| Enum type / member | PascalCase / SCREAMING_SNAKE_CASE | `enum ShopStatus { ACTIVE, SUSPENDED }` |

**Known inconsistency**: `model categories` in `schema.prisma` breaks this (lowercase plural — it should be `model Category` with `@@map("categories")`). Renaming it is a `@@map`-only change that does not alter the database, but it does change the generated client (`prisma.categories` → `prisma.category`), so it must be a coordinated PR by the module owner (อั้ม), not a drive-by edit.

Validation is split — Zod (`nestjs-zod` / `ZodValidationPipe`) in most modules (shops, staff, categories, products, shop-products, stock, sales, chat, chat-command, dashboard, notifications, ai-recommendations), `class-validator` in auth, users, admin and payments. When adding a DTO, **follow the style the module already uses**; don't mix both in one module.

## Data model invariants

- **Central product catalog**: `products` belongs to the owner, not a shop. `shop_products` is the join table carrying per-shop `sell_price`/`stock_qty`/`low_stock_threshold`. The same product sold in multiple shops of one owner still counts as 1 toward the active-product quota.
- **`stock_movements` is an append-only ledger** — it's the source of truth for stock, never UPDATE/DELETE a row. `shop_products.stock_qty` is just a cache that must be updated in the same transaction as any movement insert.
- **Soft delete** everywhere for `products`, `shops`, `shop_staffs` (`removed_at`) — sales/stock history must never be lost.
- **`payments` and `admin_audit_logs` are append-only too** — a refund is a new `payments` row, never an update.
- **`stock_lots`** holds per-lot cost. Stock-out consumes the oldest lot first (FIFO, `StockLotsService.consume`) and writes the real cost to `stock_movements.unit_cost` and `sale_items.cost_price`. `shop_products.cost_price` is only the default for a new lot.
- **Shop paused vs suspended**: `shops.paused_at` is set by the owner (pause/resume); `status = SUSPENDED` is set by an admin only. Both block stock changes and sales.
- **`sale_items` snapshots** product name/price/cost at sale time — never join back to `shop_products` to render a historical bill; prices change.
- Barcode uniqueness is scoped to the owner's catalog (`owner_id + barcode`), not global.

## Permission checks — always two layers

Every action a `SHOP_STAFF` user takes on stock/product/chatbot/barcode/dashboard must pass **both**:
1. `staff_permissions` for that `shop_staff` row (per-shop, owner-granted; defaults to all-false on creation)
2. The owner's `subscription_plans` feature flags (plan-level gate, e.g. `chatbot_enabled`)

Passing only one is a bug even if the other passes — e.g. an owner can grant `can_use_chatbot` on a Free plan, but the plan-level gate must still block it.

Both layers are implemented. The plan flags are read by `ChatAccessService` + `PrismaStockAuthorizationAdapter` (`chatbot_enabled`), `PrismaSalesSubscriptionAdapter.assertBarcodeEnabled()` (`barcode_enabled`, scan only — typing a sale in is allowed on Free so the Basic Dashboard has data) and `AiAccessService` (`ai_recommendation_enabled`). Advanced dashboard reports use `DashboardAccessService.assertPaidPlan()`. Copy one of these when you add a gated action; don't assume the check happens upstream.

## Auth and sessions — what the shared guards actually do

Owned by `feature/auth-resource` (แพรว). Everyone's endpoints sit behind these, so changing them is a coordinated change, not a drive-by edit.

- **Every non-public route needs `Authorization: Bearer <accessToken>`.** The old `x-user-id` header is gone. Get a token from `POST /auth/login`, or from `POST /auth/2fa/verify` when the account has 2FA on.
- **`AuthGuard` does more than check the signature.** After verifying the JWT it looks the account up: soft-deleted gives `401`, suspended gives `403` with `code: "ACCOUNT_SUSPENDED"`. An access token is a signed blob, not a row, so it cannot be revoked — revoking refresh tokens only stops renewal, it does nothing to the token already in someone's hand. Without this lookup a deleted staff member keeps full write access until their token expires. It costs one indexed `select` per request; keep it.
- **`ACCESS_TOKEN_EXPIRES_IN` is 900 seconds and should stay short.** It was 86400, which made the window above a whole day. The web app renews through `POST /auth/refresh`, which *is* checked against the database. `.env` is not committed, so raising it on one machine silently weakens only that machine.
- **`@OwnerId()` resolves from the JWT**, not from a header: a `SHOP_OWNER` resolves to their own id, a `SHOP_STAFF` to `users.owner_id`, and an admin account is rejected with `403` because admins own no shop. Admin work goes through `/admin/*`.
- **2FA is enforced on every login channel** (SRS §111) — password, LINE and Google alike. `POST /auth/login`, `GET /auth/line/callback` and `GET /auth/google/callback` all return `{ requires2fa: true, challengeToken }` instead of tokens when the account has 2FA on. Never call `issueTokensForUser()` from a new login path; go through `completeLogin()`.
- **Email can be changed** through `POST /auth/email-change` (current password + a link sent to the new address). Owners only — `AuthService.requestEmailChange()` rejects `SHOP_STAFF` with `403` (SRS: staff can't edit their own account).
- **`POST /auth/2fa/disable` checks the password only when the account has one.** Accounts created through LINE or Google have `password = NULL` by design (SRS §89), so requiring it locked them out of ever turning 2FA off. `otpCode` or `recoveryCode` is always required — that plus the access token is already two factors.

## AI integration

Reference patterns live in the sibling project `../ollama/src` (client setup, structured JSON output, a zod-checked tool loop). Reuse them rather than reinventing.

**Chatbot stock commands** (Plus/Pro, web and LINE):

1. Free text ("เพิ่มโค้ก10") comes in from the web chat or the LINE webhook (`POST /webhooks/line`).
2. `FallbackStockCommandParser` uses `LlmStockCommandParser` (Ollama, output validated with zod) when `OLLAMA_HOST` and `OLLAMA_MODEL` are set, and falls back to `DeterministicStockCommandParser` when they aren't or the LLM call fails.
3. The result is saved as a `PendingAction` (`status = PENDING`, `expires_at` = now + `PENDING_ACTION_TTL_MINUTES`, default 15). Intents: `ADJUST_STOCK`, `SELL`, `TRANSFER_STOCK` (`destination_shop_id`). **Never hold it only in memory** — the LINE confirm arrives as a separate webhook request.
4. An ambiguous product name stores the candidates in `payload` and asks the user to pick. An owner with several shops on LINE is asked which shop first; that half-finished state lives in `chat_shop_prompts` (one row per user) because a `PendingAction` needs a `shop_id`.
5. On confirm: write `stock_movements` (and a `sale` for `SELL`) and update `shop_products.stock_qty` in one transaction, then mark the action `CONFIRMED`. Unconfirmed actions become `EXPIRED`.
6. A plan or permission rejection must tell the user the real reason, not "couldn't understand the command" (fixed for LINE in อั้ม's repo, `643c27e`, not merged here yet).

**AI Recommendations** (Pro only): `AiAccessService` checks `ai_recommendation_enabled` before calling the LLM. Results are generated **on request** (`POST /shops/:shopId/ai/recommendations/generate`), stored in `ai_recommendations`, and pushed to everyone viewing that shop through the Socket.io gateway. Never call the LLM while rendering a page.

**AI Chat on LINE**: allowed only while the account currently has `line_user_id` linked — checked live against `users`, not cached and not based on how the account signed up.

## Design system

Theme is matched to the Figma export (`aum_stock2.zip`, already extracted for reference) rather than shadcn defaults:

```css
--color-brand-orange: #F5A31C;  /* primary/accent */
--color-brand-dark:   #17161A;  /* text/dark */
--color-brand-cream:  #F3F0EA;  /* background */
--color-brand-border: #CFC9BB;
--color-brand-muted:  #EFECE5;
--color-status-green: #5C9A54;
--color-status-orange:#F5A31C;
--color-status-red:   #D65745;
```

Fonts: **Prompt** (headings), **Sarabun** (body), **IBM Plex Mono** (numbers/code) — loaded via `next/font/google` in `web/src/app/layout.tsx` with the `thai` subset, exposed as `--font-prompt` / `--font-sarabun` / `--font-ibm-plex-mono`.

**Already set up** — don't re-run `shadcn init`. `web/components.json` is configured as `base-nova` style, Base UI (`@base-ui/react`) primitives, Lucide icons, neutral base color, CSS variables on. The palette above is already mapped onto shadcn's tokens in `web/src/app/globals.css`:

- `primary` = brand orange, with a **dark** `primary-foreground` (white on `#F5A31C` fails contrast)
- `secondary` / `muted` / `accent` = the cream tones, `border` / `input` = `#CFC9BB`, `destructive` = `#D65745`
- `sidebar` uses cream in light mode, and the `chart-*` ramp is brand orange → green → red → border → ink
- raw brand tokens are also exposed as Tailwind utilities (`bg-brand-orange`, `text-brand-dark`, `text-status-red`, …) for cases where no shadcn token fits

Add components with `pnpm dlx shadcn@latest add <component>`; they inherit this theme automatically. Don't hardcode hex values in components — use the tokens.

## SRS alignment — already fixed, don't reintroduce

The DBML and the endpoint spreadsheet were reconciled against the SRS. These decisions are settled; if you see the old version somewhere, it is stale:

- **No add-on purchases.** `POST /payments/shop-addon` was removed, along with the `EXTRA_SHOP` payment purpose, `extra_shop_quota`, and `extra_shop_price_thb` in the DBML. Quota changes only by upgrading a plan (SRS §66/§110). Don't add an endpoint that sells extra shops, products, or staff slots.
- **2FA is opt-in for every role** (SRS §39) — never forced on Shop Owners or anyone else.
- **No downgrade flow, and no free upgrade path.** `POST /subscriptions/upgrade` and `POST /subscriptions/renew` were **removed** — they changed the plan without taking payment. A purchase now starts at `POST /payments/subscription-intent { planCode }` (`PLUS|PRO` only) and takes effect only in `POST /payments/:id/confirm`, which retrieves the PaymentIntent from Stripe and requires `succeeded` before calling `SubscriptionsService.applyUpgrade()` / `applyRenewal()`. **There is no Stripe webhook**; an hourly job closes payments left open for 24 hours. Plus → Pro mid-term charges the price difference and keeps the expiry date; renewal opens 30 days before expiry and extends from the old expiry date.
- **Admin can manage shops, not just users** — `GET /admin/shops`, `PATCH /admin/shops/:id/suspend|reactivate`, and `GET /admin/overview` were added to cover SRS §22/§76/§184/§185.
- **A Dashboard module exists** (`feature/dashboard-resource`) covering SRS §176–§182, which the original endpoint list omitted entirely. Basic Dashboard is available on Free; the combined-shops view and Advanced Reports are Plus/Pro only.

## When unsure

Cross-check the SRS (Google Doc "SRS - Aum Manage Stocks") before assuming a business rule — it is the single source of truth for requirements, ahead of this file, the DBML, or the endpoint spreadsheet. If they disagree, ask rather than guessing which one is current.
