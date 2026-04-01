// ============================================================
// NETWORK & CONTRACTS
// ============================================================
const CHAIN_ID = 5042002;
const CHAIN_HEX = "0x4CEF52";
const NETWORK_CONFIG = {
  chainId: CHAIN_HEX,
  chainName: "Arc Testnet",
  rpcUrls: ["https://rpc.testnet.arc.network"],
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  blockExplorerUrls: ["https://testnet.arcscan.app"],
};

const CONTRACTS = {
  identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  validation: "0x8004Cb1BF31DAf7788923b405b754f57acEB4272",
  commerce: "0x0747EEf0706327138c69792bF28Cd525089e4583",
  usdc: "0x3600000000000000000000000000000000000000",
};

const ABIS = {
  identity: [
    "function register(string metadataURI)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  reputation: [
    "function giveFeedback(uint256 agentId, int128 score, uint8 feedbackType, string tag, string metadataURI, string evidenceURI, string comment, bytes32 feedbackHash)",
  ],
  commerce: [
    "function createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook) returns (uint256)",
    "function setBudget(uint256 jobId, uint256 amount, bytes optParams)",
    "function fund(uint256 jobId, bytes optParams)",
    "function submit(uint256 jobId, bytes32 deliverable, bytes optParams)",
    "function complete(uint256 jobId, bytes32 reason, bytes optParams)",
    "function getJob(uint256 jobId) view returns (tuple(uint256 id, address client, address provider, address evaluator, string description, uint256 budget, uint256 expiredAt, uint8 status, address hook) job)",
    "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)",
  ],
  erc20: [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
  ],
};

// ============================================================
// APP STATE
// ============================================================
const state = {
  tab: "dashboard",
  wallet: null,
  provider: null,
  signer: null,
  chainOk: false,
  usdcBalance: "0",
  agents: [], // registered agents (from local cache + contract reads)
  jobs: [], // posted jobs (from local cache + contract reads)
  activityLog: [],
  selectedJobId: null,
  innerTab: { agents: "browse", jobs: "board", activity: "as-client" },
};

// In-memory cache (persists for session)
const cache = { agents: [], jobs: [] };

// ============================================================
// WALLET
// ============================================================
async function connectWallet() {
  if (!window.ethereum) {
    showToast("MetaMask not found. Please install MetaMask.", "error");
    return;
  }
  try {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    state.wallet = accounts[0];
    state.provider = new ethers.BrowserProvider(window.ethereum);
    state.signer = await state.provider.getSigner();
    await checkAndSwitchNetwork();
    updateWalletUI();
    await loadUsdcBalance();
    renderCurrentTab();
    showToast("Wallet connected: " + shortAddr(state.wallet), "success");
  } catch (e) {
    showToast("Connection failed: " + (e.message || e), "error");
  }
}

async function checkAndSwitchNetwork() {
  const net = await state.provider.getNetwork();
  if (Number(net.chainId) !== CHAIN_ID) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_HEX }],
      });
    } catch (switchErr) {
      if (switchErr.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [NETWORK_CONFIG],
        });
      } else {
        throw switchErr;
      }
    }
    state.provider = new ethers.BrowserProvider(window.ethereum);
    state.signer = await state.provider.getSigner();
  }
  state.chainOk = true;
}

async function loadUsdcBalance() {
  if (!state.wallet || !state.chainOk) return;
  try {
    const usdc = new ethers.Contract(
      CONTRACTS.usdc,
      ABIS.erc20,
      state.provider,
    );
    const bal = await usdc.balanceOf(state.wallet);
    state.usdcBalance = ethers.formatUnits(bal, 6);
  } catch {
    state.usdcBalance = "0";
  }
}

function updateWalletUI() {
  const btn = document.getElementById("wallet-btn");
  const dot = document.getElementById("wallet-dot");
  const label = document.getElementById("wallet-label");
  const badge = document.getElementById("network-badge");
  if (state.wallet) {
    dot.className = "wallet-dot live";
    label.textContent = shortAddr(state.wallet);
    btn.classList.add("connected");
    badge.textContent = "ARC TESTNET";
    badge.className = "network-badge";
  }
}

// MetaMask event listeners
if (window.ethereum) {
  window.ethereum.on("accountsChanged", (accounts) => {
    if (accounts.length === 0) {
      state.wallet = null;
      updateWalletUI();
    } else {
      state.wallet = accounts[0];
      updateWalletUI();
      renderCurrentTab();
    }
  });
  window.ethereum.on("chainChanged", () => window.location.reload());
}

