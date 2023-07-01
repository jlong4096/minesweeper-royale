import { useParams } from 'react-router-dom';
import Board from './components/Board';

const WEBSOCKET_URL = import.meta.env.VITE_PLAYER_ACTIONS_WS;

function Game() {
  const { id } = useParams();

  const ws = new WebSocket(
    WEBSOCKET_URL + encodeURIComponent(id || '')
  );
  console.log('websocket is open');

  ws.onopen = function () {
    console.log("Connected");
  };

  ws.onmessage = function (event) {
    console.log("New message: " + event.data);
  };

  ws.onerror = function (event) {
    console.log("WebSocket error: " + JSON.stringify(event));
  };

  ws.onclose = function () {
    console.log("WebSocket connection closed");
  };

  const handleClickBuilder =
    (ws: WebSocket, key: string): ((x: number, y: number) => void) =>
    (x: number, y: number) => {
      const action = {
        gameId: id,
        [key]: { x, y },
      };

      ws.send(JSON.stringify(action));
    };

  return (
    <Board
      onLeftClick={handleClickBuilder(ws, "left")}
      onRightClick={handleClickBuilder(ws, "right")}
    />
  );
}

export default Game;
