import { createContext } from 'react';

export type Callback = (
  playerId: string,
  leftClick: boolean,
  x: number,
  y: number
) => void;
export const registerCallbackContext = createContext<
  ((cb: Callback) => void) | null
>(null);
