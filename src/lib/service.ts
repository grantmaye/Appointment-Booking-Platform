import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database, Sql } from './database';
import { services, providers, days, candidateSlots, DomainError, type Appointment } from './model';
const inputSchema = z.object({
  serviceId: z.string(),
  providerId: z.string(),
  startsAt: z.string(),
  customer: z.string().trim().min(2).max(80),
  requestKey: z.string().uuid(),
});
function editor(role: string) {
  if (role === 'VIEWER') throw new DomainError('Viewer mode cannot change bookings.', 'FORBIDDEN');
}
function validateSlot(providerId: string, serviceId: string, startsAt: string) {
  const service = services.find((s) => s.id === serviceId);
  if (
    !service ||
    !providers.some((p) => p.id === providerId) ||
    !candidateSlots(startsAt.slice(0, 10), service.duration).includes(startsAt)
  )
    throw new DomainError('Select a valid appointment in the next seven studio days.');
  return service;
}
const blocks = (start: string, duration: number) =>
  Array.from({ length: duration / 30 }, (_, i) =>
    new Date(new Date(start).getTime() + i * 1800000).toISOString(),
  );
export class Service {
  constructor(public db: Database) {}
  async initialize(workspace: string) {
    await this.db.query('INSERT INTO workspaces(id) VALUES($1) ON CONFLICT DO NOTHING', [
      workspace,
    ]);
  }
  async dashboard(workspace: string) {
    return {
      services,
      providers,
      days: days(),
      appointments: (
        await this.db.query<{ data: Appointment }>(
          "SELECT data FROM appointments WHERE workspace_id=$1 ORDER BY data->>'startsAt',id",
          [workspace],
        )
      ).map((r) => r.data),
      storageMode: this.db.mode,
    };
  }
  async slots(workspace: string, providerId: string, serviceId: string, day: string) {
    const service = services.find((s) => s.id === serviceId);
    if (!service || !providers.some((p) => p.id === providerId))
      throw new DomainError('Unknown service or provider.');
    const occupied = await this.db.query<{ starts_at: Date | string }>(
      'SELECT starts_at FROM occupied_slots WHERE workspace_id=$1 AND provider_id=$2',
      [workspace, providerId],
    );
    const set = new Set(occupied.map((r) => new Date(r.starts_at).toISOString()));
    return candidateSlots(day, service.duration).map((startsAt) => ({
      startsAt,
      available: blocks(startsAt, service.duration).every((b) => !set.has(b)),
    }));
  }
  async ensureFree(
    tx: Sql,
    w: string,
    p: string,
    start: string,
    duration: number,
    exclude?: string,
  ) {
    const occupied = await tx.query(
      'SELECT appointment_id FROM occupied_slots WHERE workspace_id=$1 AND provider_id=$2 AND starts_at=ANY($3::timestamptz[]) AND appointment_id<>$4',
      [w, p, blocks(start, duration), exclude ?? ''],
    );
    if (occupied.length)
      throw new DomainError('That time was just booked. Choose another opening.', 'CONFLICT');
  }
  async claim(tx: Sql, w: string, a: Appointment, duration: number) {
    for (const b of blocks(a.startsAt, duration))
      await tx.query(
        'INSERT INTO occupied_slots(workspace_id,provider_id,starts_at,appointment_id) VALUES($1,$2,$3,$4)',
        [w, a.providerId, b, a.id],
      );
  }
  async book(workspace: string, role: string, input: unknown) {
    editor(role);
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success)
      throw new DomainError('Provide a name, service, provider, time and request key.');
    const p = parsed.data;
    const payload = JSON.stringify({
      serviceId: p.serviceId,
      providerId: p.providerId,
      startsAt: p.startsAt,
      customer: p.customer,
    });
    return this.db.transaction(async (tx) => {
      await tx.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [workspace]);
      const [existing] = await tx.query<{ data: Appointment; request_payload: string }>(
        'SELECT data,request_payload FROM appointments WHERE workspace_id=$1 AND request_key=$2',
        [workspace, p.requestKey],
      );
      if (existing) {
        if (existing.request_payload !== payload)
          throw new DomainError('This request key belongs to different booking details.');
        return existing.data;
      }
      const service = validateSlot(p.providerId, p.serviceId, p.startsAt);
      const [{ count }] = await tx.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM appointments WHERE workspace_id=$1',
        [workspace],
      );
      if (count >= 100) throw new DomainError('This demo supports 100 appointments per workspace.');
      await this.ensureFree(tx, workspace, p.providerId, p.startsAt, service.duration);
      const now = new Date().toISOString();
      const appointment: Appointment = {
        id: randomUUID(),
        serviceId: p.serviceId,
        providerId: p.providerId,
        customer: p.customer,
        startsAt: p.startsAt,
        endsAt: new Date(new Date(p.startsAt).getTime() + service.duration * 60000).toISOString(),
        status: 'CONFIRMED',
        version: 1,
        createdAt: now,
        events: [{ kind: 'BOOKED', at: now, detail: `Booked ${p.startsAt}` }],
      };
      await tx.query(
        'INSERT INTO appointments(workspace_id,id,request_key,request_payload,data) VALUES($1,$2,$3,$4,$5::jsonb)',
        [workspace, appointment.id, p.requestKey, payload, JSON.stringify(appointment)],
      );
      await this.claim(tx, workspace, appointment, service.duration);
      return appointment;
    });
  }
  async change(
    workspace: string,
    role: string,
    id: string,
    version: number,
    startsAt: string | null,
  ) {
    editor(role);
    return this.db.transaction(async (tx) => {
      await tx.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [workspace]);
      const [row] = await tx.query<{ data: Appointment }>(
        'SELECT data FROM appointments WHERE workspace_id=$1 AND id=$2 FOR UPDATE',
        [workspace, id],
      );
      if (!row) throw new DomainError('Appointment not found.', 'NOT_FOUND');
      const old = row.data;
      if (old.version !== version)
        throw new DomainError('This appointment changed. Refresh and try again.', 'CONFLICT');
      if (old.status !== 'CONFIRMED')
        throw new DomainError('This appointment is already cancelled.');
      if (old.events.length >= 50)
        throw new DomainError('This demo supports 50 changes per appointment.');
      if (new Date(old.startsAt) <= new Date())
        throw new DomainError('Past appointments cannot be changed.');
      const service = services.find((s) => s.id === old.serviceId)!;
      if (startsAt) {
        validateSlot(old.providerId, old.serviceId, startsAt);
        await this.ensureFree(tx, workspace, old.providerId, startsAt, service.duration, id);
      }
      await tx.query('DELETE FROM occupied_slots WHERE workspace_id=$1 AND appointment_id=$2', [
        workspace,
        id,
      ]);
      const now = new Date().toISOString();
      const updated: Appointment = {
        ...old,
        startsAt: startsAt ?? old.startsAt,
        endsAt: startsAt
          ? new Date(new Date(startsAt).getTime() + service.duration * 60000).toISOString()
          : old.endsAt,
        status: startsAt ? 'CONFIRMED' : 'CANCELLED',
        version: old.version + 1,
        events: [
          ...old.events,
          {
            kind: startsAt ? 'RESCHEDULED' : 'CANCELLED',
            at: now,
            detail: startsAt ? `${old.startsAt} → ${startsAt}` : `Cancelled ${old.startsAt}`,
          },
        ],
      };
      await tx.query('UPDATE appointments SET data=$3::jsonb WHERE workspace_id=$1 AND id=$2', [
        workspace,
        id,
        JSON.stringify(updated),
      ]);
      if (startsAt) await this.claim(tx, workspace, updated, service.duration);
      return updated;
    });
  }
}
