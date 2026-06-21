import type { AdminTabId } from "@/components/admin/AdminChrome";

/** Enterprise microcopy for Pump admin console — single source of truth. */
export const ADMIN_COPY = {
  brand: {
    title: "Pump Console",
    subtitle: "Operations · BSC Testnet",
    breadcrumbRoot: "Operations",
  },

  auth: {
    gateTitle: "Pump Console",
    gateBody:
      "Sign in with the operations wallet configured in NEXT_PUBLIC_ADMIN_ADDRESS. This console controls protocol fees, treasury, and recovery tools.",
    connect: "Connect operations wallet",
    connecting: "Connecting wallet…",
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
    dashboard: {
      title: "Dashboard",
      description:
        "At-a-glance platform health, treasury position, and recovery queue for BSC Testnet.",
    },
    portfolio: {
      title: "Portfolio",
      description:
        "Review token holdings in the operations wallet and execute bulk sell actions when needed.",
    },
    treasury: {
      title: "Treasury & fees",
      description:
        "Configure protocol fees, monitor treasury balances, and process authorized withdrawals.",
    },
    airdrops: {
      title: "Airdrop recovery",
      description:
        "Recover unclaimed reward escrow after the on-chain claim window closes.",
    },
    promo: {
      title: "Promo campaigns",
      description:
        "Create off-chain link tasks that award launchpad points after user completion.",
    },
    contracts: {
      title: "Contract registry",
      description:
        "Canonical UUPS proxy addresses used by the app, indexer, and deployment scripts.",
    },
    environment: {
      title: "Environment variables",
      description:
        "Manage VM configuration per service with key-value editing, masked secrets, and one-click apply — similar to Vercel project env.",
    },
  } satisfies Record<AdminTabId, { title: string; description: string }>,

  nav: {
    overview: "Overview",
    operations: "Operations",
    finance: "Finance",
    system: "System",
    items: {
      dashboard: { label: "Dashboard", desc: "Metrics & health" },
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
      treasury: { label: "Treasury balance", hintEmpty: "LaunchpadTreasury contract" },
      sweeps: { label: "Recovery queue", hintEmpty: "Campaigns ready to sweep" },
    },
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
    description: "Live status of VM services, database, indexer, and realtime stack.",
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
      description: "On-chain fee parameters for trades, launches, and airdrops.",
    },
    balances: {
      title: "Treasury balances",
      description: "Contract balances and emergency controls for bonding curve escrow.",
    },
    withdraw: {
      title: "Treasury withdrawal",
      description: "Send BNB or ERC-20 tokens from LaunchpadTreasury to an authorized recipient.",
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
      recipientPlaceholder: "Recipient address (treasury recommended)",
      warning: "Permanently halts all curve trading.",
    },
  },

  airdrops: {
    callout:
      "Recovery unlocks when on-chain claimEnd passes (qualify end + 24 hours). Finalization is not required when there are no winners.",
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
      title: "New promo campaign",
      description: "Users earn points once after visiting the target URL.",
      titleField: "Campaign title",
      titlePlaceholder: "Follow Pump on X",
      descField: "Description (optional)",
      descPlaceholder: "Short instructions shown in Missions",
      pointsField: "Reward points",
      urlField: "Destination URL",
      urlPlaceholder: "https://…",
    },
    list: {
      title: "Active campaigns",
      description: "Completed tasks retain earned points if a campaign is removed.",
      empty: "No promo campaigns configured.",
    },
  },

  contracts: {
    intro:
      "These UUPS proxy addresses must match .env and contract_registry. Upgrades replace implementation only — addresses stay stable.",
    labels: {
      memeFactory: "MemeFactory",
      bonding: "BondingCurveManager",
      airdrop: "PumpAirdropManager",
      treasury: "LaunchpadTreasury",
    },
  },

  environment: {
    callout:
      "Variables are written to disk on save. Running services do not pick up changes until you apply them — like Vercel redeploy after editing project env.",
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

  empty: {
    loading: "Loading data…",
    noData: "No data available",
  },

  errors: {
    dismiss: "Review the message below and try again.",
  },
} as const;

export function adminPageMeta(id: AdminTabId) {
  return ADMIN_COPY.pages[id];
}
