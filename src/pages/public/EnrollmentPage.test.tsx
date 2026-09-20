import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EnrollmentPage from './EnrollmentPage';
import * as enrollment from '../../lib/enrollment';
import { ApiError } from '../../lib/apiClient';

afterEach(() => vi.restoreAllMocks());

function renderPage(path = '/enroll') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EnrollmentPage />
    </MemoryRouter>,
  );
}

const codeInput = () => screen.getByLabelText(/Guruh kodi/) as HTMLInputElement;
const pinflInput = () => screen.getByLabelText(/JSHSHIR/) as HTMLInputElement;

describe('EnrollmentPage — guruh kodi maydoni', () => {
  it("bo'sh joy va chiziqcha bilan ko'chirilgan kod tozalanadi va katta harfga o'tadi", () => {
    renderPage();
    fireEvent.change(codeInput(), { target: { value: ' k7m2-xr ' } });
    expect(codeInput().value).toBe('K7M2XR');
    expect(screen.getByRole('button', { name: /Davom etish/ })).toBeEnabled();
  });

  it("O/I/0/1 terilganda nega qabul qilinmagani tushuntiriladi", () => {
    renderPage();
    // Tushuntirish faqat kerak bo'lganda chiqadi.
    expect(screen.queryByText(/qabul qilinmadi/)).toBeNull();

    fireEvent.change(codeInput(), { target: { value: 'K0M2XR' } });
    expect(codeInput().value).toBe('KM2XR');
    expect(screen.getByText(/qabul qilinmadi/)).toBeInTheDocument();
  });

  it("havoladagi ?kod= oldindan to'ldiriladi", () => {
    renderPage('/enroll?kod=k7m2xr');
    expect(codeInput().value).toBe('K7M2XR');
  });

  it("JSHSHIR qat'iy 14 raqam bo'lishi talab qilinadi", () => {
    renderPage();
    expect(pinflInput().minLength).toBe(14);
    expect(pinflInput().maxLength).toBe(14);
  });
});

describe('EnrollmentPage — xabarlar', () => {
  it("serverning inglizcha 422 xabari ekranga chiqmaydi", async () => {
    vi.spyOn(enrollment, 'lookupPerson').mockRejectedValue(new ApiError(422, 'value is not a valid integer'));
    renderPage();

    fireEvent.change(pinflInput(), { target: { value: '30302654150047' } });
    fireEvent.change(codeInput(), { target: { value: 'K7M2XR' } });
    fireEvent.click(screen.getByRole('button', { name: /Davom etish/ }));

    expect(await screen.findByText(/So'rovni bajarib bo'lmadi/)).toBeInTheDocument();
    expect(screen.queryByText(/valid integer/)).toBeNull();
  });

  it("404 da server matni ko'rsatiladi va o'zini qo'shish taklif qilinadi", async () => {
    vi.spyOn(enrollment, 'lookupPerson').mockRejectedValue(
      new ApiError(404, "Ma'lumot topilmadi yoki kod noto'g'ri"),
    );
    renderPage();

    fireEvent.change(pinflInput(), { target: { value: '30302654150047' } });
    fireEvent.change(codeInput(), { target: { value: 'K7M2XR' } });
    fireEvent.click(screen.getByRole('button', { name: /Davom etish/ }));

    expect(await screen.findByText("Ma'lumot topilmadi yoki kod noto'g'ri")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /o'zimni qo'shish/ })).toBeInTheDocument();
  });
});

describe('EnrollmentPage — holatni tozalash', () => {
  it("qayta urinishda oldingi odamning holati qolmaydi", async () => {
    vi.spyOn(enrollment, 'lookupPerson').mockResolvedValue({
      recordId: '1',
      fullName: 'Aliyev Vali',
      typeLabel: 'Talaba',
      groupOrPosition: '301-guruh',
      alreadyEnrolled: false,
    });
    renderPage();

    fireEvent.change(pinflInput(), { target: { value: '30302654150047' } });
    fireEvent.change(codeInput(), { target: { value: 'K7M2XR' } });
    fireEvent.click(screen.getByRole('button', { name: /Davom etish/ }));

    expect(await screen.findByText('Aliyev Vali')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Boshqa ma'lumot bilan qayta urinish/ }));

    await waitFor(() => expect(screen.queryByText('Aliyev Vali')).toBeNull());
    expect(pinflInput()).toBeInTheDocument();
  });
});