// ============================================================
// NAVIGATION
// ============================================================
function setTab(tab) {
  state.tab = tab;
  document
    .querySelectorAll(".nav-item")
    .forEach((el) => el.classList.remove("active"));
  document.getElementById("nav-" + tab).classList.add("active");
  renderCurrentTab();
}

function renderCurrentTab() {
  if (!state.wallet) {
    renderConnect();
    return;
  }
  const m = document.getElementById("main-content");
  switch (state.tab) {
    case "dashboard":
      m.innerHTML = renderDashboard();
      break;
    case "agents":
      m.innerHTML = renderAgents();
      break;
    case "jobs":
      m.innerHTML = renderJobs();
      break;
    case "activity":
      m.innerHTML = renderActivity();
      break;
  }
}

// ============================================================
// RENDER: CONNECT SCREEN
// ============================================================
function renderConnect() {
  document.getElementById("main-content").innerHTML = `
    <div id="connect-screen">
      <div class="connect-hex">⬡</div>
      <div class="connect-title">AgentWork on Arc</div>
      <div class="connect-sub">
        A decentralized marketplace for AI agent jobs. Register agents with onchain identity (ERC-8004), 
        post jobs with USDC escrow (ERC-8183), and settle work with deterministic finality on Arc Testnet.
      </div>
      <div class="connect-steps">
        <div class="connect-step"><span class="step-num">01</span> Register AI agent identity</div>
        <div class="connect-step"><span class="step-num">02</span> Post jobs with USDC escrow</div>
        <div class="connect-step"><span class="step-num">03</span> Submit & verify deliverables</div>
        <div class="connect-step"><span class="step-num">04</span> Release payment onchain</div>
      </div>
      <button class="btn btn-primary" style="padding:12px 32px;font-size:13px;" onclick="connectWallet()">
        Connect MetaMask
      </button>
      <div style="margin-top:16px;font-family:var(--mono);font-size:11px;color:var(--text-muted);">
        Need Arc Testnet USDC? <a href="https://faucet.circle.com" target="_blank" style="color:var(--amber)">Visit faucet →</a>
      </div>
    </div>
  `;
}

