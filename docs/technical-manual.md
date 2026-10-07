# Atelier technical manual

Atelier is a studio-booking portfolio application. Its cream, burgundy, and peach interface makes a small customer journey easy to follow; its backend demonstrates why booking correctness is more involved than saving a start time. The providers, services, customers used in demos, and prices are fictional. No payment or notification is delivered. Read the [product story](product-story.md) for the use case and presentation narrative.

## 1. Start with the customer journey

Run the app, choose one of the three sessions, choose Maya or Leo, select a UTC studio day, pick a display timezone and opening, and enter a sample name. Confirm the appointment. Reload to see persistence, reschedule it, then cancel it through the confirmation dialog. [booking.tsx](../src/components/booking.tsx) implements this entire flow.

A **slot** is a candidate starting time. An **occupied block** is a reserved 30-minute interval. A **transaction** is a group of database operations that all commit or all roll back. An **idempotency key** is a unique request identifier used to recognize retries. An **expected version** identifies the record snapshot a customer is trying to change.

The distinction between slot and block matters: a 90-minute session starting at 10:00 occupies 10:00, 10:30, and 11:00. Simply making `(provider, start)` unique would incorrectly allow another session at 10:30. Read [model.ts](../src/lib/model.ts), then the `blocks`, `ensureFree`, and `claim` functions in [service.ts](../src/lib/service.ts).

## 2. Run and configure it

Use Node 22.13 or newer and npm. CI uses Node 22.

```sh
npm ci
npm run dev -- --hostname 127.0.0.1 --port 43102
```

Open `http://127.0.0.1:43102`. For a production-mode local check:

```sh
npm run build
npm run start -- --hostname 127.0.0.1 --port 43102
```

No external account is required. Optional `.env.local` placeholders:

```dotenv
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DATABASE
APP_ORIGIN=https://atelier.example
PGLITE_DATA_DIR=./.data/atelier
```

Leave `DATABASE_URL` unset for embedded PGlite. PGlite runs PostgreSQL locally and persists in `.data/atelier` by default. External PostgreSQL uses a pool limited to eight connections. `APP_ORIGIN` is the exact public origin, including scheme and port; omit it for ordinary local use. A new `PGLITE_DATA_DIR` gives you a separate disposable data set without deleting the previous one. See [database.ts](../src/lib/database.ts).

The `atelier-workspace` cookie partitions sample bookings. It is an unsigned UUID with a seven-day lifetime, HTTP-only, SameSite Strict, and Secure on HTTPS requests. Clearing it creates another workspace; old records are not automatically removed. Bookings in two separate workspaces do not compete for capacity. That supports isolated demonstrations, not a real shared provider calendar.

A Node server is required. Static GitHub Pages cannot run the GraphQL backend. Embedded storage requires a persistent directory and is unsuitable as shared state across independent application instances. Use external PostgreSQL when testing multiple processes.

## 3. Source map

| File                                                                                               | Responsibility                                                                |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [app/page.tsx](../src/app/page.tsx), [layout.tsx](../src/app/layout.tsx)                           | Web entry and metadata                                                        |
| [app/globals.css](../src/app/globals.css)                                                          | Editorial studio layout and responsive identity                               |
| [components/booking.tsx](../src/components/booking.tsx)                                            | Selection state, timezone presentation, booking and cancellation forms        |
| [components/use-dialog.ts](../src/components/use-dialog.ts)                                        | Escape, focus containment, and restoration                                    |
| [lib/model.ts](../src/lib/model.ts)                                                                | Fictional catalog, appointment type, days and candidate slots                 |
| [lib/service.ts](../src/lib/service.ts)                                                            | Availability, retries, locking, overlap prevention, rescheduling              |
| [lib/schema.ts](../src/lib/schema.ts)                                                              | Workspace, appointment, and occupied-block constraints                        |
| [lib/database.ts](../src/lib/database.ts)                                                          | Shared SQL interface and two PostgreSQL adapters                              |
| [lib/graphql.ts](../src/lib/graphql.ts)                                                            | API contract and domain-error mapping                                         |
| [app/api/graphql/route.ts](../src/app/api/graphql/route.ts), [lib/client.ts](../src/lib/client.ts) | HTTP adapter and client requests                                              |
| [tests/core.test.ts](../tests/core.test.ts)                                                        | Race, replay, overlap, cancellation, isolation, and invalid-change assertions |
| [tests/e2e/workflow.spec.ts](../tests/e2e/workflow.spec.ts)                                        | Desktop/mobile customer workflow                                              |

## 4. Time and capacity contracts

The studio opens every day from **10:00 to 18:00 UTC**, with 30-minute start increments. Available studio days are tomorrow through seven days after the current UTC date. Today is excluded. A session must end by 18:00. The fictional services are 30, 60, and 90 minutes at displayed prices 45, 90, and 135; these are catalog values, not payment instructions.

The service validates the complete start string against `candidateSlots`. A canonical value looks like `2026-10-08T10:00:00.000Z`; clients should use values returned by `slots`, not assemble their own dates. Equivalent instants with different string formatting are not accepted as canonical candidate strings.

