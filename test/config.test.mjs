import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCompanies, SECTORS } from '../lib/config.mjs';

test('companies come from the chosen sectors, plus the user\'s own', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobkit-'));
  fs.writeFileSync(path.join(dir, 'companies.json'), JSON.stringify([
    { id: 'a', sector: 'banks', platform: 'leumi' },
    { id: 'b', sector: 'hitech', platform: 'greenhouse' },
    { id: 'aj', sector: 'transport', platform: 'alljobs' },
  ]));
  fs.writeFileSync(path.join(dir, 'my-companies.json'), JSON.stringify([{ id: 'mine', sector: 'retail', platform: 'lever' }]));
  const ids = s => loadCompanies({ sectors: ['banks', 'transport'], alljobs: false, ...s }, dir).map(c => c.id);
  assert.deepEqual(ids({}), ['a', 'mine']);
  assert.deepEqual(ids({ alljobs: true }), ['a', 'aj', 'mine'], 'AllJobs only when switched on');
});

test('every company in the list has a known sector and an existing source', () => {
  const list = JSON.parse(fs.readFileSync(new URL('../companies.json', import.meta.url), 'utf8'));
  assert.ok(list.length > 30);
  for (const c of list) {
    assert.ok(SECTORS[c.sector], `${c.id}: unknown sector ${c.sector}`);
    assert.ok(fs.existsSync(new URL(`../sources/${c.platform}.mjs`, import.meta.url)), `${c.id}: no source ${c.platform}`);
    assert.notEqual(c.platform, 'drushim', 'Drushim forbids automated collection');
  }
});
