import Dexie, { type EntityTable } from 'dexie'
import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import type {
  Account,
  AiInsight,
  AppSettings,
  AppState,
  CardPurchase,
  Category,
  ClassificationRule,
  CreditCard,
  DayReview,
  FamilyMember,
  FinancialMonth,
  IncomeSource,
  PlannedItem,
  Project,
  Scenario,
  Transaction,
} from '../types'

interface SnapshotRecord {
  id: string
  state: AppState
  updatedAt: string
}

class FinanceDatabase extends Dexie {
  snapshots!: EntityTable<SnapshotRecord, 'id'>

  constructor() {
    super('analista_financeiro_familiar')
    this.version(1).stores({
      snapshots: 'id, updatedAt',
    })
  }
}

export const financeDb = new FinanceDatabase()

export async function loadLocalState() {
  const record = await financeDb.snapshots.get('current')
  return record?.state
}

export async function saveLocalState(state: AppState) {
  await financeDb.snapshots.put({
    id: 'current',
    state,
    updatedAt: new Date().toISOString(),
  })
}

export const supabase =
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
    ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
    : null

export const hasDeepSeekConfig = Boolean(supabase || import.meta.env.VITE_AI_FUNCTION_URL)

const asNumber = (value: unknown) => Number(value ?? 0)
const asString = (value: unknown) => String(value ?? '')
const nullable = <T,>(value: T | undefined) => value ?? null
type DbRow = Record<string, unknown>

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado')
  return supabase
}

export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user
}

export async function loadRemoteState(user: User): Promise<AppState | null> {
  const client = requireSupabase()
  const userId = user.id

  const [
    profile,
    familyMembers,
    accounts,
    categories,
    transactions,
    financialMonths,
    incomeSources,
    projects,
    plannedItems,
    creditCards,
    cardPurchases,
    dayReviews,
    classificationRules,
    aiInsights,
    scenarios,
    settings,
  ] = await Promise.all([
    client.from('profiles').select('*').eq('id', userId).maybeSingle(),
    client.from('family_members').select('*').eq('user_id', userId).order('created_at'),
    client.from('accounts').select('*').eq('user_id', userId).order('created_at'),
    client.from('categories').select('*').eq('user_id', userId).order('created_at'),
    client.from('transactions').select('*').eq('user_id', userId).order('transaction_date', { ascending: false }),
    client.from('financial_months').select('*').eq('user_id', userId).order('month'),
    client.from('income_sources').select('*').eq('user_id', userId).order('created_at'),
    client.from('projects').select('*').eq('user_id', userId).order('priority'),
    client.from('planned_items').select('*').eq('user_id', userId).order('created_at'),
    client.from('credit_cards').select('*').eq('user_id', userId).order('created_at'),
    client.from('card_purchases').select('*').eq('user_id', userId).order('purchase_date', { ascending: false }),
    client.from('day_reviews').select('*').eq('user_id', userId).order('date'),
    client.from('classification_rules').select('*').eq('user_id', userId).order('created_at'),
    client.from('ai_insights').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    client.from('scenarios').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    client.from('app_settings').select('*').eq('user_id', userId).maybeSingle(),
  ])

  if (profile.error) throw profile.error
  if (!profile.data) return null

  const errors = [
    familyMembers.error,
    accounts.error,
    categories.error,
    transactions.error,
    financialMonths.error,
    incomeSources.error,
    projects.error,
    plannedItems.error,
    creditCards.error,
    cardPurchases.error,
    dayReviews.error,
    classificationRules.error,
    aiInsights.error,
    scenarios.error,
    settings.error,
  ].filter(Boolean)

  if (errors[0]) throw errors[0]

  return {
    profile: {
      name: profile.data.name || '',
      partnerName: profile.data.partner_name || '',
      familyName: profile.data.family_name || '',
      babyExpectedDate: profile.data.baby_expected_date || '',
    },
    familyMembers: (familyMembers.data || []).map(fromFamilyMember),
    accounts: (accounts.data || []).map(fromAccount),
    categories: (categories.data || []).map(fromCategory),
    transactions: (transactions.data || []).map(fromTransaction),
    financialMonths: (financialMonths.data || []).map(fromFinancialMonth),
    incomeSources: (incomeSources.data || []).map(fromIncomeSource),
    projects: (projects.data || []).map(fromProject),
    plannedItems: (plannedItems.data || []).map(fromPlannedItem),
    creditCards: (creditCards.data || []).map(fromCreditCard),
    cardPurchases: (cardPurchases.data || []).map(fromCardPurchase),
    dayReviews: (dayReviews.data || []).map(fromDayReview),
    classificationRules: (classificationRules.data || []).map(fromClassificationRule),
    aiInsights: (aiInsights.data || []).map(fromAiInsight),
    scenarios: (scenarios.data || []).map(fromScenario),
    settings: settings.data ? fromSettings(settings.data) : defaultSettings(),
    onboardingComplete: Boolean(profile.data.onboarding_complete),
  }
}

