// T167: SheetPreview without the import's header (T-Results, C-5) keeps three generic columns (FR-021, #16).
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
