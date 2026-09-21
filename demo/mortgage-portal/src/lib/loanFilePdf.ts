import { jsPDF } from 'jspdf';

import {
  CONFORMING_LIMIT,
  debtToIncome,
  EDUCATION_LABELS,
  EMPLOYMENT_LABELS,
  loanToValue,
  OCCUPANCY_LABELS,
  PROGRAM_LABELS,
  PROPERTY_LABELS,
  type Loan,
} from '../data/loans';

const MARGIN_X = 15;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

interface Field {
  readonly label: string;
  readonly value: string;
}

/** A bordered, titled section of labelled fields, laid out like a form's own box. */
function drawSection(doc: jsPDF, y: number, title: string, fields: readonly Field[], columns: number): number {
  const padding = 4;
  const rowHeight = 12;
  const rows = Math.ceil(fields.length / columns);
  const colWidth = (CONTENT_WIDTH - padding * 2) / columns;
  const bodyTop = y + 9;
  const boxHeight = 9 + rows * rowHeight + padding;

  doc.setDrawColor(190);
  doc.rect(MARGIN_X, y, CONTENT_WIDTH, boxHeight);
  doc.line(MARGIN_X, y + 9, MARGIN_X + CONTENT_WIDTH, y + 9);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30);
  doc.text(title.toUpperCase(), MARGIN_X + padding, y + 6);

  fields.forEach((field, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const fx = MARGIN_X + padding + col * colWidth;
    const fy = bodyTop + padding + row * rowHeight;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(field.label.toUpperCase(), fx, fy);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15);
    doc.text(field.value, fx, fy + 5.5);
  });

  doc.setTextColor(0);
  return y + boxHeight + 6;
}

/**
 * The whole file, laid out like the form it would be on paper -- boxed
 * sections, a label over each value -- not the same content run together as
 * paragraphs. This is the file review page's own numbers (`loan`), its own
 * transient state (`decision`, `conditions`) turned into resolved text
 * before the call, since neither lives on the `Loan` record itself. Opened
 * inline in a new tab, the same as `loanSummaryPdf`, rather than saved to
 * disk.
 */
export function openLoanFilePdf(
  loan: Loan,
  decisionLabel: string | null,
  conditionSummaries: readonly string[],
): void {
  const doc = new jsPDF();
  let y = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15);
  doc.text('Meridian Home Lending', MARGIN_X, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text('Underwriting file', PAGE_WIDTH - MARGIN_X, y, { align: 'right' });
  y += 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(15);
  doc.text(loan.loanNumber, MARGIN_X, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(30);
  const borrowerLine =
    loan.coBorrowerName === null ? loan.borrowerName : `${loan.borrowerName} & ${loan.coBorrowerName}`;
  doc.text(borrowerLine, MARGIN_X, y);
  y += 5.5;

  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`${loan.propertyAddress}, ${loan.propertyCity} ${loan.propertyState}`, MARGIN_X, y);
  doc.setTextColor(0);
  y += 5;

  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(`Submitted ${loan.submittedOn}  ·  Underwriter ${loan.underwriter}`, MARGIN_X, y);
  doc.setTextColor(0);
  y += 8;

  if (decisionLabel !== null) {
    doc.setFillColor(230, 246, 237);
    doc.setDrawColor(190, 225, 205);
    doc.rect(MARGIN_X, y, CONTENT_WIDTH, 11, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(10, 90, 50);
    doc.text(`File decision: ${decisionLabel}`, MARGIN_X + 4, y + 7.5);
    doc.setTextColor(0);
    y += 15;
  }

  const ltv = loanToValue(loan);
  const dti = debtToIncome(loan);

  y = drawSection(
    doc,
    y,
    'Underwriting summary',
    [
      { label: 'Loan-to-value', value: `${ltv.toFixed(2)}%` },
      { label: 'Debt-to-income', value: `${dti.toFixed(2)}%` },
      { label: 'Credit score', value: String(loan.creditScore) },
      { label: 'Loan amount', value: `$${loan.loanAmount.toLocaleString('en-US')}` },
      { label: 'Appraised value', value: `$${loan.appraisedValue.toLocaleString('en-US')}` },
      { label: 'Purchase price', value: `$${loan.purchasePrice.toLocaleString('en-US')}` },
      { label: 'Reserves (months)', value: String(loan.reserveMonths) },
      { label: 'Note rate', value: `${loan.noteRate}%` },
      { label: 'Conforming limit', value: `$${CONFORMING_LIMIT.toLocaleString('en-US')}` },
    ],
    3,
  );

  y = drawSection(
    doc,
    y,
    'Borrower & employment',
    [
      { label: 'Employment type', value: EMPLOYMENT_LABELS[loan.employmentType] },
      { label: 'Years in role', value: String(loan.yearsInRole) },
      { label: 'First-time buyer', value: loan.firstTimeBuyer ? 'Yes' : 'No' },
      { label: 'Homebuyer education', value: EDUCATION_LABELS[loan.homebuyerEducation] },
      { label: 'Monthly income', value: `$${loan.monthlyIncome.toLocaleString('en-US')}` },
      { label: 'Monthly debt', value: `$${loan.monthlyDebt.toLocaleString('en-US')}` },
    ],
    3,
  );

  y = drawSection(
    doc,
    y,
    'Property & program',
    [
      { label: 'Property type', value: PROPERTY_LABELS[loan.propertyType] },
      { label: 'Occupancy', value: OCCUPANCY_LABELS[loan.occupancy] },
      { label: 'Loan program', value: PROGRAM_LABELS[loan.program] },
      { label: 'FEMA flood zone', value: loan.floodZone },
      { label: 'Property state', value: loan.propertyState },
      { label: 'Property city', value: loan.propertyCity },
    ],
    3,
  );

  const conditionRows = conditionSummaries.length === 0 ? ['No conditions attached to this file.'] : conditionSummaries;
  const conditionsBoxHeight = 9 + conditionRows.length * 6 + 4;

  doc.setDrawColor(190);
  doc.rect(MARGIN_X, y, CONTENT_WIDTH, conditionsBoxHeight);
  doc.line(MARGIN_X, y + 9, MARGIN_X + CONTENT_WIDTH, y + 9);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30);
  doc.text('CONDITIONS', MARGIN_X + 4, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(20);
  conditionRows.forEach((text, index) => {
    doc.text(`• ${text}`, MARGIN_X + 4, y + 9 + 4 + index * 6 + 4);
  });
  doc.setTextColor(0);
  y += conditionsBoxHeight + 8;

  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('Meridian Home Lending -- training instance, not a real loan document.', MARGIN_X, 285);

  window.open(doc.output('bloburl'), '_blank');
}