export async function saveRemoteState(userId: string, state: AppState) {
  const client = requireSupabase()

  const { error: profileError } = await client.from('profiles').upsert({
    id: userId,
    name: state.profile.name,
    partner_name: state.profile.partnerName,
    family_name: state.profile.familyName,
    baby_expected_date: state.profile.babyExpectedDate || null,
    onboarding_complete: state.onboardingComplete,
    updated_at: new Date().toISOString(),
  })
  if (profileError) throw profileError

  const { error: settingsError } = await client.from('app_settings').upsert(toSettingsRow(userId, state.settings))
  if (settingsError) throw settingsError

  await upsertRows('categories', state.categories.map((item) => toCategoryRow(userId, item)))
  await upsertRows('projects', state.projects.map((item) => toProjectRow(userId, item)))
  await upsertRows('accounts', state.accounts.map((item) => toAccountRow(userId, item)))
  await upsertRows('family_members', state.familyMembers.map((item) => toFamilyMemberRow(userId, item)))
  await upsertRows('income_sources', state.incomeSources.map((item) => toIncomeSourceRow(userId, item)))
  await upsertRows('classification_rules', state.classificationRules.map((item) => toClassificationRuleRow(userId, item)))
  await upsertRows('day_reviews', state.dayReviews.map((item) => toDayReviewRow(userId, item)))
  await upsertRows('financial_months', state.financialMonths.map((item) => toFinancialMonthRow(userId, item)))
  await upsertRows('credit_cards', state.creditCards.map((item) => toCreditCardRow(userId, item)))
  await upsertRows('transactions', state.transactions.map((item) => toTransactionRow(userId, item)))
  await upsertRows('planned_items', state.plannedItems.map((item) => toPlannedItemRow(userId, item)))
  await upsertRows('card_purchases', state.cardPurchases.map((item) => toCardPurchaseRow(userId, item)))
  await upsertRows('ai_insights', state.aiInsights.map((item) => toAiInsightRow(userId, item)))
  await upsertRows('scenarios', state.scenarios.map((item) => toScenarioRow(userId, item)))
}

async function upsertRows(table: string, rows: unknown[]) {
  if (!rows.length) return
  const { error } = await requireSupabase().from(table).upsert(rows)
  if (error) throw error
}

function defaultSettings(): AppSettings {
  return {
    emergencyMonths: 3,
    safetyMarginRate: 0.12,
    desiredMonthlyIncome: 0,
    deepSeekModel: import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-chat',
  }
}

const fromFamilyMember = (row: DbRow): FamilyMember => ({
  id: asString(row.id),
  name: asString(row.name),
  role: asString(row.role) as FamilyMember['role'],
  incomeParticipant: Boolean(row.income_participant),
})

const fromAccount = (row: DbRow): Account => ({
  id: asString(row.id),
  name: asString(row.name),
  type: asString(row.type) as Account['type'],
  initialBalance: asNumber(row.initial_balance),
  currentBalance: asNumber(row.current_balance),
  isGoalAccount: Boolean(row.is_goal_account),
  goalId: row.goal_id ? asString(row.goal_id) : undefined,
  active: Boolean(row.active),
})

const fromCategory = (row: DbRow): Category => ({
  id: asString(row.id),
  name: asString(row.name),
  type: row.type ? (asString(row.type) as Category['type']) : undefined,
  isEssential: Boolean(row.is_essential),
})

const fromTransaction = (row: DbRow): Transaction => ({
  id: asString(row.id),
  transactionDate: asString(row.transaction_date),
  competenceMonth: asString(row.competence_month),
  type: asString(row.type) as Transaction['type'],
  amount: asNumber(row.amount),
  description: asString(row.description),
  categoryId: row.category_id ? asString(row.category_id) : undefined,
  projectId: row.project_id ? asString(row.project_id) : undefined,
  accountId: row.account_id ? asString(row.account_id) : undefined,
  destinationAccountId: row.destination_account_id ? asString(row.destination_account_id) : undefined,
  paymentMethod: row.payment_method ? asString(row.payment_method) : undefined,
  status: asString(row.status) as Transaction['status'],
  source: asString(row.source) as Transaction['source'],
  aiConfidence: row.ai_confidence == null ? undefined : asNumber(row.ai_confidence),
  rawText: row.raw_text ? asString(row.raw_text) : undefined,
  notes: row.notes ? asString(row.notes) : undefined,
  syncStatus: 'sincronizado',
  createdAt: row.created_at ? asString(row.created_at) : undefined,
  updatedAt: row.updated_at ? asString(row.updated_at) : undefined,
  deletedAt: row.deleted_at ? asString(row.deleted_at) : undefined,
})

