import { Navigate, Route, Routes } from 'react-router-dom';
import AckProcessPage from './pages/AckProcessPage';
import ConfirmationPage from './pages/ConfirmationPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<AckProcessPage />} />
      <Route path="/confirmacion" element={<ConfirmationPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
