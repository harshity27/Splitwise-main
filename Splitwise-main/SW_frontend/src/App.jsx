import { Navigate, Route, Routes } from 'react-router-dom';
import Home from './components/Home.jsx';
import Login from './components/Login.jsx';
import Signup from './components/Signup.jsx';
import Workspace from './components/app/Workspace.jsx';
import './App.css';

function ProtectedWorkspace() {
  return localStorage.getItem('sw_token') ? <Workspace /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/app" element={<ProtectedWorkspace />} />
      <Route path="/app/activity" element={<ProtectedWorkspace />} />
      <Route path="/app/expenses" element={<ProtectedWorkspace />} />
      <Route path="/app/groups/:groupId" element={<ProtectedWorkspace />} />
      <Route path="/account" element={<Navigate to="/app" replace />} />
      <Route path="/accountinfoform" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
