# Engineering walkthrough

## Follow a booking

The client sends book with a request key, service, provider, UTC start, and sample customer name. Apollo checks the shape; Zod checks runtime input. The service locks the workspace, checks for a previous request key, validates the requested slot, checks occupancy, inserts the appointment, and claims all occupied blocks in one transaction.

A 90-minute service occupies three 30-minute rows. The database primary key prevents two appointments in the same workspace from claiming the same provider block. The current service lock also serializes independent providers in a workspace, favoring clarity over throughput.

## Likely interview questions

**Why does checking availability first not prevent double bookings?** Two clients can read the same free time before either writes. Availability is a preview. The transaction and database uniqueness establish the booking guarantee.

**Why store occupied blocks?** All sample durations align to a 30-minute grid, so blocks provide a simple database-enforced overlap rule. Arbitrary durations would need range-overlap constraints or another interval-aware design. A unique start time alone would not prevent overlaps.

**What if rescheduling fails?** The new range is checked before old blocks are released. All changes still occur within one transaction, so any later failure rolls back the move and preserves the old appointment.

**How does idempotency work?** A workspace-scoped request key is unique. The canonical booking payload is stored with it. A matching replay returns the existing record; a different payload is rejected. The browser retains a key after request failure and creates a new one when booking details change or creation succeeds.

**How do timezones work?** UTC defines the studio schedule and stored instants. IANA zones only change presentation. This is intentionally simpler than provider-local recurring hours. DST-aware availability generation would need an explicit business calendar and ambiguity policy.

**Why GraphQL?** Services, providers, availability, and bookings have different client selections but share a typed boundary. It does not replace the transaction or make a reservation by itself. REST could also implement the workflow.

**Are prices charged?** No. Prices are illustrative catalog data. Real payments should use verified provider callbacks, idempotency, and a defined hold/expiration policy rather than trusting a browser success page.

**How is cancellation recorded?** It increments the version, appends an event, changes status, and releases occupied blocks atomically. Stale versions reject; repeated cancellation is not a no-op in this API.

## Practice

Book a 90-minute session and show that the adjacent starting times become unavailable. Open two tabs and attempt the same provider/time. Explain why exactly one booking should win. Reschedule to another opening, inspect history, then cancel and show availability returning. Do not claim external payment, email, or calendar integrations.