The browser uses `Intl.DateTimeFormat` for New York, Los Angeles, London, or UTC. Changing that selection changes labels, not stored instants or the studio's UTC business day. A local date can differ from the studio date. The confirmation includes the localized date to reduce ambiguity. This is not a complete timezone scheduling engine: provider-specific calendars, daylight-saving gaps/folds, holidays, buffers, and opening exceptions are absent. The deliberate UTC model is in [model.ts](../src/lib/model.ts).

## 5. Follow a booking through the system

```mermaid
sequenceDiagram
    participant UI as Booking form
    participant G as GraphQL resolver
    participant S as Service.book
    participant DB as PostgreSQL / PGlite
    UI->>G: BookingInput + requestKey
    G->>S: workspace + role + input
    S->>DB: BEGIN; lock workspace
    S->>DB: Find existing request key
    alt Same request already exists
        DB-->>S: Existing appointment + original payload
        S-->>UI: Return existing record
    else New request
        S->>S: Validate canonical slot and quota
        S->>DB: Check every occupied block
        S->>DB: Insert appointment and claim all blocks
        S->>DB: COMMIT
        S-->>UI: Confirmed record, version 1
    end
```

The browser's availability display is advisory. Only the transaction decides whether capacity can be reserved. Each booking/change locks the workspace row (`SELECT ... FOR UPDATE`) to serialize changes in that workspace. This coarse lock is simple and reliable for a tiny demo but would limit throughput for a large studio.

A 60-minute reschedule checks the destination while excluding the appointment's existing blocks, deletes the old block claims, writes the new appointment state, and inserts new claims within one transaction. If validation or insertion fails, rollback preserves the original appointment and its capacity. A reschedule can overlap its own old range because the old claims are excluded during validation.

## 6. Tables, API, and invariants

[Schema initialization](../src/lib/schema.ts) creates:

| Table            | Key and purpose                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `workspaces`     | `id` primary key, creation timestamp                                                                                   |
| `appointments`   | `(workspace_id,id)` primary key; unique `(workspace_id,request_key)`; original `request_payload`; current `data` JSONB |
| `occupied_slots` | `(workspace_id,provider_id,starts_at)` primary key; appointment foreign key; one row for each occupied block           |

**JSONB** is PostgreSQL's structured JSON type. The appointment document stores customer, service/provider IDs, canonical start/end timestamps, status, version, creation time, and an event list. SQL constraints protect capacity and ownership references; JSON field validity is primarily enforced by the service. Bootstrap `CREATE TABLE IF NOT EXISTS` is not a versioned migration framework.

Queries are `dashboard` and `slots(providerId, serviceId, day)`. Mutations are `book(input: BookingInput!)` and `change(id: ID!, version: Int!, startsAt: String)`.

```graphql
query Openings($provider: ID!, $service: ID!, $day: String!) {
  slots(providerId: $provider, serviceId: $service, day: $day) {
    startsAt
    available
  }
}
mutation Book($input: BookingInput!) {
  book(input: $input) {
    id
    startsAt
    endsAt
    status
    version
  }
}
mutation MoveOrCancel($id: ID!, $version: Int!, $startsAt: String) {
  change(id: $id, version: $version, startsAt: $startsAt) {
    id
    startsAt
    status
    version
    events {
      kind
      detail
    }
  }
}
```

Send one operation per HTTP request. A valid booking input has catalog `serviceId` and `providerId`, a returned `startsAt`, a trimmed 2–80-character sample `customer`, and a UUID `requestKey`.

`change` uses an explicit `null` (or omitted optional GraphQL argument) for cancellation. A non-null string is always a reschedule attempt. In particular, `""` is invalid: it must not cancel, increment the version, release capacity, or replace the stored start. The regression in [core.test.ts](../tests/core.test.ts) asserts rejection, record equality, and unchanged occupied capacity.

Important rules from [service.ts](../src/lib/service.ts):

- Same key and normalized creation payload returns the existing record. Same key with different details is rejected. The stored payload describes the original creation, even after later changes.
- Replaying a cancelled booking returns that cancelled record; it does not reserve again. A new booking requires a new request key.
- Versions increase on each successful change. A stale expected version returns `CONFLICT`.
- Cancelled and past appointments cannot be changed. Cancellation releases blocks but preserves history.
- The workspace quota is 100 appointment records, including cancelled ones. Event length is capped at 50; the initial booking event consumes one position.
- `VIEWER` cannot mutate. Every appointment lookup and capacity key includes the workspace.

For a read-only smoke check:

```sh
curl -sS -c /tmp/atelier-cookies -b /tmp/atelier-cookies \
  -H 'Content-Type: application/json' \
  --data '{"query":"{dashboard{days storageMode services{id duration} appointments{id version status}}}"}' \
  http://127.0.0.1:43102/api/graphql
curl -sS http://127.0.0.1:43102/api/health
```

