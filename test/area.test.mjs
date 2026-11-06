import test from 'node:test';
import assert from 'node:assert/strict';
import { areaMatcher, titleExcluder, inIsrael } from '../lib/area.mjs';

const gh = { platform: 'greenhouse' };
const il = { platform: 'leumi' };

test('global boards keep only jobs in Israel', () => {
  assert.equal(inIsrael({ locations: ['New York, United States'] }, gh), false);
  assert.equal(inIsrael({ locations: ['Tel Aviv-Yafo, Israel'] }, gh), true);
  assert.equal(inIsrael({ locations: ['Herzliya'] }, gh), true);
  assert.equal(inIsrael({ locations: [] }, il), true, 'Israeli sites are in Israel');
});

test('area: anywhere, places, remote', () => {
  const any = areaMatcher({ anywhere: true });
  assert.equal(any({ locations: ['Haifa, Israel'] }, gh), true);
  assert.equal(any({ locations: ['London'] }, gh), false);

  const tlv = areaMatcher({ places: ['תל אביב', 'Tel Aviv', 'מרכז'], remote: false });
  assert.equal(tlv({ locations: ['Tel Aviv, Israel'] }, gh), true);
  assert.equal(tlv({ locations: ['אזור מרכז'] }, il), true);
  assert.equal(tlv({ locations: ['חיפה'] }, il), false);
  assert.equal(tlv({ locations: [], areaText: 'סניף בתל אביב' }, il), true, 'the place can be in the text');

  const remote = areaMatcher({ places: ['חיפה'], remote: true });
  assert.equal(remote({ locations: ['Remote - Israel'] }, gh), true);
  assert.equal(remote({ locations: ['Remote - Germany'] }, gh), false, 'remote abroad is not in Israel');
});

test('title exclusions match words, not parts of words', () => {
  const ex = titleExcluder(['developer', 'intern', 'מהנדס']);
  assert.equal(ex({ title: 'Senior Developer' }), true);
  assert.equal(ex({ title: 'Internal Auditor' }), false);
  assert.equal(ex({ title: 'מהנדס/ת תוכנה' }), true);
  assert.equal(titleExcluder([])({ title: 'anything' }), false);
});
