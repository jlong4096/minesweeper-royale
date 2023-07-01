// import { useQuery } from 'react-query';
import { useState, useEffect } from 'react';
import { MineCoordinate } from 'generateMineLocations-lib';
import './Lobby.scss';

const GAME_URL = import.meta.env.VITE_GAME_MANAGER_URL;

interface Game {
  id: string;
  name: string;
  coordinates: MineCoordinate[];
}

// const fetchGames = async (): Promise<Game[]> => {
//   const res = await fetch(GAME_URL, );
//   return res.json();
// };
//
function Lobby() {
  // const { data: games } = useQuery('games', fetchGames);
  const [ games, setGames ] = useState<Game[]>([]);

  useEffect(() => {
    async function fetchGames() {
      if (!ignore) {
        console.log('fetching games');
        const res = await fetch(GAME_URL );
        const games = await res.json();
        setGames(games);
      }
    }

    let ignore = false;
    fetchGames();
    return () => { ignore = true };
  }, []);

  const handleJoin = (gameId: string) => {
    // handle the join game logic here
    console.log(`Joining game with id: ${gameId}`);
  };

  const handleCreate = async () => {
    // handle the create game logic here
    console.log('Creating new game');
    const res = await fetch(GAME_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: `Game ${games?.length || 0}`}),
    });

    const game = await res.json();
    setGames([...games, game]);
  };

  const handleDelete = async (id: string) => {
    // handle the create game logic here
    console.log(`Deleting game ${GAME_URL}/${id}`);
    await fetch(`${GAME_URL}/${id}`, {
      method: "DELETE",
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
          <button onClick={() => handleJoin(`${game.id}`)} className="game-button">
            Join
          </button>
          <button onClick={() => handleDelete(`${game.id}`)} className="game-button">
            Delete
          </button>
        </div>
      ))}
      <button onClick={handleCreate}>Create new game</button>
    </div>
  );
}

export default Lobby;
