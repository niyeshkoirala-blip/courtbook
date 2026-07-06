/**
 * §11.5 release gate: 100 concurrent POST /bookings on ONE slot →
 * exactly one 201, ninety-nine 409. Zero double bookings, ever.
 *
 *   node scripts/race-test/seed.mjs            # seed users + slot
 *   k6 run scripts/race-test/race.k6.js        # fire
 */
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const input = JSON.parse(open('./race-input.json'));
const API = __ENV.API_URL || 'http://localhost:3000/api/v1';

export const options = {
  scenarios: {
    race: {
      executor: 'per-vu-iterations',
      vus: input.tokens.length, // 100 VUs, all aimed at the same slot
      iterations: 1,
    },
  },
  thresholds: {
    booked: ['count==1'], // THE gate: exactly one winner
    conflicts: [`count==${input.tokens.length - 1}`],
  },
};

const booked = new Counter('booked');
const conflicts = new Counter('conflicts');

export default function () {
  const res = http.post(
    `${API}/bookings`,
    JSON.stringify({ courtId: input.courtId, date: input.date, startMin: input.startMin }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.tokens[__VU - 1]}`,
      },
    },
  );
  if (res.status === 201) booked.add(1);
  if (res.status === 409) conflicts.add(1);
  check(res, { '201 or 409 only': (r) => r.status === 201 || r.status === 409 });
}
