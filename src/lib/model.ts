export const services = [
  {
    id: 'consult',
    name: 'The introduction',
    description: 'A focused conversation to define your next chapter.',
    duration: 30,
    price: 45,
  },
  {
    id: 'strategy',
    name: 'The deep dive',
    description: 'Make space for a thoughtful, practical working session.',
    duration: 60,
    price: 90,
  },
  {
    id: 'workshop',
    name: 'The working session',
    description: 'An extended session to turn an idea into a clear plan.',
    duration: 90,
    price: 135,
  },
];
export const providers = [
  { id: 'maya', name: 'Maya Brooks', role: 'Strategy & direction', initials: 'MB' },
  { id: 'leo', name: 'Leo Park', role: 'Systems & planning', initials: 'LP' },
];
export type Appointment = {
  id: string;
  serviceId: string;
  providerId: string;
  customer: string;
  startsAt: string;
  endsAt: string;
  status: 'CONFIRMED' | 'CANCELLED';
  version: number;
  createdAt: string;
  events: { kind: string; at: string; detail: string }[];
};
export class DomainError extends Error {
  constructor(
    message: string,
    public code = 'BAD_USER_INPUT',
  ) {
    super(message);
  }
}
export function days() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) =>
    new Date(d.getTime() + (i + 1) * 86400000).toISOString().slice(0, 10),
  );
}
export function candidateSlots(day: string, duration: number) {
  if (!days().includes(day)) return [];
  return Array.from(
    { length: (480 - duration) / 30 + 1 },
    (_, i) => new Date(`${day}T10:00:00.000Z`).getTime() + i * 1800000,
  ).map((ms) => new Date(ms).toISOString());
}