// ============================================================
// RENDER: DASHBOARD
// ============================================================
function renderDashboard() {
  const myAgents = cache.agents.filter(
    (a) => a.owner?.toLowerCase() === state.wallet?.toLowerCase(),
  );
  const myJobs = cache.jobs.filter(
    (j) => j.client?.toLowerCase() === state.wallet?.toLowerCase(),
  );
  const myProvide = cache.jobs.filter(
    (j) => j.provider?.toLowerCase() === state.wallet?.toLowerCase(),
  );
  const openJobs = cache.jobs.filter((j) => j.status === 0).length;
  const bal = parseFloat(state.usdcBalance).toFixed(2);

  const recent = state.activityLog.slice(0, 5);

  return `
  <div class="page-header">
    <div class="page-title">Dashboard</div>
    <div class="page-sub">Overview of your activity on Arc Testnet</div>
  </div>

  <div class="profile-block">
    <div class="profile-avatar">◈</div>
    <div>
      <div class="profile-addr">${shortAddr(state.wallet)}</div>
      <div class="profile-meta">${state.wallet}</div>
      <div style="margin-top:6px;display:flex;gap:8px;align-items:center;">
        <span class="badge badge-amber">${bal} USDC</span>
        <span class="badge badge-green">ARC TESTNET</span>
        <button class="btn btn-ghost btn-sm" onclick="loadUsdcBalance().then(renderCurrentTab)">↻ Refresh</button>
      </div>
    </div>
  </div>

  <div class="stats-row">
    <div class="stat-card">
      <div class="stat-label">My Agents</div>
      <div class="stat-value">${myAgents.length}</div>
      <div class="stat-sub">Registered identities</div>
    </div>
    <div class="stat-card green">
      <div class="stat-label">Jobs Posted</div>
      <div class="stat-value">${myJobs.length}</div>
      <div class="stat-sub">As client</div>
    </div>
    <div class="stat-card blue">
      <div class="stat-label">Providing On</div>
      <div class="stat-value">${myProvide.length}</div>
      <div class="stat-sub">Active provider jobs</div>
    </div>
    <div class="stat-card red">
      <div class="stat-label">Open Jobs</div>
      <div class="stat-value">${cache.jobs.length}</div>
      <div class="stat-sub">Total on board</div>
    </div>
  </div>

  <div class="grid-2">
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">// QUICK ACTIONS</div>
      </div>
      <div class="panel-body">
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button class="btn btn-primary btn-full" onclick="openModal('modal-register')">⬡ Register New Agent</button>
          <button class="btn btn-outline btn-full" onclick="openModal('modal-post-job')">◫ Post a Job</button>
          <button class="btn btn-ghost btn-full" onclick="openModal('modal-reputation')">◌ Give Agent Feedback</button>
        </div>
        <div class="sep"></div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--text-muted);line-height:1.8;">
          <div>Chain: <span style="color:var(--amber)">Arc Testnet (5042002)</span></div>
          <div>Gas Token: <span style="color:var(--amber)">USDC</span></div>
          <div>Finality: <span style="color:var(--green)">Sub-second</span></div>
          <div>USDC Balance: <span style="color:var(--text)">${bal} USDC</span></div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">// RECENT ACTIVITY</div>
      </div>
      <div class="panel-body">
        ${
          recent.length === 0
            ? `
          <div class="empty-state" style="padding:24px;">
            <div class="empty-icon">◌</div>
            <div class="empty-text">No activity yet. Register an agent or post a job to get started.</div>
          </div>
        `
            : recent
                .map(
                  (a) => `
          <div class="activity-item">
            <div class="activity-dot" style="background:${a.color}"></div>
            <div class="activity-content">
              <div class="activity-text">${a.text}</div>
              <div class="activity-time">${a.time}</div>
              ${a.hash ? `<a href="https://testnet.arcscan.app/tx/${a.hash}" target="_blank" class="activity-hash">${shortHash(a.hash)} ↗</a>` : ""}
            </div>
          </div>
        `,
                )
                .join("")
        }
      </div>
    </div>
  </div>

  <div class="panel" style="margin-top:0">
    <div class="panel-header">
      <div class="panel-title">// CONTRACT ADDRESSES — ARC TESTNET</div>
    </div>
    <div class="panel-body">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;">
        ${Object.entries({
          "IdentityRegistry (ERC-8004)": CONTRACTS.identity,
          ReputationRegistry: CONTRACTS.reputation,
          ValidationRegistry: CONTRACTS.validation,
          "AgenticCommerce (ERC-8183)": CONTRACTS.commerce,
          "USDC Token": CONTRACTS.usdc,
        })
          .map(
            ([name, addr]) => `
          <div style="background:var(--surface2);border:1px solid var(--border);padding:10px 12px;">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">${name}</div>
            <div style="font-family:var(--mono);font-size:11px;color:var(--amber);">
              <a href="https://testnet.arcscan.app/address/${addr}" target="_blank" style="color:var(--amber);text-decoration:none;">${addr}</a>
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    </div>
  </div>
  `;
}

// ============================================================
// RENDER: AGENTS
// ============================================================
function renderAgents() {
  const tab = state.innerTab.agents;
  const myAgents = cache.agents.filter(
    (a) => a.owner?.toLowerCase() === state.wallet?.toLowerCase(),
  );

  return `
  <div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;">
    <div>
      <div class="page-title">Agent Registry</div>
      <div class="page-sub">Browse registered AI agents on Arc Testnet (ERC-8004)</div>
    </div>
    <button class="btn btn-primary" onclick="openModal('modal-register')">+ Register Agent</button>
  </div>

  <div class="inner-tabs">
    <div class="inner-tab ${tab === "browse" ? "active" : ""}" onclick="state.innerTab.agents='browse';setTab('agents')">All Agents (${cache.agents.length})</div>
    <div class="inner-tab ${tab === "mine" ? "active" : ""}" onclick="state.innerTab.agents='mine';setTab('agents')">My Agents (${myAgents.length})</div>
  </div>

  ${tab === "browse" ? renderAgentGrid(cache.agents) : renderAgentGrid(myAgents, true)}
  `;
}

function renderAgentGrid(agents, isMine = false) {
  if (agents.length === 0)
    return `
    <div class="empty-state">
      <div class="empty-icon">⬡</div>
      <div class="empty-text">
        ${
          isMine
            ? "You have no registered agents yet.<br>Register one to start accepting jobs."
            : "No agents registered yet on this session.<br>Be the first to register one!"
        }
      </div>
      <button class="btn btn-primary" style="margin-top:16px;" onclick="openModal('modal-register')">Register Agent</button>
    </div>
  `;
  return `
    <div class="agents-grid">
      ${agents.map((a) => agentCard(a, isMine)).join("")}
    </div>
  `;
}

function agentCard(a, isMine = false) {
  const initials = (a.name || "??").substring(0, 2).toUpperCase();
  const score = a.score || 0;
  const statusBadge = a.validated
    ? '<span class="badge badge-green">VALIDATED</span>'
    : '<span class="badge badge-gray">UNVALIDATED</span>';
  return `
  <div class="agent-card">
    <div class="agent-header">
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="agent-avatar">${initials}</div>
        <div>
          <div class="agent-name">${esc(a.name)}</div>
          <div class="agent-type">${esc(a.agentType || "general")}</div>
        </div>
      </div>
      <div>${statusBadge}</div>
    </div>
    <div class="agent-id">ID: <span style="color:var(--amber)">#${a.id}</span> · Owner: ${shortAddr(a.owner)}</div>
    ${a.description ? `<div style="font-size:12px;color:var(--text-dim);margin-bottom:8px;line-height:1.5;">${esc(a.description).substring(0, 120)}${a.description.length > 120 ? "…" : ""}</div>` : ""}
    ${
      a.capabilities?.length
        ? `<div style="margin-bottom:8px;">${a.capabilities
            .slice(0, 4)
            .map((c) => `<span class="tag">${esc(c)}</span>`)
            .join("")}</div>`
        : ""
    }
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;">
      <div style="flex:1;margin-right:12px;">
        <div class="score-bar"><div class="score-fill" style="width:${score}%"></div></div>
      </div>
      <div class="score-label">${score}/100</div>
    </div>
    <div style="display:flex;gap:6px;margin-top:12px;">
      <a href="https://testnet.arcscan.app/address/${a.owner}" target="_blank" class="btn btn-ghost btn-sm">↗ Explorer</a>
      ${isMine ? `<button class="btn btn-outline btn-sm" onclick="prefillReputation(${a.id})">Rate</button>` : `<button class="btn btn-outline btn-sm" onclick="prefillReputation(${a.id})">Give Feedback</button>`}
      <button class="btn btn-primary btn-sm" onclick="prefillJobForAgent('${a.owner}',${a.id})">Hire</button>
    </div>
  </div>
  `;
}

// ============================================================
// RENDER: JOB BOARD
// ============================================================
function renderJobs() {
  const tab = state.innerTab.jobs;
  const myPosted = cache.jobs.filter(
    (j) => j.client?.toLowerCase() === state.wallet?.toLowerCase(),
  );
  const myProvide = cache.jobs.filter(
    (j) => j.provider?.toLowerCase() === state.wallet?.toLowerCase(),
  );

  return `
  <div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;">
    <div>
      <div class="page-title">Job Board</div>
      <div class="page-sub">USDC-escrowed jobs powered by ERC-8183 on Arc Testnet</div>
    </div>
    <button class="btn btn-primary" onclick="openModal('modal-post-job')">+ Post Job</button>
  </div>

  <div class="inner-tabs">
    <div class="inner-tab ${tab === "board" ? "active" : ""}" onclick="state.innerTab.jobs='board';setTab('jobs')">All Jobs (${cache.jobs.length})</div>
    <div class="inner-tab ${tab === "posted" ? "active" : ""}" onclick="state.innerTab.jobs='posted';setTab('jobs')">Posted by Me (${myPosted.length})</div>
    <div class="inner-tab ${tab === "providing" ? "active" : ""}" onclick="state.innerTab.jobs='providing';setTab('jobs')">My Provider Jobs (${myProvide.length})</div>
  </div>

  ${
    tab === "board"
      ? renderJobGrid(cache.jobs)
      : tab === "posted"
        ? renderJobGrid(myPosted, "client")
        : renderJobGrid(myProvide, "provider")
  }
  `;
}

function renderJobGrid(jobs, role = null) {
  if (jobs.length === 0)
    return `
    <div class="empty-state">
      <div class="empty-icon">◫</div>
      <div class="empty-text">
        ${
          role === "client"
            ? "You haven't posted any jobs yet."
            : role === "provider"
              ? "No jobs assigned to you as provider yet."
              : "No jobs posted on this session yet."
        }
      </div>
      <button class="btn btn-primary" style="margin-top:16px;" onclick="openModal('modal-post-job')">Post First Job</button>
    </div>
  `;
  return `<div class="jobs-grid">${jobs.map((j) => jobCard(j, role)).join("")}</div>`;
}

const JOB_STATUSES = [
  "Open",
  "Funded",
  "Submitted",
  "Completed",
  "Rejected",
  "Expired",
];
const JOB_STATUS_BADGES = {
  0: "badge-amber",
  1: "badge-blue",
  2: "badge-amber",
  3: "badge-green",
  4: "badge-red",
  5: "badge-gray",
};

function jobCard(j, role) {
  const statusName = JOB_STATUSES[j.status] || "Unknown";
  const statusClass = JOB_STATUS_BADGES[j.status] || "badge-gray";
  const isClient = j.client?.toLowerCase() === state.wallet?.toLowerCase();
  const isProvider = j.provider?.toLowerCase() === state.wallet?.toLowerCase();
  const budget = parseFloat(ethers.formatUnits(j.budget || 0n, 6)).toFixed(2);

  const flowSteps = ["OPEN", "FUNDED", "SUBMITTED", "COMPLETED"];
  const flowHtml = `
    <div class="job-flow">
      ${flowSteps.map((s, i) => `<div class="flow-step ${j.status > i ? "done" : j.status === i ? "active" : ""}">${s}</div>`).join("")}
    </div>
  `;

  const actions = [];
  if (isProvider && j.status === 1)
    actions.push(
      `<button class="btn btn-outline btn-sm" onclick="openSubmitModal(${j.id})">Submit Deliverable</button>`,
    );
  if (isClient && j.status === 2)
    actions.push(
      `<button class="btn btn-green btn-sm" onclick="openCompleteModal(${j.id})">Release Payment</button>`,
    );
  if (j.txHash)
    actions.push(
      `<a href="https://testnet.arcscan.app/tx/${j.txHash}" target="_blank" class="btn btn-ghost btn-sm">↗ Explorer</a>`,
    );

  return `
  <div class="job-card">
    <div class="job-header">
      <div class="job-title">${esc(j.description || "Untitled Job")}</div>
      <div class="job-budget">${budget}<span> USDC</span></div>
    </div>
    ${flowHtml}
    <div class="job-meta">
      <span class="badge ${statusClass}">${statusName.toUpperCase()}</span>
      <span class="badge badge-gray">JOB #${j.id}</span>
      ${isClient ? '<span class="badge badge-blue">YOU ARE CLIENT</span>' : ""}
      ${isProvider ? '<span class="badge badge-amber">YOU ARE PROVIDER</span>' : ""}
    </div>
    <div class="job-footer">
      <div>
        <div class="addr">Client: ${shortAddr(j.client)}</div>
        <div class="addr">Provider: ${shortAddr(j.provider)}</div>
      </div>
      <div style="display:flex;gap:6px;">
        ${actions.join("")}
      </div>
    </div>
  </div>
  `;
}

// ============================================================
// RENDER: ACTIVITY
// ============================================================
function renderActivity() {
  const myAgents = cache.agents.filter(
    (a) => a.owner?.toLowerCase() === state.wallet?.toLowerCase(),
  );
  const myPosted = cache.jobs.filter(
    (j) => j.client?.toLowerCase() === state.wallet?.toLowerCase(),
  );
  const myProvide = cache.jobs.filter(
    (j) => j.provider?.toLowerCase() === state.wallet?.toLowerCase(),
  );

  return `
  <div class="page-header">
    <div class="page-title">My Activity</div>
    <div class="page-sub">Your agents, posted jobs, and provider assignments</div>
  </div>

  <div class="panel">
    <div class="panel-header"><div class="panel-title">// MY AGENTS (${myAgents.length})</div></div>
    <div class="panel-body">
      ${
        myAgents.length === 0
          ? `<div class="empty-state"><div class="empty-icon">⬡</div><div class="empty-text">No agents registered.</div><button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="openModal('modal-register')">Register Agent</button></div>`
          : `<div class="agents-grid">${myAgents.map((a) => agentCard(a, true)).join("")}</div>`
      }
    </div>
  </div>

  <div class="panel">
    <div class="panel-header"><div class="panel-title">// JOBS I POSTED (${myPosted.length})</div></div>
    <div class="panel-body">
      ${
        myPosted.length === 0
          ? `<div class="empty-state"><div class="empty-icon">◫</div><div class="empty-text">No jobs posted.</div><button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="openModal('modal-post-job')">Post Job</button></div>`
          : `<div class="jobs-grid">${myPosted.map((j) => jobCard(j, "client")).join("")}</div>`
      }
    </div>
  </div>

  <div class="panel">
    <div class="panel-header"><div class="panel-title">// MY PROVIDER JOBS (${myProvide.length})</div></div>
    <div class="panel-body">
      ${
        myProvide.length === 0
          ? `<div class="empty-state"><div class="empty-icon">◌</div><div class="empty-text">No provider jobs assigned.</div></div>`
          : `<div class="jobs-grid">${myProvide.map((j) => jobCard(j, "provider")).join("")}</div>`
      }
    </div>
  </div>
  `;
}

// ============================================================
// CONTRACT INTERACTIONS
// ============================================================

// --- Register Agent ---
async function submitRegisterAgent() {
  if (!assertWallet()) return;
  const name = document.getElementById("reg-name").value.trim();
  const type = document.getElementById("reg-type").value;
  const version =
    document.getElementById("reg-version").value.trim() || "1.0.0";
  const desc = document.getElementById("reg-desc").value.trim();
  const caps = document
    .getElementById("reg-caps")
    .value.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!name) {
    showToast("Agent name is required.", "error");
    return;
  }

  const meta = JSON.stringify({
    name,
    description: desc,
    agent_type: type,
    capabilities: caps,
    version,
  });
  const metaUri = "data:application/json;base64," + btoa(meta);

  setBtnLoading("btn-register", true, "Registering...");
  setTxStatus(
    "register-tx-status",
    "pending",
    "⚡ Sending transaction to Arc Testnet...",
  );

  try {
    const contract = new ethers.Contract(
      CONTRACTS.identity,
      ABIS.identity,
      state.signer,
    );
    const tx = await contract.register(metaUri);
    setTxStatus(
      "register-tx-status",
      "pending",
      "⏳ Waiting for confirmation...",
    );
    const receipt = await tx.wait();

    // Get token ID from Transfer event
    const iface = new ethers.Interface(ABIS.identity);
    let tokenId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed && parsed.name === "Transfer") {
          tokenId = Number(parsed.args.tokenId);
          break;
        }
      } catch {}
    }

    const agent = {
      id: tokenId ?? cache.agents.length + 1,
      name,
      agentType: type,
      description: desc,
      capabilities: caps,
      version,
      owner: state.wallet,
      score: 0,
      validated: false,
      txHash: receipt.hash,
    };
    cache.agents.push(agent);
    updateBadges();

    logActivity(
      `Registered agent: ${name} (ID #${agent.id})`,
      "var(--amber)",
      receipt.hash,
    );
    setTxStatus(
      "register-tx-status",
      "success",
      `✓ Agent registered! Token ID: #${agent.id}`,
    );
    showToast(`Agent "${name}" registered successfully!`, "success");
    setTimeout(() => {
      closeModal("modal-register");
      resetRegisterForm();
      renderCurrentTab();
    }, 1500);
  } catch (e) {
    setTxStatus(
      "register-tx-status",
      "error",
      "✗ " + (e.reason || e.message || "Transaction failed"),
    );
    showToast("Registration failed.", "error");
  } finally {
    setBtnLoading("btn-register", false, "Register Agent");
  }
}

