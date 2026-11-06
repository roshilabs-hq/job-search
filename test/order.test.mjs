import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fairOrder } from '../lib/util.mjs';

test('fairOrder: one big company cannot fill the run, newest first within a company', () => {
  const big = { id: 'big' }, small = { id: 'small' };
  const jobs = [
    ...[1, 2, 3, 4].map(n => ({ id: `b${n}`, _company: big, postedAt: n })),
    { id: 's1', _company: small, postedAt: 0 },
  ];
  assert.deepEqual(fairOrder(jobs).slice(0, 2).map(j => j.id).sort(), ['b4', 's1']);
  assert.equal(fairOrder(jobs).length, 5);
});
