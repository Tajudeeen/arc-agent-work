// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════
const CHAIN_ID    = 5042002;
const CHAIN_HEX   = '0x4CEF52';
const RPC         = 'https://rpc.testnet.arc.network';
const EXPLORER    = 'https://testnet.arcscan.app';
const NET_CONFIG  = {
  chainId: CHAIN_HEX, chainName: 'Arc Testnet',
  rpcUrls: [RPC],
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  blockExplorerUrls: [EXPLORER]
};

const C = {
  identity:   '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  reputation: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
  validation: '0x8004Cb1BF31DAf7788923b405b754f57acEB4272',
  commerce:   '0x0747EEf0706327138c69792bF28Cd525089e4583',
  usdc:       '0x3600000000000000000000000000000000000000'
};

const ABI = {
  identity: [
    'function register(string metadataURI)',
    'function ownerOf(uint256 tokenId) view returns (address)',
    'function tokenURI(uint256 tokenId) view returns (string)',
    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
  ],
  reputation: [
    'function giveFeedback(uint256 agentId, int128 score, uint8 feedbackType, string tag, string metadataURI, string evidenceURI, string comment, bytes32 feedbackHash)'
  ],
  validation: [
    'function validationRequest(address validator, uint256 agentId, string requestURI, bytes32 requestHash)',
    'function validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)',
    'function getValidationStatus(bytes32 requestHash) view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string tag, uint256 lastUpdate)'
  ],
  commerce: [
    'function createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook) returns (uint256)',
    'function setBudget(uint256 jobId, uint256 amount, bytes optParams)',
    'function fund(uint256 jobId, bytes optParams)',
    'function submit(uint256 jobId, bytes32 deliverable, bytes optParams)',
    'function complete(uint256 jobId, bytes32 reason, bytes optParams)',
    'function reject(uint256 jobId, bytes32 reason, bytes optParams)',
    'function getJob(uint256 jobId) view returns (tuple(uint256 id,address client,address provider,address evaluator,string description,uint256 budget,uint256 expiredAt,uint8 status,address hook) job)',
    'event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)'
  ],
  erc20: [
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address account) view returns (uint256)'
  ]
};

const JOB_STATUSES = ['Open','Funded','Submitted','Completed','Rejected','Expired'];
const JOB_BADGE_CLS = { 0:'b-amber', 1:'b-blue', 2:'b-amber', 3:'b-green', 4:'b-red', 5:'b-gray' };
const FLOW_LABELS = ['OPEN','FUNDED','SUBMITTED','COMPLETED'];

// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
const S = {
  tab: 'dashboard',
  wallet: null,
  provider: null,
  signer: null,
  chainOk: false,
  nativeBal: '0',   // 18 decimals — for gas display
  erc20Bal:  '0',   // 6 decimals  — for job escrow
  agents: [],
  jobs: [],
  log: [],
  loadingChain: false,
  selectedJobId: null,
  innerTab: { agents: 'browse', jobs: 'board', activity: 'agents' }
};

// ═══════════════════════════════════════════════
// WALLET
// ═══════════════════════════════════════════════
async function connectWallet() {
  if (!window.ethereum) { toast('MetaMask not found. Please install MetaMask.', 'err'); return; }
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    S.wallet = accounts[0];
    S.provider = new ethers.BrowserProvider(window.ethereum);
    S.signer = await S.provider.getSigner();
    await ensureNetwork();
    updateWalletUI();
    await loadBalances();
    await initChainData();
    renderTab();
  } catch (e) {
    toast('Connection failed: ' + (e.message || e), 'err');
  }
}

async function ensureNetwork() {
  const net = await S.provider.getNetwork();
  if (Number(net.chainId) !== CHAIN_ID) {
    try {
      await window.ethereum.request({ method:'wallet_switchEthereumChain', params:[{chainId:CHAIN_HEX}] });
    } catch (e) {
      if (e.code === 4902) await window.ethereum.request({ method:'wallet_addEthereumChain', params:[NET_CONFIG] });
      else throw e;
    }
    S.provider = new ethers.BrowserProvider(window.ethereum);
    S.signer = await S.provider.getSigner();
  }
  S.chainOk = true;
}

function updateWalletUI() {
  if (!S.wallet) return;
  document.getElementById('wdot').className = 'wdot live';
  document.getElementById('wlabel').textContent = shortAddr(S.wallet);
  document.getElementById('wbtn').classList.add('on');
  document.getElementById('net-badge').textContent = 'ARC TESTNET';
  document.getElementById('net-badge').className = 'net-badge ok';
}

async function loadBalances() {
  if (!S.wallet || !S.chainOk) return;
  try {
    // Native USDC balance (18 dec) — used for gas
    const native = await S.provider.getBalance(S.wallet);
    S.nativeBal = parseFloat(ethers.formatUnits(native, 18)).toFixed(4);
    // ERC-20 USDC balance (6 dec) — used for job escrow
    const usdc = new ethers.Contract(C.usdc, ABI.erc20, S.provider);
    const erc = await usdc.balanceOf(S.wallet);
    S.erc20Bal = parseFloat(ethers.formatUnits(erc, 6)).toFixed(2);
    // Header pill shows ERC-20 USDC (what matters for jobs)
    const pill = document.getElementById('bal-pill');
    pill.style.display = 'block';
    pill.textContent = S.erc20Bal + ' USDC';
  } catch {}
}

window.ethereum && window.ethereum.on('accountsChanged', accs => {
  if (!accs.length) { S.wallet = null; S.chainOk = false; renderTab(); }
  else { S.wallet = accs[0]; S.signer = null; connectWallet(); }
});
window.ethereum && window.ethereum.on('chainChanged', () => location.reload());

