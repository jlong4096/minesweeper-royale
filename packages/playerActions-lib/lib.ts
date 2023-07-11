// ReadyMessage - Websocket is connected and client lets server know they are ready to participate
export interface ReadyMessage {
  event: 'READY';
  gameId: string;
}

// JoinedMessage - Server let newly Ready client know about the game state
export interface JoinedMessage {
  event: 'JOINED';
  connectionId: string;
  allConnectionIds: string[];
}

// WelcomeMessage - Server lets other clients know of the newly Ready client
export interface WelcomeMessage {
  event: 'WELCOME';
  newConnectionId: string;
}

// ActionMessage - Client lets server know of play
export interface ActionMessage {
  event: 'ACTION';
  gameId: string; // Could probably be looked up by connectionId
  left?: { x: number; y: number };
  right?: { x: number; y: number };
}

// AnnounceMessage - Server lets clients know of the play by another player
export interface AnnounceMessage extends ActionMessage {
  connectionId: string;
}
