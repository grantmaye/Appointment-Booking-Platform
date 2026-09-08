'use client';
import { useCallback, useEffect, useState } from 'react';
import { useDialog } from './use-dialog';
import { ArrowRight, Check, Clock, MoveUpRight, X } from 'lucide-react';
import { request } from '@/lib/client';
import type { Appointment, services as serviceType, providers as providerType } from '@/lib/model';
type Data = {
  services: typeof serviceType;
  providers: typeof providerType;
  days: string[];
  appointments: Appointment[];
  storageMode: string;
};
type Slot = { startsAt: string; available: boolean };
const query =
  '{dashboard{services{id name description duration price} providers{id name role initials} days appointments{id serviceId providerId customer startsAt endsAt status version createdAt events{kind at detail}} storageMode}}';
export default function Booking() {
  const [data, setData] = useState<Data | null>(null),
    [serviceId, setService] = useState('strategy'),
    [providerId, setProvider] = useState('maya'),
    [day, setDay] = useState(''),
    [slots, setSlots] = useState<Slot[]>([]),
    [time, setTime] = useState(''),
    [zone, setZone] = useState('America/New_York'),
    [customer, setCustomer] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<Appointment | null>(null),
    [cancel, setCancel] = useState<Appointment | null>(null),
    [requestKey, setRequestKey] = useState('');
  const closeDialog = useCallback(() => setCancel(null), []);
  useDialog(Boolean(cancel), closeDialog);
  async function refresh() {
    const r = await request<{ dashboard: Data }>(query);
    setData(r.dashboard);
    setDay((d) => d || r.dashboard.days[0]);
    return r.dashboard;
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    setRequestKey(crypto.randomUUID());
  }, []);
  useEffect(() => {
    if (!day) return;
    let alive = true;
    setTime('');
    request<{ slots: Slot[] }>(
      'query Slots($providerId:ID!,$serviceId:ID!,$day:String!){slots(providerId:$providerId,serviceId:$serviceId,day:$day){startsAt available}}',
      { providerId, serviceId, day },
    )
      .then((r) => {
        if (alive) setSlots(r.slots);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [day, providerId, serviceId, data]);
  const service = data?.services.find((s) => s.id === serviceId);
  const provider = data?.providers.find((p) => p.id === providerId);
  const format = (value: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(
      new Date(value),
    );
  const dateLabel = (value: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      month: 'short',
      day: 'numeric',
      weekday: 'short',
    }).format(new Date(value));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!time) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (editing) {
        await request(
          'mutation Change($id:ID!,$version:Int!,$startsAt:String){change(id:$id,version:$version,startsAt:$startsAt){id}}',
          { id: editing.id, version: editing.version, startsAt: time },
        );
        setMessage('Your appointment has been moved.');
        setEditing(null);
      } else {
        await request('mutation Book($input:BookingInput!){book(input:$input){id}}', {
          input: { serviceId, providerId, startsAt: time, customer, requestKey },
        });
        setMessage('You’re on the calendar. Your confirmation is below.');
        setRequestKey(crypto.randomUUID());
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="atelier">
      <header>
        <a className="brand" href="/">
          atelier<span>TIME, WELL SPENT.</span>
        </a>
        <nav>
          <a href="#booking">
            Book a session <MoveUpRight size={12} />
          </a>
          <a href="#appointments">Your appointments</a>
          <span className="demo">PORTFOLIO DEMO</span>
        </nav>
      </header>
      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">A LITTLE SPACE FOR YOUR NEXT BIG THING</p>
            <h1>
              Good things
              <br />
              take <em>your time.</em>
            </h1>
            <p className="hero-copy">
              A conversation. A fresh perspective. A plan.
              <br />
              Choose a session and let’s make room for it.
            </p>
            <a className="hero-link" href="#booking">
              Find your next opening <ArrowRight size={18} />
            </a>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit one" />
            <div className="orbit two" />
            <div className="orbit three" />
            <span className="art-top">
              LESS RUSH.
              <br />
              MORE INTENTION.
            </span>
            <span className="art-bottom">A / 01</span>
            <span className="art-word">
              make
              <br />
              <em>space.</em>
            </span>
          </div>
        </section>
        <div className="ribbon">
          <span>One-to-one sessions</span>
          <span>30 / 60 / 90 minutes</span>
          <span>Instant in-app confirmation</span>
          <span>No payment collected in this demo</span>
        </div>
        <section id="booking" className="booking-section">
          <div className="section-title">
            <span>01 / THE APPOINTMENT</span>
            <h2>{editing ? 'A change of plans.' : 'Let’s find your moment.'}</h2>
            <p>
              {editing
                ? 'Choose a new time. Your original booking stays reserved until the move succeeds.'
                : 'Three simple choices. One useful conversation.'}
            </p>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="confirmation" role="status">
              <Check size={18} />
              {message}
            </p>
          )}
          {!data ? (
            <p>Preparing the studio calendar…</p>
          ) : (
            <div className="booking-layout">
              <div className="choices">
                <div className="step-heading">
                  <span>01</span>
                  <h3>What brings you here?</h3>
                </div>
                <div className="services">
                  {data.services.map((s, i) => (
                    <button
                      key={s.id}
                      disabled={!!editing}
                      className={`service ${serviceId === s.id ? 'selected' : ''}`}
                      onClick={() => {
                        setService(s.id);
                        setRequestKey(crypto.randomUUID());
                      }}
                    >
                      <span className="service-number">0{i + 1}</span>
                      <div>
                        <h4>{s.name}</h4>
                        <p>{s.description}</p>
                        <span>
                          <Clock size={12} />
                          {s.duration} minutes <i>·</i> ${s.price}
                        </span>
                      </div>
                      <b>{serviceId === s.id ? <Check size={17} /> : <ArrowRight size={17} />}</b>
                    </button>
                  ))}
                </div>
                <div className="step-heading">
                  <span>02</span>
                  <h3>Pick your person.</h3>
                </div>
                <div className="providers">
                  {data.providers.map((p, i) => (
                    <button
                      key={p.id}
                      disabled={!!editing}
                      className={providerId === p.id ? 'selected' : ''}
                      onClick={() => {
                        setProvider(p.id);
                        setRequestKey(crypto.randomUUID());
                      }}
                    >
                      <span className={`portrait portrait-${i}`}>{p.initials}</span>
                      <strong>{p.name}</strong>
                      <small>{p.role}</small>
                      {providerId === p.id && <Check size={14} />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="calendar">
                <div className="step-heading">
                  <span>03</span>
                  <h3>Choose a little space.</h3>
                </div>
                <div className="calendar-caption">
                  <strong>The next seven days</strong>
                  <span>Studio days in UTC</span>
                </div>
                <div className="days">
                  {data.days.map((d) => (
                    <button
                      key={d}
                      className={day === d ? 'selected' : ''}
                      onClick={() => {
                        setDay(d);
                        setRequestKey(crypto.randomUUID());
                      }}
                    >
                      <small>
                        {new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
                          weekday: 'short',
                          timeZone: 'UTC',
                        })}
                      </small>
                      <strong>{d.slice(-2)}</strong>
                    </button>
                  ))}
                </div>
                <label className="timezone">
                  Show times in
                  <select
                    aria-label="Display timezone"
                    value={zone}
                    onChange={(e) => setZone(e.target.value)}
                  >
                    <option value="America/New_York">New York</option>
                    <option value="America/Los_Angeles">Los Angeles</option>
                    <option value="Europe/London">London</option>
                    <option value="UTC">UTC</option>
                  </select>
                </label>
                <div className="times">
                  {slots.map((s) => (
                    <button
                      key={s.startsAt}
                      aria-label={`${format(s.startsAt)}${s.available ? '' : ' unavailable'}`}
                      disabled={!s.available}
                      className={time === s.startsAt ? 'selected' : ''}
                      onClick={() => {
                        setTime(s.startsAt);
                        setRequestKey(crypto.randomUUID());
                      }}
                    >
                      {format(s.startsAt)}
                    </button>
                  ))}
                </div>
                <p className="availability-note">
                  Availability is checked again when you confirm. Studio hours are 10:00–18:00 UTC
                  daily.
                </p>
                <form className="booking-summary" onSubmit={submit}>
                  <div>
                    <span>YOUR SESSION</span>
                    <h3>{service?.name}</h3>
                    <p>
                      {provider?.name} · {service?.duration} minutes
                    </p>
                  </div>
                  <strong className="price">
                    ${service?.price}
                    <small>demo price</small>
                  </strong>
                  <p className="selected-time">
                    {time
                      ? `${dateLabel(time)} at ${format(time)}`
                      : 'Select an available time above.'}
                  </p>
                  {!editing && (
                    <label>
                      Your name
                      <input
                        aria-label="Your name"
                        required
                        minLength={2}
                        maxLength={80}
                        value={customer}
                        placeholder="Use a sample name"
                        onChange={(e) => {
                          setCustomer(e.target.value);
                          setRequestKey(crypto.randomUUID());
                        }}
                      />
                    </label>
                  )}
                  <button className="primary" disabled={!time || busy}>
                    {busy ? 'Saving…' : editing ? 'Confirm new time' : 'Confirm appointment'}
                    <ArrowRight size={16} />
                  </button>
                  {editing && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setEditing(null);
                        setTime('');
                      }}
                    >
                      Keep original appointment
                    </button>
                  )}
                  <small className="disclaimer">
                    Sample studio. No charge, email, or calendar invitation is sent.
                  </small>
                </form>
              </div>
            </div>
          )}
        </section>
        <section id="appointments" className="appointments">
          <div className="section-title">
            <span>02 / YOUR CALENDAR</span>
            <h2>Something to look forward to.</h2>
            <p>Your bookings stay here when you return in this browser.</p>
          </div>
          {!data?.appointments.length ? (
            <div className="empty">
              <span>NOTHING ON THE CALENDAR. YET.</span>
              <p>Make a little room for yourself above.</p>
            </div>
          ) : (
            data.appointments.map((a) => (
              <article key={a.id} className={a.status === 'CANCELLED' ? 'cancelled' : ''}>
                <div className="date-block">
                  <span>
                    {new Date(a.startsAt).toLocaleDateString('en-US', {
                      month: 'short',
                      timeZone: zone,
                    })}
                  </span>
                  <strong>
                    {new Date(a.startsAt).toLocaleDateString('en-US', {
                      day: 'numeric',
                      timeZone: zone,
                    })}
                  </strong>
                </div>
                <div className="appointment-info">
                  <span className="status">{a.status}</span>
                  <h3>{data.services.find((s) => s.id === a.serviceId)?.name}</h3>
                  <p>
                    {a.customer} with {data.providers.find((p) => p.id === a.providerId)?.name}
                  </p>
                  <small>
                    {format(a.startsAt)}–{format(a.endsAt)} · {zone}
                  </small>
                  <details>
                    <summary>Booking history</summary>
                    {a.events.map((e, i) => (
                      <p key={i}>
                        {e.kind}: {e.detail}
                      </p>
                    ))}
                  </details>
                </div>
                {a.status === 'CONFIRMED' && (
                  <div className="appointment-actions">
                    <button
                      onClick={() => {
                        setEditing(a);
                        setService(a.serviceId);
                        setProvider(a.providerId);
                        setTime('');
                        setMessage('');
                        document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      Reschedule
                    </button>
                    <button onClick={() => setCancel(a)}>Cancel</button>
                  </div>
                )}
              </article>
            ))
          )}
        </section>
        <section className="closing">
          <p>
            More intention.
            <br />
            <em>Less back-and-forth.</em>
          </p>
          <span>
            A considered calendar experience.
            <br />
            Made to respect everyone’s time.
          </span>
        </section>
      </main>
      <footer>
        <span>atelier / A PORTFOLIO BOOKING EXPERIENCE</span>
        <span>{data?.storageMode ?? 'Connecting'} · Fictional providers</span>
      </footer>
      {cancel && (
        <div className="overlay">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Cancel appointment"
            className="modal"
          >
            <button
              aria-label="Close cancellation"
              onClick={() => setCancel(null)}
              className="close"
            >
              <X />
            </button>
            <h2>Free up this moment?</h2>
            <p>
              Cancel the appointment at {format(cancel.startsAt)}? The time will become available
              again.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await request(
                    'mutation Cancel($id:ID!,$version:Int!){change(id:$id,version:$version){id}}',
                    { id: cancel.id, version: cancel.version },
                  );
                  setCancel(null);
                  setEditing(null);
                  await refresh();
                  setMessage('Appointment cancelled. The time is available again.');
                } catch (e) {
                  setError((e as Error).message);
                  setCancel(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Yes, cancel appointment
            </button>
            <button className="text-button" onClick={() => setCancel(null)}>
              Keep appointment
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
