/**
 * Report amount autoshrink (§4.4 tables on narrow viewports): number cells
 * that would wrap shrink their font-size per cell to fit one line — labels
 * (months, names, TOTAL) keep wrapping normally, and totals-row amounts
 * shrink too. jsdom has no layout, so widths are synthesized: cells are
 * `cellWidth` px wide (≈72px amount columns on a 320px viewport) and text
 * measures `pxPerChar` px per character at the base font.
 */
import { render, screen } from '@testing-library/react';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import AutoShrinkText, {
  isNumericCellText,
  MIN_SHRINK_FONT_PX,
} from '@/app/[locale]/(app)/menu/_components/AutoShrinkText';

// --- Layout synthesis --------------------------------------------------------

let cellWidth = 72; // available width per amount cell (≈320px viewport)
let baseFontPx = 16; // inherited font size (bump for the large-font case)
let pxPerCharAtBase = 8; // text advance per character at the base font

const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const originalScrollWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth');
const originalGetComputedStyle = window.getComputedStyle;

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return cellWidth;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      // Text width scales with the CURRENT font: the component resets the
      // inline size before measuring, so mount-time measurements use the base.
      const inline = Number.parseFloat(this.style.fontSize);
      const scale = Number.isFinite(inline) ? inline / baseFontPx : 1;
      return Math.round((this.textContent ?? '').length * pxPerCharAtBase * scale);
    },
  });
  window.getComputedStyle = (() =>
    ({ fontSize: `${baseFontPx}px` }) as CSSStyleDeclaration) as typeof window.getComputedStyle;
});

afterAll(() => {
  if (originalClientWidth) {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
  }
  if (originalScrollWidth) {
    Object.defineProperty(Element.prototype, 'scrollWidth', originalScrollWidth);
  }
  window.getComputedStyle = originalGetComputedStyle;
});

beforeEach(() => {
  cellWidth = 72;
  baseFontPx = 16;
  pxPerCharAtBase = 8;
});

// --- Numeric-cell detection ---------------------------------------------------

describe('isNumericCellText', () => {
  it('matches amounts, counts, percents, masked amounts and ISO dates', () => {
    expect(isNumericCellText('₹1,06,51,161')).toBe(true);
    expect(isNumericCellText('12')).toBe(true);
    expect(isNumericCellText('45%')).toBe(true);
    expect(isNumericCellText('₹•••')).toBe(true);
    expect(isNumericCellText('2026-01-31')).toBe(true);
  });

  it('leaves label-ish cells untouched (letters in any script)', () => {
    expect(isNumericCellText('TOTAL')).toBe(false);
    expect(isNumericCellText('Jan 26')).toBe(false);
    expect(isNumericCellText('Anaya Sharma')).toBe(false);
    expect(isNumericCellText('5 kg')).toBe(false);
    expect(isNumericCellText('कुल')).toBe(false);
    expect(isNumericCellText('')).toBe(false);
  });
});

// --- Shrink behavior -----------------------------------------------------------

describe('AutoShrinkText', () => {
  it('shrinks an overflowing amount proportionally at 320px column widths', () => {
    // 12 chars × 8px = 96px needed, 72px available → 16px × 72/96 = 12px.
    render(<AutoShrinkText>{'\u20B91,06,51,161'}</AutoShrinkText>);
    const el = screen.getByText('₹1,06,51,161');
    expect(el.style.fontSize).toBe('12px');
    expect(el).toHaveTextContent('₹1,06,51,161'); // never truncates the value
  });

  it('leaves a fitting amount at its inherited size', () => {
    // 4 chars × 8px = 32px ≤ 72px — no inline font override.
    render(<AutoShrinkText>{'\u20B9250'}</AutoShrinkText>);
    expect(screen.getByText('₹250').style.fontSize).toBe('');
  });

  it('shrinks relative to a large accessibility font', () => {
    // 24px base and 12px/char: 12 chars = 144px needed → 24 × 72/144 = 12px.
    baseFontPx = 24;
    pxPerCharAtBase = 12;
    render(<AutoShrinkText>{'\u20B91,06,51,161'}</AutoShrinkText>);
    expect(screen.getByText('₹1,06,51,161').style.fontSize).toBe('12px');
  });

  it('never shrinks below the readability floor', () => {
    cellWidth = 10; // pathological squeeze
    render(<AutoShrinkText>{'\u20B91,00,00,00,000'}</AutoShrinkText>);
    expect(screen.getByText('₹1,00,00,00,000').style.fontSize).toBe(`${MIN_SHRINK_FONT_PX}px`);
  });

  it('shrinks per cell: each amount gets its own fitted size (totals row included)', () => {
    // Replicates the report table composition: label cells plain, numeric
    // cells (body AND bold totals row) wrapped in AutoShrinkText.
    const rows: string[][] = [
      ['Jan 26', '\u20B912,34,567'],
      ['TOTAL', '\u20B91,06,51,161'],
    ];
    render(
      <Table>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {row.map((cell, j) => (
                <TableCell key={j}>
                  {isNumericCellText(cell) ? <AutoShrinkText>{cell}</AutoShrinkText> : cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>,
    );
    // ₹12,34,567: 10 chars × 8px = 80px → 16 × 72/80 = 14.4px.
    expect(screen.getByText('₹12,34,567').style.fontSize).toBe('14.4px');
    // Totals-row amount: 12 chars → 12px (independent of the other cell).
    expect(screen.getByText('₹1,06,51,161').style.fontSize).toBe('12px');
    // Label cells are NOT wrapped: plain text nodes inside the td.
    expect(screen.getByText('Jan 26').tagName).toBe('TD');
    expect(screen.getByText('TOTAL').tagName).toBe('TD');
  });
});
