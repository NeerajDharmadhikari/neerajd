const STORAGE_KEY = "sideoutLabBoardsV2";
const LEGACY_STORAGE_PREFIX = "sideoutLabBoards";
const TEAM_PASSWORD_KEY = "sideoutLabTeamPassword";
const SUPABASE_REST_URL = "https://aggmpwabqlifcwvnyfyb.supabase.co/rest/v1";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnZ21wd2FicWxpZmN3dm55ZnliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNDIzNTUsImV4cCI6MjA5MjYxODM1NX0.F73CtAOb3Xzc-dHZ_B8uY_er8kLMEJV4_WULRrz365s";
const SHARE_PARAM = "board";
const QUEUE_LIMIT = 5;
const POSITIONS = ["topLeft", "topMiddle", "topRight", "bottomLeft", "bottomMiddle", "bottomRight"];

const state = {
  boards: [],
  cloudBoards: [],
  activeBoard: null,
  activeRotationIndex: 0,
  selectedPlayerId: null,
  teamPassword: sessionStorage.getItem(TEAM_PASSWORD_KEY) || ""
};

const els = {
  notice: document.getElementById("notice"),
  homeView: document.getElementById("homeView"),
  setupView: document.getElementById("setupView"),
  builderView: document.getElementById("builderView"),
  boardList: document.getElementById("boardList"),
  startCreateButton: document.getElementById("startCreateButton"),
  clearBoardsButton: document.getElementById("clearBoardsButton"),
  cloudStatus: document.getElementById("cloudStatus"),
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
  saveCloudButton: document.getElementById("saveCloudButton"),
  nextRotationButton: document.getElementById("nextRotationButton")
};

let draftPlayers = [];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function safeParseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function mostRecentBoardTimestamp(boards) {
  if (!Array.isArray(boards) || boards.length === 0) return 0;
  return boards.reduce((latest, board) => {
    const time = Date.parse(board && board.updatedAt ? board.updatedAt : "");
    return Number.isFinite(time) ? Math.max(latest, time) : latest;
  }, 0);
}

function migrateLegacyBoardsIfNeeded() {
  const currentBoards = safeParseJson(localStorage.getItem(STORAGE_KEY));
  if (Array.isArray(currentBoards) && currentBoards.length) return null;

  let best = null;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    if (key === STORAGE_KEY) continue;
    if (!key.startsWith(LEGACY_STORAGE_PREFIX)) continue;

    const boards = safeParseJson(localStorage.getItem(key));
    if (!Array.isArray(boards) || boards.length === 0) continue;

    const score = mostRecentBoardTimestamp(boards);
    if (!best || score > best.score) {
      best = { key, boards, score };
    }
  }

  if (!best) return null;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(best.boards));
  return best.key;
}

function showNotice(message, type = "info") {
  if (!els.notice) return;
  els.notice.textContent = message;
  els.notice.classList.toggle("notice-error", type === "error");
  els.notice.classList.remove("hidden");
  window.setTimeout(() => {
    els.notice.classList.add("hidden");
    els.notice.classList.remove("notice-error");
  }, 3000);
}

function showView(viewName) {
  els.homeView.classList.toggle("hidden", viewName !== "home");
  els.setupView.classList.toggle("hidden", viewName !== "setup");
  els.builderView.classList.toggle("hidden", viewName !== "builder");
}

function updateCloudStatus(message) {
  if (!els.cloudStatus) return;
  els.cloudStatus.textContent = message || "Cloud boards load below. Opening or saving asks for the team password.";
}

function slugify(value) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function isBoardSlug(value) {
  return /^[a-z0-9-]{1,80}$/.test(value || "");
}

