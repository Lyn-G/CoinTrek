import "leaflet/dist/leaflet.css";
import "./style.css";
import leaflet from "leaflet";
import luck from "./luck";
import { Board } from "./board";
import "./leafletWorkaround";

interface Cell {
  readonly i: number;
  readonly j: number;
}

interface Coin {
  readonly i: number;
  readonly j: number;
  serial: number;
}

const MERRILL_CLASSROOM = leaflet.latLng({
  lat: 36.9995,
  lng: -122.0533,
});

// i'm using Momento in main.ts !!!
function singleCoinToMomento(coin: Coin): string {
  const { i, j, serial } = coin;
  return `${i},${j},${serial}`;
}

function arrayCoinsToMomento(coin: Coin[]): string {
  return coin.map(singleCoinToMomento).join("|");
}

function singleCoinFromMomento(momento: string) {
  const [i, j, serial] = momento.split(",").map(Number);

  return { i, j, serial };
}

function arrayCoinsFromMomento(momento: string) {
  return momento.split("|").map(singleCoinFromMomento);
}

let knownTiles = new Map<string, Cell>();
let coinCount = new Map<string, Coin>();
let allPits = new Map<Cell, leaflet.Layer>();
let allCache = new Map<string, string>();
let coinArray: Coin[] = [];
let arrayFromCache: Coin[] = [];
let lines: leaflet.LatLng[] = [MERRILL_CLASSROOM];

function getCellForPoint(i: number, j: number) {
  const key = `${i},${j}`;

  if (!knownTiles.has(key)) {
    const cell = { i, j };
    knownTiles.set(key, cell);
    return cell;
  }
  return knownTiles.get(key);
}

function createCoin(i: number, j: number) {
  const key = `${i},${j}`;
  if (!coinCount.has(key)) {
    const serial = Math.round(luck([i, j].toString()) * 100);
    const coin: Coin = { i, j, serial };
    coinCount.set(key, coin);
  }
  return coinCount.get(key)!;
}

const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const PIT_SPAWN_PROBABILITY = 0.1;
const board = new Board(NEIGHBORHOOD_SIZE, GAMEPLAY_ZOOM_LEVEL);
// const playerLocation = board.getCellForPoint(MERRILL_CLASSROOM);

const mapContainer = document.querySelector<HTMLElement>("#map")!;

const map = leaflet.map(mapContainer, {
  center: MERRILL_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      "&copy; <a href='http://www.openstreetmap.org/copyright'>OpenStreetMap</a>",
  })
  .addTo(map);

const playerMarker = leaflet.marker(MERRILL_CLASSROOM);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

// buttons for movement
const sensorButton = document.querySelector("#sensor")!;
sensorButton.addEventListener("click", () => {
  setInterval(getNewLocation, 1000);
});

const moveNorth = document.querySelector("#north")!;
movementButtons(moveNorth, TILE_DEGREES, 0);

const moveSouth = document.querySelector("#south")!;
movementButtons(moveSouth, -TILE_DEGREES, 0);

const moveEast = document.querySelector("#east")!;
movementButtons(moveEast, 0, TILE_DEGREES);

const moveWest = document.querySelector("#west")!;
movementButtons(moveWest, 0, -TILE_DEGREES);

const resetButton = document.querySelector("#reset")!;
resetButton.addEventListener("click", () => {
  if (confirm("Are you sure you want to reset the game state?")) {
    playerMarker.setLatLng(leaflet.latLng(MERRILL_CLASSROOM));
    lines = [MERRILL_CLASSROOM];
    lines.length = 1;
    map.setView(playerMarker.getLatLng());
    map.eachLayer((l) => {
      if (l instanceof leaflet.Polyline) {
        map.removeLayer(l);
      }
    });
    points = 0;
    statusPanel.innerHTML = "No points yet...";
    knownTiles = new Map<string, Cell>();
    allPits = new Map<Cell, leaflet.Layer>();
    allCache = new Map<string, string>();
    coinCount = new Map<string, Coin>();
    coinArray = [];
    arrayFromCache = [];

    regeneratePitLocations();
  }
});

window.onbeforeunload = () => {
  storeInLocalStorage();
};

