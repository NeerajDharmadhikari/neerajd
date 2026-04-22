const STORAGE_KEY = "sideoutLabBoardsV2";
const SHARE_PARAM = "board";
const QUEUE_LIMIT = 5;
const POSITIONS = ["topLeft", "topMiddle", "topRight", "bottomLeft", "bottomMiddle", "bottomRight"];

const state = {
  boards: [],
  activeBoard: null,
  activeRotationIndex: 0,
  selectedPlayerId: null
};

const els = {
  notice: document.getElementById("notice"),
  homeView: document.getElementById("homeView"),
  setupView: document.getElementById("setupView"),
  builderView: document.getElementById("builderView"),
  boardList: document.getElementById("boardList"),
  startCreateButton: document.getElementById("startCreateButton"),
  clearBoardsButton: document.getElementById("clearBoardsButton"),
  homeButton: document.getElementById("homeButton"),
  copyShareButton: document.getElementById("copyShareButton"),
  copyShareButtonCourt: document.getElementById("copyShareButtonCourt"),
  setupForm: document.getElementById("setupForm"),
  boardName: document.getElementById("boardName"),
  playerName: document.getElementById("playerName"),
  playerGender: document.getElementById("playerGender"),
  addPlayerButton: document.getElementById("addPlayerButton"),
  setupPlayerList: document.getElementById("setupPlayerList"),
  playerCount: document.getElementById("playerCount"),
  cancelSetupButton: document.getElementById("cancelSetupButton"),
  activeBoardName: document.getElementById("activeBoardName"),
  rotationCounter: document.getElementById("rotationCounter"),
  rotationTabs: document.getElementById("rotationTabs"),
  roleStickers: document.querySelectorAll(".role-sticker"),
  roleStatus: document.getElementById("roleStatus"),
  bench: document.getElementById("bench"),
  subQueue: document.getElementById("subQueue"),
  queueCount: document.getElementById("queueCount"),
  court: document.getElementById("court"),
  courtHeading: document.getElementById("courtHeading"),
  clearCourtButton: document.getElementById("clearCourtButton"),
  previousRotationButton: document.getElementById("previousRotationButton"),
  saveRotationButton: document.getElementById("saveRotationButton"),
  nextRotationButton: document.getElementById("nextRotationButton")
};

let draftPlayers = [];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function showNotice(message) {
  els.notice.textContent = message;
  els.notice.classList.remove("hidden");
  window.setTimeout(() => els.notice.classList.add("hidden"), 3000);
}

function showView(viewName) {
  els.homeView.classList.toggle("hidden", viewName !== "home");
  els.setupView.classList.toggle("hidden", viewName !== "setup");
  els.builderView.classList.toggle("hidden", viewName !== "builder");
}

function loadBoards() {
  try {
    state.boards = (JSON.parse(localStorage.getItem(STORAGE_KEY)) || []).map(normalizeBoard);
  } catch (error) {
    state.boards = [];
  }
}

function saveBoards() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.boards));
}

function normalizeBoard(board) {
  const rotations = Array.isArray(board.rotations) && board.rotations.length ? board.rotations.map(normalizeRotation) : [emptyRotation()];
  const queues = Array.isArray(board.queues) ? board.queues : [];
  const setters = Array.isArray(board.setters) ? board.setters : [];
  const middles = Array.isArray(board.middles) ? board.middles : [];
  const arrows = Array.isArray(board.arrows) ? board.arrows : [];

  return {
    id: board.id || uid(),
    name: board.name || "Untitled board",
    players: Array.isArray(board.players) ? board.players : [],
    rotations,
    queues: rotations.map((rotation, index) => Array.isArray(queues[index]) ? queues[index] : []),
    setters: rotations.map((rotation, index) => normalizeSetter(setters[index])),
    middles: rotations.map((rotation, index) => normalizeSetter(middles[index])),
    arrows: rotations.map((rotation, index) => Array.isArray(arrows[index]) ? arrows[index] : []),
    updatedAt: board.updatedAt || new Date().toISOString()
  };
}

function normalizeSetter(setterSpot) {
  return POSITIONS.includes(setterSpot) ? setterSpot : null;
}

