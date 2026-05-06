import type { Account, AppState, Category, ClassificationRule, FinancialMonth, Project } from './types'

export const todayIso = () => {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const makeId = (prefix?: string) => {
  void prefix
  return crypto.randomUUID()
}

export const competenceFromDate = (date: string) => date.slice(0, 7)

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const sameName = <T extends { name: string }>(items: T[], name: string) =>
  items.find((item) => normalize(item.name) === normalize(name))

export const emptyState: AppState = {
  profile: {
    name: '',
    partnerName: '',
    familyName: '',
    babyExpectedDate: '',
  },
  familyMembers: [],
  accounts: [],
  categories: [],
  transactions: [],
  financialMonths: [],
  incomeSources: [],
  projects: [],
  plannedItems: [],
  creditCards: [],
  cardPurchases: [],
  dayReviews: [],
  classificationRules: [],
  aiInsights: [],
  scenarios: [],
  settings: {
    emergencyMonths: 3,
    safetyMarginRate: 0.12,
    desiredMonthlyIncome: 0,
    deepSeekModel: import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-chat',
  },
  onboardingComplete: false,
}

export function createDefaultCategories(): Category[] {
  return [
    { id: makeId(), name: 'Renda', type: 'ganho', isEssential: false },
    { id: makeId(), name: 'Alimentação', type: 'despesa', isEssential: true },
    { id: makeId(), name: 'Transporte', type: 'despesa', isEssential: true },
    { id: makeId(), name: 'Combustível', type: 'despesa', isEssential: true },
    { id: makeId(), name: 'Saúde', type: 'despesa', isEssential: true },
    { id: makeId(), name: 'Farmácia', type: 'despesa', isEssential: true },
    { id: makeId(), name: 'Casa', type: 'despesa', isEssential: true },
    { id: makeId(), name: 'Bebê', type: 'despesa', isEssential: true },
    { id: makeId(), name: 'Cartão', type: 'despesa', isEssential: true },
    { id: makeId(), name: 'Dívidas', type: 'despesa', isEssential: true },
    { id: makeId(), name: 'Lazer', type: 'despesa', isEssential: false },
    { id: makeId(), name: 'Trabalho', type: 'despesa', isEssential: true },
    { id: makeId(), name: 'Família', type: 'despesa', isEssential: true },
    { id: makeId(), name: 'Educação', type: 'despesa', isEssential: false },
    { id: makeId(), name: 'Outros', type: 'ambos', isEssential: false },
  ]
}

export function createDefaultProjects(): Project[] {
  return [
    {
      id: makeId(),
      name: 'Reserva de emergência',
      type: 'reserva_emergencia',
      targetAmount: 0,
      reservedAmount: 0,
      spentAmount: 0,
      priority: 1,
      status: 'active',
      isMandatory: true,
      weight: 25,
    },
    {
      id: makeId(),
      name: 'Bebê / enxoval',
      type: 'bebe',
      targetAmount: 0,
      reservedAmount: 0,
      spentAmount: 0,
      priority: 2,
      status: 'active',
      isMandatory: true,
      weight: 35,
    },
    {
      id: makeId(),
      name: 'Casa / morar junto',
      type: 'casa',
      targetAmount: 0,
      reservedAmount: 0,
      spentAmount: 0,
      priority: 3,
      status: 'active',
      isMandatory: true,
      weight: 35,
    },
    {
      id: makeId(),
      name: 'Carro',
      type: 'carro',
      targetAmount: 0,
      reservedAmount: 0,
      spentAmount: 0,
      priority: 4,
      status: 'active',
      isMandatory: false,
      weight: 5,
    },
    {
      id: makeId(),
      name: 'Investimentos',
      type: 'investimento',
      targetAmount: 0,
      reservedAmount: 0,
      spentAmount: 0,
      priority: 5,
      status: 'active',
      isMandatory: false,
      weight: 0,
    },
  ]
}

function createBaseAccounts(projects: Project[]): Account[] {
  const projectId = (type: Project['type']) => projects.find((project) => project.type === type)?.id

  return [
    {
      id: makeId(),
      name: 'Conta principal',
      type: 'corrente',
      initialBalance: 0,
      currentBalance: 0,
      isGoalAccount: false,
      active: true,
    },
    {
      id: makeId(),
      name: 'Dinheiro físico',
      type: 'dinheiro',
      initialBalance: 0,
      currentBalance: 0,
      isGoalAccount: false,
      active: true,
    },
    {
      id: makeId(),
      name: 'Conta Bebê',
      type: 'caixinha',
      initialBalance: 0,
      currentBalance: 0,
      isGoalAccount: true,
      goalId: projectId('bebe'),
      active: true,
    },
    {
      id: makeId(),
      name: 'Conta Casa',
      type: 'caixinha',
      initialBalance: 0,
      currentBalance: 0,
      isGoalAccount: true,
      goalId: projectId('casa'),
      active: true,
    },
    {
      id: makeId(),
      name: 'Conta Reserva',
      type: 'poupanca',
      initialBalance: 0,
      currentBalance: 0,
      isGoalAccount: true,
      goalId: projectId('reserva_emergencia'),
      active: true,
    },
    {
      id: makeId(),
      name: 'Conta Carro',
      type: 'caixinha',
      initialBalance: 0,
      currentBalance: 0,
      isGoalAccount: true,
      goalId: projectId('carro'),
      active: true,
    },
    {
      id: makeId(),
      name: 'Investimentos',
      type: 'investimento',
      initialBalance: 0,
      currentBalance: 0,
      isGoalAccount: true,
      goalId: projectId('investimento'),
      active: true,
    },
  ]
}

export function createDefaultRules(categories: Category[]): ClassificationRule[] {
  const categoryId = (name: string) => categories.find((category) => normalize(category.name) === normalize(name))?.id

  return [
    { id: makeId(), keyword: 'POSTO', categoryId: categoryId('Combustível'), type: 'despesa' },
    { id: makeId(), keyword: 'SHELL', categoryId: categoryId('Combustível'), type: 'despesa' },
    { id: makeId(), keyword: 'UBER', categoryId: categoryId('Transporte'), type: 'despesa' },
    { id: makeId(), keyword: 'IFOOD', categoryId: categoryId('Alimentação'), type: 'despesa' },
    { id: makeId(), keyword: 'FARMÁCIA', categoryId: categoryId('Farmácia'), type: 'despesa' },
    { id: makeId(), keyword: 'DROGARIA', categoryId: categoryId('Farmácia'), type: 'despesa' },
    { id: makeId(), keyword: 'ESTÁGIO', categoryId: categoryId('Renda'), type: 'ganho' },
    { id: makeId(), keyword: 'BOLSA', categoryId: categoryId('Renda'), type: 'ganho' },
    { id: makeId(), keyword: 'PIX RECEBIDO', categoryId: categoryId('Renda'), type: 'ganho' },
  ]
}

export function createInitialUserState(email?: string): AppState {
  const categories = createDefaultCategories()
  const projects = createDefaultProjects()

  return ensureBaseState({
    ...emptyState,
    profile: {
      ...emptyState.profile,
      name: email?.split('@')[0] || '',
      familyName: '',
    },
    categories,
    projects,
    accounts: createBaseAccounts(projects),
    classificationRules: createDefaultRules(categories),
  })
}

export function ensureMonthReviews(state: AppState, competenceMonth: string): AppState {
  if (!competenceMonth || !/^\d{4}-\d{2}$/.test(competenceMonth)) return state

  const [year, month] = competenceMonth.split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate()
  const existing = new Set(state.dayReviews.map((review) => review.date))
  const reviews = [...state.dayReviews]

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (!existing.has(date)) {
      reviews.push({
        id: makeId(),
        date,
        competenceMonth,
        status: 'pending',
      })
    }
  }

  return { ...state, dayReviews: reviews.sort((a, b) => a.date.localeCompare(b.date)) }
}

