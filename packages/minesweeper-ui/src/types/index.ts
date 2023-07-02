import { MineCoordinate } from 'generateMineLocations-lib';

export interface Game {
  id: string;
  name: string;
  coordinates: MineCoordinate[];
}
