import type { AppState, Category, ClassificationRule, Project } from './types'

export const todayIso = () => new Date().toISOString().slice(0, 10)

export const makeId = (prefix?: string) => {
  void prefix
  return crypto.randomUUID()
}

export const competenceFromDate = (date: string) => date.slice(0, 7)

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
    { id: makeId(), name: 'Lazer', type: 'despesa', isEssential: false },
    { id: makeId(), name: 'Cartão', type: 'despesa', isEssential: true },
    { id: makeId(), name: 'Dívidas', type: 'despesa', isEssential: true },
    { id: makeId(), name: 'Educação', type: 'despesa', isEssential: false },
    { id: makeId(), name: 'Trabalho', type: 'despesa', isEssential: true },
    { id: makeId(), name: 'Família', type: 'despesa', isEssential: true },
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

export function createDefaultRules(categories: Category[]): ClassificationRule[] {
  const categoryId = (name: string) => categories.find((category) => category.name === name)?.id

  return [
    { id: makeId(), keyword: 'POSTO', categoryId: categoryId('Combustível'), type: 'despesa' },
    { id: makeId(), keyword: 'SHELL', categoryId: categoryId('Combustível'), type: 'despesa' },
    { id: makeId(), keyword: 'UBER', categoryId: categoryId('Transporte'), type: 'despesa' },
    { id: makeId(), keyword: 'IFOOD', categoryId: categoryId('Alimentação'), type: 'despesa' },
    { id: makeId(), keyword: 'FARMÁCIA', categoryId: categoryId('Farmácia'), type: 'despesa' },
    { id: makeId(), keyword: 'DROGARIA', categoryId: categoryId('Farmácia'), type: 'despesa' },
    { id: makeId(), keyword: 'ESTÁGIO', categoryId: categoryId('Renda'), type: 'ganho' },
  ]
}

export function createInitialUserState(email?: string): AppState {
  const categories = createDefaultCategories()
  const projects = createDefaultProjects()

  return {
    ...emptyState,
    profile: {
      ...emptyState.profile,
      name: email?.split('@')[0] || '',
      familyName: 'Família',
    },
    categories,
    projects,
    classificationRules: createDefaultRules(categories),
  }
}
