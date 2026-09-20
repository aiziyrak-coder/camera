// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/**
 * QA: tuzilma oynalari qayta ochilganda tozalanishi.
 *
 * Ilgari `useEffect` faqat XATOlarni tozalardi — "Bekor qilish" bosib
 * qayta ochilganda oldingi nom maydonda turib qolardi va admin uni
 * bilmasdan saqlab yuborishi mumkin edi.
 */

vi.mock('../../lib/auth', () => ({ useAuth: () => ({ token: 't', role: 'super-admin' }) }));

import AddFacultyModal from './AddFacultyModal';
import AddGroupModal from './AddGroupModal';

describe('AddFacultyModal', () => {
  it('qayta ochilganda nom tozalanadi', () => {
    const { rerender } = render(<AddFacultyModal open onClose={() => {}} onAdd={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('Stomatologiya'), { target: { value: 'Yarim yozilgan' } });

    rerender(<AddFacultyModal open={false} onClose={() => {}} onAdd={() => {}} />);
    rerender(<AddFacultyModal open onClose={() => {}} onAdd={() => {}} />);

    expect((screen.getByPlaceholderText('Stomatologiya') as HTMLInputElement).value).toBe('');
  });
});

describe('AddGroupModal', () => {
  it("fakultet yo'q bo'lsa nima qilish kerakligini aytadi", () => {
    render(<AddGroupModal open faculties={[]} onClose={() => {}} onAdd={() => {}} />);
    expect(screen.getByText(/avval «Fakultetlar» bo'limida fakultet qo'shing/i)).toBeTruthy();
    expect((screen.getByLabelText(/Fakultet/) as HTMLSelectElement).disabled).toBe(true);
  });
});