const fromFinancialMonth = (row: DbRow): FinancialMonth => ({
  id: asString(row.id),
  month: asString(row.month),
  status: asString(row.status) as FinancialMonth['status'],
  totalIncome: asNumber(row.total_income),
  totalExpense: asNumber(row.total_expense),
  totalReserved: asNumber(row.total_reserved),
  balance: asNumber(row.balance),
  closedAt: row.closed_at ? asString(row.closed_at) : undefined,
  reopenedAt: row.reopened_at ? asString(row.reopened_at) : undefined,
  createdAt: asString(row.created_at),
  updatedAt: asString(row.updated_at),
})

const fromIncomeSource = (row: DbRow): IncomeSource => ({
  id: asString(row.id),
  name: asString(row.name),
  person: asString(row.person),
  kind: asString(row.kind) as IncomeSource['kind'],
  expectedAmount: asNumber(row.expected_amount),
  receivedAmount: asNumber(row.received_amount),
  expectedDate: row.expected_date ? asString(row.expected_date) : undefined,
  receivedDate: row.received_date ? asString(row.received_date) : undefined,
  recurrence: asString(row.recurrence) as IncomeSource['recurrence'],
  status: asString(row.status) as IncomeSource['status'],
})

const fromProject = (row: DbRow): Project => ({
  id: asString(row.id),
  name: asString(row.name),
  type: asString(row.type) as Project['type'],
  targetAmount: asNumber(row.target_amount),
  reservedAmount: asNumber(row.reserved_amount),
  spentAmount: asNumber(row.spent_amount),
  deadline: row.deadline ? asString(row.deadline) : undefined,
  priority: asNumber(row.priority),
  status: asString(row.status) as Project['status'],
  isMandatory: Boolean(row.is_mandatory),
  weight: asNumber(row.weight),
  linkedAccountId: row.linked_account_id ? asString(row.linked_account_id) : undefined,
  initialCost: asNumber(row.initial_cost),
  futureMonthlyCost: asNumber(row.future_monthly_cost),
  currentEssentialCost: asNumber(row.current_essential_cost),
  futureEssentialCost: asNumber(row.future_essential_cost),
  carDownPayment: asNumber(row.car_down_payment),
  carInstallment: asNumber(row.car_installment),
  carFuel: asNumber(row.car_fuel),
  carMaintenance: asNumber(row.car_maintenance),
  carInsurance: asNumber(row.car_insurance),
  carUberIncome: asNumber(row.car_uber_income),
})

const fromPlannedItem = (row: DbRow): PlannedItem => ({
  id: asString(row.id),
  projectId: asString(row.project_id),
  name: asString(row.name),
  category: asString(row.category),
  estimatedAmount: asNumber(row.estimated_amount),
  realAmount: asNumber(row.real_amount),
  priority: asString(row.priority) as PlannedItem['priority'],
  status: asString(row.status) as PlannedItem['status'],
  deadline: row.deadline ? asString(row.deadline) : undefined,
  purchasedAt: row.purchased_at ? asString(row.purchased_at) : undefined,
  accountId: row.account_id ? asString(row.account_id) : undefined,
  notes: row.notes ? asString(row.notes) : undefined,
  referenceUrl: row.reference_url ? asString(row.reference_url) : undefined,
})

const fromCreditCard = (row: DbRow): CreditCard => ({
  id: asString(row.id),
  name: asString(row.name),
  limitAmount: asNumber(row.limit_amount),
  closingDay: asNumber(row.closing_day),
  dueDay: asNumber(row.due_day),
  accountId: row.account_id ? asString(row.account_id) : undefined,
  active: Boolean(row.active),
})

const fromCardPurchase = (row: DbRow): CardPurchase => ({
  id: asString(row.id),
  cardId: asString(row.card_id),
  purchaseDate: asString(row.purchase_date),
  description: asString(row.description),
  amount: asNumber(row.amount),
  installments: asNumber(row.installments),
  currentInstallment: asNumber(row.current_installment),
  categoryId: row.category_id ? asString(row.category_id) : undefined,
  projectId: row.project_id ? asString(row.project_id) : undefined,
})

