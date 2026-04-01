// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════
const CHAIN_ID = 5042002;
const CHAIN_HEX = "0x4CEF52";
const RPC = "https://rpc.testnet.arc.network";
const EXPLORER = "https://testnet.arcscan.app";
const NET_CONFIG = {
  chainId: CHAIN_HEX,
  chainName: "Arc Testnet",
  rpcUrls: [RPC],
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  blockExplorerUrls: [EXPLORER],
};

const C = {
  identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  validation: "0x8004Cb1BF31DAf7788923b405b754f57acEB4272",
  commerce: "0x0747EEf0706327138c69792bF28Cd525089e4583",
  usdc: "0x3600000000000000000000000000000000000000",
};

const ABI = {
  identity: [
    "function register(string metadataURI)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  ],
  reputation: [
    "function giveFeedback(uint256 agentId, int128 score, uint8 feedbackType, string tag, string metadataURI, string evidenceURI, string comment, bytes32 feedbackHash)",
  ],
  validation: [
    "function validationRequest(address validator, uint256 agentId, string requestURI, bytes32 requestHash)",
    "function validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)",
    "function getValidationStatus(bytes32 requestHash) view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string tag, uint256 lastUpdate)",
  ],
  commerce: [
    "function createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook) returns (uint256)",
    "function setBudget(uint256 jobId, uint256 amount, bytes optParams)",
    "function fund(uint256 jobId, bytes optParams)",
    "function submit(uint256 jobId, bytes32 deliverable, bytes optParams)",
    "function complete(uint256 jobId, bytes32 reason, bytes optParams)",
    "function reject(uint256 jobId, bytes32 reason, bytes optParams)",
    "function getJob(uint256 jobId) view returns (tuple(uint256 id,address client,address provider,address evaluator,string description,uint256 budget,uint256 expiredAt,uint8 status,address hook) job)",
    "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)",
  ],
  erc20: [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
  ],
};

const JOB_STATUSES = [
  "Open",
  "Funded",
  "Submitted",
  "Completed",
  "Rejected",
  "Expired",
];
const JOB_BADGE_CLS = {
  0: "b-amber",
  1: "b-blue",
  2: "b-amber",
  3: "b-green",
  4: "b-red",
  5: "b-gray",
};
const FLOW_LABELS = ["OPEN", "FUNDED", "SUBMITTED", "COMPLETED"];

// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
const S = {
  tab: "dashboard",
  wallet: null,
  provider: null,
  signer: null,
  chainOk: false,
  nativeBal: "0", // 18 decimals — for gas display
  erc20Bal: "0", // 6 decimals  — for job escrow
  agents: [],
  jobs: [],
  log: [],
  loadingChain: false,
  selectedJobId: null,
  innerTab: { agents: "browse", jobs: "board", activity: "agents" },
};

// ═══════════════════════════════════════════════
// WALLET
// ═══════════════════════════════════════════════
async function connectWallet() {
  if (!window.ethereum) {
    toast("MetaMask not found. Please install MetaMask.", "err");
    return;
  }
  try {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    S.wallet = accounts[0];
    S.provider = new ethers.BrowserProvider(window.ethereum);
    S.signer = await S.provider.getSigner();
    await ensureNetwork();
    updateWalletUI();
    await loadBalances();
    await initChainData();
    renderTab();
  } catch (e) {
    toast("Connection failed: " + (e.message || e), "err");
  }
}

async function ensureNetwork() {
  const net = await S.provider.getNetwork();
  if (Number(net.chainId) !== CHAIN_ID) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_HEX }],
      });
    } catch (e) {
      if (e.code === 4902)
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [NET_CONFIG],
        });
      else throw e;
    }
    S.provider = new ethers.BrowserProvider(window.ethereum);
    S.signer = await S.provider.getSigner();
  }
  S.chainOk = true;
}

function updateWalletUI() {
  if (!S.wallet) return;
  document.getElementById("wdot").className = "wdot live";
  document.getElementById("wlabel").textContent = shortAddr(S.wallet);
  document.getElementById("wbtn").classList.add("on");
  document.getElementById("net-badge").textContent = "ARC TESTNET";
  document.getElementById("net-badge").className = "net-badge ok";
}