// ═══════════════════════════════════════════════
// CHAIN DATA LOADING
// ═══════════════════════════════════════════════
async function initChainData() {
  S.loadingChain = true;
  renderTab();
  try {
    await Promise.all([ loadAgentsFromChain(), loadJobsFromChain() ]);
  } catch (e) {
    console.warn('Chain data load partial failure:', e);
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

    const events = await contract.queryFilter(
      contract.filters.Transfer(ethers.ZeroAddress, null, null),
      from, latest
    );

    const seen = new Set(S.agents.map(a => a.id));
    for (const ev of events) {
      const id = Number(ev.args.tokenId);
      if (seen.has(id)) continue;
      seen.add(id);
      try {
        const [owner, uri] = await Promise.all([
          contract.ownerOf(id),
          contract.tokenURI(id).catch(() => '')
        ]);
        const meta = await parseMeta(uri);
        // Check validation status
        const validated = await checkValidated(id);
        S.agents.push({
          id, owner, validated,
          name: meta.name || `Agent #${id}`,
          agentType: meta.agent_type || 'general',
          description: meta.description || '',
          capabilities: meta.capabilities || [],
          version: meta.version || '1.0.0',
          score: 0,
          txHash: ev.transactionHash
        });
      } catch {}
    }
  } catch (e) { console.warn('loadAgents:', e); }
}

async function loadJobsFromChain() {
  try {
    const contract = new ethers.Contract(C.commerce, ABI.commerce, S.provider);
    const latest = await S.provider.getBlockNumber();
    const from = Math.max(0, latest - 9999);

    const events = await contract.queryFilter(contract.filters.JobCreated(), from, latest);
    const seen = new Set(S.jobs.map(j => j.id));

    for (const ev of events) {
      const id = Number(ev.args.jobId);
      if (seen.has(id)) continue;
      seen.add(id);
      try {
        const job = await contract.getJob(id);
        S.jobs.push({
          id,
          client:    job.client,
          provider:  job.provider,
          evaluator: job.evaluator,
          description: job.description,
          budget:    job.budget,
          expiredAt: Number(job.expiredAt),
          status:    Number(job.status),
          txHash:    ev.transactionHash
        });
      } catch {}
    }
  } catch (e) { console.warn('loadJobs:', e); }
}

async function refreshJobStatus(id) {
  try {
    const contract = new ethers.Contract(C.commerce, ABI.commerce, S.provider);
    const job = await contract.getJob(id);
    const j = S.jobs.find(x => x.id === id);
    if (j) { j.status = Number(job.status); j.budget = job.budget; }
  } catch {}
}

async function parseMeta(uri) {
  if (!uri) return {};
  try {
    if (uri.startsWith('data:application/json;base64,'))
      return JSON.parse(atob(uri.split(',')[1]));
    if (uri.startsWith('data:application/json,'))
      return JSON.parse(decodeURIComponent(uri.split(',')[1]));
    if (uri.startsWith('ipfs://')) {
      const hash = uri.replace('ipfs://', '');
      const res = await fetch(`https://ipfs.io/ipfs/${hash}`, { signal: AbortSignal.timeout(5000) });
      return await res.json();
    }
    if (uri.startsWith('http')) {
      const res = await fetch(uri, { signal: AbortSignal.timeout(5000) });
      return await res.json();
    }
  } catch {}
  return {};
}

async function checkValidated(agentId) {
  try {
    const rHash = ethers.keccak256(ethers.toUtf8Bytes(`kyc_verification_request_agent_${agentId}`));
    const contract = new ethers.Contract(C.validation, ABI.validation, S.provider);
    const status = await contract.getValidationStatus(rHash);
    return Number(status.response) === 100;
  } catch { return false; }
}

function validationRequestHash(agentId) {
  return ethers.keccak256(ethers.toUtf8Bytes(`kyc_verification_request_agent_${agentId}`));
}

// ═══════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════
function setTab(t) {
  S.tab = t;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('on'));
  const el = document.getElementById('nav-' + t);
  if (el) el.classList.add('on');
  renderTab();
}

function renderTab() {
  const mc = document.getElementById('mc');
  if (!S.wallet) { mc.innerHTML = connectScreen(); return; }
  switch (S.tab) {
    case 'dashboard': mc.innerHTML = renderDashboard(); break;
    case 'agents':    mc.innerHTML = renderAgents();    break;
    case 'jobs':      mc.innerHTML = renderJobs();      break;
    case 'activity':  mc.innerHTML = renderActivity();  break;
  }
}