const fromDayReview = (row: DbRow): DayReview => ({
  id: asString(row.id),
  date: asString(row.date),
  competenceMonth: asString(row.competence_month),
  status: asString(row.status) as DayReview['status'],
  reviewedAt: row.reviewed_at ? asString(row.reviewed_at) : undefined,
  notes: row.notes ? asString(row.notes) : undefined,
})

const fromClassificationRule = (row: DbRow): ClassificationRule => ({
  id: asString(row.id),
  keyword: asString(row.keyword),
  categoryId: row.category_id ? asString(row.category_id) : undefined,
  projectId: row.project_id ? asString(row.project_id) : undefined,
  type: row.type ? (asString(row.type) as ClassificationRule['type']) : undefined,
  accountId: row.account_id ? asString(row.account_id) : undefined,
})

const fromAiInsight = (row: DbRow): AiInsight => ({
  id: asString(row.id),
  type: asString(row.type) as AiInsight['type'],
  title: asString(row.title),
  content: asString(row.content),
  severity: asString(row.severity) as AiInsight['severity'],
  relatedProjectId: row.related_project_id ? asString(row.related_project_id) : undefined,
  relatedMonth: row.related_month ? asString(row.related_month) : undefined,
  readAt: row.read_at ? asString(row.read_at) : undefined,
})

const fromScenario = (row: DbRow): Scenario => ({
  id: asString(row.id),
  name: asString(row.name),
  type: asString(row.type) as Scenario['type'],
  monthlyIncome: asNumber(row.monthly_income),
  monthlyExpense: asNumber(row.monthly_expense),
  initialCost: asNumber(row.initial_cost),
  newObligationAmount: asNumber(row.new_obligation_amount),
  notes: row.notes ? asString(row.notes) : undefined,
})

const fromSettings = (row: DbRow): AppSettings => ({
  emergencyMonths: asNumber(row.emergency_months),
  safetyMarginRate: asNumber(row.safety_margin_rate),
  desiredMonthlyIncome: asNumber(row.desired_monthly_income),
  deepSeekModel: row.deepseek_model ? asString(row.deepseek_model) : 'deepseek-chat',
})

const toFamilyMemberRow = (userId: string, item: FamilyMember) => ({
  id: item.id,
  user_id: userId,
  name: item.name,
  role: item.role,
  income_participant: item.incomeParticipant,
})

const toAccountRow = (userId: string, item: Account) => ({
  id: item.id,
  user_id: userId,
  name: item.name,
  type: item.type,
  initial_balance: item.initialBalance,
  current_balance: item.currentBalance,
  is_goal_account: item.isGoalAccount,
  goal_id: nullable(item.goalId),
  active: item.active,
})

const toCategoryRow = (userId: string, item: Category) => ({
  id: item.id,
  user_id: userId,
  name: item.name,
  type: nullable(item.type),
  is_essential: item.isEssential,
})

const toTransactionRow = (userId: string, item: Transaction) => ({
  id: item.id,
  user_id: userId,
  transaction_date: item.transactionDate,
  competence_month: item.competenceMonth,
  type: item.type,
  amount: item.amount,
  description: item.description,
  category_id: nullable(item.categoryId),
  project_id: nullable(item.projectId),
  account_id: nullable(item.accountId),
  destination_account_id: nullable(item.destinationAccountId),
  payment_method: nullable(item.paymentMethod),
  status: item.status,
  source: item.source,
  ai_confidence: nullable(item.aiConfidence),
  raw_text: nullable(item.rawText),
  notes: nullable(item.notes),
  sync_status: 'sincronizado',
  created_at: item.createdAt || new Date().toISOString(),
  updated_at: item.updatedAt || new Date().toISOString(),
  deleted_at: nullable(item.deletedAt),
})

const toFinancialMonthRow = (userId: string, item: FinancialMonth) => ({
  id: item.id,
  user_id: userId,
  month: item.month,
  year: Number(item.month.slice(0, 4)),
  status: item.status,
  total_income: item.totalIncome,
  total_expense: item.totalExpense,
  total_reserved: item.totalReserved,
  balance: item.balance,
  closed_at: nullable(item.closedAt),
  reopened_at: nullable(item.reopenedAt),
  created_at: item.createdAt,
  updated_at: item.updatedAt,
})

const toIncomeSourceRow = (userId: string, item: IncomeSource) => ({
  id: item.id,
  user_id: userId,
  name: item.name,
  person: item.person,
  kind: item.kind,
  expected_amount: item.expectedAmount,
  received_amount: item.receivedAmount,
  expected_date: nullable(item.expectedDate),
  received_date: nullable(item.receivedDate),
  recurrence: item.recurrence,
  status: item.status,
})

