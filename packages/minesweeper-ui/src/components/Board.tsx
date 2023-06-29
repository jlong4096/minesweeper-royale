import React, { useState, useEffect } from "react";
import Cell, { CellType } from "./Cell";
import "./Board.scss";

export type BoardProps = {
  onReveal: (x: number, y: number) => void;
  onFlag: (x: number, y: number) => void;
};

type GridType = CellType[][];

type MineCoordinate = {
  row: number;
  col: number;
};

const GRID_WIDTH = 16;
const GRID_HEIGHT = 30;
const NUM_MINES = 99;

function generateMineLocations(
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
      throw new Error("Not enough unique locations for all mines");
    }

    const randomIndex = Math.floor(Math.random() * candidateLocations.length);
    mineLocations.push(candidateLocations[randomIndex]);

    // Remove the chosen location from the candidate list
    candidateLocations.splice(randomIndex, 1);
  }

  return mineLocations;
}

const checkForMine = (
  row: number,
  col: number,
  grid: GridType,
  width: number,
  height: number
): boolean => {
  if (row >= 0 && col >= 0 && row < height && col < width) {
    return grid[row][col].hasMine;
  } else {
    return false;
  }
};

const calculateAdjacentMines = (
  row: number,
  col: number,
  grid: GridType,
  width: number,
  height: number
): number => {
  let count = 0;

  // check the 8 cells around the current one
  count += checkForMine(row - 1, col - 1, grid, width, height) ? 1 : 0;
  count += checkForMine(row - 1, col, grid, width, height) ? 1 : 0;
  count += checkForMine(row - 1, col + 1, grid, width, height) ? 1 : 0;
  count += checkForMine(row, col - 1, grid, width, height) ? 1 : 0;
  count += checkForMine(row, col + 1, grid, width, height) ? 1 : 0;
  count += checkForMine(row + 1, col - 1, grid, width, height) ? 1 : 0;
  count += checkForMine(row + 1, col, grid, width, height) ? 1 : 0;
  count += checkForMine(row + 1, col + 1, grid, width, height) ? 1 : 0;

  return count;
};

const createEmptyGrid = (
  width: number,
  height: number,
  mineLocations: MineCoordinate[]
): GridType => {
  const grid: GridType = [];
  for (let row = 0; row < height; row++) {
    const newRow: CellType[] = [];
    for (let col = 0; col < width; col++) {
      newRow.push({
        hasMine: false,
        revealed: false,
        flagged: false,
        adjacentMines: 0,
      });
    }
    grid.push(newRow);
  }

  // Populate the grid with mines
  mineLocations.forEach(({ row, col }) => {
    if (row < height && col < width) {
      grid[row][col].hasMine = true;
    }
  });

  // Calculate adjacent mines for each cell
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (!grid[row][col].hasMine) {
        grid[row][col].adjacentMines = calculateAdjacentMines(
          row,
          col,
          grid,
          width,
          height
        );
      }
    }
  }

  return grid;
};

const deepCopy = (arr: CellType[][]): CellType[][] => {
  const copy: CellType[][] = [];
  arr.forEach((arrInner) => {
    copy.push([...arrInner]);
  });
  return copy;
};

const revealCell = (
  row: number,
  col: number,
  currentGrid: GridType
): GridType => {
  const newGrid = deepCopy(currentGrid);

  if (
    row >= 0 &&
    col >= 0 &&
    row < newGrid.length &&
    col < newGrid[0].length &&
    !newGrid[row][col].revealed
  ) {
    newGrid[row][col].revealed = true;

    if (newGrid[row][col].adjacentMines === 0) {
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          revealCell(row + i, col + j, newGrid);
        }
      }
    }
  }

  return newGrid;
};

function largestArea(grid: GridType): number[] {
  const visited = new Array(grid.length)
    .fill(false)
    .map(() => new Array(grid[0].length).fill(false));
  let maxArea = 0;
  let maxCell = [0, 0];

  function dfs(x: number, y: number): number {
    if (
      x < 0 ||
      y < 0 ||
      x >= grid.length ||
      y >= grid[0].length ||
      visited[x][y] ||
      grid[x][y].adjacentMines > 0
    ) {
      return 0;
    }

    visited[x][y] = true;
    return 1 + dfs(x + 1, y) + dfs(x - 1, y) + dfs(x, y + 1) + dfs(x, y - 1);
  }

  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[0].length; j++) {
      if (grid[i][j].adjacentMines === 0 && !visited[i][j]) {
        const area = dfs(i, j);
        if (area > maxArea) {
          maxArea = area;
          maxCell = [i, j];
        }
      }
    }
  }

  return maxCell;
}

