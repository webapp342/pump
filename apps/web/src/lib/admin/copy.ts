import type { AdminTabId } from "@/components/admin/AdminChrome";
import { CHAIN_DISPLAY_NAME, NATIVE_SYMBOL } from "@/config/chain";

/** Enterprise microcopy for Pump admin console — single source of truth. */
export const ADMIN_COPY = {
  brand: {
    title: "Pump Console",
    subtitle: "Operations",
    envLabel: CHAIN_DISPLAY_NAME,
    breadcrumbRoot: "Operations",
  },

  auth: {
    gateTitle: "Pump Console",
    gateBody:
      "Connect the operations wallet configured in NEXT_PUBLIC_ADMIN_ADDRESS. This console controls protocol fees, treasury, and recovery tools.",
    connect: "Connect operations wallet",
    connecting: "Connecting wallet…",
    sessionChecking: "Checking sign-in session…",
    signInTitle: "Verify wallet ownership",
    signInBody:
      "Sign a one-time message (SIWE) to prove you control the operations wallet. Admin API requests require this session — connecting MetaMask alone is not enough.",
    signIn: "Sign in with wallet",
    signingIn: "Waiting for signature…",
    unauthorizedTitle: "Access denied",
    unauthorizedBody:
      "The connected wallet is not authorized for this console. Switch to the configured admin address or update your environment.",
    disconnect: "Disconnect wallet",
    sidebarConnected: "Operations wallet",
  },

  actions: {
    refresh: "Refresh",
    refreshing: "Refreshing…",
    signOut: "Sign out",
    update: "Update",
    manage: "Manage",
    viewDetails: "View details",
    close: "Close",
    create: "Create campaign",
    delete: "Remove",
    sweep: "Recover funds",
    sweepAll: `Sweep all ${NATIVE_SYMBOL}`,
    withdraw: "Send withdrawal",
    withdrawing: "Sending…",
    useMax: "Use maximum",
    refreshList: "Refresh list",
  },

  dangerConfirm: {
    stepLabel: "Step {step} of {total}",
    continue: "Continue",
    back: "Back",
    cancel: "Cancel",
    working: "Working…",
    typeLabel: "Type {phrase} to confirm",
    titles: {
      curveRecover: "Recover escrow",
      resumeTrading: "Resume trading",
      pendingFee: "Sweep pending fee",
      pendingFeesAll: "Sweep all pending fees",
      withdrawProtocol: "Withdraw protocol fees",
      airdropSweep: "Recover airdrop escrow",
      deletePromo: "Remove campaign",
    },
    consequences: {
      curveRecover:
        "Drains withdrawable liquidity to the recipient, then clears the trading halt. This cannot be undone.",
      resumeTrading:
        "Clears the global emergency halt so buys and sells work again. Does not move funds.",
      pendingFee:
        "Moves this owner’s unclaimed fees from the liquidity vault to the recipient. The owner can no longer claim.",
      pendingFeesAll:
        "Sweeps every pending creator/referrer fee PDA to the recipient. Owners can no longer claim.",
      withdrawProtocol:
        "Sends protocol-treasury SOL to the recipient. Keep rent on the PDA; this cannot be reversed on-chain.",
      airdropSweep:
        "Sweeps remaining airdrop escrow to the campaign owner / recovery path. Irreversible once confirmed.",
      deletePromo:
        "Removes this promo task from Rewards. Users keep points already earned.",
    },
  },

  pages: {
    dashboard: {
      title: "Dashboard",
      description: "Platform activity, fee ledger, and infrastructure health.",
    },
    todos: {
      title: "Todo list",
      description: "Operations checklist for launches, incidents, and follow-ups.",
    },
    portfolio: {
      title: "Portfolio",
      description: "Admin wallet bonding-curve holdings and liquidation tools.",
    },
    treasury: {
      title: "Treasury & fees",
      description: "Protocol fee config, balances, recovery, and withdrawals.",
    },
    airdrops: {
      title: "Airdrop recovery",
      description: "Escrow sweep queue for finished or recoverable campaigns.",
    },
    promo: {
      title: "Promo campaigns",
      description: "Off-chain points tasks shown in Rewards missions.",
    },
    contracts: {
      title: "Contract registry",
      description: "UUPS proxy addresses for factory, curve, airdrop, and treasury.",
    },
    environment: {
      title: "Environment",
      description: "Service key-value config for web, realtime, and indexer.",
    },
  } satisfies Record<AdminTabId, { title: string; description: string }>,

  nav: {
    overview: "Overview",
    operations: "Operations",
    finance: "Finance",
    system: "System",
    search: "Search operations…",
    environment: "Environment",
    notifications: "Notifications",
    items: {
      dashboard: { label: "Dashboard", desc: "Metrics & health" },
      todos: { label: "Todo list", desc: "Ops checklist" },
      portfolio: { label: "Portfolio", desc: "Wallet holdings" },
      airdrops: { label: "Airdrop recovery", desc: "Escrow sweeps" },
      promo: { label: "Promo campaigns", desc: "Points tasks" },
      treasury: { label: "Treasury & fees", desc: "Fees & treasury" },
      contracts: { label: "Contract registry", desc: "Proxy addresses" },
      environment: { label: "Environment", desc: "Key-value config" },
    },
  },

  dashboard: {
    kpi: {
      users: { label: "Registered users", hintEmpty: "Profiles with app activity" },
      trades24h: { label: "Trades (24h)", hintEmpty: "Indexed on-chain trades" },
      tokens: { label: "Tokens launched", hintEmpty: "Indexed launches" },
      treasury: { label: "Treasury balance", hintEmpty: "LaunchpadTreasury contract" },
      pendingFees: { label: "Pending fees", hintEmpty: "Creator + referrer unclaimed" },
      sweeps: { label: "Recovery ready", hintEmpty: "Campaigns ready to sweep" },
    },
    financialPanel: "Fee ledger",
    recoveryTable: "Recovery queue",
    lastRefreshed: "Last updated",
    autoRefresh: "Data refreshes every 60 seconds",
    sections: {
      activity: {
        title: "Platform activity",
        description: "Launch and engagement metrics indexed from PostgreSQL.",
      },
      fees: {
        title: "Fee ledger",
        description: `Accrued, pending, and claimed protocol fees in ${NATIVE_SYMBOL}.`,
      },
    },
  },

  health: {
    title: "Infrastructure",
    description: "Realtime API, indexer, Redis, and host metrics for this environment.",
    status: "Overall status",
    checks: "Service checks",
    checkedAt: "Last checked",
    runCheck: "Run check",
    modalTitle: "Infrastructure report",
    labels: {
      healthy: "Healthy",
      degraded: "Degraded",
      down: "Unavailable",
    },
  },

  treasury: {
    feeSettings: {
      title: "Protocol fees",
      description: "On-chain trade fee, share splits, and launch fees. Edits require the owner wallet.",
    },
    balances: {
      title: "Balances",
      description: `Treasury contract balances and available ${NATIVE_SYMBOL} for withdrawal.`,
    },
    withdraw: {
      title: "Withdrawal",
      description: `Send ${NATIVE_SYMBOL} or ERC-20 from LaunchpadTreasury to a recipient address.`,
      descriptionSolana:
        "Withdraw protocol fees from the protocol-treasury PDA. Creator and referrer fees live in separate claim PDAs — users claim those themselves.",
      typeBnb: NATIVE_SYMBOL,
      typeToken: "Token",
      recipient: "Recipient address",
      amountBnb: `Amount (${NATIVE_SYMBOL})`,
      amountToken: "Amount (tokens)",
      tokenContract: "Token contract",
      available: "Available balance",
      availableSolana: "Withdrawable (protocol − rent)",
      treasuryBalanceSolana: "Protocol treasury balance",
      withdrawAvailable: "Withdraw all available",
      withdrawCustom: "Send custom amount",
      ownerRequired: "Withdrawals require the treasury owner wallet.",
    },
    pendingFees: {
      title: "Emergency pending fees",
      description:
        "Creator/referrer claim balances are accounting PDAs only — claimable SOL sits in the liquidity vault. Sweep moves that SOL to the recipient and zeros the PDA so the owner cannot claim.",
      empty: "No unclaimed creator or referrer fees.",
      owner: "Owner",
      kind: "Kind",
      pending: `Pending (${NATIVE_SYMBOL})`,
      sweep: "Sweep",
      sweepAll: "Sweep all",
      sweeping: "Sweeping…",
      sweepingAll: "Sweeping all…",
      refresh: "Refresh list",
      total: "Total pending",
      recipientHint: "Uses the withdrawal recipient above.",
      confirm:
        "Sweep this owner’s unclaimed {kind} fees ({amount} {symbol}) to {to}? The owner will no longer be able to claim them.",
      confirmAll:
        "Sweep all unclaimed creator/referrer fees ({amount} {symbol} across {count} accounts) to {to}? Owners will no longer be able to claim them.",
    },
    emergency: {
      recipientPlaceholder: "Recipient",
      warning: "Halts curve trading",
    },
    curveRecovery: {
      title: "Curve recovery",
      halted: "Trading halted — new buys and sells are blocked until you resume.",
      ready: "Escrow empty — curve is ready for new tokens and trades.",
      recipient: `Send recovered ${NATIVE_SYMBOL} to`,
      resetDb: "Reset app database after recovery (recommended for a clean slate)",
      recoverAndResume: "Recover escrow & resume trading",
      resumeOnly: "Resume trading",
      recovering: "Recovering…",
      resuming: "Resuming…",
      wiping: "Resetting database…",
      hint:
        "Sweeps leftover curve escrow to the recipient, then re-enables trading automatically.",
      confirmSweep:
        `Recover {amount} ${NATIVE_SYMBOL} from the bonding curve to {to}? Trading will pause briefly, then resume automatically.`,
      confirmSweepWithWipe:
        `Recover {amount} ${NATIVE_SYMBOL} to {to}, resume trading, and wipe all app data (tokens, trades, indexer cursor)?`,
      confirmResume: "Re-enable curve trading (setEmergencyHalt false)?",
      confirmResumeWithWipe:
        "Re-enable curve trading and wipe all app data for a fresh start?",
      success: "Curve trading is live again. You can create tokens and trade.",
      successWithWipe: "Curve trading is live and app data was reset.",
      wipeFailed: "Trading resumed, but database reset failed:",
    },
  },

  feeExempt: {
    title: "Fee exemption",
    listTitle: "Exempt addresses",
    addTitle: "Add or update",
    address: "Wallet address",
    applyTo: "Apply to",
    status: "Status",
    grant: "Grant",
    revoke: "Revoke exempt",
    submit: "Update on-chain",
    confirming: "Confirming…",
    empty: "No exempt addresses (owner/admin are always free).",
  },

  airdrops: {
    tableTitle: "Recovery queue",
    callout: "",
    ready: "ready for recovery",
    locked: "awaiting claim window",
    empty: "No airdrop campaigns indexed yet.",
    status: {
      ready: "Ready for recovery",
      claimWindowOpen: "Claim window open",
      noWinners: "No eligible winners",
      swept: "Recovered",
      notFinalized: "Awaiting finalization",
      fullyClaimed: "Fully claimed",
    },
    columns: {
      id: "ID",
      campaign: "Campaign",
      symbol: "Symbol",
      pool: "Reward pool",
      claimed: "Claimed",
      remaining: "Remaining",
      claimUntil: "Claim until",
      sweepIn: "Recovery in",
      status: "Status",
      action: "Action",
    },
  },

  promo: {
    create: {
      title: "New campaign",
      description: "Create an off-chain points task. It appears in Rewards missions after save.",
      titleField: "Campaign title",
      titlePlaceholder: "Follow Pump on X",
      descField: "Description (optional)",
      descPlaceholder: "Short instructions shown in Rewards",
      pointsField: "Reward points",
      urlField: "Destination URL",
      urlPlaceholder: "https://…",
    },
    list: {
      title: "Campaigns",
      description: "Active promo tasks and point rewards shown to users.",
      empty: "No promo campaigns configured.",
    },
  },

  contracts: {
    intro: "",
    tableTitle: "Proxy addresses",
    tableDescription: "UUPS proxies used by the web app and indexer. Verify on the explorer before upgrades.",
    labels: {
      memeFactory: "MemeFactory",
      bonding: "BondingCurveManager",
      airdrop: "PumpAirdropManager",
      treasury: "LaunchpadTreasury",
    },
  },

  environment: {
    callout: "",
    servicesTitle: "Services",
    variablesTitle: "Environment variables",
    variablesDescription: "Key-value configuration for the selected service. Sensitive values are masked at rest in the UI.",
    connectRequired: "Connect the operations wallet to manage environment variables.",
    searchPlaceholder: "Search by name…",
    filterAll: "All",
    filterClient: "Client",
    filterServer: "Server",
    filterSensitive: "Sensitive",
    addTitle: "Add variable",
    addKeyPlaceholder: "KEY_NAME",
    addValuePlaceholder: "Value",
    addButton: "Add",
    colName: "Name",
    colValue: "Value",
    colScope: "Scope",
    colActions: "Actions",
    scopeClient: "Client",
    scopeServer: "Server",
    sensitiveBadge: "Sensitive",
    masked: "••••••••••••",
    reveal: "Reveal",
    hide: "Hide",
    edit: "Edit",
    delete: "Remove",
    saveChanges: "Save changes",
    saving: "Saving…",
    discard: "Discard",
    empty: "No variables in this file yet.",
    emptySearch: "No variables match your search.",
    selectFile: "Select a service to manage variables.",
    unsaved: "You have unsaved changes.",
    savedToDisk: "Saved to disk. Apply changes to reload running services.",
    applyTitle: "Apply environment changes",
    applyBody: "Saved variables are on disk but not yet loaded by running processes. Apply now to restart the service with updated configuration.",
    applyButton: "Apply changes",
    applying: "Applying…",
    applied: "Services reloaded. New values are active.",
    addErrorKey: "Enter a valid key (letters, numbers, underscore; must start with a letter or underscore).",
    addErrorDuplicate: "A variable with this name already exists.",
    deleteConfirm: "Remove this variable from the saved configuration?",
  },

  portfolio: {
    empty: "Connect the operations wallet to view holdings.",
    title: "Bonding-curve holdings",
    description: "Sellable positions held by the operations wallet on active curves.",
    refresh: "Refresh",
    loading: "Loading…",
    loadingHoldings: "Loading holdings…",
    sellAll: "Sell all",
    sellMax: "Sell max",
    emptyHoldings: "No sellable bonding-curve holdings found for this wallet.",
    columns: {
      token: "Token",
      value: "Value",
      balance: "Balance",
      action: "Action",
    },
  },

  todos: {
    connectRequired: "Connect the operations wallet to manage the todo list.",
    add: "Add",
    creating: "Adding…",
    save: "Save",
    loading: "Loading todos…",
    empty: "No todos in this view yet.",
    listTitle: "Tasks",
    listDesc: "Drag tasks to reorder (switches to manual sort). Use notes for long specs — keep titles short.",
    deleteConfirm: "Delete this todo permanently?",
    moveUp: "Move up",
    moveDown: "Move down",
    edit: "Edit",
    drag: "Drag to reorder",
    sortPriority: "By priority",
    sortManual: "Manual order",
    sortPriorityHint: "Urgent → High → Medium → Low",
    expandNotes: "Notes",
    filters: {
      open: "Open",
      done: "Done",
      all: "All",
    },
    fields: {
      title: "Title",
      notes: "Notes (optional)",
      priority: "Priority",
    },
    placeholders: {
      title: "e.g. Rotate RPC keys before mainnet",
      notes: "Extra context, links, or acceptance criteria",
    },
  },

  empty: {
    loading: "Loading data…",
    noData: "No data available",
  },

  errors: {
    dismiss: "Review the message below and try again.",
  },

  wipe: {
    title: "Reset data",
    description:
      "Clean-start test environment: wipes all user/wallet/trading/XP/leaderboard data from PostgreSQL, Redis, and ClickHouse. Mission definitions, platform settings, contract registry, and admin todos stay intact. On-chain contracts and balances are not modified.",
    warning:
      "Deletes every user account, wallet link, token, trade, XP, weekly leaderboard, clan, airdrop progress, Redis hot cache, and ClickHouse history. You can log in again as the first user, create tokens, trade, earn XP, and complete missions from scratch.",
    preservedTitle: "Kept (app keeps working)",
    wipedTitle: "Deleted (runtime / user data)",
    confirmLabel: "Type WIPE PUMP DATA to enable",
    button: "Wipe application data",
    running: "Wiping PostgreSQL, Redis, ClickHouse…",
    success:
      "Clean start complete. Registry synced from .env; indexer + realtime restarted to resync from chain.",
    successWithWarning:
      "Data wiped with warnings — check indexer/realtime services if live board lags.",
    finalConfirm:
      "Last chance: wipe ALL user/trading/XP/leaderboard data (PG + Redis + ClickHouse)? Mission definitions and platform settings are kept. You will be the first user again after login.",
    indexerNote: "",
  },
} as const;

export function adminPageMeta(id: AdminTabId) {
  return ADMIN_COPY.pages[id];
}