window.onload = () => {
  takeFromLocalStorage();
  lines = [
    leaflet.latLng({
      lat: playerMarker.getLatLng().lat,
      lng: playerMarker.getLatLng().lng,
    }),
  ];
};

// setting up stuff before making the pop-up
let points = 0;
let value = 0;

const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "No points yet...";

// making the pop-up
function makePit(cell: Cell) {
  const bounds = board.getCellBounds(cell);

  const pit = leaflet.rectangle(bounds) as leaflet.Layer;

  allPits.set(cell, pit);

  pit.bindPopup(() => {
    const getCoinsFromCell = allCache.get(`${cell.i},${cell.j}`);

    arrayFromCache = arrayCoinsFromMomento(getCoinsFromCell!);

    const currentLastCell = arrayFromCache[arrayFromCache.length - 1];

    value = isNaN(currentLastCell.serial) ? 0 : currentLastCell.serial + 1;

    const container = document.createElement("div");
    container.innerHTML = `
                <div>There is a pit here at
                "${currentLastCell.i},
                ${currentLastCell.j}"
                . It has a value of <span id="value">${value}</span>.
                <button id="deposit">deposit</button>`;

    // deposit button
    const deposit = container.querySelector<HTMLButtonElement>("#deposit");
    deposit?.addEventListener("click", () => {
      if (points) {
        points--;
        value++;

        // edit the innerHTML
        container.querySelector<HTMLSpanElement>("#value")!.innerHTML =
          value.toString();

        statusPanel.innerHTML = `${points} points accumulated`;

        editCacheInformationForDeposit(currentLastCell);
      }
    });

    arrayFromCache.forEach((c) => {
      if (c.i && c.j) coinCollect(container, c);
    });

    return container;
  });

  pit.addTo(map);
}

// create the cells and coins
regeneratePitLocations();

// create the multiple instances of coin collect buttons
function coinCollect(divContainer: HTMLDivElement, coin: Coin) {
  if (coin.serial < 0) return;

  const coinContainer = document.createElement("div");
  coinContainer.innerHTML += `<div>
  ${coin.i} 
  ${coin.j} 
  ${coin.serial} 
  <button id="collect">collect</button></div> `;
  divContainer.appendChild(coinContainer);

  const collect = coinContainer.querySelector<HTMLButtonElement>("#collect");
  collect?.addEventListener("click", () => {
    if (value) {
      editCacheInformationForCollect(coin);

      value--;
      points++;
      divContainer.querySelector<HTMLSpanElement>("#value")!.innerHTML =
        value.toString();

      statusPanel.innerHTML = `${points} points accumulated`;
      coinContainer?.remove();
    }
  });
}

// function to change player movement
function movementButtons(
  button: Element,
  latMovement: number,
  lngMovement: number
) {
  button.addEventListener("click", () => {
    playerMarker.setLatLng(
      leaflet.latLng(
        playerMarker.getLatLng().lat + latMovement,
        playerMarker.getLatLng().lng + lngMovement
      )
    );
    lines.push(
      leaflet.latLng({
        lat: playerMarker.getLatLng().lat,
        lng: playerMarker.getLatLng().lng,
      })
    );
    leaflet.polyline(lines, { color: "green" }).addTo(map);
    map.setView(playerMarker.getLatLng());
    regeneratePitLocations();
  });
}

// function to regenerate pit locations
// and make cells & coins
function regeneratePitLocations() {
  removeAllPits();
  const b = board.getCellsNearPoint(playerMarker.getLatLng());
  b.forEach((bCell) => {
    if (luck([bCell.i, bCell.j].toString()) < PIT_SPAWN_PROBABILITY) {
      getCellForPoint(bCell.i, bCell.j);
      const initialCoin = createCoin(bCell.i, bCell.j);
      setUpCoinArray(initialCoin, bCell);
      makePit(bCell);
    }
  });
}

function removeAllPits() {
  allPits.forEach((p) => {
    map.removeLayer(p);
  });
  allPits.clear();
}

