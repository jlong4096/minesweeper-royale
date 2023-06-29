import React, { memo } from "react";
import "./Cell.scss";

export type CellProps = {
  cell: CellType;
  onClick: () => void;
  onRightClick: () => void;
  neighborsRevealed: {
    top: boolean;
    right: boolean;
    bottom: boolean;
    left: boolean;
  };
};

export type CellType = {
  hasMine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacentMines: number;
};

const Cell: React.FC<CellProps> = memo(
  ({ cell, neighborsRevealed, onClick, onRightClick }) => {
    const numColors = [
      "#0000FF",
      "#008000",
      "#FF0000",
      "#000080",
      "#800000",
      "#008080",
      "#000000",
      "#808080",
    ];
    const bomb = "\u{1F4A3}";
    const flag = "\u{1F6A9}";

    const { hasMine, revealed, flagged, adjacentMines } = cell;
    const mineRevealed = hasMine && revealed;
    const numRevealed = !hasMine && revealed && adjacentMines > 0;
    const mineFlagged = !revealed && flagged;

    const calcBorderColor = (revealed: boolean): string => {
      return revealed ? "white" : "black";
    };

    const handleRightClick = (e: React.MouseEvent) => {
      e.preventDefault();
      onRightClick();
    };

    return (
      <div
        className={`cell ${revealed && "revealed"}`}
        style={{
          borderTopColor: calcBorderColor(revealed && neighborsRevealed.top),
          borderRightColor: calcBorderColor(
            revealed && neighborsRevealed.right
          ),
          borderBottomColor: calcBorderColor(
            revealed && neighborsRevealed.bottom
          ),
          borderLeftColor: calcBorderColor(revealed && neighborsRevealed.left),
          color: numRevealed ? numColors[adjacentMines - 1] : "black",
        }}
        onClick={() => {
          if (!flagged) {
            onClick();
          }
        }}
        onContextMenu={handleRightClick}
      >
        {mineRevealed && bomb}
        {numRevealed && adjacentMines}
        {mineFlagged && flag}
      </div>
    );
  }
);

export default Cell;