function normalizeRotation(rotation) {
  const normalized = emptyRotation();
  const legacyMap = {
    4: "topLeft",
    3: "topMiddle",
    2: "topRight",
    5: "bottomLeft",
    6: "bottomMiddle",
    1: "bottomRight"
  };

  Object.entries(rotation || {}).forEach(([position, playerId]) => {
    const normalizedPosition = legacyMap[position] || position;
    if (POSITIONS.includes(normalizedPosition)) {
      normalized[normalizedPosition] = playerId;
    }
  });

  return normalized;
}

function emptyRotation() {
  return POSITIONS.reduce((rotation, position) => {
    rotation[position] = null;
    return rotation;
  }, {});
}

function encodeBoard(board) {
  const payload = JSON.stringify({
    name: board.name,
    players: board.players,
    rotations: board.rotations,
    queues: board.queues || [],
    setters: board.setters || [],
    middles: board.middles || [],
    arrows: board.arrows || []
  });
  const bytes = new TextEncoder().encode(payload);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBoard(encoded) {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return normalizeBoard(JSON.parse(new TextDecoder().decode(bytes)));
}

function getShareUrl(board) {
  const url = new URL(window.location.href);
  url.searchParams.set(SHARE_PARAM, encodeBoard(board));
  return url.toString();
}

async function copyShareLink() {
  if (!state.activeBoard) {
    showNotice("Open or create a board before copying a share link.");
    return;
  }

  const shareUrl = getShareUrl(state.activeBoard);
  try {
    await navigator.clipboard.writeText(shareUrl);
    showNotice("Share link copied.");
  } catch (error) {
    window.prompt("Copy this share link:", shareUrl);
  }
}

function renderBoardList() {
  els.boardList.innerHTML = "";

  if (!state.boards.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No local boards yet. Create one to start mapping rotations.";
    els.boardList.appendChild(empty);
    return;
  }

  state.boards.forEach((board) => {
    const card = document.createElement("article");
    card.className = "board-card";

    const title = document.createElement("h3");
    title.textContent = board.name;

  const meta = document.createElement("p");
  meta.textContent = `${board.players.length} players · ${board.rotations.length} rotations`;

    const actions = document.createElement("div");
    actions.className = "board-card-actions";

    const openButton = document.createElement("button");
    openButton.className = "primary-button";
    openButton.type = "button";
    openButton.textContent = "Open";
    openButton.addEventListener("click", () => openBoard(board.id));

    const shareButton = document.createElement("button");
    shareButton.className = "secondary-button";
    shareButton.type = "button";
    shareButton.textContent = "Share";
    shareButton.addEventListener("click", async () => {
      state.activeBoard = board;
      await copyShareLink();
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "text-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteBoard(board.id));

    actions.append(openButton, shareButton, deleteButton);
    card.append(title, meta, actions);
    els.boardList.appendChild(card);
  });
}

function renderDraftPlayers() {
  els.setupPlayerList.innerHTML = "";
  els.playerCount.textContent = `${draftPlayers.length} player${draftPlayers.length === 1 ? "" : "s"}`;

  if (!draftPlayers.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Add at least six players to start.";
    els.setupPlayerList.appendChild(empty);
    return;
  }

  draftPlayers.forEach((player) => {
    const chip = playerChip(player);
    const remove = document.createElement("button");
    remove.className = "player-remove";
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${player.name}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      draftPlayers = draftPlayers.filter((item) => item.id !== player.id);
      renderDraftPlayers();
    });
    chip.appendChild(remove);
    els.setupPlayerList.appendChild(chip);
  });
}

function playerChip(player) {
  const chip = document.createElement("button");
  chip.className = "player-chip";
  chip.type = "button";
  chip.dataset.playerId = player.id;
  chip.draggable = true;

  const dot = document.createElement("span");
  dot.className = `gender-dot ${player.gender}`;
  dot.textContent = player.gender;

  const name = document.createElement("span");
  name.textContent = player.name;

  chip.append(dot, name);
  return chip;
}

function addDraftPlayer() {
  const name = els.playerName.value.trim();
  if (!name) {
    showNotice("Add a player name first.");
    return;
  }

  draftPlayers.push({
    id: uid(),
    name,
    gender: els.playerGender.value
  });
  els.playerName.value = "";
  els.playerName.focus();
  renderDraftPlayers();
}

function startSetup() {
  draftPlayers = [];
  els.setupForm.reset();
  renderDraftPlayers();
  showView("setup");
}

function createBoard(event) {
  event.preventDefault();
  if (draftPlayers.length < 6) {
    showNotice("Add at least six players before starting.");
    return;
  }

  const board = normalizeBoard({
    id: uid(),
    name: els.boardName.value.trim(),
    players: draftPlayers,
    rotations: [emptyRotation()],
    queues: [[]],
    setters: [null],
    middles: [null],
    arrows: [[]],
    updatedAt: new Date().toISOString()
  });

  state.boards.unshift(board);
  saveBoards();
  state.activeBoard = board;
  state.activeRotationIndex = 0;
  renderBuilder();
  showView("builder");
}

function openBoard(id) {
  state.activeBoard = state.boards.find((board) => board.id === id);
  state.activeRotationIndex = 0;
  state.selectedPlayerId = null;
  renderBuilder();
  showView("builder");
}

function deleteBoard(id) {
  state.boards = state.boards.filter((board) => board.id !== id);
  saveBoards();
  renderBoardList();
}

function renderBuilder() {
  if (!state.activeBoard) return;

  const board = state.activeBoard;
  const rotationNumber = state.activeRotationIndex + 1;
  const rotation = board.rotations[state.activeRotationIndex] || emptyRotation();
  board.rotations[state.activeRotationIndex] = rotation;
  board.queues[state.activeRotationIndex] = cleanQueue(rotation, board.queues[state.activeRotationIndex]);
  board.setters[state.activeRotationIndex] = normalizeSetter(board.setters[state.activeRotationIndex]);
  board.middles[state.activeRotationIndex] = normalizeSetter(board.middles[state.activeRotationIndex]);
  board.arrows[state.activeRotationIndex] = Array.isArray(board.arrows[state.activeRotationIndex]) ? board.arrows[state.activeRotationIndex] : [];

  els.activeBoardName.textContent = board.name;
  els.rotationCounter.textContent = `Rotation ${rotationNumber}`;
  els.courtHeading.textContent = `Rotation ${rotationNumber}`;
  els.previousRotationButton.disabled = state.activeRotationIndex === 0;
  renderRotationTabs();
  renderRoleStatus();
  renderBench(rotation);
  renderSubQueue(board.queues[state.activeRotationIndex]);
  renderCourt(rotation);
}

function renderRotationTabs() {
  els.rotationTabs.innerHTML = "";
  state.activeBoard.rotations.forEach((rotation, index) => {
    const tab = document.createElement("button");
    tab.className = `rotation-tab${index === state.activeRotationIndex ? " active" : ""}`;
    tab.type = "button";
    tab.textContent = `${index + 1}`;
    tab.addEventListener("click", () => {
      state.activeRotationIndex = index;
      state.selectedPlayerId = null;
      renderBuilder();
    });
    els.rotationTabs.appendChild(tab);
  });
}

function renderRoleStatus() {
  const rotation = state.activeBoard.rotations[state.activeRotationIndex];
  const setter = getRolePlayer("setter", rotation);
  const middle = getRolePlayer("middle", rotation);
  const labels = [];
  if (setter) labels.push(`Setter: ${setter.name}`);
  if (middle) labels.push(`Middle: ${middle.name}`);
  els.roleStatus.textContent = labels.length ? labels.join(" · ") : "Not placed";
  els.roleStickers.forEach((sticker) => {
    sticker.classList.toggle("placed", Boolean(getRolePlayer(sticker.dataset.role, rotation)));
  });
}

function getRolePlayer(role, rotation) {
  const spot = getRoleSpot(role);
  const playerId = spot ? rotation[spot] : null;
  return state.activeBoard.players.find((item) => item.id === playerId);
}

function getRoleSpot(role) {
  if (role === "setter") return state.activeBoard.setters[state.activeRotationIndex];
  if (role === "middle") return state.activeBoard.middles[state.activeRotationIndex];
  return null;
}

function renderBench(rotation) {
  els.bench.innerHTML = "";
  const assignedIds = new Set(Object.values(rotation).filter(Boolean));
  const queuedIds = new Set(state.activeBoard.queues[state.activeRotationIndex] || []);
  const benchPlayers = state.activeBoard.players.filter((player) => !assignedIds.has(player.id) && !queuedIds.has(player.id));

  if (!benchPlayers.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "All six spots are filled.";
    els.bench.appendChild(empty);
    return;
  }

  benchPlayers.forEach((player) => {
    const chip = playerChip(player);
    chip.classList.toggle("selected", state.selectedPlayerId === player.id);
    chip.addEventListener("click", () => selectPlayer(player.id));
    chip.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", player.id);
    });
    els.bench.appendChild(chip);
  });
}

