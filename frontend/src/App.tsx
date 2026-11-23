import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/setup" element={<div>Setup Page</div>} />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/dashboard" element={<div>Dashboard Page</div>} />
        <Route path="/subscriptions" element={<div>Subscriptions Page</div>} />
        <Route path="/online-services" element={<div>Online Services Page</div>} />
        <Route path="/servers" element={<div>Servers Page</div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;