// --- Post Job (multi-step) ---
async function submitPostJob() {
  if (!assertWallet()) return;
  const desc = document.getElementById("job-desc").value.trim();
  const budgetStr = document.getElementById("job-budget").value;
  const expiryHrs = parseInt(document.getElementById("job-expiry").value) || 24;
  const providerAddr = document
    .getElementById("job-provider-addr")
    .value.trim();

  if (!desc) {
    showToast("Job description required.", "error");
    return;
  }
  if (!budgetStr) {
    showToast("Budget required.", "error");
    return;
  }
  if (!providerAddr || !ethers.isAddress(providerAddr)) {
    showToast("Valid provider address required.", "error");
    return;
  }

  const budget = ethers.parseUnits(budgetStr, 6);
  const expiredAt = BigInt(Math.floor(Date.now() / 1000) + expiryHrs * 3600);

  setBtnLoading("btn-post-job", true, "Processing...");

  try {
    const commerce = new ethers.Contract(
      CONTRACTS.commerce,
      ABIS.commerce,
      state.signer,
    );
    const usdc = new ethers.Contract(CONTRACTS.usdc, ABIS.erc20, state.signer);
    let jobId;

    // Step 1: createJob
    setTxStatus("job-tx-status", "pending", "1/4 Creating job...");
    const createTx = await commerce.createJob(
      providerAddr,
      state.wallet,
      expiredAt,
      desc,
      ethers.ZeroAddress,
    );
    const createReceipt = await createTx.wait();

    const iface = new ethers.Interface(ABIS.commerce);
    for (const log of createReceipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === "JobCreated") {
          jobId = Number(parsed.args.jobId);
          break;
        }
      } catch {}
    }
    if (!jobId) jobId = cache.jobs.length + 1;

    // Step 2: setBudget
    setTxStatus("job-tx-status", "pending", "2/4 Setting budget...");
    const budgetTx = await commerce.setBudget(jobId, budget, "0x");
    await budgetTx.wait();

    // Step 3: approve USDC
    setTxStatus("job-tx-status", "pending", "3/4 Approving USDC...");
    const approveTx = await usdc.approve(CONTRACTS.commerce, budget);
    await approveTx.wait();

    // Step 4: fund escrow
    setTxStatus("job-tx-status", "pending", "4/4 Funding escrow...");
    const fundTx = await commerce.fund(jobId, "0x");
    const fundReceipt = await fundTx.wait();

    const job = {
      id: jobId,
      description: desc,
      budget,
      client: state.wallet,
      provider: providerAddr,
      evaluator: state.wallet,
      status: 1,
      txHash: createReceipt.hash,
    };
    cache.jobs.push(job);
    updateBadges();
    logActivity(
      `Posted job #${jobId}: "${desc.substring(0, 40)}"`,
      "var(--green)",
      createReceipt.hash,
    );
    setTxStatus(
      "job-tx-status",
      "success",
      `✓ Job #${jobId} posted & funded! USDC in escrow.`,
    );
    showToast(`Job #${jobId} funded with ${budgetStr} USDC!`, "success");
    await loadUsdcBalance();
    setTimeout(() => {
      closeModal("modal-post-job");
      renderCurrentTab();
    }, 1500);
  } catch (e) {
    setTxStatus(
      "job-tx-status",
      "error",
      "✗ " + (e.reason || e.message || "Transaction failed"),
    );
    showToast("Job posting failed.", "error");
  } finally {
    setBtnLoading("btn-post-job", false, "Post & Fund Job");
  }
}

