import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import GamePage from "./pages/Game";
import LobbyPage from './pages/Lobby';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/game/:gameId" element={<GamePage />} />
      </Routes>
    </Router>
  );
}

export default App;
