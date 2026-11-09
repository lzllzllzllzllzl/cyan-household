# Cyan — Household Inventory Management

An English-language course prototype for **ECOM7121, Cyan — Climbing Cat**. The goal is to reduce avoidable household food waste and duplicate buying through a clearer inventory and human-approved meal planning.

**Live application:** https://cyan-household.vercel.app

**Source repository:** https://github.com/lzllzllzllzllzl/cyan-household (private).

## Run locally

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. The API runs on port 3001. The configured local `.env` connects to the isolated Neon project `cyan-household` in Singapore. It contains private credentials and must not be submitted or committed.

For another machine, copy `.env.example` to `.env`, enter a Neon PostgreSQL connection string, then run the commands above. The server creates its tables automatically. Repeated starts preserve accounts and their data.

## Create an account and sign in

Open the app and choose **Create account**. Enter an email or any username and any non-empty password. There are no email-format, verification, or password-complexity requirements. Registration opens your new kitchen immediately.

Each account starts with an empty inventory and its own preferences, meal plans, chat, activity and feedback. Add food, sign out using the account bar, and sign in again to continue. Usernames are case-insensitive; passwords are case-sensitive and spaces are preserved.

Accounts are stored in Neon. Passwords use individually salted scrypt hashes. A seven-day opaque session is stored as a hash in Neon and held in an HttpOnly, SameSite cookie. Signing out revokes that session. Every inventory and AI-context query uses the account associated with the session; the browser cannot select another account by supplying a household ID.

The original sample kitchen is stored in Neon and is now linked to an editable sample account:

- Username: **demo@cyan.example**
- Password: **demo**

Choose **Try demo** at the far right of the login tabs to open this account immediately, without entering credentials. You can also sign in manually with the account above. The sample inventory, meal plans and history remain editable in Neon. Use the pencil action to edit a food item. Use the minus action to record **Used** or **Discarded** quantities. To remove an entire batch from the active inventory, discard its full remaining quantity; the historical record stays in Neon.

Run `npm run seed:demo` to connect this account on another configured database. It preserves existing sample data and never resets an existing owner's password. Normal registrations still start with their own empty inventories.

```bash
npm test
npm run test:accounts
npm run build
npm start
```

After a production build, `npm start` serves both the frontend and API at **http://127.0.0.1:3001**.

## Deploy on Vercel

The Vite frontend and Express API deploy together using `vercel.json` and `api/index.js`. The API runs in Singapore with a 60-second execution limit. HTTPS sessions use Secure, HttpOnly cookies, and write requests accept only the current site's origin.

Configure these server-side variables in Vercel for Production and Preview:

- `DATABASE_URL`: the pooled Neon PostgreSQL connection string, including its database credentials.
- `AI_API_KEY`: the model provider's private API key.
- `AI_BASE_URL`: `https://api.deepseek.com/v1`.
- `AI_MODEL`: `deepseek-flash`.

No Neon administrative API key is needed to run the application. Do not prefix secrets with `VITE_`; they must stay on the server. Preview and Production use the same database unless a separate Preview connection string is configured.

Connect the GitHub repository in Vercel. Pushes to `main` deploy Production; other branches create Preview deployments. The existing sample account and all registered users persist in Neon across deployments.

The production project uses Node.js 24. Production and Preview have all four variables configured as Secrets. GitHub is connected to the Vercel project `cyan-household`.

## What works

- Account registration, sign-in, persistent sessions, sign-out, and separate data for every account.
- Persistent inventory: categories, batch quantities, units, storage locations, package dates, date labels, allergen labels and condition flags.
- Recording dates are saved automatically by Neon when food is added, using the household time zone for display. A recognition batch shows today's recording date once; no per-item date entry is needed. Package expiry dates are separate, optional fields with an English `YYYY-MM-DD` placeholder.
- Add and edit food; log use or discard; searchable and filterable inventory.
- Upload a grocery image, receipt, or text description; review and correct recognition drafts before saving.
- Use-first reminders in the dashboard and notification panel.
- Meal suggestions from available stock with a current package date or explicit condition/storage review, and approved wellbeing preferences.
- Confirm a cooked meal to deduct ingredients in a PostgreSQL transaction. Stock, date status, condition and preferences are checked again at cooking time. Duplicate recording is rejected.
- English assistant chat with inventory context and human approval for proposed preference changes.
- Household preferences, time zone, activity trail, and feedback queued for human review.

## AI modes and setup

The app starts in **clearly labeled demo mode** if no model key is configured. Image recognition returns fictional example items without analyzing the upload; chat uses simple demonstration rules; meals come from inventory-matched recipe templates. Demo output is not evidence of live AI execution.

To enable a real model, edit the private `.env`:

```dotenv
AI_API_KEY=your-provider-key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

Restart the server. Use an OpenAI-compatible provider supporting image inputs and JSON responses. The key stays on the backend. The app sends the submitted image/description and, for meal planning or chat, inventory and preferences to that provider. Use fictional data for the assignment.

The current local configuration uses **DeepSeek Flash** at `https://api.deepseek.com/v1` with model ID **`deepseek-flash`**. The requested name `deepseek-v4.1-flash` was rejected by the provider; its models endpoint lists `deepseek-flash` and `deepseek-v4-pro`. Direct text and valid PNG image requests succeeded. Live grocery-description parsing, inventory-aware chat, and generation of three validated meal plans also succeeded through the app API; the plans were persisted in Neon. Flash thinking mode is disabled for this interactive app so it can return concise JSON promptly. The private API key is stored only in `.env`.