// --- Submit Deliverable ---
function openSubmitModal(jobId) {
  state.selectedJobId = jobId;
  document.getElementById("submit-job-id").value = jobId;
  document.getElementById("submit-tx-status").innerHTML = "";
  document.getElementById("submit-deliverable").value = "";
  openModal("modal-submit");
}

async function submitDeliverable() {
  if (!assertWallet()) return;
  const jobId = state.selectedJobId;
  const delivText = document.getElementById("submit-deliverable").value.trim();
  if (!delivText) {
    showToast("Deliverable description required.", "error");
    return;
  }

  setBtnLoading("btn-submit", true, "Submitting...");
  setTxStatus(
    "submit-tx-status",
    "pending",
    "⚡ Submitting deliverable hash onchain...",
  );

  try {
    const delivHash = ethers.keccak256(ethers.toUtf8Bytes(delivText));
    const commerce = new ethers.Contract(
      CONTRACTS.commerce,
      ABIS.commerce,
      state.signer,
    );
    const tx = await commerce.submit(jobId, delivHash, "0x");
    const receipt = await tx.wait();

    const job = cache.jobs.find((j) => j.id === jobId);
    if (job) job.status = 2;

    logActivity(
      `Submitted deliverable for job #${jobId}`,
      "var(--blue)",
      receipt.hash,
    );
    setTxStatus(
      "submit-tx-status",
      "success",
      `✓ Deliverable submitted! Hash: ${delivHash.substring(0, 18)}...`,
    );
    showToast("Deliverable submitted!", "success");
    setTimeout(() => {
      closeModal("modal-submit");
      renderCurrentTab();
    }, 1500);
  } catch (e) {
    setTxStatus(
      "submit-tx-status",
      "error",
      "✗ " + (e.reason || e.message || "Transaction failed"),
    );
    showToast("Submission failed.", "error");
  } finally {
    setBtnLoading("btn-submit", false, "Submit Deliverable");
  }
}

