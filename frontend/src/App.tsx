import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { ProtectedRoute, PublicRoute } from './components/layout/ProtectedRoute';
import { SetupPage } from './pages/SetupPage';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { SubscriptionsPage } from './pages/SubscriptionsPage';
import { OnlineServicesPage } from './pages/OnlineServicesPage';
import { ServersPage } from './pages/ServersPage';
import { SettingsPage } from './pages/SettingsPage';
import { AnycastPage } from './pages/AnycastPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup" element={<PublicRoute><SetupPage /></PublicRoute>} />
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="subscriptions" element={<SubscriptionsPage />} />
          <Route path="online-services" element={<OnlineServicesPage />} />
          <Route path="servers" element={<ServersPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="anycast" element={<AnycastPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;