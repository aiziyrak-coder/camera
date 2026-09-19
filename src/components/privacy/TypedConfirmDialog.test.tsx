import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TypedConfirmDialog from './TypedConfirmDialog';

describe('TypedConfirmDialog', () => {
  it('familiya yozilmaguncha o‘chirib bo‘lmaydi', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <TypedConfirmDialog
        open
        title="Biometrikani o'chirish"
        message="Qaytarib bo'lmaydi"
        expected="Karimov"
        confirmLabel="O'chirish"
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );

    const button = screen.getByRole('button', { name: "O'chirish" });
    expect(button).toBeDisabled();

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Karim' } });
    expect(button).toBeDisabled();

    fireEvent.change(input, { target: { value: ' karimov ' } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it('server xatosi dialog ichida ko‘rsatiladi', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('Sizda bu amal uchun huquq yo\'q'));
    render(
      <TypedConfirmDialog
        open
        title="O'chirish"
        message="..."
        expected="Aliyev"
        confirmLabel="O'chirish"
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Aliyev' } });
    fireEvent.click(screen.getByRole('button', { name: "O'chirish" }));
    expect(await screen.findByText("Sizda bu amal uchun huquq yo'q")).toBeInTheDocument();
  });
});