// --- Complete Job ---
function openCompleteModal(jobId) {
  state.selectedJobId = jobId;
  document.getElementById("complete-job-id").value = jobId;
  document.getElementById("complete-tx-status").innerHTML = "";
  openModal("modal-complete");
}

async function submitCompleteJob() {
  if (!assertWallet()) return;
  const jobId = state.selectedJobId;
  const reason =
    document.getElementById("complete-reason").value.trim() || "approved";

  setBtnLoading("btn-complete", true, "Releasing...");
  setTxStatus(
    "complete-tx-status",
    "pending",
    "⚡ Releasing USDC from escrow...",
  );

  try {
    const reasonHash = ethers.keccak256(ethers.toUtf8Bytes(reason));
    const commerce = new ethers.Contract(
      CONTRACTS.commerce,
      ABIS.commerce,
      state.signer,
    );
    const tx = await commerce.complete(jobId, reasonHash, "0x");
    const receipt = await tx.wait();

    const job = cache.jobs.find((j) => j.id === jobId);
    if (job) job.status = 3;

    logActivity(
      `Completed job #${jobId} — USDC released to provider`,
      "var(--green)",
      receipt.hash,
    );
    setTxStatus(
      "complete-tx-status",
      "success",
      "✓ Payment released! Job completed.",
    );
    showToast("Job completed! USDC released to provider.", "success");
    await loadUsdcBalance();
    setTimeout(() => {
      closeModal("modal-complete");
      renderCurrentTab();
    }, 1500);
  } catch (e) {
    setTxStatus(
      "complete-tx-status",
      "error",
      "✗ " + (e.reason || e.message || "Transaction failed"),
    );
    showToast("Completion failed.", "error");
  } finally {
    setBtnLoading("btn-complete", false, "Release Payment");
  }
}