const Board: React.FC<BoardProps> = ({ onReveal, onFlag }) => {
  const mineLocations = generateMineLocations(
    GRID_WIDTH,
    GRID_HEIGHT,
    NUM_MINES
  );
  const [grid, setGrid] = useState<GridType>(
    createEmptyGrid(GRID_WIDTH, GRID_HEIGHT, mineLocations)
  );
  const [unflaggedCount, setUnflaggedCount] = useState<number>(NUM_MINES);

  useEffect(() => {
    // Run on startup
    const [revealX, revealY] = largestArea(grid);
    handleCellClick(revealX, revealY);
  }, []);

  useEffect(() => {
    const arr = grid.map((row: CellType[]): number =>
      row.reduce(
        (acc: number, cur: CellType) => (cur.flagged ? acc + 1 : acc),
        0
      )
    );
    const numFlagged = arr.reduce((acc: number, cur: number) => acc + cur);
    setUnflaggedCount(NUM_MINES - numFlagged);
  }, [grid]);

  const computeNewGridState = (
    row: number,
    col: number,
    currentGrid: GridType
  ): GridType => {
    const newGrid = revealCell(row, col, currentGrid);
    return newGrid;
  };

  const handleCellClick = (row: number, col: number) => {
    if (grid[row][col].hasMine) {
      // Game over
      const newGrid = deepCopy(grid);
      for (let i = 0; i < newGrid.length; i++) {
        for (let j = 0; j < newGrid[0].length; j++) {
          newGrid[i][j].revealed = true;
        }
      }
      // TODO:  Come up with a way to overlay symbols.
      // Flagged correctly flagged mines should be shown.
      // Maybe an X over the mine that was clicked.
      setGrid(newGrid);
    } else {
      const newGrid = computeNewGridState(row, col, grid);
      setGrid(newGrid);
    }
  };

  const handleRightClick = (row: number, col: number) => {
    let newGrid = deepCopy(grid);

    // Toggle the flagged status
    if (!newGrid[row][col].revealed) {
      onFlag(row, col);
      newGrid[row][col].flagged = !newGrid[row][col].flagged;
    }

    // If the cell is already revealed and is not a mine, reveal the surrounding cells
    else if (!newGrid[row][col].hasMine) {
      let flaggedCount = 0;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          if (i !== 0 || j !== 0) {
            if (
              row + i >= 0 &&
              col + j >= 0 &&
              row + i < newGrid.length &&
              col + j < newGrid[0].length
            ) {
              if (newGrid[row + i][col + j].flagged) {
                flaggedCount++;
              }
            }
          }
        }
      }

      // Only reveal the surroundings if the number of flagged cells equals the adjacentMines count
      if (flaggedCount === newGrid[row][col].adjacentMines) {
        for (let i = -1; i <= 1; i++) {
          for (let j = -1; j <= 1; j++) {
            if (i !== 0 || j !== 0) {
              if (
                row + i >= 0 &&
                col + j >= 0 &&
                row + i < newGrid.length &&
                col + j < newGrid[0].length
              ) {
                if (!newGrid[row + i][col + j].flagged) {
                  newGrid = revealCell(row + i, col + j, newGrid);
                }
              }
            }
          }
        }
      }
    }

    setGrid(newGrid);
  };

  const getNeighborsRevealed = (row: number, col: number) => {
    const top = row > 0 && grid[row - 1][col].revealed;
    const right = col < grid[0].length - 1 && grid[row][col + 1].revealed;
    const bottom = row < grid.length - 1 && grid[row + 1][col].revealed;
    const left = col > 0 && grid[row][col - 1].revealed;

    return { top, right, bottom, left };
  };

  return (
    <div>
      {unflaggedCount}
      <div className="board">
        {grid.map((row, rowIndex) => (
          <div key={rowIndex} className="row">
            {row.map((cell, cellIndex) => (
              <Cell
                key={cellIndex}
                cell={cell}
                neighborsRevealed={getNeighborsRevealed(rowIndex, cellIndex)}
                onClick={() => {
                  onReveal(rowIndex, cellIndex);
                  handleCellClick(rowIndex, cellIndex);
                }}
                onRightClick={() => handleRightClick(rowIndex, cellIndex)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Board;