async function loadBalances() {
  if (!S.wallet || !S.chainOk) return;
  try {
    const native = await S.provider.getBalance(S.wallet);
    S.nativeBal = parseFloat(ethers.formatUnits(native, 18)).toFixed(4);

    const usdc = new ethers.Contract(C.usdc, ABI.erc20, S.provider);
    const erc = await usdc.balanceOf(S.wallet);
    S.erc20Bal = parseFloat(ethers.formatUnits(erc, 6)).toFixed(2);

    const pill = document.getElementById("bal-pill");
    pill.style.display = "block";
    pill.textContent = S.erc20Bal + " USDC";
  } catch {}
}

window.ethereum &&
  window.ethereum.on("accountsChanged", (accs) => {
    if (!accs.length) {
      S.wallet = null;
      S.chainOk = false;
      renderTab();
    } else {
      S.wallet = accs[0];
      S.signer = null;
      connectWallet();
    }
  });
window.ethereum && window.ethereum.on("chainChanged", () => location.reload());

// ═══════════════════════════════════════════════
// CHUNKED QUERY HELPER
// ═══════════════════════════════════════════════
async function queryFilterChunked(contract, filter, from, to, chunkSize = 500) {
  const events = [];
  for (let start = from; start <= to; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, to);
    try {
      const chunkEvents = await contract.queryFilter(filter, start, end);
      events.push(...chunkEvents);
    } catch (e) {
      console.warn("Chunk query failed", start, end, e);
    }
  }
  return events;
}

// ═══════════════════════════════════════════════
// CHAIN DATA LOADING
// ═══════════════════════════════════════════════
async function initChainData() {
  S.loadingChain = true;
  renderTab();
  try {
    await Promise.all([loadAgentsFromChain(), loadJobsFromChain()]);
  } catch (e) {
    console.warn("Chain data load partial failure:", e);
  }
  S.loadingChain = false;
  updateBadges();
  renderTab();
}

async function loadAgentsFromChain() {
  try {
    const contract = new ethers.Contract(C.identity, ABI.identity, S.provider);
    const latest = await S.provider.getBlockNumber();
    const from = Math.max(0, latest - 9999);

    const events = await queryFilterChunked(
      contract,
      contract.filters.Transfer(ethers.ZeroAddress, null, null),
      from,
      latest,
      500,
    );

    const seen = new Set(S.agents.map((a) => a.id));
    for (const ev of events) {
      const id = Number(ev.args.tokenId);
      if (seen.has(id)) continue;
      seen.add(id);
      try {
        const [owner, uri] = await Promise.all([
          contract.ownerOf(id),
          contract.tokenURI(id).catch(() => ""),
        ]);
        const meta = await parseMeta(uri);
        const validated = await checkValidated(id);
        S.agents.push({
          id,
          owner,
          validated,
          name: meta.name || `Agent #${id}`,
          agentType: meta.agent_type || "general",
          description: meta.description || "",
          capabilities: meta.capabilities || [],
          version: meta.version || "1.0.0",
          score: 0,
          txHash: ev.transactionHash,
        });
      } catch {}
    }
  } catch (e) {
    console.warn("loadAgents:", e);
  }
}

async function loadJobsFromChain() {
  try {
    const contract = new ethers.Contract(C.commerce, ABI.commerce, S.provider);
    const latest = await S.provider.getBlockNumber();
    const from = Math.max(0, latest - 9999);

    const events = await queryFilterChunked(
      contract,
      contract.filters.JobCreated(),
      from,
      latest,
      500,
    );

    const seen = new Set(S.jobs.map((j) => j.id));
    for (const ev of events) {
      const id = Number(ev.args.jobId);
      if (seen.has(id)) continue;
      seen.add(id);
      try {
        const job = await contract.getJob(id);
        S.jobs.push({
          id,
          client: job.client,
          provider: job.provider,
          evaluator: job.evaluator,
          description: job.description,
          budget: job.budget,
          expiredAt: Number(job.expiredAt),
          status: Number(job.status),
          txHash: ev.transactionHash,
        });
      } catch {}
    }
  } catch (e) {
    console.warn("loadJobs:", e);
  }
}
