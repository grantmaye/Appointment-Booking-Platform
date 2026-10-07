# The product story behind Atelier

Booking a useful conversation should be straightforward for the customer. For the software, however, “choose a time” hides several hard problems: two customers can choose the same opening, a longer appointment can overlap a shorter one, a retry can create a duplicate, and a failed reschedule can accidentally destroy the original reservation.

Atelier is a portfolio exploration of that tension. Its editorial cream, burgundy, and peach interface offers a calm studio experience while the service layer demonstrates how to preserve booking intent. This is a rationale based on the code, not a claim of actual customers, revenue, a commissioned studio, or a production history. The people, sessions, and prices in [model.ts](../src/lib/model.ts) are fictional.

## A hypothetical afternoon at a small studio

Imagine a two-person strategy studio offering introductions, deep dives, and working sessions. A prospective customer wants an hour with Maya. Another customer is looking at the same opening, and a returning customer needs to move a previously booked session.

With an ad hoc workflow, the studio might exchange several messages, maintain a shared sheet, and manually compare start and end times. The customer has to wait for confirmation. The coordinator must remember that a 90-minute session blocks three half-hour intervals. A duplicated submission or a move onto someone else's time becomes manual cleanup.

In Atelier's demonstration, the customer selects the session, provider, UTC studio day, and preferred display timezone. The server checks every block the session occupies, then commits the appointment and its claims together. A repeated creation request with the same key returns the same appointment. A move succeeds completely or leaves the old reservation intact. Those behaviors are implemented in [service.ts](../src/lib/service.ts) and backed by [SQL constraints](../src/lib/schema.ts).

The result is not a real studio reservation. It is an in-app confirmation in an anonymous demo workspace. No email, calendar invitation, provider message, or payment happens.

## Intended users and value

For a learner, Atelier makes transactions, idempotency, and time modeling concrete. For a reviewer, it offers a small enough codebase to trace a full user action and a serious enough domain to ask meaningful concurrency questions. For someone exploring booking-product design, it shows how a pleasant customer flow can communicate service length, localized time, and the consequences of a schedule change.

The intended benefit is fewer ambiguous booking states: a retry should not create a second appointment, a reschedule should not lose the first, and two overlapping reservations should not both succeed. No measured conversion increase, administrative savings, or production reliability is claimed.

| Before, in the hypothetical studio                         | After, in this implemented demo                            |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| Coordinate choices in separate messages                    | Session, provider, and opening in one flow                 |
| Compare times by hand                                      | Reserve every occupied 30-minute block                     |
| Wonder whether a retry duplicated a request                | Request key returns the original record                    |
| Delete an old slot before discovering a move is impossible | Transactional reschedule preserves the original on failure |
| Treat display timezone as a new appointment time           | Render one canonical UTC instant in the selected zone      |

The visual identity is purposeful: large editorial typography and studio-inspired forms keep the interaction approachable. The underlying rules remain server-side. See [booking.tsx](../src/components/booking.tsx) and [globals.css](../src/app/globals.css).

## Honest limitations

Each cookie workspace has its own capacity, so separate demo visitors do not compete for the same real calendar. Days are tomorrow through the next seven UTC studio days, with fixed 10:00–18:00 UTC hours. There are no holiday rules or provider-specific daylight-saving calendars. Saved records are not tied to an authenticated customer account. Prices are fictional display values.

A real rollout would need identity, provider ownership, shared capacity, cancellation and payment rules, notification delivery, and operational safeguards. The [technical manual](technical-manual.md) turns those limits into extension exercises rather than implying they already exist.

## A 60–90 second demo narration

**0–15 seconds:** “Atelier is a booking portfolio demo for a fictional studio. I can choose a 30-, 60-, or 90-minute session, a provider, and an opening. No payment is collected.”

**15–35 seconds:** Select a session and switch the display timezone. “The studio day is UTC. These labels translate the same instant into my selected timezone.” Enter a sample name and confirm. Point to the appointment record.

**35–55 seconds:** Reload, then reschedule the appointment. “The record persists. A move checks the entire destination range and commits the new reservation atomically; a conflict leaves the original intact.” If presenting a prepared conflict, show the old appointment still present.

**55–70 seconds:** Cancel through the dialog. “Cancellation releases capacity but retains the record and its event history. Replaying an old creation request does not resurrect it.”

**70–90 seconds:** “The core engineering is block-level uniqueness, a transaction, a retry key for creation, and a version for updates. This is a demo workspace, not a connected provider calendar. The manual explains the data model, test commands, and what real deployment would require.”

Keep the database test of competing writers ready as supporting evidence; the customer interface alone cannot prove concurrency correctness.
