// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { NAV_SECTIONS, visibleSections } from './navConfig';

/**
 * QA: yon panelda faqat o'qiladigan nomlar qoladi; faol band rangsiz ham
 * `aria-current="page"` orqali bilinadi.
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
  it('shows full item labels without internal index codes', () => {
    renderSidebar('/reestr');
    for (const item of NAV_SECTIONS.flatMap((section) => section.items)) {
      expect(screen.getByRole('link', { name: item.label })).toBeInTheDocument();
      expect(screen.queryByText(item.code)).not.toBeInTheDocument();
    }
    // 20+ getByRole so'rovi — to'liq to'plam parallel ishlaganda 5 s yetmasdi.
  }, 20_000);

  it('marks the active item for screen readers, not only by colour', () => {
    renderSidebar('/reestr');
    const active = screen.getByRole('link', { name: 'Yuzlar bazasi' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Tashkiliy tuzilma' })).not.toHaveAttribute('aria-current');
  });

  it('counts the items in each section header', () => {
    renderSidebar('/');
    const settings = screen.getByRole('button', { name: /Sozlamalar/ });
    expect(within(settings).getByLabelText('4 ta band')).toHaveTextContent('04');
  });

  it('does not carry the date to non-attendance links', () => {
    renderSidebar('/');
    expect(screen.getByRole('link', { name: 'Yuzlar bazasi' })).toHaveAttribute('href', '/reestr');
  });

  it('keeps every page reachable when collapsed', () => {
    renderSidebar('/', true);
    expect(screen.getByRole('link', { name: 'Yuzlar bazasi' })).toBeInTheDocument();
    expect(screen.queryByText('RST')).not.toBeInTheDocument();
  });
});
