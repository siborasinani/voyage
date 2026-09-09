export const CURRENCIES = ['EUR', 'USD', 'GBP', 'ALL']

export const EXPENSE_CATEGORIES = [
  'Flights',
  'Accommodation',
  'Food',
  'Transport',
  'Activities',
  'Shopping',
  'Nightlife',
  'Other',
]

// Formats an amount in the given currency using the browser's own
// currency formatting (correct symbol, decimal places, grouping) — no
// exchange-rate conversion, just display of the amount as entered.
//
// The Albanian Lek has no widely-supported single-character symbol, and
// `Intl.NumberFormat` falls back to the bare "ALL" ISO code for it at
// the "en-US" locale used everywhere else in the app — rather than
// invent a symbol that could be wrong, it's spelled out as "Lek".
export function formatCurrencyAmount(amount, currency) {
  const normalizedCurrency = currency || 'USD'

  if (normalizedCurrency === 'ALL') {
    const formattedNumber = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0)

    return `${formattedNumber} Lek`
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: normalizedCurrency,
  }).format(amount || 0)
}

export function getTotalSpent(expenses) {
  return expenses.reduce((total, expense) => total + Number(expense.amount || 0), 0)
}

// Returns { category: totalAmount } for every category that has at
// least one expense.
export function getSpendingByCategory(expenses) {
  const totals = {}

  for (const expense of expenses) {
    const amount = Number(expense.amount || 0)
    totals[expense.category] = (totals[expense.category] || 0) + amount
  }

  return totals
}

// Chronological order, earliest first. Array.prototype.sort is stable,
// so same-day expenses keep their existing relative order.
export function sortExpensesByDate(expenses) {
  return [...expenses].sort((a, b) => {
    if (a.date < b.date) return -1
    if (a.date > b.date) return 1
    return 0
  })
}

// --- Shared expenses (equal split only, for now) ------------------

// Splits `amount` equally among `participantCount` people, rounded to
// whole cents, guaranteeing the shares always sum to *exactly*
// `amount` — never a cent more or less from naive per-share rounding.
// Works entirely in integer cents (never summing floating-point
// dollars/euros, which is what actually causes totals like 99.99
// instead of 100.00): everyone gets the same base share
// (floor(totalCents / count)), and any leftover cents from that
// division — always fewer cents than there are participants — go one
// each to the first few participants in array order. E.g. €100.00
// split 3 ways: 10000 cents / 3 = 3333 base + 1 leftover ->
// [33.34, 33.33, 33.33], which sums to exactly 100.00. Order-dependent
// (whoever is first in the given array gets the extra cent first) but
// deterministic — recalculating with the same participant order always
// produces the same shares.
export function splitAmountEqually(amount, participantCount) {
  if (!participantCount || participantCount <= 0) return []

  const totalCents = Math.round((Number(amount) || 0) * 100)
  const baseCents = Math.floor(totalCents / participantCount)
  const leftoverCents = totalCents - baseCents * participantCount

  return Array.from({ length: participantCount }, (_, index) => {
    const cents = baseCents + (index < leftoverCents ? 1 : 0)
    return cents / 100
  })
}

// Each person's net position across every *shared* expense on a trip
// (an expense with no participants — i.e. a personal one — never
// contributes here at all): `paid` is what they've actually paid out
// as the payer on any shared expense, `owed` is their own share across
// every shared expense they're a participant on (whether or not they
// were also the payer on that one), and `net = paid - owed` — positive
// means they should receive money, negative means they owe money, zero
// means they're settled. Only ever reads `expense.participants`/
// `expense.paidBy`/`expense.payerName` (see
// services/tripsRepository.js's fromExpenseRow) — never mutates
// anything, purely a display computation.
export function calculateSharedExpenseBalances(expenses) {
  const balances = new Map()

  const entryFor = (userId, displayName) => {
    if (!balances.has(userId)) {
      balances.set(userId, { userId, displayName: displayName || '', paid: 0, owed: 0 })
    } else if (displayName && !balances.get(userId).displayName) {
      balances.get(userId).displayName = displayName
    }
    return balances.get(userId)
  }

  for (const expense of expenses) {
    const participants = expense.participants ?? []
    if (participants.length === 0) continue // personal expense

    if (expense.paidBy) {
      entryFor(expense.paidBy, expense.payerName).paid += Number(expense.amount) || 0
    }
    for (const participant of participants) {
      entryFor(participant.userId, participant.displayName).owed +=
        Number(participant.shareAmount) || 0
    }
  }

  return [...balances.values()].map((entry) => ({
    ...entry,
    // Rounds away the sub-cent floating-point residue that summing
    // many decimal amounts can leave behind (e.g. -0.0000000000004)
    // without changing anything meaningful — amounts throughout this
    // feature are always whole-cent to begin with (see
    // splitAmountEqually above).
    net: Math.round((entry.paid - entry.owed) * 100) / 100,
  }))
}

// A plain-English settle-up summary for DISPLAY ONLY — this never
// moves or records money (see the product brief: "do not implement
// payment transfers or settlement actions"), it's purely a readable
// restatement of the balances above. Standard greedy debt
// simplification: repeatedly matches whoever owes the most against
// whoever is owed the most until everyone's settled — the minimal
// number of "who pays whom" lines that would fully resolve the group,
// even though with 3+ people it can name a pair who never actually
// shared an expense together (still mathematically correct: the group
// as a whole still ends up settled).
export function summarizeSettlements(balances) {
  const round2 = (value) => Math.round(value * 100) / 100

  const creditors = balances
    .filter((b) => b.net > 0.004)
    .map((b) => ({ displayName: b.displayName, remaining: b.net }))
    .sort((a, b) => b.remaining - a.remaining)
  const debtors = balances
    .filter((b) => b.net < -0.004)
    .map((b) => ({ displayName: b.displayName, remaining: -b.net }))
    .sort((a, b) => b.remaining - a.remaining)

  const settlements = []
  let ci = 0
  let di = 0
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]
    const debtor = debtors[di]
    const amount = round2(Math.min(creditor.remaining, debtor.remaining))

    if (amount > 0) {
      settlements.push({
        from: debtor.displayName || 'Someone',
        to: creditor.displayName || 'someone',
        amount,
      })
    }

    creditor.remaining = round2(creditor.remaining - amount)
    debtor.remaining = round2(debtor.remaining - amount)
    if (creditor.remaining <= 0.004) ci += 1
    if (debtor.remaining <= 0.004) di += 1
  }

  return settlements
}
