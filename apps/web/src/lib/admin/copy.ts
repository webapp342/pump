import type { AdminTabId } from "@/components/admin/AdminChrome";

/** Enterprise microcopy for Pump admin console — single source of truth. */
export const ADMIN_COPY = {
  brand: {
    title: "Pump Console",
    subtitle: "Operations",
    envLabel: "BSC Testnet",
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
    sweepAll: "Sweep all BNB",
    withdraw: "Send withdrawal",
    withdrawing: "Sending…",
    useMax: "Use maximum",
    refreshList: "Refresh list",
  },

  pages: {
    dashboard: { title: "Dashboard", description: "" },
    todos: { title: "Todo list", description: "" },
    portfolio: { title: "Portfolio", description: "" },
    treasury: { title: "Treasury & fees", description: "" },
    airdrops: { title: "Airdrop recovery", description: "" },
    promo: { title: "Promo campaigns", description: "" },
    contracts: { title: "Contract registry", description: "" },
    environment: { title: "Environment", description: "" },
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
        description: "Accrued, pending, and claimed protocol fees in BNB.",
      },
    },
  },

  health: {
    title: "Infrastructure",
    description: "",
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
      description: "",
    },
    balances: {
      title: "Balances",
      description: "",
    },
    withdraw: {
      title: "Withdrawal",
      description: "",
      typeBnb: "BNB",
      typeToken: "Token",
      recipient: "Recipient address",
      amountBnb: "Amount (BNB)",
      amountToken: "Amount (tokens)",
      tokenContract: "Token contract",
      available: "Available balance",
      ownerRequired: "Withdrawals require the treasury owner wallet.",
    },
    emergency: {
      recipientPlaceholder: "Recipient",
      warning: "Halts curve trading",
    },
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
      description: "",
      titleField: "Campaign title",
      titlePlaceholder: "Follow Pump on X",
      descField: "Description (optional)",
      descPlaceholder: "Short instructions shown in Missions",
      pointsField: "Reward points",
      urlField: "Destination URL",
      urlPlaceholder: "https://…",
    },
    list: {
      title: "Campaigns",
      description: "",
      empty: "No promo campaigns configured.",
    },
  },

  contracts: {
    intro: "",
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
  },

  todos: {
    add: "Add",
    creating: "Adding…",
    save: "Save",
    loading: "Loading todos…",
    empty: "No todos in this view yet.",
    listTitle: "Tasks",
    listDesc: "Drag to reorder (switches to manual). Reset to sort by priority anytime.",
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
    description: "",
    warning: "Deletes indexed app data. On-chain state unchanged.",
    preservedTitle: "Kept",
    wipedTitle: "Deleted",
    confirmLabel: "Type WIPE PUMP DATA to enable",
    button: "Wipe application data",
    running: "Wiping…",
    success: "Application data wiped. Indexer restart scheduled to resync from chain.",
    successWithWarning:
      "Data wiped, but indexer restart could not be confirmed — run systemctl restart manually if needed.",
    finalConfirm:
      "Last chance: wipe all application data except contract registry, missions, platform settings, and admin todos?",
    indexerNote: "",
  },
} as const;

export function adminPageMeta(id: AdminTabId) {
  return ADMIN_COPY.pages[id];
}
