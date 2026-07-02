import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import AppShell from '@/components/layout/AppShell';
import LoginForm from '@/components/auth/LoginForm';
import AccountingPage from '@/pages/AccountingPage';
import TraderPage from '@/pages/TraderPage';
import DividendPage from '@/pages/DividendPage';
import RetirementPage from '@/pages/RetirementPage';
import IncomePage from '@/pages/IncomePage';
import TaxPage from '@/pages/TaxPage';
import RiskPage from '@/pages/RiskPage';
import ImportPage from '@/pages/ImportPage';
import SettingsPage from '@/pages/SettingsPage';

function AuthenticatedApp() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <p>Loading…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/accounting" replace />} />
        <Route path="accounting" element={<AccountingPage />} />
        <Route path="trader" element={<TraderPage />} />
        <Route path="dividends" element={<DividendPage />} />
        <Route path="retirement" element={<RetirementPage />} />
        <Route path="income" element={<IncomePage />} />
        <Route path="tax" element={<TaxPage />} />
        <Route path="risk" element={<RiskPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/accounting" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AuthenticatedApp />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
