import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Game } from '@/types';
import './Lobby.scss';

const GAME_URL = import.meta.env.VITE_GAME_MANAGER_URL;

function Lobby() {
  const [games, setGames] = useState<Game[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchGames() {
      if (!ignore) {
        console.log('fetching games');
        const res = await fetch(GAME_URL);
        const games = await res.json();
        setGames(games);
      }
    }

    let ignore = false;
    fetchGames();
    return () => {
      ignore = true;
    };
  }, []);

  const handleCreate = async () => {
    // handle the create game logic here
    console.log('Creating new game');
    const res = await fetch(GAME_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: `Game ${games?.length || 0}` })
    });

    const game = await res.json();
    setGames([...games, game]);
  };

  const handleDelete = async (id: string) => {
    // handle the create game logic here
    console.log(`Deleting game ${GAME_URL}/${id}`);
    await fetch(`${GAME_URL}/${id}`, {
      method: 'DELETE'
    });
    const idx = games.findIndex((g) => g.id === id);
    if (idx > -1) {
      const remainingGames = [...games];
      remainingGames.splice(idx, 1);
      setGames(remainingGames);
    }
  };

  return (
    <div className="game-list">
      <h2>Available Games</h2>
      {games?.map((game) => (
        <div key={game.id} className="game">
          <span className="game-name">{game.name}</span>
          <button
            onClick={() => navigate(`/game/${game.id}`)}
            className="game-button"
          >
            Join
          </button>
          <button
            onClick={() => handleDelete(`${game.id}`)}
            className="game-button"
          >
            Delete
          </button>
        </div>
      ))}
      <button onClick={handleCreate}>Create new game</button>
    </div>
  );
}

export default Lobby;
