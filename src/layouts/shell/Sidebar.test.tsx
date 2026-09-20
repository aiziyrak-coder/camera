// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { NAV_SECTIONS, visibleSections } from './navConfig';

/**
 * QA: yon panel — texnik ko'rsatkich.
 *
 * Muhimi ko'rinish emas, O'QILISHI: har bandning indeks kodi bor,
 * bo'lim sarlavhasida nechta band borligi yozilgan, faol band esa
 * `aria-current="page"` bilan belgilanadi (rangga tayanmaydi).
 */

function renderSidebar(pathname: string, collapsed = false) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Sidebar
        sections={visibleSections(() => true, 'super-admin')}
        collapsed={collapsed}
        mobileOpen={false}
        onCloseMobile={() => {}}
        userName="Test Foydalanuvchi"
        role="super-admin"
        onLogout={() => {}}
        linkSuffix="?sana=2026-09-21"
      />
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  it('shows an index code for every item', () => {
    renderSidebar('/hodisalar');
    for (const item of NAV_SECTIONS.flatMap((section) => section.items)) {
      expect(screen.getAllByText(item.code).length).toBeGreaterThan(0);
    }
  });

  it('marks the active item for screen readers, not only by colour', () => {
    renderSidebar('/hodisalar');
    const active = screen.getByRole('link', { name: 'Hodisalar' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Talabalar' })).not.toHaveAttribute('aria-current');
  });

  it('counts the items in each section header', () => {
    renderSidebar('/');
    const monitoring = screen.getByRole('button', { name: /Monitoring/ });
    expect(within(monitoring).getByLabelText('3 ta band')).toHaveTextContent('03');
  });

  it('keeps the selected date on attendance links only', () => {
    renderSidebar('/');
    expect(screen.getByRole('link', { name: 'Talabalar' })).toHaveAttribute('href', '/talabalar?sana=2026-09-21');
    expect(screen.getByRole('link', { name: 'Hodisalar' })).toHaveAttribute('href', '/hodisalar');
  });

  it('still lists every item when collapsed to the code rail', () => {
    renderSidebar('/', true);
    expect(screen.getByRole('link', { name: 'Hodisalar' })).toBeInTheDocument();
    expect(screen.getAllByText('HOD').length).toBeGreaterThan(0);
  });
});