function cleanQueue(rotation, existingQueue = []) {
  const assignedIds = new Set(Object.values(rotation).filter(Boolean));
  const waitingIds = state.activeBoard.players
    .filter((player) => !assignedIds.has(player.id))
    .map((player) => player.id);
  return existingQueue.filter((playerId) => waitingIds.includes(playerId));
}

function renderSubQueue(queue) {
  els.subQueue.innerHTML = "";
  els.queueCount.textContent = `${queue.length}/${QUEUE_LIMIT} waiting`;

  for (let index = 0; index < QUEUE_LIMIT; index += 1) {
    const playerId = queue[index];
    const player = state.activeBoard.players.find((item) => item.id === playerId);

    if (!player) {
      const openSlot = document.createElement("button");
      openSlot.className = "queue-player queue-empty";
      openSlot.type = "button";
      openSlot.dataset.queueOrder = `${index + 1}`;
      openSlot.textContent = "Open";
      openSlot.addEventListener("click", () => {
        if (state.selectedPlayerId) {
          addPlayerToQueue(state.selectedPlayerId);
        }
      });
      els.subQueue.appendChild(openSlot);
      continue;
    }

    const queuePlayer = document.createElement("button");
    queuePlayer.className = `queue-player${index === 0 ? " next-in" : ""}`;
    queuePlayer.type = "button";
    queuePlayer.dataset.queueOrder = index === 0 ? "IN" : `${index + 1}`;
    queuePlayer.draggable = true;
    queuePlayer.addEventListener("click", () => removePlayerFromQueue(playerId));
    queuePlayer.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", player.id);
    });

    const name = document.createElement("span");
    name.textContent = player.name;
    queuePlayer.appendChild(name);
    els.subQueue.appendChild(queuePlayer);
  }
}

