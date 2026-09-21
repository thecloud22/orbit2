import { jsPDF } from 'jspdf';

import {
  debtToIncome,
  loanToValue,
  PROGRAM_LABELS,
  STATUS_LABELS,
  type Loan,
} from '../data/loans';

/**
 * A real PDF, opened inline in a new tab rather than saved to disk. Every
 * other page in this portal ends in the DOM; this is the one place a click
 * has to be followed into a document the browser's own viewer renders, not
 * a download the OS has to be asked about. No demo portal in this
 * repository has produced a PDF before, and a recorded workflow that pulls
 * loan figures off a rendered document is a genuinely different capability
 * than reading text out of an element.
 */
export function openLoanSummaryPdf(loan: Loan): void {
  const doc = new jsPDF();
  const marginX = 20;
  let y = 20;

  function line(text: string, size = 11, gap = 7): void {
    doc.setFontSize(size);
    doc.text(text, marginX, y);
    y += gap;
  }

  function rule(): void {
    y += 2;
    doc.line(marginX, y, 190, y);
    y += 8;
  }

  doc.setFont('helvetica', 'bold');
  line('Meridian Home Lending', 16, 8);
  doc.setFont('helvetica', 'normal');
  line('Loan Summary', 11, 10);
  rule();

  doc.setFont('helvetica', 'bold');
  line(loan.loanNumber, 14, 8);
  doc.setFont('helvetica', 'normal');
  line(
    loan.coBorrowerName === null
      ? loan.borrowerName
      : `${loan.borrowerName} & ${loan.coBorrowerName}`,
  );
  line(`${loan.propertyAddress}, ${loan.propertyCity} ${loan.propertyState}`);
  rule();

  line(`Status: ${STATUS_LABELS[loan.status]}`);
  line(`Program: ${PROGRAM_LABELS[loan.program]}`);
  line(`Submitted: ${loan.submittedOn}`);
  line(`Underwriter: ${loan.underwriter}`);
  rule();

  line(`Purchase price: $${loan.purchasePrice.toLocaleString('en-US')}`);
  line(`Appraised value: $${loan.appraisedValue.toLocaleString('en-US')}`);
  line(`Loan amount: $${loan.loanAmount.toLocaleString('en-US')}`);
  line(`Note rate: ${loan.noteRate}%`);
  rule();

  line(`Loan-to-value: ${loanToValue(loan).toFixed(2)}%`);
  line(`Debt-to-income: ${debtToIncome(loan).toFixed(2)}%`);
  line(`Credit score: ${loan.creditScore}`);
  line(`Reserves: ${loan.reserveMonths} months`);

  doc.setFontSize(8);
  doc.text('Meridian Home Lending -- training instance, not a real loan document.', marginX, 285);

  window.open(doc.output('bloburl'), '_blank');
}