export function recalculateFinancialMonths(state: AppState): AppState {
  const months = new Set<string>([
    ...state.dayReviews.map((review) => review.competenceMonth),
    ...state.transactions.map((transaction) => transaction.competenceMonth),
    ...(state.financialMonths || []).map((item) => item.month),
  ])
  const now = `${todayIso()}T00:00:00.000`

  const financialMonths: FinancialMonth[] = Array.from(months)
    .filter(Boolean)
    .sort()
    .map((month) => {
      const previous = state.financialMonths.find((item) => item.month === month)
      const reviews = state.dayReviews.filter((review) => review.competenceMonth === month)
      const transactions = state.transactions.filter(
        (transaction) => transaction.competenceMonth === month && transaction.status === 'confirmed',
      )
      const totalIncome = transactions
        .filter((transaction) => transaction.type === 'ganho' || transaction.type === 'reembolso')
        .reduce((sum, transaction) => sum + transaction.amount, 0)
      const totalExpense = transactions
        .filter((transaction) =>
          ['despesa', 'compra_planejada', 'pagamento_cartao', 'pagamento_parcela'].includes(transaction.type),
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0)
      const totalReserved = transactions
        .filter((transaction) => transaction.type === 'reserva_objetivo')
        .reduce((sum, transaction) => sum + transaction.amount, 0)
      const allReviewed =
        reviews.length > 0 && reviews.every((review) => review.status === 'reviewed' || review.status === 'no_movement')
      const status: FinancialMonth['status'] = allReviewed ? 'fechado' : reviews.length ? 'incompleto' : 'em_andamento'

      return {
        id: previous?.id || makeId(),
        month,
        status,
        totalIncome,
        totalExpense,
        totalReserved,
        balance: totalIncome - totalExpense,
        closedAt: status === 'fechado' ? previous?.closedAt || now : undefined,
        reopenedAt: previous?.status === 'fechado' && status !== 'fechado' ? now : previous?.reopenedAt,
        createdAt: previous?.createdAt || now,
        updatedAt: now,
      }
    })

  return { ...state, financialMonths }
}

export function ensureBaseState(state: AppState): AppState {
  let next: AppState = {
    ...emptyState,
    ...state,
    profile: { ...emptyState.profile, ...state.profile },
    settings: { ...emptyState.settings, ...state.settings },
    financialMonths: state.financialMonths || [],
  }

  if (!state.onboardingComplete && !state.transactions.length && next.profile.familyName === 'Família') {
    next = { ...next, profile: { ...next.profile, familyName: '' } }
  }

  const categories = [...next.categories]
  for (const category of createDefaultCategories()) {
    if (!sameName(categories, category.name)) categories.push(category)
  }

  const projects = [...next.projects]
  for (const project of createDefaultProjects()) {
    if (!projects.find((item) => item.type === project.type)) projects.push(project)
  }

  const accounts = [...next.accounts]
  for (const account of createBaseAccounts(projects)) {
    if (!sameName(accounts, account.name)) accounts.push(account)
  }

  const rules = [...next.classificationRules]
  for (const rule of createDefaultRules(categories)) {
    if (!rules.find((item) => normalize(item.keyword) === normalize(rule.keyword))) rules.push(rule)
  }

  next = {
    ...next,
    categories,
    projects,
    accounts,
    classificationRules: rules,
  }

  next = ensureMonthReviews(next, competenceFromDate(todayIso()))
  return recalculateFinancialMonths(next)
}
