import leaflet from "leaflet";

interface Cell {
  readonly i: number;
  readonly j: number;
}

export class Board {
  readonly tileWidth: number;
  readonly tileVisibilityRadius: number;

  private readonly knownCells: Map<string, Cell>;

  constructor(tileWidth: number, tileVisibilityRadius: number) {
    this.tileWidth = tileWidth;
    this.tileVisibilityRadius = tileVisibilityRadius;
    this.knownCells = new Map<string, Cell>();
  }

  private getCanonicalCell(input: Cell): Cell {
    const i = input.i;
    const j = input.j;
    const key = `${i},${j}`;

    if (!this.knownCells.has(key)) {
      const cell = { i, j };
      this.knownCells.set(key, cell);
      return cell;
    }
    return this.knownCells.get(key)!;
  }

  getCellForPoint(point: leaflet.LatLng): Cell {
    const TILE_DEGREES = 1e-4;
    const i = Math.round(point.lat / TILE_DEGREES);
    const j = Math.round(point.lng / TILE_DEGREES);
    return this.getCanonicalCell({ i, j });
  }

  getCellBounds(cell: Cell): leaflet.LatLngBounds {
    const lat = cell.i;
    const lng = cell.j;
    const TILE_DEGREES = 1e-4;
    const bounds = leaflet.latLngBounds([
      [lat * TILE_DEGREES, lng * TILE_DEGREES],
      [(lat + 1) * TILE_DEGREES, (lng + 1) * TILE_DEGREES],
    ]);

    return bounds;
  }

  getCellsNearPoint(point: leaflet.LatLng): Cell[] {
    const resultCells: Cell[] = [];
    const originCell = this.getCellForPoint(point);
    // const TILE_DEGREES = 1e-4;

    for (
      let i = -this.tileVisibilityRadius;
      i < this.tileVisibilityRadius;
      i++
    ) {
      for (
        let j = -this.tileVisibilityRadius;
        j < this.tileVisibilityRadius;
        j++
      ) {
        const cell = this.getCanonicalCell({
          i: originCell.i + i,
          j: originCell.j + j,
        });
        resultCells.push(cell);
      }
    }
    return resultCells;
  }
}
