# AgenticCommerce Dashboard – Full Rewrite

This repository contains the updated AgenticCommerce front-end with all major fixes implemented. The dashboard now fully interacts with the blockchain, handles multiple USDC formats correctly, validates agents and jobs, and supports IPFS metadata seamlessly.

---

## Key Updates & Fixes

### 1. Onchain Data Loading
- `initChainData()` runs immediately after wallet connect.
- Queries `Transfer(from=0x0)` events from **IdentityRegistry** and `JobCreated` events from **AgenticCommerce** for the last 9,999 blocks (RPC limit).
- Hydrates each agent and job with live contract reads.
- Page refresh fully restores all data from chain.

### 2. USDC Handling
- Native USDC (18 decimals) read via `provider.getBalance()`.
- ERC-20 USDC (6 decimals) read via `balanceOf()` for job escrow.
- Both balances are displayed clearly with distinct labels in the dashboard.

### 3. Owner-of for Hire Flow
- Agent cards now pull owner address from `ownerOf(tokenId)`.
- Clicking **Hire** pre-fills the job modal with the correct provider address.

### 4. Full Validation Flow
- **Agent owners**: click **Request Validation** → calls `validationRequest()`, displays deterministic `requestHash` to share with validators.
- **Validators**: click **Respond to Validation**, enter agent ID → hash computed live, pick Approved/Rejected → calls `validationResponse()`.
- VALIDATED badge updates immediately on approval.

### 5. Job Expiry Countdown
- Each job card computes remaining time dynamically.
- Color-coded:
  - Green: >24h
  - Amber: <24h
  - Red: expired
- Shown as `expires Nov 12 09:30` or `⚠ expires in 3h`.

### 6. Reject Flow
- Evaluators now see **Release ✓** and **Reject ✗** buttons for `Submitted` jobs.
- Calls `reject(jobId, reasonHash, 0x)` on the contract.
- Status updates to **Rejected (4)** immediately.

### 7. IPFS Metadata Support
- `parseMeta()` handles:
  - `data:application/json;base64,`
  - `ipfs://` (via ipfs.io with 5s timeout)
  - Plain `https://` URIs
- Fallback: `Agent #${id}` if unreachable.

---

## Usage

1. Connect your wallet.
2. Dashboard auto-loads agents and jobs from chain.
3. Interact with jobs:
   - Hire agents
   - Request or respond to validation
   - Release or reject submitted jobs
4. Check balances for native and ERC-20 USDC distinctly.
5. Job cards show expiry countdowns and status badges.
6. Agent metadata loaded seamlessly via IPFS or fallback.

---

## Notes
- Requires RPC endpoint with support for querying the last 9,999 blocks.
- USDC balances displayed separately to prevent confusion between native and ERC-20 tokens.
- IPFS requests time out after 5 seconds to ensure dashboard responsiveness.

---

## License
MIT License
