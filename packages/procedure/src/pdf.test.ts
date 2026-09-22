/**
 * A PDF is read in code, page by page. What matters: the words come out as
 * written, each sentence can say its page, a sentence over a page break stays
 * one sentence, and a page with no text refuses the whole document rather
 * than being quietly left out.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { pageAt, readPdf } from './pdf.ts';
import { aPdf } from './pdf-fixture.ts';
import { segment } from './segment.ts';

test('the text of each page, in order, with where each page sits', async () => {
  const read = await readPdf(aPdf([
    ['Claims Status Enquiry', '1. Log into Claims Central.'],
    ['2. Search for the claim.'],
  ]));
  assert.ok(read.ok, read.ok ? '' : read.because);
  assert.match(read.text, /Claims Status Enquiry[\s\S]*Log into Claims Central\.[\s\S]*Search for the claim\./);
  assert.deepEqual(read.pages.map((p) => p.page), [1, 2]);
  const search = segment(read.text).find((s) => s.text.includes('Search'))!;
  assert.equal(pageAt(read.pages, search.start), 2);
});

test('a sentence that runs over a page break is still one sentence', async () => {
  const read = await readPdf(aPdf([['Search the pipeline for the loan number and open the'], ['file before reading the rate.']]));
  assert.ok(read.ok);
  const found = segment(read.text).map((s) => s.text.replace(/\s+/g, ' '));
  assert.ok(found.includes('Search the pipeline for the loan number and open the file before reading the rate.'), JSON.stringify(found));
});

test('a PDF with no text at all is refused as a probable scan', async () => {
  const read = await readPdf(aPdf([null, null]));
  assert.equal(read.ok, false);
  assert.match(read.ok ? '' : read.because, /no text in it/);
});

test('one page with no text refuses the whole document, and names the page', async () => {
  const read = await readPdf(aPdf([['1. Log in.'], null, ['3. Record the rate.']]));
  assert.equal(read.ok, false);
  assert.match(read.ok ? '' : read.because, /^Page 2 of this PDF has no text/);
});

test('something that is not a PDF is refused, not thrown', async () => {
  const read = await readPdf(new TextEncoder().encode('Log in. Search for the claim.'));
  assert.deepEqual(read, { ok: false, because: 'This could not be read as a PDF.' });
});
