import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock PocketBase module
vi.mock('@/lib/pocketbase', () => ({
  default: {
    collection: vi.fn(),
    authStore: {
      isValid: true,
      record: { id: 'user1', email: 'test@test.com' },
      onChange: vi.fn(() => () => {}),
      clear: vi.fn(),
    },
  },
}));

// Mock the useAuth hook used by AuthContext
vi.mock('@/hooks/useAuth', () => ({
  useAuthProvider: () => ({
    user: { id: 'user1', email: 'test@test.com' },
    isAuthenticated: true,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

// Mock settings to prevent network calls from SettingsPage
vi.mock('@/lib/settings', () => ({
  fetchSettings: vi.fn().mockResolvedValue([]),
  fetchSettingsByCategory: vi.fn().mockResolvedValue([]),
  updateSetting: vi.fn().mockResolvedValue({}),
}));

import AppShell from '@/components/layout/AppShell';
import AccountingPage from '@/pages/AccountingPage';
import TraderPage from '@/pages/TraderPage';
import RetirementPage from '@/pages/RetirementPage';
import IncomePage from '@/pages/IncomePage';
import TaxPage from '@/pages/TaxPage';
import RiskPage from '@/pages/RiskPage';
import ImportPage from '@/pages/ImportPage';
import SettingsPage from '@/pages/SettingsPage';

/**
 * Helper that renders the app routes at a given initial path.
 */
function renderWithRouter(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/accounting" replace />} />
          <Route path="accounting" element={<AccountingPage />} />
          <Route path="trader" element={<TraderPage />} />
          <Route path="retirement" element={<RetirementPage />} />
          <Route path="income" element={<IncomePage />} />
          <Route path="tax" element={<TaxPage />} />
          <Route path="risk" element={<RiskPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/accounting" replace />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Navigation Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the app without crashing', () => {
    renderWithRouter('/accounting');
    expect(screen.getByText('Investment Workbook')).toBeInTheDocument();
  });

  it('renders AccountingPage at /accounting', () => {
    renderWithRouter('/accounting');
    expect(screen.getByText('Accounting Dashboard')).toBeInTheDocument();
  });

  it('renders TraderPage at /trader', () => {
    renderWithRouter('/trader');
    expect(screen.getByText('Trader Dashboard')).toBeInTheDocument();
  });

  it('renders RetirementPage at /retirement', () => {
    renderWithRouter('/retirement');
    expect(screen.getByText('Retirement Dashboard')).toBeInTheDocument();
  });

  it('renders IncomePage at /income', () => {
    renderWithRouter('/income');
    expect(screen.getByText('Income Dashboard')).toBeInTheDocument();
  });

  it('renders TaxPage at /tax', () => {
    renderWithRouter('/tax');
    expect(screen.getByText('Tax Dashboard')).toBeInTheDocument();
  });

  it('renders RiskPage at /risk', () => {
    renderWithRouter('/risk');
    expect(screen.getByText('Risk Dashboard')).toBeInTheDocument();
  });

  it('renders ImportPage at /import', () => {
    renderWithRouter('/import');
    expect(screen.getByRole('heading', { name: 'Import', level: 2 })).toBeInTheDocument();
  });

  it('renders SettingsPage at /settings', () => {
    renderWithRouter('/settings');
    expect(screen.getByRole('heading', { name: 'Settings', level: 2 })).toBeInTheDocument();
  });

  it('redirects root (/) to /accounting', () => {
    renderWithRouter('/');
    expect(screen.getByText('Accounting Dashboard')).toBeInTheDocument();
  });

  it('redirects unknown routes to /accounting (catch-all)', () => {
    renderWithRouter('/nonexistent-route');
    expect(screen.getByText('Accounting Dashboard')).toBeInTheDocument();
  });
});
