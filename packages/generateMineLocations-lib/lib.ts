export type MineCoordinate = {
  row: number;
  col: number;
};

export function generateMineLocations(
  width: number,
  height: number,
  mineCount: number
): MineCoordinate[] {
  const mineLocations: MineCoordinate[] = [];
  const candidateLocations: MineCoordinate[] = [];

  // Create a list of all possible locations
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      candidateLocations.push({ row, col });
    }
  }

  // Randomly pick a location for each mine
  for (let i = 0; i < mineCount; i++) {
    if (candidateLocations.length === 0) {
      throw new Error('Not enough unique locations for all mines');
    }

    const randomIndex = Math.floor(Math.random() * candidateLocations.length);
    mineLocations.push(candidateLocations[randomIndex]);

    // Remove the chosen location from the candidate list
    candidateLocations.splice(randomIndex, 1);
  }

  return mineLocations;
}
