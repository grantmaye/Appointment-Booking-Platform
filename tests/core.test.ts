import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/lib/database';
import { migrate } from '../src/lib/schema';
import { Service } from '../src/lib/service';
import { days, candidateSlots } from '../src/lib/model';
import { createApi, contextFor } from '../src/lib/graphql';
test('booking race, replay, overlap, atomic reschedule, cancellation and workspace isolation', async () => {
  const db = await createDatabase(process.env.TEST_DATABASE_URL);
  await migrate(db);
  const s = new Service(db),
    w = crypto.randomUUID(),
    other = crypto.randomUUID(),
    api = createApi();
  try {
    await s.initialize(w);
    await s.initialize(other);
    const starts = candidateSlots(days()[0], 60);
    const input = {
      serviceId: 'strategy',
      providerId: 'maya',
      customer: 'Sample Guest',
      startsAt: starts[0],
      requestKey: crypto.randomUUID(),
    };
    const results = await Promise.allSettled([
      s.book(w, 'OWNER', input),
      s.book(w, 'OWNER', { ...input, requestKey: crypto.randomUUID() }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const a = (await s.dashboard(w)).appointments[0];
    const success = results[0].status === 'fulfilled';
    if (success) {
      assert.equal((await s.book(w, 'OWNER', input)).id, a.id);
      await assert.rejects(s.book(w, 'OWNER', { ...input, customer: 'Other Guest' }));
    }
    await assert.rejects(
      s.book(w, 'OWNER', { ...input, startsAt: starts[1], requestKey: crypto.randomUUID() }),
    );
    const b = await s.book(w, 'OWNER', {
      ...input,
      startsAt: starts[4],
      requestKey: crypto.randomUUID(),
    });
    await assert.rejects(s.change(w, 'OWNER', a.id, 1, b.startsAt));
    assert.equal(
      (await s.dashboard(w)).appointments.find((x) => x.id === a.id)?.startsAt,
      starts[0],
    );
    await assert.rejects(s.change(other, 'OWNER', a.id, 1, null));
    await assert.rejects(s.change(w, 'VIEWER', a.id, 1, null));
    const moved = await s.change(w, 'OWNER', a.id, 1, starts[6]);
    assert.equal(moved.version, 2);
    await assert.rejects(s.change(w, 'OWNER', a.id, 1, null));
    await s.change(w, 'OWNER', a.id, 2, null);
    assert.equal(
      (await s.slots(w, 'maya', 'strategy', days()[0])).find((x) => x.startsAt === starts[6])
        ?.available,
      true,
    );
    await s.book(other, 'OWNER', { ...input, requestKey: crypto.randomUUID() });
    const response = await api.executeOperation(
      { query: '{dashboard{appointments{id events{kind}}}}' },
      { contextValue: contextFor(s, w, 'OWNER') },
    );
    if (response.body.kind === 'single') assert.equal(response.body.singleResult.errors, undefined);
  } finally {
    await api.stop();
    await db.close();
  }
});