## Assignment architecture

These are three **bounded operational roles**, not autonomous background agents:

| Assignment label | App behavior | Authority |
| --- | --- | --- |
| A — Sensing | Image/text capture, detection draft, date signals | May propose entries; cannot save unreviewed detection |
| B — Seizing | Inventory matching and wellbeing-aware meal drafts | May propose meals; cannot automatically deduct stock |
| C — Reconfiguring | Feedback collection and visible review queue | May record improvement requests; cannot change rules or retrain itself |
| D1 — Approval / stop | Human review before food is added | User checks quantity, package date and labels |
| D2 — Approval / stop | Explicit preference approval and cooked-meal confirmation | Server validates restrictions and stock again |
| E — Feedback / learning | Audit trail and pending feedback | Feedback is evidence for human review; it is not automatic learning |

No scheduled reminders, automatic purchases, sharing or food rescue deliveries are included. Dates organize stock; neither dates nor photos establish food safety. Past-date and flagged items are excluded from plans. Undated food requires explicit condition/storage review in the item form; recognition never grants that review. Recording dates never become expiry dates. Recorded package dates cannot be removed or extended through editing. New purchases are separate batches.

Allergens are checked against stored labels and conservative food-name matches. This is not a complete allergen database and cannot verify traces, cross-contamination or storage. Health suggestions are general inspiration, not clinical advice or calculated nutritional targets.

## Six-frame classroom demonstration

1. **Local problem and user:** create an account for a fictional Hong Kong household that forgets groceries during a busy week. Public value: less avoidable waste; private benefit: fewer duplicate purchases. The prototype does not claim validated local impact.
2. **Signal received:** upload groceries or a receipt. Show the recognition draft and its uncertainty. In demo mode, explicitly state that the output is simulated.
3. **Coordinated action:** review the draft, verify printed dates, save food, and prepare use-first meal ideas.
4. **Unexpected change:** tell Cyan “I would like more protein,” or mark an ingredient “Check needed.” Show how the request changes planning constraints.
5. **Verification and safeguard:** approve a preference change explicitly. Attempt to record a stale meal using a flagged item; the backend rejects it. Attempt to extend a package date; the backend rejects it.
6. **Outcome and feedback:** record a valid cooked meal, show the updated stock and activity trail, then submit a workflow improvement. Show that feedback remains pending review.

Possible evaluation measures: inventory correction rate, time spent reviewing recognition, confirmed food-use events, and self-reported duplicate purchases avoided. The dashboard counts recorded actions; it does not invent money saved or kilograms of waste prevented. Household size provides context; each suggested plan specifies its own servings.

## Implementation and limits

React + Vite frontend, Express API, Zod validation, and PostgreSQL via Neon. Database tables are prefixed `cyan_`, including `cyan_users` and `cyan_sessions`. Secrets are excluded by `.gitignore`; model calls are server-side; SQL values use parameters. The server binds to localhost and checks browser origins.

This version supports a separate kitchen for each registered account. Shared-account membership, email verification and password recovery are outside this version's scope. Hosting uses Vercel with Neon storage. Recipe photography is illustrative, not evidence of the suggested meal's exact ingredients. Recipe images are compressed static WebP assets served by the app; Google Fonts still requires network access.

Recipe planning uses 16 ingredient/preparation templates in `recipe-catalog.js`. All core ingredients must be eligible and in stock. The text model selects candidates and adjusts portions and instructions; the API checks candidate identity, ingredient IDs, units, quantities, allergies and diet. If no template matches, the model can suggest a snack or side using available food. Invalid responses or provider failures fall back to inventory rules. Suggestions are separate alternatives; cooking revalidates against current inventory and preferences.

Photos are generated once, visually reviewed, then compressed into `public/recipes`. They are not generated during requests or stored as base64 in Neon. The server chooses their static URL from ingredients and preparation, ignoring model-provided URLs. Unmatched dishes use a clearly labeled ingredient illustration. `generate-recipe-photos.py` is an optional maintenance script for the text-to-image endpoint, requiring Pillow; it rejects the service's temporary generation image. Normal development does not need it.

The login illustration is also a static asset (`public/kitchen-hero.webp`). All food photos ship with the Vercel deployment and load from the application's own public origin, without ByteDance authentication or a runtime image-generation service. Base64 is not needed for public access; it is an encoding rather than a hosting or access-control mechanism. First-time access to the hosted website still requires an internet connection.

Verification: `npm test` runs nine unit tests for credentials, password hashing, inventory and meal restrictions. With the server running, `npm run test:accounts` registers two temporary accounts, checks session revocation and data isolation, verifies food persists through logout/login, then removes only its own fixtures.

Source files: `src/main.jsx`, `src/styles.css`, `src/auth.css`, `server/index.js`, `server/auth.js`, `server/db.js`, `server/ai.js`, and `server/domain.js`.
