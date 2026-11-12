import { Component, type ReactNode } from 'react';

/** Kutilmagan xato butun ilovani oq ekranga aylantirmasin. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-sm p-8 text-center">
          <p className="text-[17px] font-semibold text-ink">Sahifada xatolik yuz berdi</p>
          <p className="mt-2 text-[14px] text-soft">Sahifani yangilang. Muammo takrorlansa, administratorga xabar bering.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 h-11 rounded-xl bg-brand px-5 text-[15px] font-medium text-white hover:bg-brand-dark"
          >
            Yangilash
          </button>
        </div>
      </div>
    );
  }
}