function renderCourt(rotation) {
  document.querySelectorAll(".court-spot").forEach((spot) => {
    const playerId = rotation[spot.dataset.spot];
    const player = state.activeBoard.players.find((item) => item.id === playerId);
    const hasSetter = state.activeBoard.setters[state.activeRotationIndex] === spot.dataset.spot;
    const hasMiddle = state.activeBoard.middles[state.activeRotationIndex] === spot.dataset.spot;
    spot.classList.toggle("filled", Boolean(player));
    spot.classList.toggle("has-setter", Boolean(player) && hasSetter);
    spot.classList.toggle("has-middle", Boolean(player) && hasMiddle);
    spot.dataset.playerName = player ? player.name : "";
  });
}

function selectPlayer(playerId) {
  state.selectedPlayerId = state.selectedPlayerId === playerId ? null : playerId;
  renderBuilder();
}

function assignPlayerToSpot(playerId, spotId) {
  const rotation = state.activeBoard.rotations[state.activeRotationIndex];
  const queue = state.activeBoard.queues[state.activeRotationIndex] || [];
  Object.keys(rotation).forEach((position) => {
    if (rotation[position] === playerId) {
      rotation[position] = null;
    }
  });
  state.activeBoard.queues[state.activeRotationIndex] = queue.filter((queuedPlayerId) => queuedPlayerId !== playerId);
  rotation[spotId] = playerId;
  state.selectedPlayerId = null;
  renderBuilder();
}

function assignRoleToSpot(role, spotId) {
  const rotation = state.activeBoard.rotations[state.activeRotationIndex];
  if (!rotation[spotId]) {
    showNotice(`Place a player there before adding the ${role} sticker.`);
    return;
  }
  if (role === "setter") {
    state.activeBoard.setters[state.activeRotationIndex] = spotId;
  } else if (role === "middle") {
    state.activeBoard.middles[state.activeRotationIndex] = spotId;
  }
  renderBuilder();
}

function clearRole(role) {
  if (role === "setter") {
    state.activeBoard.setters[state.activeRotationIndex] = null;
  } else if (role === "middle") {
    state.activeBoard.middles[state.activeRotationIndex] = null;
  }
  renderBuilder();
}

function addPlayerToQueue(playerId) {
  const rotation = state.activeBoard.rotations[state.activeRotationIndex];
  const queue = state.activeBoard.queues[state.activeRotationIndex] || [];
  if (queue.length >= QUEUE_LIMIT && !queue.includes(playerId)) {
    showNotice("The sub queue has five spots.");
    return;
  }
  Object.keys(rotation).forEach((position) => {
    if (rotation[position] === playerId) {
      rotation[position] = null;
    }
  });
  if (!queue.includes(playerId)) {
    queue.push(playerId);
  }
  state.activeBoard.queues[state.activeRotationIndex] = queue;
  state.selectedPlayerId = null;
  renderBuilder();
}