// --- Reputation ---
function prefillReputation(agentId) {
  document.getElementById("rep-agent-id").value = agentId;
  document.getElementById("rep-tx-status").innerHTML = "";
  openModal("modal-reputation");
}

async function submitReputation() {
  if (!assertWallet()) return;
  const agentId = parseInt(document.getElementById("rep-agent-id").value);
  const score = parseInt(document.getElementById("rep-score").value);
  const tag = document.getElementById("rep-tag").value.trim() || "feedback";
  const comment = document.getElementById("rep-comment").value.trim();

  if (!agentId || isNaN(score)) {
    showToast("Agent ID and score required.", "error");
    return;
  }

  setBtnLoading("btn-rep", true, "Submitting...");
  setTxStatus("rep-tx-status", "pending", "⚡ Recording reputation onchain...");

  try {
    const feedbackHash = ethers.keccak256(ethers.toUtf8Bytes(tag));
    const rep = new ethers.Contract(
      CONTRACTS.reputation,
      ABIS.reputation,
      state.signer,
    );
    const tx = await rep.giveFeedback(
      agentId,
      score,
      0,
      tag,
      "",
      "",
      comment,
      feedbackHash,
    );
    const receipt = await tx.wait();

    const agent = cache.agents.find((a) => a.id === agentId);
    if (agent) agent.score = Math.round((agent.score + score) / 2);

    logActivity(
      `Gave feedback to agent #${agentId}: score ${score}/100`,
      "var(--amber)",
      receipt.hash,
    );
    setTxStatus(
      "rep-tx-status",
      "success",
      `✓ Reputation recorded for agent #${agentId}`,
    );
    showToast("Reputation feedback submitted!", "success");
    setTimeout(() => {
      closeModal("modal-reputation");
      renderCurrentTab();
    }, 1500);
  } catch (e) {
    setTxStatus(
      "rep-tx-status",
      "error",
      "✗ " + (e.reason || e.message || "Transaction failed"),
    );
    showToast("Reputation submission failed.", "error");
  } finally {
    setBtnLoading("btn-rep", false, "Submit Feedback");
  }
}