function setUpCoinArray(cellCoin: Coin, cell: Cell) {
  // get the coin for the cell
  // iterate from 0 to the serial number to generate the coins for the pop-ups
  if (cellCoin) {
    for (
      let serialIterate = 0;
      serialIterate <= cellCoin?.serial;
      serialIterate++
    ) {
      coinArray.push({ i: cellCoin.i, j: cellCoin.j, serial: serialIterate });
    }
  }

  // put them into the Momentos pattern
  allCache.set(`${cell.i},${cell.j}`, arrayCoinsToMomento(coinArray));
  coinArray = [];
}

function editCacheInformationForCollect(coin: Coin) {
  const findCoin = coinCount.get(`${coin.i},${coin.j}`);
  const arrayLength = arrayCoinsFromMomento(
    allCache.get(`${coin.i},${coin.j}`)!
  );
  if (arrayLength.length <= 1) {
    allCache.delete(`${coin.i},${coin.j}`);
    coinArray.push({ i: coin.i, j: coin.j, serial: -1 });
    allCache.set(`${coin.i},${coin.j}`, arrayCoinsToMomento(coinArray));
    coinArray = [];
    if (findCoin) findCoin.serial = -1;
    return;
  }
  allCache.delete(`${coin.i},${coin.j}`);
  const findCell = knownTiles.get(`${coin.i},${coin.j}`);
  if (findCell && findCoin) {
    findCoin.serial--;
    setUpCoinArray(findCoin, findCell);
  }
}

function editCacheInformationForDeposit(coin: Coin) {
  allCache.delete(`${coin.i},${coin.j}`);
  const findCell = knownTiles.get(`${coin.i},${coin.j}`);
  const findCoin = coinCount.get(`${coin.i},${coin.j}`);

  if (findCell && findCoin) {
    findCoin.serial++;
    setUpCoinArray(findCoin, findCell);
  }
}

function getNewLocation() {
  navigator.geolocation.watchPosition((position) => {
    playerMarker.setLatLng(
      leaflet.latLng(position.coords.latitude, position.coords.longitude)
    );
    lines.push(
      leaflet.latLng({
        lat: playerMarker.getLatLng().lat,
        lng: playerMarker.getLatLng().lng,
      })
    );
    leaflet.polyline(lines, { color: "green" }).addTo(map);
    map.setView(playerMarker.getLatLng());
    regeneratePitLocations();
    storeInLocalStorage();
  });
}

function storeInLocalStorage() {
  const arrayFromCacheString = JSON.stringify(arrayFromCache);
  localStorage.setItem("array from cache", arrayFromCacheString);

  const arrayFromCoin = JSON.stringify(coinArray);
  localStorage.setItem("array from coin", arrayFromCoin);

  const coinCountString = JSON.stringify(Array.from(coinCount.entries()));
  localStorage.setItem("array from coin collect", coinCountString);
  console.log(coinCountString);

  localStorage.setItem("latitude", playerMarker.getLatLng().lat.toString());
  localStorage.setItem("longitude", playerMarker.getLatLng().lng.toString());
  localStorage.setItem("point", points.toString());
}

function takeFromLocalStorage() {
  const arrayFromCacheString = localStorage.getItem("array from cache");
  if (arrayFromCacheString)
    arrayFromCache = JSON.parse(arrayFromCacheString) as Coin[];

  const arrayFromCoin = localStorage.getItem("array from coin");
  if (arrayFromCoin) coinArray = JSON.parse(arrayFromCoin) as Coin[];

  const coinCountString = localStorage.getItem("array from coin collect");
  if (coinCountString) {
    const coinCountArray = JSON.parse(coinCountString) as [string, Coin][];
    coinCount = new Map(coinCountArray);
    console.log(coinCount);
  }

  points = Number(localStorage.getItem("point"));
  if (points == 0) {
    statusPanel.innerHTML = "No points yet...";
  } else {
    statusPanel.innerHTML = `${points} points accumulated`;
  }

  playerMarker.setLatLng(
    leaflet.latLng({
      lat: Number(localStorage.getItem("latitude")),
      lng: Number(localStorage.getItem("longitude")),
    })
  );
  map.setView(playerMarker.getLatLng());
  regeneratePitLocations();
}
