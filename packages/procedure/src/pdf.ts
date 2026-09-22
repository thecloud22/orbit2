/**
 * The text of a PDF, read in code (Orbit 2.1-i).
 *
 * Never by a model: sorting depends on Orbit numbering the author's exact
 * words, and a model asked to read a document can reword it before the rule
 * that it may not has even started to apply.
 *
 * The pages are joined with a single line break, so a sentence that runs over
 * a page break is still one sentence — the splitter treats a line break inside
 * running text as a wrap. Each page's span in the joined text is kept, so a
 * sentence can say which page it came from.
 *
 * A page with no text is refused, not skipped. It is almost always a scanned
 * image, and dropping it would sort the procedure without it and say nothing.
 */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** The fonts PDF.js ships, for the standard fourteen a PDF may name without embedding. */
const FONTS = `${dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')))}/standard_fonts/`;

export type PdfRead =
  | { ok: true; text: string; pages: Array<{ page: number; start: number; end: number }> }
  | { ok: false; because: string };

type Item = { str: string; hasEOL?: boolean };

export async function readPdf(bytes: Uint8Array): Promise<PdfRead> {
  const loading = getDocument({ data: bytes, useSystemFonts: false, standardFontDataUrl: FONTS, verbosity: 0 });
  let doc;
  try {
    doc = await loading.promise;
  } catch {
    await loading.destroy();
    return { ok: false, because: 'This could not be read as a PDF.' };
  }

  try {
    const pages: Array<{ page: number; start: number; end: number }> = [];
    const empty: number[] = [];
    let text = '';
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const pageText = (content.items as Item[])
        .map((item) => (item.str ?? '') + (item.hasEOL ? '\n' : ''))
        .join('')
        .replace(/[ \t]+\n/g, '\n');
      if (pageText.trim() === '') { empty.push(n); continue; }
      if (text) text += '\n';
      pages.push({ page: n, start: text.length, end: text.length + pageText.length });
      text += pageText;
    }

    if (pages.length === 0) {
      return { ok: false, because: 'This PDF has no text in it, so it could not be read. It is probably a scan; '
        + 'Orbit reads the text of a document and does not guess at pictures of one.' };
    }
    if (empty.length) {
      return { ok: false, because: `${empty.length === 1 ? 'Page' : 'Pages'} ${empty.join(', ')} of this PDF `
        + `${empty.length === 1 ? 'has' : 'have'} no text, so ${empty.length === 1 ? 'it is' : 'they are'} probably scanned. `
        + 'Orbit would have to sort the procedure without them, so it has read none of it.' };
    }
    return { ok: true, text, pages };
  } finally {
    await loading.destroy();
  }
}

/** Which page a position in the joined text falls on. */
export function pageAt(pages: ReadonlyArray<{ page: number; start: number; end: number }>, at: number): number | null {
  for (const p of pages) if (at >= p.start && at < p.end) return p.page;
  return null;
}