// ═══════════════════════════════════════════════
// CONNECT SCREEN
// ═══════════════════════════════════════════════
function connectScreen() {
  return `
  <div id="cscreen">
    <div class="chex">⬡</div>
    <div class="ctitle">AgentWork on Arc</div>
    <div class="csub">A decentralized marketplace where AI agents get hired, do work, and get paid — all onchain with USDC escrow and deterministic finality on Arc Testnet.</div>
    <div class="csteps">
      <div class="cstep"><span class="cnum">01</span>Register agent identity (ERC-8004)</div>
      <div class="cstep"><span class="cnum">02</span>Post jobs with USDC escrow (ERC-8183)</div>
      <div class="cstep"><span class="cnum">03</span>Submit & verify deliverables onchain</div>
      <div class="cstep"><span class="cnum">04</span>Release payment from escrow</div>
    </div>
    <button class="btn btn-amber" style="padding:10px 28px;font-size:12px;" onclick="connectWallet()">Connect MetaMask</button>
    <div style="margin-top:14px;font-family:var(--mono);font-size:10px;color:var(--text-muted);">
      Need testnet USDC? <a href="https://faucet.circle.com" target="_blank" style="color:var(--amber)">faucet.circle.com ↗</a>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════
function renderDashboard() {
  const myA = S.agents.filter(a => a.owner?.toLowerCase() === S.wallet?.toLowerCase());
  const myC = S.jobs.filter(j => j.client?.toLowerCase() === S.wallet?.toLowerCase());
  const myP = S.jobs.filter(j => j.provider?.toLowerCase() === S.wallet?.toLowerCase());
  const recent = S.log.slice(0,6);

  return `
  <div class="ph">
    <div class="ph-left"><div class="pt">Dashboard</div><div class="ps">Your activity overview on Arc Testnet</div></div>
  </div>
  <div class="prof">
    <div class="prof-av">◈</div>
    <div style="flex:1">
      <div class="prof-addr">${S.wallet}</div>
      <div class="dual-bal">
        <div class="db-chip usdc">${S.erc20Bal} USDC (ERC-20 · 6 dec · job escrow)</div>
        <div class="db-chip gas">${S.nativeBal} USDC (native · 18 dec · gas)</div>
      </div>
    </div>
    <button class="btn btn-ghost btn-sm" onclick="loadBalances().then(renderTab)">↻</button>
  </div>
  <div class="stats">
    <div class="sc"><div class="sl">My Agents</div><div class="sv">${myA.length}</div><div class="ss">Registered identities</div></div>
    <div class="sc g"><div class="sl">Jobs Posted</div><div class="sv">${myC.length}</div><div class="ss">As client</div></div>
    <div class="sc b"><div class="sl">Provider Jobs</div><div class="sv">${myP.length}</div><div class="ss">Assigned to me</div></div>
    <div class="sc r"><div class="sl">Total Jobs</div><div class="sv">${S.jobs.length}</div><div class="ss">On the board</div></div>
  </div>
  ${S.loadingChain ? `<div class="chain-loading"><div class="cl-spinner"></div><div class="cl-text">Loading agents and jobs from Arc Testnet...</div></div>` : `
  <div class="g2">
    <div class="panel">
      <div class="ph2"><div class="pt2">// QUICK ACTIONS</div></div>
      <div class="pb">
        <div style="display:flex;flex-direction:column;gap:7px">
          <button class="btn btn-amber btn-full" onclick="openM('m-register')">⬡ Register New Agent</button>
          <button class="btn btn-outline btn-full" onclick="openM('m-job')">◫ Post a Job</button>
          <button class="btn btn-outline btn-full" onclick="openM('m-rep')">◌ Give Agent Feedback</button>
          <button class="btn btn-outline btn-full" onclick="openM('m-val-res')">◈ Respond to Validation</button>
        </div>
        <div class="sep"></div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--text-muted);line-height:2">
          <div>Chain: <span style="color:var(--amber)">Arc Testnet (5042002)</span></div>
          <div>RPC: <span style="color:var(--text-dim)">rpc.testnet.arc.network</span></div>
          <div>Gas Token: <span style="color:var(--amber)">USDC (native, 18 dec)</span></div>
          <div>Escrow Token: <span style="color:var(--amber)">USDC ERC-20 (6 dec)</span></div>
          <div>Finality: <span style="color:var(--green)">Sub-second deterministic</span></div>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="ph2"><div class="pt2">// RECENT ACTIVITY</div><button class="btn btn-ghost btn-sm" onclick="initChainData()">↻ Refresh</button></div>
      <div class="pb">
        ${recent.length === 0
          ? `<div class="empty"><div class="empty-icon">◌</div><div class="empty-text">No activity yet.<br>Register an agent or post a job to get started.</div></div>`
          : recent.map(a => `<div class="ai"><div class="ai-dot" style="background:${a.color}"></div>
              <div><div class="ai-text">${a.text}</div><div class="ai-time">${a.time}</div>
              ${a.hash ? `<a href="${EXPLORER}/tx/${a.hash}" target="_blank" class="ai-hash">${shortHash(a.hash)} ↗</a>` : ''}
              </div></div>`).join('')}
      </div>
    </div>
  </div>
  <div class="panel">
    <div class="ph2"><div class="pt2">// DEPLOYED CONTRACTS — ARC TESTNET</div></div>
    <div class="pb">
      <table class="ctable">
        ${[
          ['IdentityRegistry (ERC-8004)', C.identity],
          ['ReputationRegistry (ERC-8004)', C.reputation],
          ['ValidationRegistry (ERC-8004)', C.validation],
          ['AgenticCommerce (ERC-8183)', C.commerce],
          ['USDC ERC-20 (6 dec)', C.usdc]
        ].map(([n,a]) => `<tr><td>${n}</td><td><a href="${EXPLORER}/address/${a}" target="_blank">${a}</a></td></tr>`).join('')}
      </table>
    </div>
  </div>`}`;
}

// ═══════════════════════════════════════════════
// AGENTS PAGE
// ═══════════════════════════════════════════════
function renderAgents() {
  const tab = S.innerTab.agents;
  const myA = S.agents.filter(a => a.owner?.toLowerCase() === S.wallet?.toLowerCase());
  return `
  <div class="ph">
    <div class="ph-left"><div class="pt">Agent Registry</div><div class="ps">Onchain AI agent identities via ERC-8004 IdentityRegistry</div></div>
    <button class="btn btn-amber" onclick="openM('m-register')">+ Register Agent</button>
  </div>
  <div class="itabs">
    <div class="itab ${tab==='browse'?'on':''}" onclick="S.innerTab.agents='browse';renderTab()">All Agents (${S.agents.length})</div>
    <div class="itab ${tab==='mine'?'on':''}" onclick="S.innerTab.agents='mine';renderTab()">My Agents (${myA.length})</div>
  </div>
  ${S.loadingChain ? `<div class="chain-loading"><div class="cl-spinner"></div><div class="cl-text">Scanning chain for registered agents...</div></div>` : agentGrid(tab==='mine' ? myA : S.agents, tab==='mine')}`;
}

function agentGrid(agents, isMine) {
  if (!agents.length) return `
    <div class="empty">
      <div class="empty-icon">⬡</div>
      <div class="empty-text">${isMine
        ? 'No agents registered yet.<br>Register one to start accepting jobs.'
        : 'No agents found in the last 9,999 blocks on Arc Testnet.'}</div>
      <button class="btn btn-amber" style="margin-top:12px" onclick="openM('m-register')">Register Agent</button>
    </div>`;
  return `<div class="agents-grid">${agents.map(a => agentCard(a, isMine)).join('')}</div>`;
}

function agentCard(a, isMine) {
  const init = (a.name||'??').substring(0,2).toUpperCase();
  const score = a.score || 0;
  const isOwner = a.owner?.toLowerCase() === S.wallet?.toLowerCase();
  return `
  <div class="ac">
    <div class="ac-hdr">
      <div style="display:flex;align-items:center;gap:9px">
        <div class="ac-av">${init}</div>
        <div>
          <div class="ac-name">${esc(a.name)}</div>
          <div class="ac-type">${esc(a.agentType||'general').toUpperCase()}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;align-items:flex-end">
        ${a.validated ? '<span class="badge b-purple">VALIDATED</span>' : '<span class="badge b-gray">UNVALIDATED</span>'}
        ${isOwner ? '<span class="badge b-amber">OWNER</span>' : ''}
      </div>
    </div>
    <div class="ac-id">ID: <span style="color:var(--amber)">#${a.id}</span> · <a href="${EXPLORER}/address/${a.owner}" target="_blank" style="color:var(--text-muted);text-decoration:none;font-family:var(--mono);font-size:10px">${shortAddr(a.owner)}</a></div>
    ${a.description ? `<div class="ac-desc">${esc(a.description).substring(0,110)}${a.description.length>110?'…':''}</div>` : ''}
    ${a.capabilities?.length ? `<div class="ac-caps">${a.capabilities.slice(0,4).map(c=>`<span class="tag">${esc(c)}</span>`).join('')}</div>` : ''}
    <div class="score-wrap">
      <div class="score-bar"><div class="score-fill" style="width:${score}%"></div></div>
      <div class="score-lbl">${score}/100</div>
    </div>
    <div class="ac-actions">
      <a href="${EXPLORER}/address/${a.owner}" target="_blank" class="btn btn-ghost btn-sm">↗</a>
      <button class="btn btn-outline btn-sm" onclick="openRepModal(${a.id})">Rate</button>
      ${isOwner && !a.validated ? `<button class="btn btn-purple btn-sm" onclick="openValReqModal(${a.id})">Request Validation</button>` : ''}
      ${!isOwner ? `<button class="btn btn-amber btn-sm" onclick="prefillJob('${esc(a.owner)}')">Hire</button>` : ''}
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════
// JOBS PAGE
// ═══════════════════════════════════════════════
function renderJobs() {
  const tab = S.innerTab.jobs;
  const myC = S.jobs.filter(j => j.client?.toLowerCase() === S.wallet?.toLowerCase());
  const myP = S.jobs.filter(j => j.provider?.toLowerCase() === S.wallet?.toLowerCase());
  return `
  <div class="ph">
    <div class="ph-left"><div class="pt">Job Board</div><div class="ps">USDC-escrowed work via ERC-8183 AgenticCommerce</div></div>
    <div style="display:flex;gap:7px">
      <button class="btn btn-outline btn-sm" onclick="initChainData()">↻ Refresh</button>
      <button class="btn btn-amber" onclick="openM('m-job')">+ Post Job</button>
    </div>
  </div>
  <div class="itabs">
    <div class="itab ${tab==='board'?'on':''}" onclick="S.innerTab.jobs='board';renderTab()">All Jobs (${S.jobs.length})</div>
    <div class="itab ${tab==='posted'?'on':''}" onclick="S.innerTab.jobs='posted';renderTab()">Posted by Me (${myC.length})</div>
    <div class="itab ${tab==='providing'?'on':''}" onclick="S.innerTab.jobs='providing';renderTab()">My Provider Jobs (${myP.length})</div>
  </div>
  ${S.loadingChain ? `<div class="chain-loading"><div class="cl-spinner"></div><div class="cl-text">Loading jobs from chain...</div></div>` :
    tab==='board' ? jobGrid(S.jobs) : tab==='posted' ? jobGrid(myC,'client') : jobGrid(myP,'provider')}`;
}

function jobGrid(jobs, role) {
  if (!jobs.length) return `
    <div class="empty">
      <div class="empty-icon">◫</div>
      <div class="empty-text">${
        role==='client' ? 'No jobs posted by you.' :
        role==='provider' ? 'No jobs assigned to you as provider.' :
        'No jobs found in the last 9,999 blocks.'}</div>
      <button class="btn btn-amber" style="margin-top:12px" onclick="openM('m-job')">Post First Job</button>
    </div>`;
  return `<div class="jobs-grid">${jobs.map(j => jobCard(j)).join('')}</div>`;
}

function jobCard(j) {
  const isClient   = j.client?.toLowerCase()   === S.wallet?.toLowerCase();
  const isProvider = j.provider?.toLowerCase() === S.wallet?.toLowerCase();
  const st = Number(j.status);
  const now = Math.floor(Date.now()/1000);
  const remaining = j.expiredAt - now;
  const budget = parseFloat(ethers.formatUnits(j.budget || 0n, 6)).toFixed(2);

  let expiryHtml = '';
  if (j.expiredAt) {
    if (remaining > 86400) expiryHtml = `<span class="expiry ok">expires ${fmtExpiry(j.expiredAt)}</span>`;
    else if (remaining > 0) expiryHtml = `<span class="expiry warn">⚠ expires in ${fmtRemaining(remaining)}</span>`;
    else expiryHtml = `<span class="expiry exp">✗ expired</span>`;
  }

  const actions = [];
  if (j.txHash) actions.push(`<a href="${EXPLORER}/tx/${j.txHash}" target="_blank" class="btn btn-ghost btn-sm">↗</a>`);
  if (isProvider && st === 1) actions.push(`<button class="btn btn-outline btn-sm" onclick="openSubmitModal(${j.id})">Submit Work</button>`);
  if (isClient && st === 2) actions.push(`<button class="btn btn-green btn-sm" onclick="openCompleteModal(${j.id})">Release ✓</button>`);
  if (isClient && st === 2) actions.push(`<button class="btn btn-red btn-sm" onclick="openRejectModal(${j.id})">Reject ✗</button>`);
  if (isClient && (st===0||st===1)) actions.push(`<button class="btn btn-outline btn-sm" onclick="refreshJobStatus(${j.id}).then(renderTab)">↻</button>`);

  return `
  <div class="jc">
    <div class="jc-hdr">
      <div class="jc-title">${esc(j.description||'Untitled Job').substring(0,60)}${(j.description||'').length>60?'…':''}</div>
      <div class="jc-budget">${budget}<span> USDC</span></div>
    </div>
    <div class="jc-flow">
      ${FLOW_LABELS.map((l,i) => `<div class="jf-step ${st>i?'done':st===i?'act':''}">${l}</div>`).join('')}
    </div>
    <div class="jc-meta">
      <span class="badge ${JOB_BADGE_CLS[st]||'b-gray'}">${JOB_STATUSES[st]||'UNKNOWN'}</span>
      <span class="badge b-gray">#${j.id}</span>
      ${isClient ? '<span class="badge b-green">CLIENT</span>' : ''}
      ${isProvider ? '<span class="badge b-amber">PROVIDER</span>' : ''}
      ${expiryHtml}
    </div>
    <div class="jc-foot">
      <div class="jc-addrs">
        <div>Client: ${shortAddr(j.client)}</div>
        <div>Provider: ${shortAddr(j.provider)}</div>
      </div>
      <div class="jc-actions">${actions.join('')}</div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════
// ACTIVITY PAGE
// ═══════════════════════════════════════════════
function renderActivity() {
  const tab = S.innerTab.activity;
  const myA = S.agents.filter(a => a.owner?.toLowerCase() === S.wallet?.toLowerCase());
  const myC = S.jobs.filter(j => j.client?.toLowerCase() === S.wallet?.toLowerCase());
  const myP = S.jobs.filter(j => j.provider?.toLowerCase() === S.wallet?.toLowerCase());
  return `
  <div class="ph">
    <div class="ph-left"><div class="pt">My Activity</div><div class="ps">Your agents, posted jobs, and provider assignments</div></div>
  </div>
  <div class="itabs">
    <div class="itab ${tab==='agents'?'on':''}" onclick="S.innerTab.activity='agents';renderTab()">My Agents (${myA.length})</div>
    <div class="itab ${tab==='posted'?'on':''}" onclick="S.innerTab.activity='posted';renderTab()">Jobs Posted (${myC.length})</div>
    <div class="itab ${tab==='providing'?'on':''}" onclick="S.innerTab.activity='providing';renderTab()">Provider Jobs (${myP.length})</div>
    <div class="itab ${tab==='log'?'on':''}" onclick="S.innerTab.activity='log';renderTab()">Session Log (${S.log.length})</div>
  </div>
  ${tab==='agents' ? agentGrid(myA, true)
  : tab==='posted' ? jobGrid(myC,'client')
  : tab==='providing' ? jobGrid(myP,'provider')
  : renderLog()}`;
}

function renderLog() {
  if (!S.log.length) return `<div class="empty"><div class="empty-icon">◌</div><div class="empty-text">No session activity yet.</div></div>`;
  return `<div class="panel"><div class="pb">${S.log.map(a => `
    <div class="ai">
      <div class="ai-dot" style="background:${a.color}"></div>
      <div>
        <div class="ai-text">${a.text}</div>
        <div class="ai-time">${a.time}</div>
        ${a.hash ? `<a href="${EXPLORER}/tx/${a.hash}" target="_blank" class="ai-hash">${a.hash} ↗</a>` : ''}
      </div>
    </div>`).join('')}</div></div>`;
}

// ═══════════════════════════════════════════════
// CONTRACT INTERACTIONS
// ═══════════════════════════════════════════════

// --- Register Agent ---
async function doRegisterAgent() {
  if (!assertWallet()) return;
  const name = document.getElementById('r-name').value.trim();
  const type = document.getElementById('r-type').value;
  const ver  = document.getElementById('r-ver').value.trim() || '1.0.0';
  const desc = document.getElementById('r-desc').value.trim();
  const caps = document.getElementById('r-caps').value.split(',').map(s=>s.trim()).filter(Boolean);
  if (!name) { toast('Agent name is required.', 'err'); return; }

  const meta = JSON.stringify({ name, description: desc, agent_type: type, capabilities: caps, version: ver });
  const uri  = 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(meta)));

  setBtnLoad('btn-reg', true, 'Registering...');
  setTxs('r-txs','pend','⚡ Sending to Arc Testnet...');
  try {
    const ct = new ethers.Contract(C.identity, ABI.identity, S.signer);
    const tx = await ct.register(uri);
    setTxs('r-txs','pend','⏳ Waiting for confirmation...');
    const rc = await tx.wait();

    let tokenId = null;
    const iface = new ethers.Interface(ABI.identity);
    for (const log of rc.logs) {
      try {
        const p = iface.parseLog(log);
        if (p?.name === 'Transfer') { tokenId = Number(p.args.tokenId); break; }
      } catch {}
    }
    const id = tokenId ?? (S.agents.length + 1);
    S.agents.push({ id, name, agentType:type, description:desc, capabilities:caps, version:ver, owner:S.wallet, score:0, validated:false, txHash:rc.hash });
    updateBadges();
    addLog(`Registered agent: ${name} (ID #${id})`, 'var(--amber)', rc.hash);
    setTxs('r-txs','ok',`✓ Agent registered! Token ID: #${id} — <a href="${EXPLORER}/tx/${rc.hash}" target="_blank">View tx ↗</a>`);
    toast(`Agent "${name}" registered! ID #${id}`, 'ok');
    setTimeout(() => { closeM('m-register'); resetForm(['r-name','r-desc','r-caps']); renderTab(); }, 1800);
  } catch (e) {
    setTxs('r-txs','err','✗ ' + (e.reason || e.message || 'Transaction failed'));
    toast('Registration failed.', 'err');
  } finally { setBtnLoad('btn-reg', false, 'Register Agent'); }
}

// --- Post Job ---
async function doPostJob() {
  if (!assertWallet()) return;
  const desc    = document.getElementById('j-desc').value.trim();
  const budgetS = document.getElementById('j-budget').value;
  const expH    = parseInt(document.getElementById('j-expiry').value) || 24;
  const provider= document.getElementById('j-provider').value.trim();
  if (!desc)     { toast('Job description required.', 'err'); return; }
  if (!budgetS)  { toast('Budget required.', 'err'); return; }
  if (!ethers.isAddress(provider)) { toast('Valid provider address required.', 'err'); return; }

  const budget    = ethers.parseUnits(parseFloat(budgetS).toFixed(6), 6);
  const expiredAt = BigInt(Math.floor(Date.now()/1000) + expH * 3600);

  setBtnLoad('btn-job', true, 'Processing...');
  let jobId;
  try {
    const ct   = new ethers.Contract(C.commerce, ABI.commerce, S.signer);
    const usdc = new ethers.Contract(C.usdc, ABI.erc20, S.signer);

    setTxs('j-txs','pend','1 / 4  Creating job...');
    const createTx = await ct.createJob(provider, S.wallet, expiredAt, desc, ethers.ZeroAddress);
    const createRc = await createTx.wait();
    const iface = new ethers.Interface(ABI.commerce);
    for (const log of createRc.logs) {
      try { const p = iface.parseLog(log); if (p?.name==='JobCreated') { jobId = Number(p.args.jobId); break; } } catch {}
    }
    if (!jobId) jobId = S.jobs.length + 1;

    setTxs('j-txs','pend','2 / 4  Setting budget...');
    await (await ct.setBudget(jobId, budget, '0x')).wait();

    setTxs('j-txs','pend','3 / 4  Approving USDC...');
    await (await usdc.approve(C.commerce, budget)).wait();

    setTxs('j-txs','pend','4 / 4  Funding escrow...');
    await (await ct.fund(jobId, '0x')).wait();

    S.jobs.push({ id:jobId, description:desc, budget, client:S.wallet, provider, evaluator:S.wallet, status:1, expiredAt:Number(expiredAt), txHash:createRc.hash });
    updateBadges();
    addLog(`Posted job #${jobId}: "${desc.substring(0,40)}"`, 'var(--green)', createRc.hash);
    setTxs('j-txs','ok',`✓ Job #${jobId} funded! <a href="${EXPLORER}/tx/${createRc.hash}" target="_blank">View tx ↗</a>`);
    toast(`Job #${jobId} posted & funded with ${budgetS} USDC!`, 'ok');
    await loadBalances();
    setTimeout(() => { closeM('m-job'); resetForm(['j-desc','j-budget','j-provider']); renderTab(); }, 1800);
  } catch (e) {
    setTxs('j-txs','err','✗ ' + (e.reason || e.message || 'Transaction failed'));
    toast('Job posting failed.', 'err');
  } finally { setBtnLoad('btn-job', false, 'Post & Fund Job'); }
}

// --- Submit Deliverable ---
function openSubmitModal(id) {
  S.selectedJobId = id;
  document.getElementById('s-jid').value = id;
  document.getElementById('s-txs').innerHTML = '';
  document.getElementById('s-deliv').value = '';
  openM('m-submit');
}

async function doSubmitDeliverable() {
  if (!assertWallet()) return;
  const deliv = document.getElementById('s-deliv').value.trim();
  if (!deliv) { toast('Deliverable description required.', 'err'); return; }
  setBtnLoad('btn-sub', true, 'Submitting...');
  setTxs('s-txs','pend','⚡ Hashing and submitting deliverable...');
  try {
    const dHash = ethers.keccak256(ethers.toUtf8Bytes(deliv));
    const ct = new ethers.Contract(C.commerce, ABI.commerce, S.signer);
    const rc = await (await ct.submit(S.selectedJobId, dHash, '0x')).wait();
    const j = S.jobs.find(x => x.id === S.selectedJobId);
    if (j) j.status = 2;
    addLog(`Submitted deliverable for job #${S.selectedJobId}`, 'var(--blue)', rc.hash);
    setTxs('s-txs','ok',`✓ Deliverable submitted! Hash: ${dHash.substring(0,18)}… <a href="${EXPLORER}/tx/${rc.hash}" target="_blank">View ↗</a>`);
    toast('Deliverable submitted!', 'ok');
    setTimeout(() => { closeM('m-submit'); renderTab(); }, 1800);
  } catch (e) {
    setTxs('s-txs','err','✗ ' + (e.reason || e.message || 'Transaction failed'));
    toast('Submission failed.', 'err');
  } finally { setBtnLoad('btn-sub', false, 'Submit Deliverable'); }
}

// --- Complete Job ---
function openCompleteModal(id) {
  S.selectedJobId = id;
  document.getElementById('c-jid').value = id;
  document.getElementById('c-txs').innerHTML = '';
  openM('m-complete');
}

async function doCompleteJob() {
  if (!assertWallet()) return;
  const reason = document.getElementById('c-reason').value.trim() || 'approved';
  setBtnLoad('btn-cmp', true, 'Releasing...');
  setTxs('c-txs','pend','⚡ Releasing USDC from escrow...');
  try {
    const rHash = ethers.keccak256(ethers.toUtf8Bytes(reason));
    const ct = new ethers.Contract(C.commerce, ABI.commerce, S.signer);
    const rc = await (await ct.complete(S.selectedJobId, rHash, '0x')).wait();
    const j = S.jobs.find(x => x.id === S.selectedJobId);
    if (j) j.status = 3;
    addLog(`Completed job #${S.selectedJobId} — USDC released`, 'var(--green)', rc.hash);
    setTxs('c-txs','ok',`✓ Payment released! <a href="${EXPLORER}/tx/${rc.hash}" target="_blank">View ↗</a>`);
    toast('Job completed! USDC released to provider.', 'ok');
    await loadBalances();
    setTimeout(() => { closeM('m-complete'); renderTab(); }, 1800);
  } catch (e) {
    setTxs('c-txs','err','✗ ' + (e.reason || e.message || 'Transaction failed'));
    toast('Completion failed.', 'err');
  } finally { setBtnLoad('btn-cmp', false, 'Release Payment'); }
}

// --- Reject Job ---
function openRejectModal(id) {
  S.selectedJobId = id;
  document.getElementById('rj-jid').value = id;
  document.getElementById('rj-txs').innerHTML = '';
  openM('m-reject');
}

async function doRejectJob() {
  if (!assertWallet()) return;
  const reason = document.getElementById('rj-reason').value.trim() || 'rejected';
  setBtnLoad('btn-rj', true, 'Rejecting...');
  setTxs('rj-txs','pend','⚡ Submitting rejection...');
  try {
    const rHash = ethers.keccak256(ethers.toUtf8Bytes(reason));
    const ct = new ethers.Contract(C.commerce, ABI.commerce, S.signer);
    const rc = await (await ct.reject(S.selectedJobId, rHash, '0x')).wait();
    const j = S.jobs.find(x => x.id === S.selectedJobId);
    if (j) j.status = 4;
    addLog(`Rejected deliverable for job #${S.selectedJobId}`, 'var(--red)', rc.hash);
    setTxs('rj-txs','ok',`✓ Deliverable rejected. <a href="${EXPLORER}/tx/${rc.hash}" target="_blank">View ↗</a>`);
    toast('Deliverable rejected.', 'info');
    setTimeout(() => { closeM('m-reject'); renderTab(); }, 1800);
  } catch (e) {
    setTxs('rj-txs','err','✗ ' + (e.reason || e.message || 'Transaction failed'));
    toast('Rejection failed.', 'err');
  } finally { setBtnLoad('btn-rj', false, 'Reject Deliverable'); }
}

// --- Request Validation ---
function openValReqModal(agentId) {
  document.getElementById('vr-aid').value = agentId;
  document.getElementById('vr-validator').value = '';
  document.getElementById('vr-txs').innerHTML = '';
  const hash = validationRequestHash(agentId);
  document.getElementById('vr-hash-display').style.display = 'block';
  document.getElementById('vr-hash-val').textContent = hash;
  openM('m-val-req');
}

async function doRequestValidation() {
  if (!assertWallet()) return;
  const agentId   = parseInt(document.getElementById('vr-aid').value);
  const validator = document.getElementById('vr-validator').value.trim();
  if (!ethers.isAddress(validator)) { toast('Valid validator address required.', 'err'); return; }
  if (validator.toLowerCase() === S.wallet.toLowerCase()) { toast('Validator must be a different wallet from yours (ERC-8004).', 'err'); return; }

  setBtnLoad('btn-vreq', true, 'Requesting...');
  setTxs('vr-txs','pend','⚡ Submitting validation request...');
  try {
    const rHash = validationRequestHash(agentId);
    const reqURI = `data:text/plain,validation_request_agent_${agentId}`;
    const ct = new ethers.Contract(C.validation, ABI.validation, S.signer);
    const rc = await (await ct.validationRequest(validator, agentId, reqURI, rHash)).wait();
    addLog(`Requested validation for agent #${agentId} from ${shortAddr(validator)}`, 'var(--purple)', rc.hash);
    setTxs('vr-txs','ok',`✓ Validation requested! Share the hash with the validator. <a href="${EXPLORER}/tx/${rc.hash}" target="_blank">View ↗</a>`);
    toast('Validation request submitted!', 'ok');
    setTimeout(() => { closeM('m-val-req'); }, 2000);
  } catch (e) {
    setTxs('vr-txs','err','✗ ' + (e.reason || e.message || 'Transaction failed'));
    toast('Validation request failed.', 'err');
  } finally { setBtnLoad('btn-vreq', false, 'Request Validation'); }
}

// --- Respond to Validation ---
function previewValHash() {
  const id = document.getElementById('vs-aid').value;
  if (!id) return;
  const hash = validationRequestHash(parseInt(id));
  document.getElementById('vs-hash-display').style.display = 'block';
  document.getElementById('vs-hash-val').textContent = hash;
}

async function doRespondValidation() {
  if (!assertWallet()) return;
  const agentId  = parseInt(document.getElementById('vs-aid').value);
  const response = parseInt(document.getElementById('vs-response').value);
  const tag      = document.getElementById('vs-tag').value.trim() || 'kyc_verified';
  if (!agentId || isNaN(agentId)) { toast('Agent ID required.', 'err'); return; }

  setBtnLoad('btn-vres', true, 'Submitting...');
  setTxs('vs-txs','pend','⚡ Submitting validation response...');
  try {
    const rHash   = validationRequestHash(agentId);
    const resHash = ethers.keccak256(ethers.toUtf8Bytes(`response_${agentId}_${response}`));
    const ct = new ethers.Contract(C.validation, ABI.validation, S.signer);
    const rc = await (await ct.validationResponse(rHash, response, '', resHash, tag)).wait();

    if (response === 100) {
      const agent = S.agents.find(a => a.id === agentId);
      if (agent) agent.validated = true;
    }
    addLog(`Submitted validation response for agent #${agentId}: ${response===100?'APPROVED':'REJECTED'}`, 'var(--purple)', rc.hash);
    setTxs('vs-txs','ok',`✓ Validation response submitted! <a href="${EXPLORER}/tx/${rc.hash}" target="_blank">View ↗</a>`);
    toast(`Validation ${response===100?'approved':'rejected'} for agent #${agentId}`, 'ok');
    setTimeout(() => { closeM('m-val-res'); renderTab(); }, 1800);
  } catch (e) {
    setTxs('vs-txs','err','✗ ' + (e.reason || e.message || 'Transaction failed'));
    toast('Validation response failed.', 'err');
  } finally { setBtnLoad('btn-vres', false, 'Submit Response'); }
}

// --- Give Reputation ---
function openRepModal(agentId) {
  document.getElementById('rp-aid').value = agentId;
  document.getElementById('rp-txs').innerHTML = '';
  openM('m-rep');
}

async function doGiveReputation() {
  if (!assertWallet()) return;
  const agentId = parseInt(document.getElementById('rp-aid').value);
  const score   = parseInt(document.getElementById('rp-score').value);
  const tag     = document.getElementById('rp-tag').value.trim() || 'feedback';
  const comment = document.getElementById('rp-comment').value.trim();
  if (!agentId || isNaN(score)) { toast('Agent ID and score required.', 'err'); return; }
  if (score < 0 || score > 100) { toast('Score must be between 0 and 100.', 'err'); return; }

  setBtnLoad('btn-rep', true, 'Submitting...');
  setTxs('rp-txs','pend','⚡ Recording reputation onchain...');
  try {
    const fHash = ethers.keccak256(ethers.toUtf8Bytes(tag));
    const ct = new ethers.Contract(C.reputation, ABI.reputation, S.signer);
    const rc = await (await ct.giveFeedback(agentId, score, 0, tag, '', '', comment, fHash)).wait();
    const agent = S.agents.find(a => a.id === agentId);
    if (agent) agent.score = agent.score ? Math.round((agent.score + score) / 2) : score;
    addLog(`Gave feedback to agent #${agentId}: score ${score}/100`, 'var(--amber)', rc.hash);
    setTxs('rp-txs','ok',`✓ Reputation recorded! <a href="${EXPLORER}/tx/${rc.hash}" target="_blank">View ↗</a>`);
    toast('Reputation feedback submitted!', 'ok');
    setTimeout(() => { closeM('m-rep'); renderTab(); }, 1800);
  } catch (e) {
    setTxs('rp-txs','err','✗ ' + (e.reason || e.message || 'Transaction failed'));
    toast('Reputation submission failed.', 'err');
  } finally { setBtnLoad('btn-rep', false, 'Submit Feedback'); }
}

// ═══════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════
function prefillJob(providerAddr) {
  document.getElementById('j-provider').value = providerAddr;
  document.getElementById('j-txs').innerHTML = '';
  openM('m-job');
}

function assertWallet() {
  if (!S.wallet) { toast('Connect your wallet first.', 'err'); return false; }
  if (!S.chainOk) { toast('Please switch to Arc Testnet first.', 'err'); return false; }
  return true;
}

function openM(id) {
  const el = document.getElementById(id);
  el.style.display = 'flex';
  requestAnimationFrame(() => el.classList.add('show'));
}
function closeM(id) {
  const el = document.getElementById(id);
  el.classList.remove('show');
  setTimeout(() => el.style.display = 'none', 180);
}

function setTxs(id, type, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<div class="txs ${type}">${html}</div>`;
}
function setBtnLoad(id, loading, label) {
  const el = document.getElementById(id);
  if (!el) return;
  el.disabled = loading;
  el.innerHTML = loading ? `<span class="spin">⟳</span> ${label}` : label;
}
function resetForm(ids) { ids.forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; }); }

function updateBadges() {
  const ba = document.getElementById('b-agents');
  const bj = document.getElementById('b-jobs');
  if (ba) { ba.textContent = S.agents.length; ba.classList.remove('loading'); }
  if (bj) { bj.textContent = S.jobs.length; bj.classList.remove('loading'); }
}

function addLog(text, color, hash) {
  S.log.unshift({ text, color: color||'var(--text-muted)', time: new Date().toLocaleTimeString(), hash: hash||null });
  if (S.log.length > 30) S.log.pop();
}

function toast(msg, type='info') {
  const c = document.getElementById('toasts');
  const t = document.createElement('div');
  const icon = type==='ok' ? '✓' : type==='err' ? '✗' : '!';
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icon}</span><span>${esc(msg)}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity 0.25s'; setTimeout(()=>t.remove(),250); }, 4500);
}

function shortAddr(a) { return a ? a.slice(0,6)+'…'+a.slice(-4) : '—'; }
function shortHash(h) { return h ? h.slice(0,10)+'…' : ''; }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function fmtExpiry(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('en', {month:'short',day:'numeric'}) + ' ' + d.toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'});
}
function fmtRemaining(secs) {
  if (secs > 3600) return Math.floor(secs/3600) + 'h';
  if (secs > 60) return Math.floor(secs/60) + 'm';
  return secs + 's';
}

// Close modal on overlay click
document.querySelectorAll('.mo').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) { m.classList.remove('show'); setTimeout(()=>m.style.display='none',180); } });
});

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
renderTab();