const toProjectRow = (userId: string, item: Project) => ({
  id: item.id,
  user_id: userId,
  name: item.name,
  type: item.type,
  target_amount: item.targetAmount,
  reserved_amount: item.reservedAmount,
  spent_amount: item.spentAmount,
  deadline: nullable(item.deadline),
  priority: item.priority,
  status: item.status,
  is_mandatory: item.isMandatory,
  weight: item.weight,
  linked_account_id: nullable(item.linkedAccountId),
  initial_cost: item.initialCost || 0,
  future_monthly_cost: item.futureMonthlyCost || 0,
  current_essential_cost: item.currentEssentialCost || 0,
  future_essential_cost: item.futureEssentialCost || 0,
  car_down_payment: item.carDownPayment || 0,
  car_installment: item.carInstallment || 0,
  car_fuel: item.carFuel || 0,
  car_maintenance: item.carMaintenance || 0,
  car_insurance: item.carInsurance || 0,
  car_uber_income: item.carUberIncome || 0,
})

const toPlannedItemRow = (userId: string, item: PlannedItem) => ({
  id: item.id,
  user_id: userId,
  project_id: item.projectId,
  name: item.name,
  category: item.category,
  estimated_amount: item.estimatedAmount,
  real_amount: item.realAmount,
  priority: item.priority,
  status: item.status,
  deadline: nullable(item.deadline),
  purchased_at: nullable(item.purchasedAt),
  account_id: nullable(item.accountId),
  notes: nullable(item.notes),
  reference_url: nullable(item.referenceUrl),
})

const toCreditCardRow = (userId: string, item: CreditCard) => ({
  id: item.id,
  user_id: userId,
  name: item.name,
  limit_amount: item.limitAmount,
  closing_day: item.closingDay,
  due_day: item.dueDay,
  account_id: nullable(item.accountId),
  active: item.active,
})

const toCardPurchaseRow = (userId: string, item: CardPurchase) => ({
  id: item.id,
  user_id: userId,
  card_id: item.cardId,
  purchase_date: item.purchaseDate,
  description: item.description,
  amount: item.amount,
  installments: item.installments,
  current_installment: item.currentInstallment,
  category_id: nullable(item.categoryId),
  project_id: nullable(item.projectId),
})

const toDayReviewRow = (userId: string, item: DayReview) => ({
  id: item.id,
  user_id: userId,
  date: item.date,
  competence_month: item.competenceMonth,
  status: item.status,
  reviewed_at: nullable(item.reviewedAt),
  notes: nullable(item.notes),
})

const toClassificationRuleRow = (userId: string, item: ClassificationRule) => ({
  id: item.id,
  user_id: userId,
  keyword: item.keyword,
  category_id: nullable(item.categoryId),
  project_id: nullable(item.projectId),
  type: nullable(item.type),
  account_id: nullable(item.accountId),
})

const toAiInsightRow = (userId: string, item: AiInsight) => ({
  id: item.id,
  user_id: userId,
  type: item.type,
  title: item.title,
  content: item.content,
  severity: item.severity,
  related_project_id: nullable(item.relatedProjectId),
  related_month: nullable(item.relatedMonth),
  read_at: nullable(item.readAt),
})

const toScenarioRow = (userId: string, item: Scenario) => ({
  id: item.id,
  user_id: userId,
  name: item.name,
  type: item.type,
  monthly_income: item.monthlyIncome,
  monthly_expense: item.monthlyExpense,
  initial_cost: item.initialCost,
  new_obligation_amount: item.newObligationAmount,
  notes: nullable(item.notes),
})

const toSettingsRow = (userId: string, item: AppSettings) => ({
  user_id: userId,
  emergency_months: item.emergencyMonths,
  safety_margin_rate: item.safetyMarginRate,
  desired_monthly_income: item.desiredMonthlyIncome,
  deepseek_model: item.deepSeekModel,
})

export async function askDeepSeek(prompt: string) {
  if (!hasDeepSeekConfig) {
    return null
  }

  if (import.meta.env.VITE_AI_FUNCTION_URL) {
    const response = await fetch(import.meta.env.VITE_AI_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })

    if (!response.ok) throw new Error('Falha ao consultar IA')
    const data = await response.json()
    return data.content as string | undefined
  }

  if (!supabase) return null

  const { data, error } = await supabase.functions.invoke('ai', {
    body: { prompt },
  })
  if (error) throw error
  return data?.content as string | undefined
}
