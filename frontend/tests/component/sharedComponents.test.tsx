import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from '../../src/components/AppHeader';
import { ConfirmDialog } from '../../src/components/ConfirmDialog';
import { ErrorArea } from '../../src/components/ErrorArea';

describe('AppHeader', () => {
  it('teacher header links "搶答板" to onHome', async () => {
    const onHome = vi.fn();
    render(<AppHeader variant="teacher" onHome={onHome} account="teacher@example.com" />);
    await userEvent.click(screen.getByRole('button', { name: '搶答板' }));
    expect(onHome).toHaveBeenCalledTimes(1);
    expect(screen.getByText('teacher@example.com')).toBeInTheDocument();
  });

  it('student header shows the group and has no home link (FR-007)', () => {
    render(<AppHeader variant="student" groupNumber={3} />);
    expect(screen.getByText('第 3 組')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('student header without a group shows the brand as plain text', () => {
    render(<AppHeader variant="student" />);
    expect(screen.getByText('搶答板')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('ErrorArea', () => {
  it('shows the message as an alert', () => {
    render(<ErrorArea message="模擬：連不上伺服器" />);
    expect(screen.getByRole('alert')).toHaveTextContent('模擬：連不上伺服器');
  });

  it('renders nothing without a message (edge)', () => {
    const { container } = render(<ErrorArea />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ConfirmDialog', () => {
  it('shows title, content and buttons, and calls each callback', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="結束這一題？"
        onClose={vi.fn()}
        actions={[
          { label: '繼續作答', onClick: onCancel },
          { label: '結束並公布結果', onClick: onConfirm, variant: 'danger' },
        ]}
      >
        本題已送出 2 組
      </ConfirmDialog>,
    );
    expect(screen.getByRole('dialog', { name: '結束這一題？' })).toHaveTextContent('本題已送出 2 組');
    await userEvent.click(screen.getByRole('button', { name: '繼續作答' }));
    await userEvent.click(screen.getByRole('button', { name: '結束並公布結果' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<ConfirmDialog open title="T" onClose={onClose} actions={[]} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed (edge)', () => {
    render(<ConfirmDialog open={false} title="T" onClose={vi.fn()} actions={[]} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
