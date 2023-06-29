import Board from "./components/Board";
import "./App.css";

const GAME_ID = "d43ca6d1-2890-4147-96c6-3de442454029";

const ws = new WebSocket(
  `wss://jokm6s5dl8.execute-api.us-east-2.amazonaws.com/poc?gameId=${encodeURIComponent(
    GAME_ID
  )}`
);

ws.onopen = function (event) {
  console.log("Connected");
  // const msg = {
  //   reveal: {
  //     x: 5,
  //     y: 10,
  //   },
  // };
  // ws.send(JSON.stringify(msg));
};

ws.onmessage = function (event) {
  console.log("New message: " + event.data);
};

ws.onerror = function (event) {
  console.log("WebSocket error: " + JSON.stringify(event));
};

ws.onclose = function (event) {
  console.log("WebSocket connection closed");
};

function App() {
  const handleClickBuilder =
    (ws: WebSocket, key: string): ((x: number, y: number) => void) =>
    (x: number, y: number) => {
      const action = {
        gameId: GAME_ID,
        [key]: { x, y },
      };

      ws.send(JSON.stringify(action));
    };

  return (
    <>
      <Board
        onLeftClick={handleClickBuilder(ws, "left")}
        onRightClick={handleClickBuilder(ws, "right")}
      />
    </>
  );
}

export default App;