GraphQL maps domain errors to `BAD_USER_INPUT`, `CONFLICT`, `NOT_FOUND`, or `FORBIDDEN`. HTTP rejects non-JSON (415), a mismatched Origin (403), malformed JSON (400), and raw text over 16,000 characters (413). The body is read before checking length. The GraphQL document limit is 150 fields, named fragment definitions are disabled, and one top-level mutation selection is allowed. These are bounded-demo controls, not complete denial-of-service protection.

## 7. Authentication and external boundaries

The customer interface uses demo operator access. The route derives a role from `x-demo-role`; callers can change that header. There is no verified customer/provider identity, membership, payment processing, calendar export, email, or authentication. The unsigned workspace cookie is not secure multi-tenancy. Do not put real client contact information into the demo.

“Confirmed” means an application record and block claims committed in this workspace. It does not mean a provider was contacted. The database health endpoint only executes `SELECT 1`; it does not test email delivery or a real provider calendar.

## 8. Tests and failure labs

```sh
npm run format:check
npm run typecheck
npm test
npm run build
npx playwright install chromium
PORT=43102 PGLITE_DATA_DIR=./.data/browser-check npm run test:e2e
```

Playwright starts an isolated production server and does not reuse a running server. Choose an unused port and stop any previous server there. It runs desktop and mobile viewports. There is no separate ESLint script; formatting, types, service tests, build, and browser workflows are the repository's checks.

The same service test runs against external PostgreSQL when given a **disposable test database**:

```sh
TEST_DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DISPOSABLE_TEST_DB npm test
```

Tests leave random-workspace data in that database. [CI](../.github/workflows/ci.yml) provisions PostgreSQL 17, tests both adapters, builds, and runs browsers. Embedded tests alone do not prove contention between real database connections.

| Lab                                 | Expected result and diagnostic path                                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two clients book the same opening   | Exactly one new record succeeds; the other gets `CONFLICT`. Inspect workspace lock, occupied block claims, and request keys. The service test performs this concurrently. |
| Retry after a lost response         | Resend the identical input and UUID; the existing record returns. Alter the customer with the same key; validation rejects reuse.                                         |
| Try moving onto another appointment | Error; original appointment timestamp and all old block claims remain. This demonstrates rollback rather than “delete then try again.”                                    |
| Send an empty change time           | `BAD_USER_INPUT`; the appointment and its occupied blocks remain unchanged. Only null is cancellation.                                                                    |
| Change from a stale tab             | `CONFLICT`; reload the current record and reconcile the intended change. Never retry automatically with a guessed version.                                                |
| Origin error behind a proxy         | Compare `APP_ORIGIN` with the browser's complete origin. The expected value must not contain a path or trailing slash.                                                    |
| Database cannot connect             | `/api/health` returns 503. Check host/credentials privately; restart after fixing a failed process-cached initialization.                                                 |

A browser failure trace is viewable with `npx playwright show-trace PATH_TO_TRACE.zip`. If a date-dependent test fails near UTC midnight, inspect the current seven-day window before suspecting timezone display code.

## 9. Tradeoffs, exercises, and solutions

Atelier keeps catalog and business hours in code so capacity correctness is visible without an admin subsystem. JSON documents reduce mapping code but constrain reporting. Coarse workspace locking is easy to reason about but is not a high-throughput provider-lock design. Prices are display-only; charging before or after a reservation would require an explicit payment state machine.

**Exercise: support provider-specific days off.** **Solution:** move calendar rules into persisted provider schedules; validate in both availability generation and the final booking transaction; test timezone boundaries and races with schedule changes. Updating the UI alone is insufficient.

**Exercise: send a confirmation email reliably.** **Solution:** add an outbox row in the booking transaction, then use a worker with idempotent delivery and retry state. An outbox is a durable queue stored alongside the business write. Calling email before commit can announce a booking that rolls back; calling it after commit without a queue can lose the notification.

**Exercise: remove the workspace-wide bottleneck.** **Solution:** design a provider/day locking strategy with a consistent lock order for moves, retain the unique occupied-block constraint, map constraint conflicts to domain errors, and test competing overlapping ranges on PostgreSQL. Measure contention before replacing the simple lock.

## 10. Interview questions

**Why not just check availability then insert?** Another request can book between the check and insertion. The transaction, lock, and unique block key jointly defend that interval.

**What is the difference between an idempotency key and a version?** The key recognizes a repeated creation command; the version rejects an update based on stale record state.

**Why retain cancelled appointments?** History and retry semantics depend on the original record. A retry should not resurrect a cancellation.

**Does changing timezone reschedule an appointment?** No. It changes rendering of the same stored UTC instant.

**What does the empty-string fix teach?** Truthiness is not a domain contract. `null` explicitly means cancel; malformed strings are errors, not destructive commands.

**What would make this a real booking product?** Verified identities, shared provider capacity, real timezone schedules, cancellation policy, payment holds, reliable notifications, privacy/retention controls, migrations, and operational recovery. None should be inferred from the polished customer interface.