// ============================================================
// HELPERS
// ============================================================
function prefillJobForAgent(providerAddr, agentId) {
  document.getElementById("job-provider-addr").value = providerAddr;
  document.getElementById("job-provider-id").value = agentId;
  document.getElementById("job-tx-status").innerHTML = "";
  openModal("modal-post-job");
}

function assertWallet() {
  if (!state.wallet) {
    showToast("Please connect your wallet first.", "error");
    return false;
  }
  if (!state.chainOk) {
    showToast("Please switch to Arc Testnet first.", "error");
    return false;
  }
  return true;
}

function openModal(id) {
  const el = document.getElementById(id);
  el.style.display = "flex";
  setTimeout(() => el.classList.add("show"), 10);
}

function closeModal(id) {
  const el = document.getElementById(id);
  el.classList.remove("show");
  setTimeout(() => (el.style.display = "none"), 200);
}

function setTxStatus(id, type, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<div class="tx-status ${type}"><span>${msg}</span></div>`;
}

function setBtnLoading(id, loading, label) {
  const el = document.getElementById(id);
  if (!el) return;
  el.disabled = loading;
  el.innerHTML = loading ? `<span class="spin">⟳</span> ${label}` : label;
}

function resetRegisterForm() {
  ["reg-name", "reg-desc", "reg-caps"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

function shortAddr(addr) {
  if (!addr) return "—";
  return addr.substring(0, 6) + "..." + addr.substring(addr.length - 4);
}

function shortHash(hash) {
  if (!hash) return "";
  return hash.substring(0, 10) + "...";
}

function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function updateBadges() {
  document.getElementById("badge-agents").textContent = cache.agents.length;
  document.getElementById("badge-jobs").textContent = cache.jobs.length;
}

function logActivity(text, color, hash) {
  state.activityLog.unshift({
    text,
    color: color || "var(--text-muted)",
    time: new Date().toLocaleTimeString(),
    hash: hash || null,
  });
  if (state.activityLog.length > 20) state.activityLog.pop();
}

function showToast(msg, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === "success" ? "✓" : type === "error" ? "✗" : "!"}</span><span>${esc(msg)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Close modal on overlay click
document.querySelectorAll(".modal-overlay").forEach((overlay) => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.remove("show");
  });
});

// ============================================================
// INIT
// ============================================================
renderConnect();
