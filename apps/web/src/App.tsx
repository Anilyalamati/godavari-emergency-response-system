import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { SiteLayout } from './components/SiteLayout.js';
import { AdminPage } from './pages/AdminPage.js';
import { HomePage } from './pages/HomePage.js';
import { InviteAcceptPage } from './pages/InviteAcceptPage.js';
import { NotFoundPage } from './pages/PlaceholderPage.js';
import { OperationalWorkspacePage } from './pages/OperationalWorkspacePage.js';
import { ReportEmergencyPage } from './pages/ReportEmergencyPage.js';
import { TrackIncidentPage } from './pages/TrackIncidentPage.js';
import { StaffLoginPage } from './pages/StaffLoginPage.js';

export function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<HomePage />} />
        <Route path="report" element={<ReportEmergencyPage />} />
        <Route path="track" element={<TrackIncidentPage />} />
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
