import type { AppState, FinancialRisk, PlanningSnapshot, Project } from '../types'

export const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(value) ? value : 0)

export const percent = (value: number) =>
  `${Math.round((Number.isFinite(value) ? value : 0) * 100)}%`

export const monthKey = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export const readableMonth = (competenceMonth: string) => {
  const [year, month] = competenceMonth.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1))
}

export const formatShortDate = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(year, month - 1, day))
}

export const monthsUntil = (deadline?: string) => {
  if (!deadline) return 12
  const now = new Date()
  const target = new Date(`${deadline}T12:00:00`)
  const raw =
    (target.getFullYear() - now.getFullYear()) * 12 +
    (target.getMonth() - now.getMonth()) +
    (target.getDate() >= now.getDate() ? 1 : 0)
  return Math.max(raw, 1)
}

export const monthlyGoal = (project?: Project) => {
  if (!project) return 0
  const missing = Math.max(project.targetAmount - project.reservedAmount - project.spentAmount, 0)
  return missing / monthsUntil(project.deadline)
}

export const riskLabel = (snapshot: Pick<PlanningSnapshot, 'incomeGap' | 'realSurplus' | 'cardIncomeRate'>): FinancialRisk => {
  if (snapshot.incomeGap <= 0 && snapshot.realSurplus > 300 && snapshot.cardIncomeRate < 0.25) return 'seguro'
  if (snapshot.incomeGap <= 600 && snapshot.cardIncomeRate < 0.35) return 'atencao'
  if (snapshot.incomeGap <= 1800 && snapshot.cardIncomeRate < 0.55) return 'arriscado'
  return 'critico'
}

const scoreClamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