async function supabaseRpc(functionName, payload) {
  const response = await fetch(`${SUPABASE_REST_URL}/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Supabase request failed: ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function boardToCloudData(board) {
  return {
    meta: {
      playerCount: board.players.length,
      rotationCount: board.rotations.length
    },
    players: board.players,
    rotations: board.rotations,
    queues: board.queues || [],
    setters: board.setters || [],
    middles: board.middles || [],
    arrows: board.arrows || []
  };
}

function cloudRowToBoard(row) {
  return normalizeBoard({
    id: row.id || row.slug,
    slug: row.slug,
    name: row.name,
    ...(row.board_data || {}),
    updatedAt: row.updated_at,
    isCloud: true
  });
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
    slug: board.slug || null,
    isCloud: Boolean(board.isCloud),
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

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
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
  url.searchParams.set(SHARE_PARAM, board.slug || encodeBoard(board));
  return url.toString();
}

async function loadCloudBoards() {
  updateCloudStatus("Loading cloud boards...");
  const rows = await supabaseRpc("sideout_list_public_boards", {});
  state.cloudBoards = (Array.isArray(rows) ? rows : []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    playerCount: row.player_count,
    rotationCount: row.rotation_count,
    updatedAt: row.updated_at,
    isCloud: true
  }));
  updateCloudStatus(`${state.cloudBoards.length} cloud board${state.cloudBoards.length === 1 ? "" : "s"} available`);
  renderBoardList();
}

function getTeamPassword() {
  if (state.teamPassword) return state.teamPassword;
  const password = window.prompt("Team password");
  if (!password) return "";
  state.teamPassword = password.trim();
  sessionStorage.setItem(TEAM_PASSWORD_KEY, state.teamPassword);
  return state.teamPassword;
}

function showWrongPasswordNotice() {
  showNotice("wow, you got the password wrong. that's 10 push ups", "error");
}

function boardMetaText(board) {
  const playerCount = Number.isFinite(board.playerCount) ? board.playerCount : Array.isArray(board.players) ? board.players.length : null;
  const rotationCount = Number.isFinite(board.rotationCount) ? board.rotationCount : Array.isArray(board.rotations) ? board.rotations.length : null;
  if (playerCount === null || rotationCount === null) return "Team board";
  return `${playerCount} players · ${rotationCount} rotations`;
}

function trashIconMarkup() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6h18"/>
      <path d="M8 6V4h8v2"/>
      <path d="M6 6l1 15h10l1-15"/>
      <path d="M10 10v7"/>
      <path d="M14 10v7"/>
    </svg>
  `;
}

async function fetchCloudBoard(slug, password) {
  const rows = await supabaseRpc("sideout_get_board", {
    team_password: password,
    board_slug: slug
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? cloudRowToBoard(row) : null;
}

async function openCloudBoard(slug) {
  const password = getTeamPassword();
  if (!password) return;

  try {
    const board = await fetchCloudBoard(slug, password);
    if (!board) {
      showNotice("That cloud board could not be found.");
      return;
    }

    state.activeBoard = board;
    state.activeRotationIndex = 0;
    state.selectedPlayerId = null;
    renderBuilder();
    showView("builder");
  } catch (error) {
    state.teamPassword = "";
    sessionStorage.removeItem(TEAM_PASSWORD_KEY);
    showWrongPasswordNotice();
  }
}

async function deleteCloudBoard(slug) {
  const password = getTeamPassword();
  if (!password) return;

  try {
    await supabaseRpc("sideout_delete_board", {
      team_password: password,
      board_slug: slug
    });
    if (state.activeBoard && state.activeBoard.slug === slug) {
      state.activeBoard = null;
      state.activeRotationIndex = 0;
      state.selectedPlayerId = null;
      showView("home");
    }
    state.boards = state.boards.map((board) => (
      board.slug === slug ? { ...board, slug: null, isCloud: false } : board
    ));
    saveBoards();
    await loadCloudBoards();
    showNotice("Team board deleted.");
  } catch (error) {
    state.teamPassword = "";
    sessionStorage.removeItem(TEAM_PASSWORD_KEY);
    showWrongPasswordNotice();
  }
}

async function saveCloudBoard() {
  if (!state.activeBoard) {
    showNotice("Open or create a board before saving to cloud.");
    return;
  }

  const password = getTeamPassword();
  if (!password) return;

  const suggestedSlug = slugify(state.activeBoard.slug || state.activeBoard.name);
  const slug = window.prompt("Board URL slug", suggestedSlug);
  if (!slug) return;

  persistDraftRotation();
  try {
    const rows = await supabaseRpc("sideout_upsert_board", {
      team_password: state.teamPassword,
      board_slug: slug,
      board_name: state.activeBoard.name,
      input_board_data: boardToCloudData(state.activeBoard),
      publish_board: true
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row) {
      state.activeBoard.slug = row.slug;
      state.activeBoard.isCloud = true;
      state.activeBoard.updatedAt = row.updated_at;
      saveActiveBoard();
    }
    sessionStorage.setItem(TEAM_PASSWORD_KEY, state.teamPassword);
    await loadCloudBoards();
    renderBuilder();
    showNotice("Saved to team boards. Share links are short now.");
  } catch (error) {
    state.teamPassword = "";
    sessionStorage.removeItem(TEAM_PASSWORD_KEY);
    showWrongPasswordNotice();
  }
}

async function copyShareLink() {
  if (!state.activeBoard) {
    showNotice("Open or create a board before copying a share link.");
    return;
  }

  if (!state.activeBoard.slug) {
    showNotice("Save this board to team boards before sharing.");
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
  const hasCloudBoards = state.cloudBoards.length > 0;
  const hasLocalBoards = state.boards.length > 0;

  if (!hasCloudBoards && !hasLocalBoards) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No cloud or local boards yet. Create one to start mapping rotations.";
    els.boardList.appendChild(empty);
    return;
  }

  const renderSection = (title, boards, emptyText, renderCard) => {
    const section = document.createElement("section");
    section.className = "board-section";

    const heading = document.createElement("div");
    heading.className = "section-heading compact";
    const headingTitle = document.createElement("h3");
    headingTitle.textContent = title;
    heading.appendChild(headingTitle);
    section.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "board-grid";
    if (boards.length) {
      boards.forEach((board) => grid.appendChild(renderCard(board)));
    } else {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = emptyText;
      grid.appendChild(empty);
    }
    section.appendChild(grid);
    els.boardList.appendChild(section);
  };

  const renderTeamCard = (board) => {
    const card = document.createElement("article");
    card.className = "board-card";

    const title = document.createElement("h3");
    title.textContent = board.name;

    const meta = document.createElement("p");
    meta.textContent = boardMetaText(board);

    const actions = document.createElement("div");
    actions.className = "board-card-actions";

    const openButton = document.createElement("button");
    openButton.className = "primary-button";
    openButton.type = "button";
    openButton.textContent = "Open";
    openButton.addEventListener("click", () => openCloudBoard(board.slug));

    const shareButton = document.createElement("button");
    shareButton.className = "secondary-button";
    shareButton.type = "button";
    shareButton.textContent = "Share";
    shareButton.addEventListener("click", async () => {
      state.activeBoard = normalizeBoard({ ...board, players: [], rotations: [emptyRotation()] });
      await copyShareLink();
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "icon-button danger-button";
    deleteButton.type = "button";
    deleteButton.setAttribute("aria-label", `Delete ${board.name}`);
    deleteButton.title = "Delete team board";
    deleteButton.innerHTML = trashIconMarkup();
    deleteButton.addEventListener("click", () => deleteCloudBoard(board.slug));

    actions.append(openButton, shareButton, deleteButton);
    card.append(title, meta, actions);
    return card;
  };

  const renderLocalCard = (board) => {
    const card = document.createElement("article");
    card.className = "board-card";

    const title = document.createElement("h3");
    title.textContent = board.name;

    const meta = document.createElement("p");
    meta.textContent = boardMetaText(board);

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
    shareButton.textContent = board.slug ? "Share" : "Save to team boards";
    shareButton.addEventListener("click", async () => {
      state.activeBoard = board;
      if (board.slug) {
        await copyShareLink();
      } else {
        await saveCloudBoard();
      }
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "icon-button danger-button";
    deleteButton.type = "button";
    deleteButton.setAttribute("aria-label", `Delete ${board.name}`);
    deleteButton.title = "Delete local board";
    deleteButton.innerHTML = trashIconMarkup();
    deleteButton.addEventListener("click", () => deleteBoard(board.id));

    actions.append(openButton, shareButton, deleteButton);
    card.append(title, meta, actions);
    return card;
  };

  renderSection("Team boards", state.cloudBoards, "No team boards yet.", renderTeamCard);
  renderSection("Local boards", state.boards, "No local boards yet.", renderLocalCard);
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

  if (els.activeBoardName) els.activeBoardName.textContent = board.name;
  if (els.courtHeading) els.courtHeading.textContent = `Rotation ${rotationNumber}`;
  if (els.previousRotationButton) els.previousRotationButton.disabled = state.activeRotationIndex === 0;
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
  if (els.roleStatus) els.roleStatus.textContent = labels.length ? labels.join(" · ") : "Not placed";
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
  if (els.queueCount) els.queueCount.textContent = `${queue.length}/${QUEUE_LIMIT} waiting`;

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
    spot.innerHTML = "";
    spot.removeAttribute("data-player-name");

    if (!player) return;

    const playerName = document.createElement("span");
    playerName.className = "court-player-name";
    playerName.textContent = player.name;
    playerName.style.setProperty("--name-length", `${Math.max(player.name.length, 5)}`);
    spot.appendChild(playerName);

    if (hasSetter || hasMiddle) {
      const roleLabel = document.createElement("span");
      roleLabel.className = "court-role-label";
      roleLabel.textContent = hasSetter && hasMiddle ? "Setter / Middle" : hasSetter ? "Setter" : "Middle";
      spot.appendChild(roleLabel);
    }
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

function persistDraftRotation() {
  state.activeBoard.queues[state.activeRotationIndex] = cleanQueue(
    state.activeBoard.rotations[state.activeRotationIndex],
    state.activeBoard.queues[state.activeRotationIndex]
  );
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
  persistDraftRotation();
  state.activeRotationIndex -= 1;
  state.selectedPlayerId = null;
  renderBuilder();
}

function goToNextRotation() {
  if (state.activeRotationIndex === state.activeBoard.rotations.length - 1) {
    if (!persistCurrentRotation()) return;
    generateNextRotationFromCurrent();
  } else {
    persistDraftRotation();
  }
  state.activeRotationIndex += 1;
  state.selectedPlayerId = null;
  renderBuilder();
}

async function loadSharedBoard() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get(SHARE_PARAM);
  if (!encoded) return false;

  if (isBoardSlug(encoded)) {
    const password = getTeamPassword();
    if (!password) return false;

    try {
      const board = await fetchCloudBoard(encoded, password);
      if (board) {
        state.activeBoard = board;
        state.activeRotationIndex = 0;
        state.selectedPlayerId = null;
        renderBuilder();
        showView("builder");
        showNotice("Loaded shared Sideout Lab board.");
        return true;
      }
    } catch (error) {
      state.teamPassword = "";
      sessionStorage.removeItem(TEAM_PASSWORD_KEY);
      showWrongPasswordNotice();
      return false;
    }
  }

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
  if (els.startCreateButton) els.startCreateButton.addEventListener("click", startSetup);
  if (els.cancelSetupButton) els.cancelSetupButton.addEventListener("click", () => showView("home"));
  if (els.addPlayerButton) els.addPlayerButton.addEventListener("click", addDraftPlayer);
  if (els.playerName) els.playerName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addDraftPlayer();
    }
  });
  if (els.setupForm) els.setupForm.addEventListener("submit", createBoard);
  if (els.homeButton) els.homeButton.addEventListener("click", () => {
    state.activeBoard = null;
    state.selectedPlayerId = null;
    renderBoardList();
    showView("home");
  });
  if (els.clearBoardsButton) els.clearBoardsButton.addEventListener("click", () => {
    state.boards = [];
    saveBoards();
    renderBoardList();
  });
  if (els.copyShareButton) els.copyShareButton.addEventListener("click", copyShareLink);
  if (els.copyShareButtonCourt) els.copyShareButtonCourt.addEventListener("click", copyShareLink);
  if (els.clearCourtButton) els.clearCourtButton.addEventListener("click", clearCourt);
  if (els.previousRotationButton) els.previousRotationButton.addEventListener("click", goToPreviousRotation);
  if (els.nextRotationButton) els.nextRotationButton.addEventListener("click", goToNextRotation);
  if (els.saveRotationButton) els.saveRotationButton.addEventListener("click", saveRotation);
  if (els.saveCloudButton) els.saveCloudButton.addEventListener("click", saveCloudBoard);
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
  if (els.subQueue) els.subQueue.addEventListener("click", (event) => {
    if (event.target.closest(".queue-player")) return;
    if (state.selectedPlayerId) {
      addPlayerToQueue(state.selectedPlayerId);
    }
  });
  if (els.subQueue) els.subQueue.addEventListener("dragover", (event) => {
    event.preventDefault();
    els.subQueue.classList.add("drop-target");
  });
  if (els.subQueue) els.subQueue.addEventListener("dragleave", () => {
    els.subQueue.classList.remove("drop-target");
  });
  if (els.subQueue) els.subQueue.addEventListener("drop", (event) => {
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

async function init() {
  const migratedFrom = migrateLegacyBoardsIfNeeded();
  loadBoards();
  bindEvents();
  updateCloudStatus();
  loadCloudBoards().catch(() => {
    state.cloudBoards = [];
    updateCloudStatus("Cloud boards could not load.");
    renderBoardList();
  });
  if (!await loadSharedBoard()) {
    renderBoardList();
    showView("home");
  }
  if (migratedFrom) {
    showNotice("Restored saved boards from an older Sideout Lab version.");
  }
}

init();