function removePlayerFromQueue(playerId) {
  state.activeBoard.queues[state.activeRotationIndex] = (state.activeBoard.queues[state.activeRotationIndex] || [])
    .filter((queuedPlayerId) => queuedPlayerId !== playerId);
  state.selectedPlayerId = null;
  renderBuilder();
}

function clearCourt() {
  state.activeBoard.rotations[state.activeRotationIndex] = emptyRotation();
  state.activeBoard.queues[state.activeRotationIndex] = [];
  state.activeBoard.setters[state.activeRotationIndex] = null;
  state.activeBoard.middles[state.activeRotationIndex] = null;
  state.selectedPlayerId = null;
  renderBuilder();
}

function saveActiveBoard() {
  const board = state.activeBoard;
  const existingIndex = state.boards.findIndex((item) => item.id === board.id);
  board.updatedAt = new Date().toISOString();
  if (existingIndex >= 0) {
    state.boards.splice(existingIndex, 1, board);
  } else {
    state.boards.unshift(board);
  }
  saveBoards();
}

function persistCurrentRotation() {
  const rotation = state.activeBoard.rotations[state.activeRotationIndex];
  const queue = cleanQueue(rotation, state.activeBoard.queues[state.activeRotationIndex]);
  const filledCount = Object.values(rotation).filter(Boolean).length;
  if (filledCount < 6) {
    showNotice(`Fill all six spots before saving. ${6 - filledCount} left.`);
    return false;
  }

  state.activeBoard.queues[state.activeRotationIndex] = queue;
  saveActiveBoard();
  return true;
}

function generateNextRotationFromCurrent() {
  const rotation = state.activeBoard.rotations[state.activeRotationIndex];
  const queue = cleanQueue(rotation, state.activeBoard.queues[state.activeRotationIndex]);
  const next = calculateNextRotation(rotation, queue);
  state.activeBoard.rotations[state.activeRotationIndex + 1] = next.rotation;
  state.activeBoard.queues[state.activeRotationIndex + 1] = next.queue;
  state.activeBoard.setters[state.activeRotationIndex + 1] = null;
  state.activeBoard.middles[state.activeRotationIndex + 1] = null;
  state.activeBoard.arrows[state.activeRotationIndex + 1] = [];
}

function saveRotation() {
  if (!persistCurrentRotation()) return;
  showNotice(`Rotation ${state.activeRotationIndex + 1} saved.`);

  generateNextRotationFromCurrent();
  state.activeRotationIndex += 1;
  renderBuilder();
}

function calculateNextRotation(rotation, queue) {
  const outgoingPlayerId = rotation.topRight;
  const incomingPlayerId = queue[0] || outgoingPlayerId;
  const nextQueue = queue.length ? [...queue.slice(1), outgoingPlayerId].filter(Boolean) : [];

  return {
    rotation: {
      topLeft: rotation.bottomLeft,
      topMiddle: rotation.topLeft,
      topRight: rotation.topMiddle,
      bottomLeft: rotation.bottomMiddle,
      bottomMiddle: rotation.bottomRight,
      bottomRight: incomingPlayerId
    },
    queue: nextQueue
  };
}

function goToPreviousRotation() {
  if (state.activeRotationIndex === 0) return;
  if (!persistCurrentRotation()) return;
  state.activeRotationIndex -= 1;
  state.selectedPlayerId = null;
  renderBuilder();
}

function goToNextRotation() {
  if (state.activeRotationIndex === state.activeBoard.rotations.length - 1) {
    if (!persistCurrentRotation()) return;
    generateNextRotationFromCurrent();
  } else if (!persistCurrentRotation()) {
    return;
  }
  state.activeRotationIndex += 1;
  state.selectedPlayerId = null;
  renderBuilder();
}

function loadSharedBoard() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get(SHARE_PARAM);
  if (!encoded) return false;

  try {
    const board = decodeBoard(encoded);
    state.activeBoard = board;
    state.activeRotationIndex = 0;
    const alreadySaved = state.boards.some((item) => encodeBoard(item) === encodeBoard(board));
    if (!alreadySaved) {
      state.boards.unshift(board);
      saveBoards();
    }
    renderBuilder();
    showView("builder");
    showNotice("Loaded shared Sideout Lab board.");
    return true;
  } catch (error) {
    showNotice("That shared link could not be loaded.");
    return false;
  }
}

