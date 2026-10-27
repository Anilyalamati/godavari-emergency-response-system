import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { SiteLayout } from './components/SiteLayout.js';
import { AdminPage } from './pages/AdminPage.js';
import { HomePage } from './pages/HomePage.js';
import { InviteAcceptPage } from './pages/InviteAcceptPage.js';
import { NotFoundPage, PlaceholderPage, ReportPlaceholderPage } from './pages/PlaceholderPage.js';
import { OperationalWorkspacePage } from './pages/OperationalWorkspacePage.js';
import { StaffLoginPage } from './pages/StaffLoginPage.js';

export function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<HomePage />} />
        <Route path="report" element={<ReportPlaceholderPage />} />
        <Route
          path="track"
          element={
            <PlaceholderPage
              eyebrow="Public view / 02"
              title="Track a report"
              summary="Public incident tracking is not available. There are no public report records or tracking-token lookup services in this prototype."
              detail="Public access to other reports is not part of this prototype."
            />
          }
        />
        <Route path="staff/login" element={<StaffLoginPage />} />
        <Route path="staff/accept-invite" element={<InviteAcceptPage />} />
        <Route
          path="operator"
          element={
            <ProtectedRoute role="OPERATOR">
              <OperationalWorkspacePage role="OPERATOR" />
            </ProtectedRoute>
          }
        />
        <Route
          path="responder"
          element={
            <ProtectedRoute role="RESPONDER">
              <OperationalWorkspacePage role="RESPONDER" />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin"
          element={
            <ProtectedRoute role="ADMIN">
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
