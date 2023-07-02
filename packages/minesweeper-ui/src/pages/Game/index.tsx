import { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Game } from '@/types';
import { MineCoordinate } from 'generateMineLocations-lib';
import { Callback, registerCallbackContext } from './index.context';
import Board from './components/Board';
import './Game.scss';

const GAME_URL = import.meta.env.VITE_GAME_MANAGER_URL;
const WEBSOCKET_URL = import.meta.env.VITE_PLAYER_ACTIONS_WS;

function Game() {
  const { gameId } = useParams();

  const ws = useRef<WebSocket | null>(null)
  const loaded = useRef<boolean>(false);
  const callbacks = useRef<Callback[]>([]);

  const [ mines, setMines ] = useState<MineCoordinate[]>([]);
  const [ playerId, setPlayerId ] = useState<string>('');
  const [ otherPlayers, setOtherPlayers ] = useState<string[]>([]);

  const registerCb = (cb: Callback) => { callbacks.current.push(cb); };

  useEffect(() => {
    if (loaded.current) {
      return;
    }
    if (!gameId) {
      return;
    }

    loaded.current = true;

    async function fetchGame() {
      if (!ignore) {
        console.log('fetching game');

        console.log(`${GAME_URL}/${gameId}`);
        const res = await fetch(`${GAME_URL}/${gameId}`);
        const game: Game = await res.json();
        console.log(game.coordinates);
        setMines(game.coordinates);

        ws.current = new WebSocket(
          WEBSOCKET_URL + encodeURIComponent(gameId || '')
        );
        console.log('websocket is open');

        ws.current.onopen = function () {
          if (ws.current) {
            console.log("Client is ready");
            ws.current.send(JSON.stringify({ event: 'READY', gameId: gameId }));
          }
        };

        ws.current.onmessage = function (event) {
          console.log("New message: " + event.data);
          const action = JSON.parse(event.data);
          // TODO:  Capture and share all possible message types.
          if (action.event === 'JOINED') {
            setPlayerId(action.connectionId);
            setOtherPlayers(action.allConnectionIds);
          } else if (action.event === 'WELCOME') {
            setOtherPlayers([...otherPlayers, action.newConnectionId]);
          } else if (action.event === 'ACTION') {
            callbacks.current.forEach((cb: Callback) =>
              cb(
                action.connectionId,
                !!action.left,
                action[action.left ? 'left' : 'right'].x,
                action[action.left ? 'left' : 'right'].y
              )
            );
          }
        };

        ws.current.onerror = function (event) {
          console.log("WebSocket error: " + JSON.stringify(event));
        };

        ws.current.onclose = function () {
          console.log("WebSocket connection closed");
        };
      }
    }

    let ignore = false;
    fetchGame();
    return () => {
      ignore = true ;
      if (ws.current) {
        console.log('Disconnecting WS...');
        ws.current.close();
      }
    };
  }, [gameId]);

  const handleClickBuilder =
    (ws: WebSocket | null, key: string): ((x: number, y: number) => void) =>
    (x: number, y: number) => {
      if (!ws) {
        return;
      }

      const action = {
        event: 'ACTION',
        gameId: gameId,
        // TODO:  This is kind of annoying elsewhere.
        [key]: { x, y },
      };

      ws.send(JSON.stringify(action));
    };

  return (
    <registerCallbackContext.Provider value={registerCb}>
      <div>
        <div className="navbar">
          <Link to="/">Leave game</Link>
        </div>
        <div className="game-field">
          <div className="player-board">
            { mines && mines.length && <Board
              playerId={playerId}
              mines={mines}
              onLeftClick={handleClickBuilder(ws.current, "left")}
              onRightClick={handleClickBuilder(ws.current, "right")}
            />}
          </div>
          <div className="opponent-field">
            { otherPlayers.filter((otherId) => otherId !== playerId).map((otherId) => (<div key={otherId} className="opponent-board"><Board playerId={otherId} mines={mines} viewOnly /></div>)) }
          </div>
        </div>
      </div>
    </registerCallbackContext.Provider>
  );
}

export default Game;