function bindEvents() {
  els.startCreateButton.addEventListener("click", startSetup);
  els.cancelSetupButton.addEventListener("click", () => showView("home"));
  els.addPlayerButton.addEventListener("click", addDraftPlayer);
  els.playerName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addDraftPlayer();
    }
  });
  els.setupForm.addEventListener("submit", createBoard);
  els.homeButton.addEventListener("click", () => {
    state.activeBoard = null;
    state.selectedPlayerId = null;
    renderBoardList();
    showView("home");
  });
  els.clearBoardsButton.addEventListener("click", () => {
    state.boards = [];
    saveBoards();
    renderBoardList();
  });
  els.copyShareButton.addEventListener("click", copyShareLink);
  els.copyShareButtonCourt.addEventListener("click", copyShareLink);
  els.clearCourtButton.addEventListener("click", clearCourt);
  els.previousRotationButton.addEventListener("click", goToPreviousRotation);
  els.nextRotationButton.addEventListener("click", goToNextRotation);
  els.saveRotationButton.addEventListener("click", saveRotation);
  els.roleStickers.forEach((sticker) => {
    sticker.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/sticker", `role-${sticker.dataset.role}`);
      event.dataTransfer.setData("text/plain", `role-${sticker.dataset.role}`);
    });
    sticker.addEventListener("click", () => {
      if (getRoleSpot(sticker.dataset.role)) {
        clearRole(sticker.dataset.role);
      } else {
        showNotice(`Drag the ${sticker.dataset.role} sticker onto a player circle.`);
      }
    });
  });
  els.subQueue.addEventListener("click", (event) => {
    if (event.target.closest(".queue-player")) return;
    if (state.selectedPlayerId) {
      addPlayerToQueue(state.selectedPlayerId);
    }
  });
  els.subQueue.addEventListener("dragover", (event) => {
    event.preventDefault();
    els.subQueue.classList.add("drop-target");
  });
  els.subQueue.addEventListener("dragleave", () => {
    els.subQueue.classList.remove("drop-target");
  });
  els.subQueue.addEventListener("drop", (event) => {
    event.preventDefault();
    els.subQueue.classList.remove("drop-target");
    const playerId = event.dataTransfer.getData("text/plain");
    if (playerId) {
      addPlayerToQueue(playerId);
    }
  });

  document.querySelectorAll(".court-spot").forEach((spot) => {
    spot.addEventListener("click", () => {
      const rotation = state.activeBoard.rotations[state.activeRotationIndex];
      const existingPlayerId = rotation[spot.dataset.spot];
      const hasSetter = state.activeBoard.setters[state.activeRotationIndex] === spot.dataset.spot;
      const hasMiddle = state.activeBoard.middles[state.activeRotationIndex] === spot.dataset.spot;
      if ((hasSetter || hasMiddle) && !state.selectedPlayerId) {
        clearRole(hasMiddle ? "middle" : "setter");
        return;
      }
      if (state.selectedPlayerId) {
        assignPlayerToSpot(state.selectedPlayerId, spot.dataset.spot);
      } else if (existingPlayerId) {
        rotation[spot.dataset.spot] = null;
        renderBuilder();
      }
    });

    spot.addEventListener("dragover", (event) => {
      event.preventDefault();
      spot.classList.add("drop-target");
    });

    spot.addEventListener("dragleave", () => {
      spot.classList.remove("drop-target");
    });

    spot.addEventListener("drop", (event) => {
      event.preventDefault();
      spot.classList.remove("drop-target");
      const sticker = event.dataTransfer.getData("text/sticker");
      if (sticker === "role-setter" || sticker === "role-middle") {
        assignRoleToSpot(sticker.replace("role-", ""), spot.dataset.spot);
        return;
      }
      const playerId = event.dataTransfer.getData("text/plain");
      if (playerId && !playerId.startsWith("role-")) {
        assignPlayerToSpot(playerId, spot.dataset.spot);
      }
    });
  });
}

function init() {
  loadBoards();
  bindEvents();
  if (!loadSharedBoard()) {
    renderBoardList();
    showView("home");
  }
}

init();
