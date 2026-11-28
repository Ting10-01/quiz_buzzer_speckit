// T167: SheetPreview without the import's header (T-Results, C-5) keeps three generic columns (FR-021, #16).
// T176: the answer column is named after the blank cells' columns (FR-021, #35).
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SheetPreview } from '../../src/components/SheetPreview';
import { makeMixedQuestions } from '../helpers/fixtures';

describe('SheetPreview without header information (T-Results)', () => {
  it('uses 題號, 題目 and 作答 as column names and shows no header row (T167)', () => {
    render(<SheetPreview result={{ questions: makeMixedQuestions() }} />);
    const preview = screen.getByRole('region', { name: '學習單預覽' });
    const columns = within(preview)
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
      .filter((text) => text !== '');
    expect(columns).toEqual(['題號', '題目', '作答']);
    expect(within(preview).queryByText('題號欄')).not.toBeInTheDocument();
  });
});

describe('SheetPreview answer columns from blank cells (FR-021, #35)', () => {
  it('names the answer column after the blank cells, not the header (T176)', () => {
    const questions = makeMixedQuestions().map((question) =>
      question.type === 'GROUP'
        ? { ...question, subQuestions: question.subQuestions.map((sub) => ({ ...sub, blankCell: sub.blankCell.replace('G', 'H') })) }
        : question,
    );
    render(<SheetPreview result={{ headerRow: 4, headerColumns: ['B', 'C', 'G'], questions }} />);
    const preview = screen.getByRole('region', { name: '學習單預覽' });
    const columns = within(preview)
      .getAllByRole('columnheader')
      .map((th) => th.textContent)
      .filter((text) => text !== '');
    expect(columns).toEqual(['B', 'C', 'G、H']);
  });
});