export function calculatePlanning(state: AppState, selectedMonth = monthKey()): PlanningSnapshot {
  const monthTransactions = state.transactions.filter(
    (transaction) => transaction.competenceMonth === selectedMonth && transaction.status === 'confirmed',
  )

  const categoriesById = new Map(state.categories.map((category) => [category.id, category]))
  const projectByType = new Map(state.projects.map((project) => [project.type, project]))
  const goalAccountIds = new Set(state.accounts.filter((account) => account.isGoalAccount).map((account) => account.id))

  const currentIncome =
    monthTransactions
      .filter((transaction) => transaction.type === 'ganho' || transaction.type === 'reembolso')
      .reduce((sum, transaction) => sum + transaction.amount, 0) ||
    state.incomeSources
      .filter((income) => income.status === 'recebida')
      .reduce((sum, income) => sum + income.receivedAmount, 0)

  const expectedIncome = state.incomeSources.reduce((sum, income) => sum + income.expectedAmount, 0)

  const expenseTypes = new Set(['despesa', 'compra_planejada', 'pagamento_cartao', 'pagamento_parcela'])
  const totalExpenses = monthTransactions
    .filter((transaction) => expenseTypes.has(transaction.type))
    .reduce((sum, transaction) => sum + transaction.amount, 0)

  const essentialCost = monthTransactions
    .filter((transaction) => {
      const category = transaction.categoryId ? categoriesById.get(transaction.categoryId) : undefined
      return expenseTypes.has(transaction.type) && category?.isEssential
    })
    .reduce((sum, transaction) => sum + transaction.amount, 0)

  const historicalEssential = state.transactions
    .filter((transaction) => expenseTypes.has(transaction.type))
    .filter((transaction) => {
      const category = transaction.categoryId ? categoriesById.get(transaction.categoryId) : undefined
      return category?.isEssential
    })
    .reduce((sum, transaction) => sum + transaction.amount, 0)

  const monthsWithHistory = new Set(state.transactions.map((transaction) => transaction.competenceMonth)).size || 1
  const reserveProject = projectByType.get('reserva_emergencia')
  const babyProject = projectByType.get('bebe')
  const homeProject = projectByType.get('casa')
  const carProject = projectByType.get('carro')
  const essentialBase = Math.max(
    essentialCost,
    historicalEssential / monthsWithHistory,
    reserveProject?.currentEssentialCost || 0,
    reserveProject?.futureEssentialCost || 0,
  )

  const emergencyMinimum = essentialBase * 3
  const emergencyComfortable = essentialBase * 6
  const emergencyIdeal = essentialBase * 12
  const emergencyNeeded = essentialBase * state.settings.emergencyMonths
  const monthlyReserveGoal = reserveProject
    ? Math.max(emergencyNeeded - reserveProject.reservedAmount, 0) / monthsUntil(reserveProject.deadline)
    : 0
  const monthlyBabyGoal = monthlyGoal(babyProject)
  const monthlyHomeGoal = monthlyGoal(homeProject)
  const monthlyCarGoal = carProject?.isMandatory ? monthlyGoal(carProject) : 0
  const carMonthlyCost =
    carProject && (carProject.isMandatory || carProject.status === 'active')
      ? (carProject.carInstallment || 0) +
        (carProject.carFuel || 0) +
        (carProject.carMaintenance || 0) +
        (carProject.carInsurance || 0) -
        (carProject.carUberIncome || 0)
      : 0
  const homeFutureCost = homeProject && (homeProject.deadline || homeProject.status === 'active') ? homeProject.futureMonthlyCost || 0 : 0

  const mandatoryMonthlyGoals = monthlyReserveGoal + monthlyBabyGoal + monthlyHomeGoal + monthlyCarGoal
  const safetyMargin = essentialBase * state.settings.safetyMarginRate
  const cardImpact = state.cardPurchases
    .filter((purchase) => purchase.purchaseDate.slice(0, 7) <= selectedMonth)
    .reduce((sum, purchase) => sum + purchase.amount / Math.max(purchase.installments, 1), 0)
  const cardIncomeRate = currentIncome > 0 ? cardImpact / currentIncome : 0
  const scenarioFutureCost = state.scenarios
    .filter((scenario) => scenario.type === 'alugar_casa' || scenario.type === 'morar_junto')
    .reduce((sum, scenario) => sum + scenario.monthlyExpense, 0)
  const futureCost = homeFutureCost + Math.max(carMonthlyCost, 0) + scenarioFutureCost

  const necessaryIncome = essentialBase + futureCost + mandatoryMonthlyGoals + cardImpact + safetyMargin
  const incomeGap = necessaryIncome - currentIncome

  const reservedBalance = state.accounts
    .filter((account) => goalAccountIds.has(account.id))
    .reduce((sum, account) => sum + account.currentBalance, 0)
  const freeBalance = state.accounts
    .filter((account) => !goalAccountIds.has(account.id) && account.type !== 'cartao_credito')
    .reduce((sum, account) => sum + account.currentBalance, 0)

  const realSurplus = currentIncome - essentialBase - futureCost - mandatoryMonthlyGoals - cardImpact - safetyMargin

  const reviewsForMonth = state.dayReviews.filter((review) => review.competenceMonth === selectedMonth)
  const missingReviewDays = reviewsForMonth
    .filter((review) => review.status === 'pending')
    .map((review) => review.date)

  const monthStatus =
    reviewsForMonth.length > 0 && missingReviewDays.length === 0
      ? 'fechado'
      : reviewsForMonth.length > 0
        ? 'incompleto'
        : 'em_andamento'

  const controlScore = monthStatus === 'fechado' ? 20 : monthStatus === 'incompleto' ? 10 : 14
  const reserveScore = reserveProject
    ? Math.min((reserveProject.reservedAmount / Math.max(emergencyMinimum, 1)) * 20, 20)
    : 0
  const babyScore = babyProject ? Math.min((babyProject.reservedAmount / Math.max(babyProject.targetAmount * 0.25, 1)) * 15, 15) : 0
  const homeScore = homeProject ? Math.min((homeProject.reservedAmount / Math.max(homeProject.targetAmount * 0.25, 1)) * 15, 15) : 0
  const cardScore = cardIncomeRate <= 0.25 ? 10 : cardIncomeRate <= 0.4 ? 5 : 0
  const incomeScore = incomeGap <= 0 ? 10 : incomeGap <= currentIncome * 0.5 ? 5 : 1
  const monthCloseScore = monthStatus === 'fechado' ? 5 : 1
  const surplusScore = realSurplus > 0 ? 5 : 0
  const score = scoreClamp(controlScore + reserveScore + babyScore + homeScore + cardScore + incomeScore + monthCloseScore + surplusScore)

  const risk = riskLabel({ incomeGap, realSurplus, cardIncomeRate })

  return {
    currentMonth: selectedMonth,
    currentIncome,
    expectedIncome,
    necessaryIncome,
    incomeGap,
    totalExpenses,
    essentialCost: essentialBase,
    futureCost,
    mandatoryMonthlyGoals,
    monthlyReserveGoal,
    monthlyBabyGoal,
    monthlyHomeGoal,
    monthlyCarGoal,
    cardImpact,
    cardIncomeRate,
    freeBalance,
    reservedBalance,
    realSurplus,
    emergencyNeeded,
    emergencyMinimum,
    emergencyComfortable,
    emergencyIdeal,
    score,
    risk,
    missingReviewDays,
    monthStatus,
  }
}
