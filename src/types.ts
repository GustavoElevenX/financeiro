export type SyncStatus =
  | 'salvo_localmente'
  | 'sincronizando'
  | 'sincronizado'
  | 'erro_sincronizacao'

export type TransactionType =
  | 'ganho'
  | 'despesa'
  | 'transferencia'
  | 'reserva_objetivo'
  | 'compra_planejada'
  | 'pagamento_cartao'
  | 'pagamento_parcela'
  | 'reembolso'
  | 'ajuste_saldo'

export type DayReviewStatus = 'pending' | 'reviewed' | 'no_movement'
export type FinancialRisk = 'seguro' | 'atencao' | 'arriscado' | 'critico'
export type ProjectType =
  | 'reserva_emergencia'
  | 'bebe'
  | 'casa'
  | 'carro'
  | 'investimento'
  | 'outro'

export interface Profile {
  name: string
  partnerName: string
  familyName: string
  babyExpectedDate?: string
}

export interface FamilyMember {
  id: string
  name: string
  role: 'usuario' | 'namorada' | 'filho_futuro' | 'familiar' | 'outro'
  incomeParticipant: boolean
}

export interface Account {
  id: string
  name: string
  type:
    | 'corrente'
    | 'poupanca'
    | 'caixinha'
    | 'dinheiro'
    | 'cartao_credito'
    | 'investimento'
    | 'outro'
  initialBalance: number
  currentBalance: number
  isGoalAccount: boolean
  goalId?: string
  active: boolean
}

export interface Category {
  id: string
  name: string
  type?: 'ganho' | 'despesa' | 'ambos'
  isEssential: boolean
}

export interface Transaction {
  id: string
  transactionDate: string
  competenceMonth: string
  type: TransactionType
  amount: number
  description: string
  categoryId?: string
  projectId?: string
  accountId?: string
  destinationAccountId?: string
  paymentMethod?: string
  status: 'confirmed' | 'planned' | 'cancelled'
  source: 'manual' | 'quick' | 'statement' | 'ai'
  aiConfidence?: number
  rawText?: string
  syncStatus: SyncStatus
}

export interface IncomeSource {
  id: string
  name: string
  person: string
  kind: 'fixa' | 'variavel' | 'eventual'
  expectedAmount: number
  receivedAmount: number
  expectedDate?: string
  receivedDate?: string
  recurrence: 'mensal' | 'semanal' | 'eventual'
  status: 'prevista' | 'recebida' | 'atrasada'
}

export interface Project {
  id: string
  name: string
  type: ProjectType
  targetAmount: number
  reservedAmount: number
  spentAmount: number
  deadline?: string
  priority: number
  status: 'active' | 'paused' | 'done'
  isMandatory: boolean
  weight: number
}

export interface PlannedItem {
  id: string
  projectId: string
  name: string
  category: string
  estimatedAmount: number
  realAmount: number
  priority: 'baixa' | 'media' | 'alta' | 'critica'
  status:
    | 'planejado'
    | 'pesquisando'
    | 'reservado'
    | 'comprado'
    | 'pago'
    | 'recebido'
    | 'cancelado'
  deadline?: string
  purchasedAt?: string
  accountId?: string
  notes?: string
}

export interface CreditCard {
  id: string
  name: string
  limitAmount: number
  closingDay: number
  dueDay: number
  accountId?: string
  active: boolean
}

export interface CardPurchase {
  id: string
  cardId: string
  purchaseDate: string
  description: string
  amount: number
  installments: number
  currentInstallment: number
  categoryId?: string
  projectId?: string
}

export interface DayReview {
  id: string
  date: string
  competenceMonth: string
  status: DayReviewStatus
  reviewedAt?: string
  notes?: string
}

export interface ClassificationRule {
  id: string
  keyword: string
  categoryId?: string
  projectId?: string
  type?: TransactionType
  accountId?: string
}

export interface AiInsight {
  id: string
  type: 'daily' | 'weekly' | 'monthly' | 'decision' | 'risk'
  title: string
  content: string
  severity: 'info' | 'warning' | 'critical' | 'success'
  relatedProjectId?: string
  relatedMonth?: string
  readAt?: string
}

export interface Scenario {
  id: string
  name: string
  type:
    | 'morar_junto'
    | 'comprar_carro'
    | 'financiar_carro'
    | 'alugar_casa'
    | 'comprar_item_bebe'
    | 'investir'
    | 'outro'
  monthlyIncome: number
  monthlyExpense: number
  initialCost: number
  newObligationAmount: number
  notes?: string
}

export interface AppSettings {
  emergencyMonths: number
  safetyMarginRate: number
  desiredMonthlyIncome: number
  deepSeekModel: string
}

export interface AppState {
  profile: Profile
  familyMembers: FamilyMember[]
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  incomeSources: IncomeSource[]
  projects: Project[]
  plannedItems: PlannedItem[]
  creditCards: CreditCard[]
  cardPurchases: CardPurchase[]
  dayReviews: DayReview[]
  classificationRules: ClassificationRule[]
  aiInsights: AiInsight[]
  scenarios: Scenario[]
  settings: AppSettings
  onboardingComplete: boolean
}

export interface PlanningSnapshot {
  currentMonth: string
  currentIncome: number
  expectedIncome: number
  necessaryIncome: number
  incomeGap: number
  totalExpenses: number
  essentialCost: number
  futureCost: number
  mandatoryMonthlyGoals: number
  monthlyReserveGoal: number
  monthlyBabyGoal: number
  monthlyHomeGoal: number
  monthlyCarGoal: number
  cardImpact: number
  cardIncomeRate: number
  freeBalance: number
  reservedBalance: number
  realSurplus: number
  emergencyNeeded: number
  emergencyMinimum: number
  emergencyComfortable: number
  emergencyIdeal: number
  score: number
  risk: FinancialRisk
  missingReviewDays: string[]
  monthStatus: 'em_andamento' | 'incompleto' | 'fechado'
}
