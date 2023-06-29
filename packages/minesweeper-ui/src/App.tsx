import Board from "./components/Board";
import "./App.css";

const GAME_ID = "5128a564-a704-4085-a0e8-8e52685e894b";

const ws = new WebSocket(
  `wss://6sktzarvqj.execute-api.us-east-2.amazonaws.com/poc?gameId=${encodeURIComponent(
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
  const handleReveal = (x: number, y: number) => {
    const action = {
      gameId: GAME_ID,
      reveal: {
        x,
        y,
      },
    };

    ws.send(JSON.stringify(action));
  };

  const handleFlag = (x: number, y: number) => {
    const action = {
      gameId: GAME_ID,
      flag: {
        x,
        y,
      },
    };

    ws.send(JSON.stringify(action));
  };

  return (
    <>
      <Board onReveal={handleReveal} onFlag={handleFlag} />
    </>
  );
}

export default App;
