import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Baby,
  Bot,
  CalendarCheck,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Database,
  Home,
  Landmark,
  LayoutDashboard,
  LineChart as LineChartIcon,
  PiggyBank,
  Plus,
  ReceiptText,
  RefreshCcw,
  Send,
  Settings,
  Shield,
  Upload,
  Wallet,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  competenceFromDate,
  createInitialUserState,
  emptyState,
  ensureBaseState,
  ensureMonthReviews,
  makeId,
  recalculateFinancialMonths,
  todayIso,
} from './data'
import {
  askDeepSeek,
  hasDeepSeekConfig,
  loadLocalState,
  loadRemoteState,
  saveLocalState,
  saveRemoteState,
  supabase,
} from './lib/storage'
import { parseMoneyBR, parseQuickEntry, parseStatement } from './lib/parser'
import {
  calculatePlanning,
  formatShortDate,
  formatCurrencyBR,
  money,
  monthKey,
  monthlyGoal,
  parseCurrencyBR,
  percent,
  readableMonth,
} from './lib/planning'
import type {
  AppState,
  CreditCard as CreditCardType,
  DayReview,
  PlannedItem,
  PlanningSnapshot,
  Project,
  Scenario,
  Transaction,
} from './types'
import type { User } from '@supabase/supabase-js'

type RouteKey =
  | 'dashboard'
  | 'onboarding'
  | 'lancamento'
  | 'transacoes'
  | 'rendas'
  | 'despesas'
  | 'cartoes'
  | 'contas'
  | 'metas'
  | 'reserva'
  | 'bebe'
  | 'casa'
  | 'carro'
  | 'investimentos'
  | 'regularizacao'
  | 'simulador'
  | 'historico'
  | 'planejamento'
  | 'ia'
  | 'configuracoes'

const navItems: Array<{ key: RouteKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'onboarding', label: 'Plano de Vida Familiar', icon: Home },
  { key: 'lancamento', label: 'Lançar Movimento', icon: Plus },
  { key: 'bebe', label: 'Bebê e Enxoval', icon: Baby },
  { key: 'casa', label: 'Casa e Morar Junto', icon: Home },
  { key: 'reserva', label: 'Reserva de Emergência', icon: Shield },
  { key: 'contas', label: 'Contas e Caixinhas', icon: Landmark },
  { key: 'cartoes', label: 'Cartões e Dívidas', icon: CreditCard },
  { key: 'regularizacao', label: 'Regularização', icon: CalendarCheck },
  { key: 'historico', label: 'Histórico', icon: LineChartIcon },
  { key: 'ia', label: 'IA Financeira', icon: Bot },
  { key: 'metas', label: 'Projetos', icon: PiggyBank },
  { key: 'configuracoes', label: 'Configurações', icon: Settings },
]

const riskCopy = {
  seguro: 'Seguro',
  atencao: 'Atenção',
  arriscado: 'Arriscado',
  critico: 'Crítico',
}

const riskClass = {
  seguro: 'good',
  atencao: 'warn',
  arriscado: 'danger',
  critico: 'critical',
}

const mergeById = <T extends { id: string }>(primary: T[], secondary: T[]) => [
  ...primary,
  ...secondary.filter((item) => !primary.some((current) => current.id === item.id)),
]

function hasLocalData(state?: AppState) {
  if (!state) return false
  return [
    state.transactions,
    state.accounts,
    state.projects,
    state.plannedItems,
    state.dayReviews,
    state.incomeSources,
    state.creditCards,
    state.cardPurchases,
    state.scenarios,
  ].some((items) => items.length > 0)
}

function mergeLocalIntoRemote(remote: AppState, local?: AppState) {
  if (!local || !hasLocalData(local)) return ensureBaseState(remote)
  const localState = ensureBaseState(local)
  return ensureBaseState({
    ...remote,
    profile: remote.profile.name || remote.profile.familyName ? remote.profile : localState.profile,
    familyMembers: mergeById(remote.familyMembers, localState.familyMembers),
    accounts: mergeById(remote.accounts, localState.accounts),
    categories: mergeById(remote.categories, localState.categories),
    transactions: mergeById(remote.transactions, localState.transactions),
    financialMonths: mergeById(remote.financialMonths, localState.financialMonths),
    incomeSources: mergeById(remote.incomeSources, localState.incomeSources),
    projects: mergeById(remote.projects, localState.projects),
    plannedItems: mergeById(remote.plannedItems, localState.plannedItems),
    creditCards: mergeById(remote.creditCards, localState.creditCards),
    cardPurchases: mergeById(remote.cardPurchases, localState.cardPurchases),
    dayReviews: mergeById(remote.dayReviews, localState.dayReviews),
    classificationRules: mergeById(remote.classificationRules, localState.classificationRules),
    aiInsights: mergeById(remote.aiInsights, localState.aiInsights),
    scenarios: mergeById(remote.scenarios, localState.scenarios),
    settings: remote.settings || localState.settings,
    onboardingComplete: remote.onboardingComplete || localState.onboardingComplete,
  })
}

function App() {
  const [state, setState] = useState<AppState>(emptyState)
  const [route, setRoute] = useState<RouteKey>('dashboard')
  const [selectedMonth, setSelectedMonth] = useState(monthKey())
  const [hydrated, setHydrated] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [localMode, setLocalMode] = useState(false)
  const [syncMessage, setSyncMessage] = useState('Carregando')

  useEffect(() => {
    if (!supabase) {
      loadLocalState()
        .then((localState) => {
          setState(ensureBaseState(localState ?? createInitialUserState()))
        })
        .finally(() => {
          setHydrated(true)
          setSyncMessage('Modo local')
        })
      return
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (!data.user) {
        loadLocalState()
          .then((localState) => {
            setState(ensureBaseState(localState ?? createInitialUserState()))
          })
          .finally(() => {
            setHydrated(true)
            setSyncMessage('Modo local - faça login para sincronizar com Supabase')
          })
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) {
        loadLocalState()
          .then((localState) => {
            setState(ensureBaseState(localState ?? createInitialUserState()))
          })
          .finally(() => {
            setHydrated(true)
            setSyncMessage('Modo local - faça login para sincronizar com Supabase')
          })
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !user) return

    let active = true
    queueMicrotask(() => {
      if (active) {
        setHydrated(false)
        setSyncMessage('Carregando Supabase')
      }
    })

    Promise.all([loadRemoteState(user), loadLocalState()])
      .then(async ([remoteState, localState]) => {
        const baseRemote = ensureBaseState(remoteState ?? createInitialUserState(user.email))
        const nextState = mergeLocalIntoRemote(baseRemote, localState)
        if (!remoteState || hasLocalData(localState) || JSON.stringify(remoteState) !== JSON.stringify(nextState)) {
          await saveRemoteState(user.id, nextState)
        }
        if (active) {
          setState(nextState)
          setHydrated(true)
          setSyncMessage(hasLocalData(localState) ? 'Local sincronizado com Supabase' : remoteState ? 'Sincronizado' : 'Perfil criado')
        }
      })
      .catch((error: Error) => {
        if (active) {
          setHydrated(true)
          setSyncMessage(error.message)
        }
      })

    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    if (!hydrated) return

    const id = window.setTimeout(() => {
      saveLocalState(state)
        .then(() => {
          if (supabase && user) {
            const syncedTransactionIds = new Set(state.transactions.map((transaction) => transaction.id))
            setSyncMessage('Salvo localmente; sincronizando Supabase')
            return saveRemoteState(user.id, state)
              .then(() => {
                setSyncMessage('Sincronizado')
                setState((current) => {
                  let changed = false
                  const transactions = current.transactions.map((transaction) => {
                    if (!syncedTransactionIds.has(transaction.id) || transaction.syncStatus === 'sincronizado') return transaction
                    changed = true
                    return { ...transaction, syncStatus: 'sincronizado' as const }
                  })
                  return changed ? { ...current, transactions } : current
                })
              })
              .catch((error: Error) => setSyncMessage(`Pendente de sincronização: ${error.message}`))
          }
          setSyncMessage(supabase ? 'Salvo localmente - faça login para sincronizar com Supabase' : 'Salvo localmente')
          return undefined
        })
        .catch((error: Error) => setSyncMessage(error.message))
    }, 300)
    return () => window.clearTimeout(id)
  }, [hydrated, state, user])

  const snapshot = useMemo(() => calculatePlanning(state, selectedMonth), [state, selectedMonth])

  const updateState = (updater: (current: AppState) => AppState) => {
    setState((current) => updater(current))
  }

  useEffect(() => {
    queueMicrotask(() => {
      setState((current) => recalculateFinancialMonths(ensureMonthReviews(ensureBaseState(current), selectedMonth)))
    })
  }, [selectedMonth])

  const addTransaction = (transaction: Transaction) => {
    updateState((current) => {
      const month = current.financialMonths.find((item) => item.month === transaction.competenceMonth)
      if (month?.status === 'fechado') {
        window.alert('Você está alterando um mês já fechado. Os relatórios serão recalculados.')
      }
      return applyTransaction(current, transaction)
    })
  }

  const page = {
    dashboard: <Dashboard state={state} snapshot={snapshot} selectedMonth={selectedMonth} setRoute={setRoute} />,
    onboarding: <Onboarding state={state} updateState={updateState} setRoute={setRoute} snapshot={snapshot} />,
    lancamento: <QuickEntry state={state} snapshot={snapshot} addTransaction={addTransaction} updateState={updateState} selectedMonth={selectedMonth} cloudSyncActive={Boolean(supabase && user)} />,
    transacoes: <Transactions state={state} selectedMonth={selectedMonth} addTransaction={addTransaction} />,
    rendas: <IncomePage state={state} updateState={updateState} snapshot={snapshot} />,
    despesas: <ExpensesPage state={state} snapshot={snapshot} selectedMonth={selectedMonth} />,
    cartoes: <CardsPage state={state} updateState={updateState} snapshot={snapshot} addTransaction={addTransaction} />,
    contas: <AccountsPage state={state} updateState={updateState} />,
    metas: <ProjectsHub state={state} updateState={updateState} snapshot={snapshot} addTransaction={addTransaction} />,
    reserva: <ProjectFocus state={state} updateState={updateState} snapshot={snapshot} type="reserva_emergencia" addTransaction={addTransaction} />,
    bebe: <ProjectFocus state={state} updateState={updateState} snapshot={snapshot} type="bebe" addTransaction={addTransaction} />,
    casa: <ProjectFocus state={state} updateState={updateState} snapshot={snapshot} type="casa" addTransaction={addTransaction} />,
    carro: <ProjectFocus state={state} updateState={updateState} snapshot={snapshot} type="carro" addTransaction={addTransaction} />,
    investimentos: <InvestmentsPage snapshot={snapshot} />,
    regularizacao: <Regularization state={state} updateState={updateState} selectedMonth={selectedMonth} addTransaction={addTransaction} />,
    simulador: <Simulator updateState={updateState} snapshot={snapshot} />,
    historico: <HistoryPage state={state} selectedMonth={selectedMonth} />,
    planejamento: <MonthlyPlanning state={state} updateState={updateState} snapshot={snapshot} selectedMonth={selectedMonth} />,
    ia: <AiPage state={state} snapshot={snapshot} />,
    configuracoes: <SettingsPage state={state} updateState={updateState} />,
  }[route]

  if (!hydrated) {
    return <LoginScreen status="Carregando seus dados" onLocal={() => setLocalMode(true)} />
  }

  if (!user && !localMode) {
    return <LoginScreen status={syncMessage} onLocal={() => setLocalMode(true)} />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" type="button" onClick={() => setRoute('dashboard')}>
          <span className="brand-icon">
            <Wallet size={22} />
          </span>
          <span>
            <strong>Analista Financeiro</strong>
            <small>Pessoal e familiar</small>
          </span>
        </button>

        <nav className="nav-list" aria-label="Rotas principais">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.key}
                className={`nav-item ${route === item.key ? 'active' : ''}`}
                type="button"
                onClick={() => setRoute(item.key)}
                title={item.label}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="sync-panel">
          <Database size={18} />
          <div>
            <strong>{supabase ? syncMessage : 'Modo local-first'}</strong>
            <small>{hasDeepSeekConfig ? 'IA avançada ativa' : 'Cálculos financeiros ativos'}</small>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <span className={`status-pill ${riskClass[snapshot.risk]}`}>{riskCopy[snapshot.risk]}</span>
            <h1>{pageTitle(route)}</h1>
          </div>
          <div className="topbar-actions">
            <label className="field inline">
              <span>Mês</span>
              <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
            </label>
            <button className="icon-button" type="button" onClick={() => setRoute('onboarding')} title="Diagnóstico inicial">
              <RefreshCcw size={18} />
            </button>
          </div>
        </header>
        {page}
      </main>
    </div>
  )
}

function LoginScreen({ status, onLocal }: { status: string; onLocal: () => void }) {
  return (
    <main className="login-screen">
      <section className="login-hero">
        <div className="brand-icon">
          <Wallet size={24} />
        </div>
        <p className="eyebrow">Analista Financeiro Pessoal/Familiar</p>
        <h1>Entre para sincronizar seu Plano Familiar.</h1>
        <p>
          A plataforma abre pelo login para proteger seus lançamentos. Depois de entrar, cada movimento salva primeiro neste navegador e sincroniza com Supabase.
        </p>
        <div className="login-proof">
          <span>Plano Familiar</span>
          <span>Projetos de vida</span>
          <span>IA financeira</span>
        </div>
      </section>
      <section className="login-card">
        <AuthPanel />
        <div className="sync-panel">
          <Database size={18} />
          <div>
            <strong>{status}</strong>
            <small>{supabase ? 'Supabase configurado' : 'Supabase ausente no ambiente; modo local disponível'}</small>
          </div>
        </div>
        <button type="button" onClick={onLocal}>
          Continuar em modo local
        </button>
      </section>
    </main>
  )
}

function pageTitle(route: RouteKey) {
  return navItems.find((item) => item.key === route)?.label || 'Onboarding inicial'
}

function applyTransaction(state: AppState, transaction: Transaction): AppState {
  const now = new Date().toISOString()
  const projectGoalAccountId = transaction.projectId
    ? state.accounts.find((account) => account.goalId === transaction.projectId)?.id
    : undefined
  const originAccountId =
    transaction.accountId ||
    state.accounts.find((account) => !account.isGoalAccount && account.type !== 'cartao_credito')?.id ||
    state.accounts[0]?.id
  const destinationAccountId =
    transaction.destinationAccountId ||
    ((transaction.type === 'reserva_objetivo' || transaction.type === 'transferencia') ? projectGoalAccountId : undefined)
  const normalizedTransaction: Transaction = {
    ...transaction,
    accountId: originAccountId,
    destinationAccountId,
    syncStatus: transaction.syncStatus || 'salvo_localmente',
    createdAt: transaction.createdAt || now,
    updatedAt: now,
  }
  const accounts = state.accounts.map((account) => {
    if (normalizedTransaction.type === 'ajuste_saldo' && account.id === normalizedTransaction.accountId) {
      return { ...account, currentBalance: normalizedTransaction.amount }
    }
    if (normalizedTransaction.type === 'ganho' && account.id === normalizedTransaction.accountId) {
      return { ...account, currentBalance: account.currentBalance + normalizedTransaction.amount }
    }
    if (
      ['despesa', 'compra_planejada', 'pagamento_cartao', 'pagamento_parcela'].includes(normalizedTransaction.type) &&
      account.id === normalizedTransaction.accountId
    ) {
      return { ...account, currentBalance: account.currentBalance - normalizedTransaction.amount }
    }
    if ((normalizedTransaction.type === 'transferencia' || normalizedTransaction.type === 'reserva_objetivo') && account.id === normalizedTransaction.accountId) {
      return { ...account, currentBalance: account.currentBalance - normalizedTransaction.amount }
    }
    if ((normalizedTransaction.type === 'transferencia' || normalizedTransaction.type === 'reserva_objetivo') && account.id === normalizedTransaction.destinationAccountId) {
      return { ...account, currentBalance: account.currentBalance + normalizedTransaction.amount }
    }
    return account
  })

  const projects = state.projects.map((project) => {
    if (project.id !== normalizedTransaction.projectId) return project
    if (normalizedTransaction.type === 'reserva_objetivo' || normalizedTransaction.type === 'transferencia') {
      return { ...project, reservedAmount: project.reservedAmount + normalizedTransaction.amount }
    }
    if (normalizedTransaction.type === 'despesa' || normalizedTransaction.type === 'compra_planejada') {
      return { ...project, spentAmount: project.spentAmount + normalizedTransaction.amount }
    }
    return project
  })

  return recalculateFinancialMonths(ensureMonthReviews({
    ...state,
    accounts,
    projects,
    transactions: [normalizedTransaction, ...state.transactions],
  }, normalizedTransaction.competenceMonth))
}

function Dashboard({
  state,
  snapshot,
  selectedMonth,
  setRoute,
}: {
  state: AppState
  snapshot: PlanningSnapshot
  selectedMonth: string
  setRoute: (route: RouteKey) => void
}) {
  const projectProgress = state.projects.map((project) => ({
    name: project.name,
    progress: Math.min(((project.reservedAmount + project.spentAmount) / Math.max(project.targetAmount, 1)) * 100, 100),
    reserved: project.reservedAmount,
    missing: Math.max(project.targetAmount - project.reservedAmount - project.spentAmount, 0),
  }))

  const history = Array.from(new Set(state.transactions.map((transaction) => transaction.competenceMonth)))
    .sort()
    .map((month) => {
      const transactions = state.transactions.filter((transaction) => transaction.competenceMonth === month)
      return {
        month: readableMonth(month).slice(0, 3),
        renda: transactions.filter((item) => item.type === 'ganho').reduce((sum, item) => sum + item.amount, 0),
        gastos: transactions
          .filter((item) => ['despesa', 'compra_planejada', 'pagamento_cartao', 'pagamento_parcela'].includes(item.type))
          .reduce((sum, item) => sum + item.amount, 0),
      }
    })

  const cardData = [
    { name: 'Usado', value: snapshot.cardImpact, color: '#ef4444' },
    { name: 'Livre', value: Math.max((state.creditCards[0]?.limitAmount || 0) - snapshot.cardImpact, 0), color: '#0f766e' },
  ]

  return (
    <div className="page-grid">
      <section className="hero-band">
        <div>
          <p className="eyebrow">{readableMonth(selectedMonth)}</p>
          <h2>Decisão financeira da família</h2>
          <p>
            Para viver juntos com bebê e segurança, vocês precisam de {money(snapshot.necessaryIncome)} por mês. A renda familiar considerada é {money(snapshot.currentIncome)} e o gap é {money(snapshot.incomeGap)}.
          </p>
        </div>
        <div className="score-ring">
          <span>{snapshot.score}</span>
          <small>/100</small>
        </div>
      </section>

      <section className="decision-month">
        <div>
          <p className="eyebrow">Decisão financeira do mês</p>
          <h2>{monthlyDecisionRecommendation(snapshot)}</h2>
        </div>
        <div className="decision-metrics">
          <span>Renda confirmada: <strong>{money(snapshot.confirmedIncome)}</strong></span>
          <span>Renda pendente: <strong>{money(snapshot.pendingIncome)}</strong></span>
          <span>Renda necessária para o plano: <strong>{money(snapshot.necessaryIncome)}</strong></span>
          <span>Gap do Plano Familiar: <strong>{money(snapshot.incomeGap)}</strong></span>
          <span>Status do mês: <strong>{snapshot.monthStatus}</strong></span>
          <span>Falta para bebê/casa/reserva: <strong>{money(snapshot.monthlyBabyGoal + snapshot.monthlyHomeGoal + snapshot.monthlyReserveGoal)}</strong></span>
          <span>Risco atual: <strong>{riskCopy[snapshot.risk]}</strong></span>
          <span>Não assumir agora: <strong>{snapshot.incomeGap > 0 || snapshot.cardIncomeRate > 0.35 ? 'parcela nova' : 'gasto sem prioridade'}</strong></span>
          <span>Próxima ação: <strong>{snapshot.missingReviewDays.length ? 'regularizar dias pendentes' : snapshot.incomeGap > 0 ? 'buscar renda extra' : 'aportar nas metas'}</strong></span>
          <span>Reserva: <strong>{money(snapshot.monthlyReserveGoal)}</strong></span>
          <span>Bebê: <strong>{money(snapshot.monthlyBabyGoal)}</strong></span>
          <span>Casa: <strong>{money(snapshot.monthlyHomeGoal)}</strong></span>
          <span>Cartão: <strong>{money(snapshot.cardImpact)}</strong></span>
        </div>
      </section>

      <section className="kpi-grid">
        <Kpi title="Renda atual" value={money(snapshot.currentIncome)} icon={CircleDollarSign} tone="good" />
        <Kpi title="Renda confirmada por lançamentos" value={money(snapshot.confirmedIncome)} icon={CircleDollarSign} tone="good" />
        <Kpi title="Renda prevista" value={money(snapshot.expectedIncome)} icon={CircleDollarSign} tone="neutral" />
        <Kpi title="Renda necessária para viver o plano" value={money(snapshot.necessaryIncome)} icon={Wallet} tone="neutral" />
        <Kpi title="Gap do Plano Familiar" value={money(snapshot.incomeGap)} icon={AlertTriangle} tone={snapshot.incomeGap > 0 ? 'danger' : 'good'} />
        <Kpi title="Gastos confirmados" value={money(snapshot.totalExpenses)} icon={ReceiptText} tone="danger" />
        <Kpi title="Status do mês" value={snapshot.monthStatus} icon={CalendarCheck} tone={snapshot.monthStatus === 'fechado' ? 'good' : 'warn'} />
        <Kpi title="Saldo livre real" value={money(snapshot.freeBalance)} icon={Landmark} tone="neutral" />
        <Kpi title="Saldo reservado" value={money(snapshot.reservedBalance)} icon={PiggyBank} tone="good" />
        <Kpi title="Reserva necessária" value={money(snapshot.emergencyNeeded)} icon={Shield} tone="warn" />
        <Kpi title="Cartão do mês" value={money(snapshot.cardImpact)} icon={CreditCard} tone={snapshot.cardIncomeRate > 0.35 ? 'danger' : 'neutral'} />
        <Kpi title="Sobra real" value={money(snapshot.realSurplus)} icon={LineChartIcon} tone={snapshot.realSurplus > 0 ? 'good' : 'danger'} />
      </section>

      {snapshot.incomeGap > 0 && (
        <Panel title="Por que existe esse gap?">
          <div className="decision-metrics">
            <span>Gastos essenciais: <strong>{money(snapshot.essentialCost)}</strong></span>
            <span>Custo futuro familiar: <strong>{money(snapshot.futureCost)}</strong></span>
            <span>Reserva de emergência: <strong>{money(snapshot.monthlyReserveGoal)}</strong></span>
            <span>Bebê: <strong>{money(snapshot.monthlyBabyGoal)}</strong></span>
            <span>Casa: <strong>{money(snapshot.monthlyHomeGoal)}</strong></span>
            <span>Cartão/dívidas: <strong>{money(snapshot.cardImpact)}</strong></span>
            <span>Margem de segurança: <strong>{money(snapshot.safetyMargin)}</strong></span>
            <span>Renda confirmada: <strong>{money(snapshot.currentIncome)}</strong></span>
          </div>
        </Panel>
      )}

      <Panel title="Ações práticas">
        <div className="button-row">
          <button type="button" onClick={() => setRoute('lancamento')}>Lançar renda</button>
          <button type="button" onClick={() => setRoute('lancamento')}>Lançar despesa</button>
          <button type="button" onClick={() => setRoute('lancamento')}>Reservar para bebê</button>
          <button type="button" onClick={() => setRoute('lancamento')}>Reservar para casa</button>
          <button type="button" onClick={() => setRoute('onboarding')}>Revisar Plano Familiar</button>
          <button type="button" onClick={() => setRoute('regularizacao')}>Regularizar dias</button>
          <button type="button" onClick={() => setRoute('ia')}>Perguntar à IA</button>
        </div>
      </Panel>

      <section className="split-grid">
        <Panel title="Projetos de vida" action={<button type="button" onClick={() => setRoute('metas')}>Abrir</button>}>
          <div className="progress-list">
            {state.projects
              .filter((project) => project.isMandatory)
              .map((project) => (
                <ProgressRow
                  key={project.id}
                  label={project.name}
                  value={project.reservedAmount + project.spentAmount}
                  max={project.targetAmount}
                  detail={`Meta mensal: ${money(monthlyGoal(project))}`}
                />
              ))}
          </div>
        </Panel>

        <Panel title="Gap de renda">
          <div className="decision-card">
            <strong>{money(snapshot.incomeGap)}</strong>
            <span>é o aumento mensal necessário para manter contas essenciais, reserva, bebê e casa no ritmo.</span>
          </div>
          <div className="mini-metrics">
            <span>Reserva: {money(snapshot.monthlyReserveGoal)}</span>
            <span>Bebê: {money(snapshot.monthlyBabyGoal)}</span>
            <span>Casa: {money(snapshot.monthlyHomeGoal)}</span>
          </div>
        </Panel>
      </section>

      <section className="analytics-grid">
        <Panel title="Histórico e tendência">
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `R$ ${value}`} />
                <Tooltip formatter={(value) => money(Number(value))} />
                <Area type="monotone" dataKey="renda" stroke="#0f766e" fill="#ccfbf1" />
                <Area type="monotone" dataKey="gastos" stroke="#dc2626" fill="#fee2e2" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Cartão de crédito">
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={cardData} dataKey="value" innerRadius={58} outerRadius={86} paddingAngle={4}>
                  {cardData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => money(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
            <div>
              <strong>{percent(snapshot.cardIncomeRate)}</strong>
              <span>da renda confirmada</span>
            </div>
          </div>
        </Panel>
      </section>

      <section className="split-grid">
        <Panel title="Decisões pendentes">
          <ul className="decision-list">
            <li>Comprar item do bebê agora: {snapshot.realSurplus > 0 ? 'seguro com limite' : 'simular antes'}</li>
            <li>Reservar dinheiro para casa: {snapshot.monthlyHomeGoal <= snapshot.freeBalance ? 'possível' : 'depende de renda extra'}</li>
            <li>Cartão saudável: {snapshot.cardIncomeRate <= 0.25 ? 'sim' : 'em atenção'}</li>
            <li>Mês pendente: {snapshot.missingReviewDays.length ? `${snapshot.missingReviewDays.length} dias` : 'nenhum'}</li>
          </ul>
        </Panel>

        <Panel title="Pendências para melhorar sua análise">
          <SetupChecklist state={state} snapshot={snapshot} setRoute={setRoute} />
        </Panel>

        <Panel title="IA analista">
          <AiSummary state={state} snapshot={snapshot} />
        </Panel>
      </section>

      <Panel title="Mapa das metas">
        <div className="chart-box">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={projectProgress}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(value) => `${value}%`} />
              <Tooltip formatter={(value, name) => (name === 'progress' ? `${Number(value).toFixed(1)}%` : money(Number(value)))} />
              <Bar dataKey="progress" fill="#2563eb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  )
}

function Kpi({
  title,
  value,
  icon: Icon,
  tone,
}: {
  title: string
  value: string
  icon: typeof Wallet
  tone: 'good' | 'warn' | 'danger' | 'neutral'
}) {
  return (
    <article className={`kpi ${tone}`}>
      <Icon size={22} />
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  )
}

function monthlyDecisionRecommendation(snapshot: PlanningSnapshot) {
  if (snapshot.incomeGap > 0) {
    return `O Gap do Plano Familiar é ${money(snapshot.incomeGap)}. Priorize renda extra e dinheiro para bebê/casa antes de carro ou investimentos.`
  }
  if (snapshot.cardIncomeRate > 0.35) {
    return 'Reduza o cartão neste mês para proteger reserva, bebê e casa.'
  }
  if (snapshot.monthStatus !== 'fechado' && snapshot.missingReviewDays.length > 0) {
    return `Regularize ${snapshot.missingReviewDays.length} dias para fechar o mês com confiança.`
  }
  if (snapshot.realSurplus > 0) {
    return 'Plano sustentável: direcione a sobra real para as metas obrigatórias.'
  }
  return 'Lance movimentos reais do mês para receber uma recomendação objetiva.'
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function ProgressRow({ label, value, max, detail }: { label: string; value: number; max: number; detail?: string }) {
  const progress = Math.min((value / Math.max(max, 1)) * 100, 100)
  return (
    <div className="progress-row">
      <div>
        <strong>{label}</strong>
        <span>{detail || `${money(value)} / ${money(max)}`}</span>
      </div>
      <div className="progress-track">
        <span style={{ width: `${progress}%` }} />
      </div>
      <small>
        {money(value)} / {money(max)}
      </small>
    </div>
  )
}

function AiSummary({ state, snapshot }: { state: AppState; snapshot: PlanningSnapshot }) {
  const baby = state.projects.find((project) => project.type === 'bebe')
  const home = state.projects.find((project) => project.type === 'casa')
  return (
    <div className="ai-summary">
      <p>
        Seu custo essencial médio está em <strong>{money(snapshot.essentialCost)}</strong>.
      </p>
      <p>
        Para bebê e casa nos prazos, as metas mensais são <strong>{money(snapshot.monthlyBabyGoal)}</strong> e{' '}
        <strong>{money(snapshot.monthlyHomeGoal)}</strong>.
      </p>
      <p>
        A renda necessária está em <strong>{money(snapshot.necessaryIncome)}</strong>; com a renda atual, o gap é{' '}
        <strong>{money(snapshot.incomeGap)}</strong>.
      </p>
      <p>
        Prioridade agora: {snapshot.incomeGap > 0 ? 'aumentar renda e preservar reserva mínima.' : 'manter metas no ritmo e evitar parcelas novas.'}
      </p>
      <small>
        {baby?.name}: {money(baby?.reservedAmount || 0)} reservado. {home?.name}: {money(home?.reservedAmount || 0)} reservado.
      </small>
    </div>
  )
}

function SetupChecklist({
  state,
  snapshot,
  setRoute,
}: {
  state: AppState
  snapshot: PlanningSnapshot
  setRoute: (route: RouteKey) => void
}) {
  const home = state.projects.find((project) => project.type === 'casa')
  const baby = state.projects.find((project) => project.type === 'bebe')
  const reserveAccount = state.accounts.find((account) => account.goalId === state.projects.find((project) => project.type === 'reserva_emergencia')?.id)
  const previousIncomplete = state.financialMonths.find((month) => month.status === 'incompleto')
  const items = [
    !state.incomeSources.some((income) => income.expectedAmount > 0 || income.receivedAmount > 0) && {
      text: 'Informe renda atual para calcular o gap familiar.',
      route: 'onboarding' as RouteKey,
    },
    snapshot.essentialCost <= 0 && {
      text: 'Informe gastos essenciais para calcular a reserva de emergência.',
      route: 'onboarding' as RouteKey,
    },
    !home?.deadline && {
      text: 'Defina a data alvo da casa para calcular a renda necessária.',
      route: 'onboarding' as RouteKey,
    },
    !baby?.deadline && !state.profile.babyExpectedDate && {
      text: 'Informe a previsão de nascimento para calcular a meta mensal do bebê.',
      route: 'onboarding' as RouteKey,
    },
    !reserveAccount && {
      text: 'Crie ou vincule uma conta para a reserva.',
      route: 'contas' as RouteKey,
    },
    state.creditCards.length === 0 && {
      text: 'Configure um cartão para acompanhar faturas e parcelas.',
      route: 'cartoes' as RouteKey,
    },
    previousIncomplete && {
      text: `Feche o mês ${readableMonth(previousIncomplete.month)} para melhorar o histórico.`,
      route: 'regularizacao' as RouteKey,
    },
  ].filter(Boolean) as Array<{ text: string; route: RouteKey }>

  if (!items.length) {
    return <p className="empty-copy">A estrutura principal está pronta. Continue lançando movimentações para refinar a análise.</p>
  }

  return (
    <div className="item-list">
      {items.map((item) => (
        <div className="list-row action-row" key={item.text}>
          <span>{item.text}</span>
          <button type="button" onClick={() => setRoute(item.route)}>Configurar agora</button>
        </div>
      ))}
    </div>
  )
}

function QuickEntry({
  state,
  snapshot,
  addTransaction,
  updateState,
  selectedMonth,
  cloudSyncActive,
}: {
  state: AppState
  snapshot: PlanningSnapshot
  addTransaction: (transaction: Transaction) => void
  updateState: (updater: (current: AppState) => AppState) => void
  selectedMonth: string
  cloudSyncActive: boolean
}) {
  const [entry, setEntry] = useState('')
  const [statement, setStatement] = useState('')
  const [statementMonth, setStatementMonth] = useState(selectedMonth)
  const [preview, setPreview] = useState<Transaction[]>([])
  const [movementType, setMovementType] = useState<Transaction['type']>('ganho')
  const [feedback, setFeedback] = useState('')

  const parsed = useMemo(() => {
    const base = parseQuickEntry(entry, state)
    if (!base) return null
    const projectGoalAccountId = base.projectId
      ? state.accounts.find((account) => account.goalId === base.projectId)?.id
      : undefined
    const originAccountId =
      base.accountId ||
      state.accounts.find((account) => !account.isGoalAccount && account.type !== 'cartao_credito')?.id ||
      state.accounts[0]?.id
    return {
      ...base,
      type: movementType,
      accountId: originAccountId,
      destinationAccountId:
        movementType === 'reserva_objetivo' || movementType === 'transferencia'
          ? base.destinationAccountId || projectGoalAccountId
          : undefined,
    } satisfies Transaction
  }, [entry, movementType, state])
  void snapshot
  const movementOptions: Array<{ label: string; type: Transaction['type'] }> = [
    { label: 'Recebi dinheiro', type: 'ganho' },
    { label: 'Gastei dinheiro', type: 'despesa' },
    { label: 'Reservei para uma meta', type: 'reserva_objetivo' },
    { label: 'Transferi entre contas', type: 'transferencia' },
    { label: 'Comprei item planejado', type: 'compra_planejada' },
    { label: 'Paguei cartão', type: 'pagamento_cartao' },
    { label: 'Criei uma dívida/parcela', type: 'pagamento_parcela' },
    { label: 'Ajustei saldo', type: 'ajuste_saldo' },
  ]

  const saveWithFeedback = (transaction: Transaction) => {
    addTransaction(transaction)
    const projected = calculatePlanning(applyTransaction(state, transaction), transaction.competenceMonth)
    setFeedback(
      `${transaction.description || 'Movimento'} registrado: ${money(transaction.amount)}. Renda confirmada por lançamentos: ${money(projected.confirmedIncome)}. Renda pendente prevista: ${money(projected.pendingIncome)}. Renda considerada no Plano Familiar: ${money(projected.currentIncome)}. Renda necessária para o Plano Familiar: ${money(projected.necessaryIncome)}. Gap do Plano Familiar: ${money(projected.incomeGap)}.`,
    )
  }

  return (
    <div className="page-grid">
      <Panel title="O que aconteceu?">
        <div className="movement-grid">
          {movementOptions.map((option) => (
            <button
              key={option.type}
              type="button"
              className={movementType === option.type ? 'active-choice' : ''}
              onClick={() => setMovementType(option.type)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Lançamento rápido com IA/parser">
        <div className="quick-layout">
          <label className="field">
            <span>Digite a movimentação</span>
            <input value={entry} onChange={(event) => setEntry(event.target.value)} placeholder="1033,33 bolsa estágio nubank hoje" />
          </label>
          <button
            className="primary-button"
            type="button"
            disabled={!parsed}
            onClick={() => {
              if (parsed) {
                saveWithFeedback(parsed)
                setEntry('')
              }
            }}
          >
            <Send size={18} />
            Salvar
          </button>
        </div>
        {parsed && <TransactionPreview transaction={parsed} state={state} />}
      </Panel>

      {feedback && (
        <Panel title="Impacto no Plano Familiar">
          <div className="decision-card">
            <strong>{cloudSyncActive ? 'Salvo; sincronizando com Supabase' : supabase ? 'Salvo localmente - faça login para ir ao banco' : 'Salvo localmente'}</strong>
            <span>{feedback}</span>
          </div>
        </Panel>
      )}

      <Panel title="Formulário completo do movimento">
        <ManualTransactionForm key={movementType} state={state} onSave={saveWithFeedback} defaultType={movementType} />
      </Panel>

      <Panel title="Importação de extrato com IA">
        <label className="field">
          <span>Mês/ano de referência</span>
          <input type="month" value={statementMonth} onChange={(event) => setStatementMonth(event.target.value)} />
        </label>
        <label className="field">
          <span>Extrato colado</span>
          <textarea value={statement} onChange={(event) => setStatement(event.target.value)} rows={6} />
        </label>
        <div className="button-row">
          <button type="button" onClick={() => setPreview(parseStatement(statement, state, statementMonth))}>
            <Upload size={18} />
            Classificar
          </button>
          <button
            type="button"
            disabled={!preview.length}
            onClick={() => {
              updateState((current) => preview.reduce((next, transaction) => applyTransaction(next, transaction), current))
              setPreview([])
            }}
          >
            <CheckCircle2 size={18} />
            Importar todos
          </button>
        </div>
        {preview.length > 0 && <TransactionTable transactions={preview} state={state} compact />}
      </Panel>
    </div>
  )
}

function TransactionPreview({ transaction, state }: { transaction: Transaction; state: AppState }) {
  return (
    <div className="preview-grid">
      <span>Valor: {money(transaction.amount)}</span>
      <span>Tipo: {transaction.type}</span>
      <span>Data: {formatShortDate(transaction.transactionDate)}</span>
      <span>Categoria: {nameById(state.categories, transaction.categoryId)}</span>
      <span>Projeto: {nameById(state.projects, transaction.projectId) || 'Sem projeto'}</span>
      <span>Conta: {nameById(state.accounts, transaction.accountId)}</span>
      <span>Destino: {nameById(state.accounts, transaction.destinationAccountId) || 'Não se aplica'}</span>
      <span>Confiança: {percent(transaction.aiConfidence || 0)}</span>
    </div>
  )
}

function ManualTransactionForm({
  state,
  onSave,
  defaultDate,
  defaultType = 'despesa',
  defaultProjectId,
}: {
  state: AppState
  onSave: (transaction: Transaction) => void
  defaultDate?: string
  defaultType?: Transaction['type']
  defaultProjectId?: string
}) {
  const [form, setForm] = useState({
    type: defaultType,
    amount: '',
    transactionDate: defaultDate || todayIso(),
    competenceMonth: competenceFromDate(defaultDate || todayIso()),
    description: '',
    categoryId: '',
    projectId: defaultProjectId || '',
    accountId: state.accounts[0]?.id || '',
    destinationAccountId: '',
    paymentMethod: 'pix',
    status: 'confirmed' as Transaction['status'],
    notes: '',
  })

  useEffect(() => {
    if (defaultDate) {
      queueMicrotask(() =>
        setForm((current) => ({
          ...current,
          transactionDate: defaultDate,
          competenceMonth: competenceFromDate(defaultDate),
        })),
      )
    }
  }, [defaultDate])

  const save = () => {
    const parsedAmount = parseMoneyBR(form.amount)
    if (!parsedAmount || !form.description.trim()) return
    const now = new Date().toISOString()
    const destinationAccountId =
      form.destinationAccountId ||
      ((form.type === 'reserva_objetivo' || form.type === 'transferencia') && form.projectId
        ? state.accounts.find((account) => account.goalId === form.projectId)?.id
        : undefined)
    onSave({
      id: makeId('tx'),
      transactionDate: form.transactionDate,
      competenceMonth: form.competenceMonth || competenceFromDate(form.transactionDate),
      type: form.type,
      amount: Math.abs(parsedAmount.value),
      description: form.description,
      categoryId: form.categoryId || undefined,
      projectId: form.projectId || undefined,
      accountId: form.accountId || undefined,
      destinationAccountId,
      paymentMethod: form.paymentMethod,
      status: form.status,
      source: 'manual',
      notes: form.notes || undefined,
      syncStatus: 'salvo_localmente',
      createdAt: now,
      updatedAt: now,
    })
    setForm((current) => ({ ...current, amount: '', description: '', notes: '' }))
  }

  return (
    <div className="manual-form">
      <label className="field">
        <span>Tipo</span>
        <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as Transaction['type'] })}>
          <option value="ganho">Ganho</option>
          <option value="despesa">Despesa</option>
          <option value="transferencia">Transferência</option>
          <option value="reserva_objetivo">Reserva para objetivo</option>
          <option value="compra_planejada">Compra planejada</option>
          <option value="pagamento_cartao">Pagamento de cartão</option>
          <option value="pagamento_parcela">Parcela</option>
          <option value="reembolso">Reembolso</option>
          <option value="ajuste_saldo">Ajuste de saldo</option>
        </select>
      </label>
      <label className="field">
        <span>Valor</span>
        <input inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="1.033,33" />
      </label>
      <label className="field">
        <span>Data real</span>
        <input
          type="date"
          value={form.transactionDate}
          onChange={(event) =>
            setForm({ ...form, transactionDate: event.target.value, competenceMonth: competenceFromDate(event.target.value) })
          }
        />
      </label>
      <label className="field">
        <span>Competência</span>
        <input type="month" value={form.competenceMonth} onChange={(event) => setForm({ ...form, competenceMonth: event.target.value })} />
      </label>
      <label className="field wide">
        <span>Descrição</span>
        <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
      </label>
      <label className="field">
        <span>Categoria</span>
        <select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
          <option value="">Sem categoria</option>
          {state.categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Projeto/meta</span>
        <select value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}>
          <option value="">Sem projeto</option>
          {state.projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Conta origem</span>
        <select value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })}>
          <option value="">Sem conta</option>
          {state.accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Conta destino</span>
        <select value={form.destinationAccountId} onChange={(event) => setForm({ ...form, destinationAccountId: event.target.value })}>
          <option value="">Não se aplica</option>
          {state.accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Pagamento</span>
        <select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}>
          <option value="pix">Pix</option>
          <option value="debito">Débito</option>
          <option value="credito">Crédito</option>
          <option value="dinheiro">Dinheiro</option>
          <option value="boleto">Boleto</option>
          <option value="transferencia">Transferência</option>
          <option value="outro">Outro</option>
        </select>
      </label>
      <label className="field">
        <span>Status</span>
        <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Transaction['status'] })}>
          <option value="confirmed">Confirmado</option>
          <option value="planned">Previsto</option>
          <option value="cancelled">Cancelado</option>
        </select>
      </label>
      <label className="field wide">
        <span>Observações</span>
        <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      </label>
      <button className="primary-button" type="button" onClick={save}>
        <Plus size={18} />
        Salvar lançamento
      </button>
    </div>
  )
}

function Transactions({
  state,
  selectedMonth,
  addTransaction,
}: {
  state: AppState
  selectedMonth: string
  addTransaction: (transaction: Transaction) => void
}) {
  const transactions = state.transactions.filter((transaction) => transaction.competenceMonth === selectedMonth)
  return (
    <div className="page-grid">
      <Panel title="Novo lançamento">
        <ManualTransactionForm state={state} onSave={addTransaction} />
      </Panel>
      <Panel title="Lista de transações">
        <TransactionTable transactions={transactions} state={state} />
      </Panel>
    </div>
  )
}

function TransactionTable({ transactions, state, compact = false }: { transactions: Transaction[]; state: AppState; compact?: boolean }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Descrição</th>
            <th>Tipo</th>
            {!compact && <th>Categoria</th>}
            {!compact && <th>Projeto</th>}
            <th>Valor</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id}>
              <td>{formatShortDate(transaction.transactionDate)}</td>
              <td>{transaction.description}</td>
              <td><span className={`type-pill ${transaction.type}`}>{transaction.type}</span></td>
              {!compact && <td>{nameById(state.categories, transaction.categoryId)}</td>}
              {!compact && <td>{nameById(state.projects, transaction.projectId) || '-'}</td>}
              <td>{money(transaction.amount)}</td>
              <td>{transaction.syncStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function IncomePage({
  state,
  updateState,
  snapshot,
}: {
  state: AppState
  updateState: (updater: (current: AppState) => AppState) => void
  snapshot: PlanningSnapshot
}) {
  const [form, setForm] = useState({ name: '', amount: 0, person: state.profile.name })

  return (
    <div className="page-grid">
      <section className="kpi-grid">
        <Kpi title="Confirmada" value={money(snapshot.currentIncome)} icon={CircleDollarSign} tone="good" />
        <Kpi title="Prevista" value={money(snapshot.expectedIncome)} icon={Wallet} tone="neutral" />
        <Kpi title="Necessária" value={money(snapshot.necessaryIncome)} icon={AlertTriangle} tone="warn" />
        <Kpi title="Renda adicional" value={money(Math.max(snapshot.incomeGap, 0))} icon={Plus} tone="danger" />
      </section>
      <Panel title="Fontes de renda">
        <div className="form-inline">
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <input inputMode="decimal" value={form.amount ? formatCurrencyBR(form.amount) : ''} onChange={(event) => setForm({ ...form, amount: parseCurrencyBR(event.target.value) })} />
          <button
            type="button"
            disabled={!form.name.trim() || form.amount <= 0}
            onClick={() => {
              updateState((current) => ({
                ...current,
                incomeSources: [
                  ...current.incomeSources,
                  {
                    id: makeId('income'),
                    name: form.name,
                    person: form.person,
                    kind: 'variavel',
                    expectedAmount: form.amount,
                    receivedAmount: 0,
                    recurrence: 'mensal',
                    status: 'prevista',
                  },
                ],
              }))
              setForm((current) => ({ ...current, name: '', amount: 0 }))
            }}
          >
            <Plus size={18} />
            Adicionar
          </button>
        </div>
        <div className="item-list">
          {state.incomeSources.map((income) => (
            <div className="list-row" key={income.id}>
              <strong>{income.name}</strong>
              <span>{income.person}</span>
              <span>{income.kind}</span>
              <span>{money(income.receivedAmount)} / {money(income.expectedAmount)}</span>
              <span className="status-pill good">{income.status}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function ExpensesPage({ state, snapshot, selectedMonth }: { state: AppState; snapshot: PlanningSnapshot; selectedMonth: string }) {
  const rows = state.categories
    .filter((category) => category.type !== 'ganho')
    .map((category) => ({
      name: category.name,
      amount: state.transactions
        .filter((transaction) => transaction.competenceMonth === selectedMonth && transaction.categoryId === category.id && transaction.type === 'despesa')
        .reduce((sum, transaction) => sum + transaction.amount, 0),
      essential: category.isEssential,
    }))
    .filter((row) => row.amount > 0)

  return (
    <div className="page-grid">
      <section className="kpi-grid">
        <Kpi title="Gastos do mês" value={money(snapshot.totalExpenses)} icon={ReceiptText} tone="danger" />
        <Kpi title="Custo essencial" value={money(snapshot.essentialCost)} icon={Shield} tone="warn" />
        <Kpi title="Peso do cartão" value={percent(snapshot.cardIncomeRate)} icon={CreditCard} tone="neutral" />
        <Kpi title="Sobra real" value={money(snapshot.realSurplus)} icon={LineChartIcon} tone={snapshot.realSurplus > 0 ? 'good' : 'danger'} />
      </section>
      <Panel title="Análise por categoria">
        <div className="chart-box">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => money(Number(value))} />
              <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                {rows.map((row) => (
                  <Cell key={row.name} fill={row.essential ? '#0f766e' : '#f59e0b'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  )
}

function CardsPage({
  state,
  updateState,
  snapshot,
  addTransaction,
}: {
  state: AppState
  updateState: (updater: (current: AppState) => AppState) => void
  snapshot: PlanningSnapshot
  addTransaction: (transaction: Transaction) => void
}) {
  const [purchase, setPurchase] = useState({ description: '', amount: 0, installments: 1 })
  const card = state.creditCards[0]
  const monthNumberForCard = (competenceMonth: string) => {
    const [year, month] = competenceMonth.split('-').map(Number)
    return year * 12 + month
  }
  const currentMonthIndex = monthNumberForCard(snapshot.currentMonth)
  const futureInvoice = state.cardPurchases.reduce((sum, item) => {
    const parcel = item.amount / Math.max(item.installments, 1)
    const firstMonthIndex = monthNumberForCard(item.purchaseDate.slice(0, 7))
    const elapsed = Math.max(currentMonthIndex - firstMonthIndex, 0)
    const currentInstallment = Math.max((item.currentInstallment || 1) + elapsed, 1)
    return sum + parcel * Math.max(item.installments - currentInstallment + 1, 0)
  }, 0)
  if (!card) {
    return (
      <div className="page-grid">
        <Panel title="Cartão de crédito">
          <div className="empty-state">
            <p>Nenhum cartão cadastrado ainda. Cadastre limite, fechamento e vencimento para calcular fatura atual, futura e impacto na renda.</p>
            <button
              type="button"
              onClick={() =>
                updateState((current) => ({
                  ...current,
                  creditCards: [
                    {
                      id: makeId('card'),
                      name: 'Cartão principal',
                      limitAmount: 0,
                      closingDay: 20,
                      dueDay: 28,
                      active: true,
                    },
                    ...current.creditCards,
                  ],
                }))
              }
            >
              Criar cartão
            </button>
          </div>
        </Panel>
        <Panel title="Pagamento de cartão">
          <ManualTransactionForm state={state} onSave={addTransaction} defaultType="pagamento_cartao" />
        </Panel>
      </div>
    )
  }
  return (
    <div className="page-grid">
      <section className="kpi-grid">
        <Kpi title="Fatura prevista" value={money(snapshot.cardImpact)} icon={CreditCard} tone="warn" />
        <Kpi title="Faturas futuras" value={money(futureInvoice)} icon={CalendarCheck} tone="neutral" />
        <Kpi title="Comprometimento" value={percent(snapshot.cardIncomeRate)} icon={AlertTriangle} tone={snapshot.cardIncomeRate > 0.35 ? 'danger' : 'neutral'} />
        <Kpi title="Limite" value={money(card?.limitAmount || 0)} icon={Wallet} tone="neutral" />
      </section>
      <Panel title="Nova compra no cartão">
        <div className="form-inline">
          <input value={purchase.description} onChange={(event) => setPurchase({ ...purchase, description: event.target.value })} />
        <input inputMode="decimal" value={purchase.amount ? formatCurrencyBR(purchase.amount) : ''} onChange={(event) => setPurchase({ ...purchase, amount: parseCurrencyBR(event.target.value) })} />
          <input type="number" value={purchase.installments} onChange={(event) => setPurchase({ ...purchase, installments: Number(event.target.value) })} />
          <button
            type="button"
            disabled={!purchase.description.trim() || purchase.amount <= 0}
            onClick={() => {
              updateState((current) => ({
                ...current,
                cardPurchases: [
                  {
                    id: makeId('cardp'),
                    cardId: card.id,
                    purchaseDate: todayIso(),
                    description: purchase.description.trim(),
                    amount: purchase.amount,
                    installments: Math.max(purchase.installments, 1),
                    currentInstallment: 1,
                  },
                  ...current.cardPurchases,
                ],
              }))
              setPurchase({ description: '', amount: 0, installments: 1 })
            }}
          >
            <Plus size={18} />
            Adicionar
          </button>
        </div>
        <CardPurchaseList purchases={state.cardPurchases} cards={state.creditCards} />
      </Panel>
      <Panel title="Pagamento de cartão">
        <ManualTransactionForm state={state} onSave={addTransaction} defaultType="pagamento_cartao" />
      </Panel>
    </div>
  )
}

function CardPurchaseList({ purchases, cards }: { purchases: AppState['cardPurchases']; cards: CreditCardType[] }) {
  return (
    <div className="item-list">
      {purchases.map((purchase) => (
        <div className="list-row" key={purchase.id}>
          <strong>{purchase.description}</strong>
          <span>{nameById(cards, purchase.cardId)}</span>
          <span>{money(purchase.amount)}</span>
          <span>{purchase.currentInstallment}/{purchase.installments}</span>
        </div>
      ))}
    </div>
  )
}

function AccountsPage({
  state,
  updateState,
}: {
  state: AppState
  updateState: (updater: (current: AppState) => AppState) => void
}) {
  const [draft, setDraft] = useState({
    name: '',
    type: 'corrente' as AppState['accounts'][number]['type'],
    initialBalance: 0,
    currentBalance: 0,
    isGoalAccount: false,
    goalId: '',
    active: true,
  })
  const reserved = state.accounts.filter((account) => account.isGoalAccount).reduce((sum, account) => sum + account.currentBalance, 0)
  const total = state.accounts.filter((account) => account.type !== 'cartao_credito').reduce((sum, account) => sum + account.currentBalance, 0)
  const free = total - reserved
  return (
    <div className="page-grid">
      <section className="kpi-grid">
        <Kpi title="Saldo total" value={money(total)} icon={Landmark} tone="neutral" />
        <Kpi title="Saldo livre real" value={money(free)} icon={Wallet} tone="good" />
        <Kpi title="Saldo reservado" value={money(reserved)} icon={PiggyBank} tone="warn" />
      </section>
      <Panel title="Contas e caixinhas">
        <div className="manual-form">
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Nome da conta" />
          <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as AppState['accounts'][number]['type'] })}>
            <option value="corrente">Corrente</option>
            <option value="poupanca">Poupança</option>
            <option value="caixinha">Caixinha</option>
            <option value="dinheiro">Dinheiro</option>
            <option value="cartao_credito">Cartão de crédito</option>
            <option value="investimento">Investimento</option>
            <option value="outro">Outro</option>
          </select>
        <input inputMode="decimal" value={draft.initialBalance ? formatCurrencyBR(draft.initialBalance) : ''} onChange={(event) => setDraft({ ...draft, initialBalance: parseCurrencyBR(event.target.value) })} placeholder="Saldo inicial" />
        <input inputMode="decimal" value={draft.currentBalance ? formatCurrencyBR(draft.currentBalance) : ''} onChange={(event) => setDraft({ ...draft, currentBalance: parseCurrencyBR(event.target.value) })} placeholder="Saldo atual" />
          <select value={draft.isGoalAccount ? 'sim' : 'nao'} onChange={(event) => setDraft({ ...draft, isGoalAccount: event.target.value === 'sim' })}>
            <option value="nao">Conta comum</option>
            <option value="sim">Vinculada a meta</option>
          </select>
          <select value={draft.goalId} onChange={(event) => setDraft({ ...draft, goalId: event.target.value })}>
            <option value="">Sem meta</option>
            {state.projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!draft.name.trim()}
            onClick={() => {
              updateState((current) => ({
                ...current,
                accounts: [
                  ...current.accounts,
                  {
                    id: makeId('acc'),
                    ...draft,
                    name: draft.name.trim(),
                    goalId: draft.goalId || undefined,
                  },
                ],
              }))
              setDraft((current) => ({ ...current, name: '', initialBalance: 0, currentBalance: 0 }))
            }}
          >
            <Plus size={18} />
            Adicionar
          </button>
        </div>
        <div className="account-grid">
          {state.accounts.map((account) => (
            <article className="account-card" key={account.id}>
              <input
                value={account.name}
                onChange={(event) =>
                  updateState((current) => ({
                    ...current,
                    accounts: current.accounts.map((item) => (item.id === account.id ? { ...item, name: event.target.value } : item)),
                  }))
                }
              />
              <span>{account.type}</span>
              <b>{money(account.currentBalance)}</b>
              <small>{account.isGoalAccount ? `Meta: ${nameById(state.projects, account.goalId)}` : 'Saldo livre'}</small>
              <button
                type="button"
                onClick={() =>
                  updateState((current) => ({
                    ...current,
                    accounts: current.accounts.map((item) => (item.id === account.id ? { ...item, active: !item.active } : item)),
                  }))
                }
              >
                {account.active ? 'Ativa' : 'Inativa'}
              </button>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function GoalsPage({
  state,
  updateState,
}: {
  state: AppState
  updateState: (updater: (current: AppState) => AppState) => void
}) {
  return (
    <div className="page-grid">
      <Panel title="Prioridades financeiras">
        <div className="priority-stack">
          {state.projects.map((project, index) => (
            <div className="priority-row" key={project.id}>
              <span>{index + 1}</span>
              <strong>{project.name}</strong>
              <input
                type="range"
                min="0"
                max="100"
                value={project.weight}
                onChange={(event) =>
                  updateState((current) => ({
                    ...current,
                    projects: current.projects.map((item) =>
                      item.id === project.id ? { ...item, weight: Number(event.target.value) } : item,
                    ),
                  }))
                }
              />
              <b>{project.weight}%</b>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Projetos e metas">
        <div className="progress-list">
          {state.projects.map((project) => (
            <ProgressRow key={project.id} label={project.name} value={project.reservedAmount + project.spentAmount} max={project.targetAmount} detail={`Faltam ${money(Math.max(project.targetAmount - project.reservedAmount - project.spentAmount, 0))}`} />
          ))}
        </div>
      </Panel>
    </div>
  )
}

function ProjectsHub({
  state,
  updateState,
  snapshot,
  addTransaction,
}: {
  state: AppState
  updateState: (updater: (current: AppState) => AppState) => void
  snapshot: PlanningSnapshot
  addTransaction: (transaction: Transaction) => void
}) {
  const [activeType, setActiveType] = useState<Project['type']>('reserva_emergencia')
  const projectCards = [
    { type: 'reserva_emergencia' as Project['type'], label: 'Reserva de emergência', gap: snapshot.reserveGap },
    { type: 'bebe' as Project['type'], label: 'Bebê / enxoval', gap: snapshot.babyGap },
    { type: 'casa' as Project['type'], label: 'Casa / morar junto', gap: snapshot.houseGap },
    { type: 'carro' as Project['type'], label: 'Carro', gap: snapshot.monthlyCarGoal },
    { type: 'investimento' as Project['type'], label: 'Investimentos', gap: snapshot.incomeGap > 0 ? snapshot.incomeGap : 0 },
  ]

  return (
    <div className="page-grid">
      <Panel title="Projetos de vida">
        <div className="project-tabs">
          {projectCards.map((card) => {
            const project = state.projects.find((item) => item.type === card.type)
            const missing = project ? Math.max(project.targetAmount - project.reservedAmount - project.spentAmount, 0) : 0
            return (
              <button key={card.type} type="button" className={activeType === card.type ? 'active-choice' : ''} onClick={() => setActiveType(card.type)}>
                <strong>{card.label}</strong>
                <span>Falta {money(missing)} | gap mensal {money(card.gap)}</span>
              </button>
            )
          })}
        </div>
      </Panel>
      {activeType === 'investimento' ? (
        <InvestmentsPage snapshot={snapshot} />
      ) : (
        <ProjectFocus state={state} updateState={updateState} snapshot={snapshot} type={activeType} addTransaction={addTransaction} />
      )}
    </div>
  )
}

void GoalsPage

function ProjectFocus({
  state,
  updateState,
  snapshot,
  type,
  addTransaction,
}: {
  state: AppState
  updateState: (updater: (current: AppState) => AppState) => void
  snapshot: PlanningSnapshot
  type: Project['type']
  addTransaction: (transaction: Transaction) => void
}) {
  const project = state.projects.find((item) => item.type === type)
  const [itemName, setItemName] = useState('')

  if (!project) {
    return (
      <Panel title="Módulo em preparação">
        <p>Este módulo ainda não tinha sido criado no seu perfil, mas a plataforma pode criá-lo automaticamente.</p>
        <button type="button" onClick={() => updateState((current) => ensureBaseState(current))}>Criar estrutura padrão</button>
      </Panel>
    )
  }

  const items = state.plannedItems.filter((item) => item.projectId === project.id)
  const estimatedItems = items.reduce((sum, item) => sum + item.estimatedAmount, 0)
  const realItems = items.reduce((sum, item) => sum + item.realAmount, 0)
  const purchasedItems = items
    .filter((item) => item.status === 'comprado' || item.status === 'pago' || item.status === 'recebido')
    .reduce((sum, item) => sum + (item.realAmount || item.estimatedAmount), 0)
  const pendingItems = Math.max(estimatedItems - purchasedItems, 0)
  const monthly =
    type === 'reserva_emergencia'
      ? snapshot.monthlyReserveGoal
      : type === 'bebe'
        ? snapshot.monthlyBabyGoal
        : type === 'casa'
          ? snapshot.monthlyHomeGoal
          : monthlyGoal(project)

  return (
    <div className="page-grid">
      <section className="kpi-grid">
        <Kpi title="Meta total" value={money(project.targetAmount)} icon={PiggyBank} tone="neutral" />
        <Kpi title="Reservado" value={money(project.reservedAmount)} icon={Shield} tone="good" />
        <Kpi title="Gasto" value={money(project.spentAmount)} icon={ReceiptText} tone="warn" />
        <Kpi title="Meta mensal" value={money(monthly)} icon={CalendarCheck} tone="danger" />
        {(type === 'bebe' || type === 'casa') && <Kpi title="Itens pendentes" value={money(pendingItems)} icon={ReceiptText} tone="warn" />}
      </section>
      <Panel title={project.name}>
        <ProgressRow label="Progresso" value={project.reservedAmount + project.spentAmount} max={project.targetAmount} />
        <ProjectEditor state={state} project={project} updateState={updateState} type={type} />
        {type === 'reserva_emergencia' && (
          <div className="mini-metrics">
            <span>Mínima: {money(snapshot.emergencyMinimum)}</span>
            <span>Confortável: {money(snapshot.emergencyComfortable)}</span>
            <span>Ideal: {money(snapshot.emergencyIdeal)}</span>
          </div>
        )}
      </Panel>
      <Panel
        title={type === 'bebe' ? 'Bebê e Enxoval' : type === 'casa' ? 'Casa e Morar Junto' : 'Itens planejados'}
        action={
          <span className="status-pill">
            Estimado {money(estimatedItems)} | real {money(realItems)} | comprado {money(purchasedItems)}
          </span>
        }
      >
        <div className="form-inline">
          <input value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Nome do item" />
          <button
            type="button"
            disabled={!itemName.trim()}
            onClick={() => {
              updateState((current) => ({
                ...current,
                plannedItems: [
                  ...current.plannedItems,
                  {
                    id: makeId('item'),
                    projectId: project.id,
                    name: itemName.trim(),
                    category: project.name,
                    estimatedAmount: 0,
                    realAmount: 0,
                    priority: 'media',
                    status: 'planejado',
                  },
                ],
              }))
              setItemName('')
            }}
          >
            <Plus size={18} />
            {type === 'bebe' ? 'Adicionar item do bebê' : type === 'casa' ? 'Adicionar item da casa' : 'Adicionar'}
          </button>
        </div>
        <PlannedItemsManager state={state} project={project} items={items} updateState={updateState} addTransaction={addTransaction} />
      </Panel>
      <Panel title="Novo lançamento vinculado">
        <ManualTransactionForm state={state} onSave={addTransaction} defaultType={type === 'reserva_emergencia' ? 'reserva_objetivo' : 'despesa'} defaultProjectId={project.id} />
      </Panel>
      {(type === 'bebe' || type === 'casa' || type === 'reserva_emergencia') && (
        <Panel title="IA do projeto">
          <AiSummary state={state} snapshot={snapshot} />
        </Panel>
      )}
    </div>
  )
}

function ProjectEditor({
  state,
  project,
  updateState,
  type,
}: {
  state: AppState
  project: Project
  updateState: (updater: (current: AppState) => AppState) => void
  type: Project['type']
}) {
  const updateProject = (patch: Partial<Project>) => {
    updateState((current) => ({
      ...current,
      projects: current.projects.map((item) => (item.id === project.id ? { ...item, ...patch } : item)),
    }))
  }

  return (
    <div className="project-editor">
      <label className="field">
        <span>Valor total</span>
        <input inputMode="decimal" value={project.targetAmount ? formatCurrencyBR(project.targetAmount) : ''} onChange={(event) => updateProject({ targetAmount: parseCurrencyBR(event.target.value) })} />
      </label>
      <label className="field">
        <span>Prazo</span>
        <input type="date" value={project.deadline || ''} onChange={(event) => updateProject({ deadline: event.target.value })} />
      </label>
      <label className="field">
        <span>Reservado</span>
        <input inputMode="decimal" value={project.reservedAmount ? formatCurrencyBR(project.reservedAmount) : ''} onChange={(event) => updateProject({ reservedAmount: parseCurrencyBR(event.target.value) })} />
      </label>
      <label className="field">
        <span>Gasto</span>
        <input inputMode="decimal" value={project.spentAmount ? formatCurrencyBR(project.spentAmount) : ''} onChange={(event) => updateProject({ spentAmount: parseCurrencyBR(event.target.value) })} />
      </label>
      <label className="field">
        <span>Prioridade</span>
        <input type="number" value={project.priority} onChange={(event) => updateProject({ priority: Number(event.target.value) })} />
      </label>
      <label className="field">
        <span>Peso</span>
        <input type="number" value={project.weight} onChange={(event) => updateProject({ weight: Number(event.target.value) })} />
      </label>
      <label className="field">
        <span>Conta vinculada</span>
        <select value={project.linkedAccountId || ''} onChange={(event) => updateProject({ linkedAccountId: event.target.value || undefined })}>
          <option value="">Sem conta</option>
          {state.accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Status</span>
        <select value={project.status} onChange={(event) => updateProject({ status: event.target.value as Project['status'] })}>
          <option value="active">Ativa</option>
          <option value="paused">Pausada</option>
          <option value="done">Concluída</option>
        </select>
      </label>
      <label className="field">
        <span>Obrigatória</span>
        <select value={project.isMandatory ? 'sim' : 'nao'} onChange={(event) => updateProject({ isMandatory: event.target.value === 'sim' })}>
          <option value="sim">Sim</option>
          <option value="nao">Não</option>
        </select>
      </label>
      {(type === 'casa' || type === 'carro' || type === 'bebe') && (
        <>
          <label className="field">
            <span>Custo inicial</span>
            <input inputMode="decimal" value={project.initialCost ? formatCurrencyBR(project.initialCost) : ''} onChange={(event) => updateProject({ initialCost: parseCurrencyBR(event.target.value) })} />
          </label>
          <label className="field">
            <span>{type === 'bebe' ? 'Gasto mensal futuro do bebê' : 'Custo mensal futuro'}</span>
            <input inputMode="decimal" value={project.futureMonthlyCost ? formatCurrencyBR(project.futureMonthlyCost) : ''} onChange={(event) => updateProject({ futureMonthlyCost: parseCurrencyBR(event.target.value) })} />
          </label>
        </>
      )}
      {type === 'carro' && (
        <>
          <label className="field">
            <span>Entrada</span>
            <input inputMode="decimal" value={project.carDownPayment ? formatCurrencyBR(project.carDownPayment) : ''} onChange={(event) => updateProject({ carDownPayment: parseCurrencyBR(event.target.value) })} />
          </label>
          <label className="field">
            <span>Parcela</span>
            <input inputMode="decimal" value={project.carInstallment ? formatCurrencyBR(project.carInstallment) : ''} onChange={(event) => updateProject({ carInstallment: parseCurrencyBR(event.target.value) })} />
          </label>
          <label className="field">
            <span>Combustível</span>
            <input inputMode="decimal" value={project.carFuel ? formatCurrencyBR(project.carFuel) : ''} onChange={(event) => updateProject({ carFuel: parseCurrencyBR(event.target.value) })} />
          </label>
        </>
      )}
      {type === 'reserva_emergencia' && (
        <>
          <label className="field">
            <span>Custo essencial atual</span>
            <input inputMode="decimal" value={project.currentEssentialCost ? formatCurrencyBR(project.currentEssentialCost) : ''} onChange={(event) => updateProject({ currentEssentialCost: parseCurrencyBR(event.target.value) })} />
          </label>
          <label className="field">
            <span>Custo essencial futuro</span>
            <input inputMode="decimal" value={project.futureEssentialCost ? formatCurrencyBR(project.futureEssentialCost) : ''} onChange={(event) => updateProject({ futureEssentialCost: parseCurrencyBR(event.target.value) })} />
          </label>
        </>
      )}
    </div>
  )
}

function PlannedItemsManager({
  state,
  project,
  items,
  updateState,
  addTransaction,
}: {
  state: AppState
  project: Project
  items: PlannedItem[]
  updateState: (updater: (current: AppState) => AppState) => void
  addTransaction: (transaction: Transaction) => void
}) {
  const [draft, setDraft] = useState({
    name: '',
    category: '',
    estimatedAmount: 0,
    realAmount: 0,
    priority: 'media' as PlannedItem['priority'],
    status: 'planejado' as PlannedItem['status'],
    deadline: '',
    accountId: '',
    notes: '',
    referenceUrl: '',
  })

  const suggested =
    project.type === 'bebe'
      ? ['Fraldas', 'Roupinhas', 'Berço', 'Carrinho', 'Bebê conforto', 'Banheira', 'Bolsa maternidade', 'Produtos de higiene', 'Mamadeiras', 'Lenços umedecidos', 'Consultas/exames', 'Farmácia', 'Móveis do bebê']
      : project.type === 'casa'
        ? ['Geladeira', 'Fogão', 'Cama', 'Colchão', 'Guarda-roupa', 'Mesa', 'Cadeiras', 'Sofá', 'Máquina de lavar', 'Ventilador/ar-condicionado', 'Panelas', 'Pratos', 'Copos', 'Talheres', 'Utensílios de cozinha', 'Aluguel inicial', 'Caução', 'Energia', 'Água', 'Internet', 'Gás', 'Mercado inicial']
        : []

  const addItem = (item: Partial<PlannedItem> = {}) => {
    const name = item.name || draft.name
    if (!name) return
    updateState((current) => ({
      ...current,
      plannedItems: [
        ...current.plannedItems,
        {
          id: makeId('item'),
          projectId: project.id,
          name,
          category: item.category || draft.category || project.name,
          estimatedAmount: item.estimatedAmount ?? draft.estimatedAmount,
          realAmount: item.realAmount ?? draft.realAmount,
          priority: item.priority || draft.priority,
          status: item.status || draft.status,
          deadline: draft.deadline || undefined,
          accountId: draft.accountId || undefined,
          notes: draft.notes || undefined,
          referenceUrl: draft.referenceUrl || undefined,
        },
      ],
    }))
    setDraft((current) => ({ ...current, name: '', estimatedAmount: 0, realAmount: 0 }))
  }

  const markPaid = (item: PlannedItem) => {
    const amount = item.realAmount || item.estimatedAmount
    const accountId = item.accountId || project.linkedAccountId || state.accounts.find((account) => account.goalId === project.id)?.id || state.accounts[0]?.id
    if (!accountId) {
      window.alert('Cadastre ou escolha uma conta para registrar o pagamento real.')
      return
    }
    addTransaction({
      id: makeId('tx'),
      transactionDate: todayIso(),
      competenceMonth: competenceFromDate(todayIso()),
      type: 'compra_planejada',
      amount,
      description: item.name,
      projectId: project.id,
      accountId,
      paymentMethod: 'pix',
      status: 'confirmed',
      source: 'manual',
      notes: item.notes,
      syncStatus: 'salvo_localmente',
    })
    updateState((current) => ({
      ...current,
      plannedItems: current.plannedItems.map((planned) =>
        planned.id === item.id ? { ...planned, status: 'pago', purchasedAt: todayIso(), realAmount: amount } : planned,
      ),
    }))
  }

  return (
    <div className="item-manager">
      {!items.length && (
        <div className="empty-state">
          <p>
            {project.type === 'bebe'
              ? 'Nenhum item do enxoval cadastrado ainda. Comece adicionando os itens principais para calcular quanto falta até o nascimento.'
              : project.type === 'casa'
                ? 'Nenhum item da casa cadastrado ainda. Adicione móveis, eletrodomésticos, aluguel/parcela e custos de mudança para calcular a renda necessária.'
                : project.type === 'carro'
                  ? 'O carro ainda não foi planejado. Você pode simular compra, financiamento, combustível, manutenção e custo mensal real.'
                  : 'Cadastre os itens desta meta para acompanhar prazo, saldo e prioridade.'}
          </p>
          {!!suggested.length && (
            <button type="button" onClick={() => suggested.forEach((name) => addItem({ name }))}>
              {project.type === 'bebe' ? 'Gerar lista sugerida do enxoval' : 'Gerar lista sugerida da casa'}
            </button>
          )}
        </div>
      )}
      <div className="manual-form">
        <input placeholder="Nome" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        <input placeholder="Categoria" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
        <input inputMode="decimal" placeholder="Estimado" value={draft.estimatedAmount ? formatCurrencyBR(draft.estimatedAmount) : ''} onChange={(event) => setDraft({ ...draft, estimatedAmount: parseCurrencyBR(event.target.value) })} />
        <input inputMode="decimal" placeholder="Real" value={draft.realAmount ? formatCurrencyBR(draft.realAmount) : ''} onChange={(event) => setDraft({ ...draft, realAmount: parseCurrencyBR(event.target.value) })} />
        <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as PlannedItem['priority'] })}>
          <option value="baixa">Baixa</option>
          <option value="media">Média</option>
          <option value="alta">Alta</option>
          <option value="critica">Crítica</option>
        </select>
        <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as PlannedItem['status'] })}>
          <option value="planejado">Planejado</option>
          <option value="pesquisando">Pesquisando</option>
          <option value="reservado">Reservado</option>
          <option value="comprado">Comprado</option>
          <option value="pago">Pago</option>
          <option value="recebido">Recebido</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <select value={draft.accountId} onChange={(event) => setDraft({ ...draft, accountId: event.target.value })}>
          <option value="">Conta sugerida</option>
          {state.accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>
        <input type="date" value={draft.deadline} onChange={(event) => setDraft({ ...draft, deadline: event.target.value })} />
        <input placeholder="Link de referência" value={draft.referenceUrl} onChange={(event) => setDraft({ ...draft, referenceUrl: event.target.value })} />
        <button type="button" onClick={() => addItem()}>Adicionar item</button>
      </div>
      <PlannedItemList items={items} onPaid={markPaid} />
    </div>
  )
}

function PlannedItemList({ items, onPaid }: { items: PlannedItem[]; onPaid?: (item: PlannedItem) => void }) {
  return (
    <div className="item-list">
      {items.map((item) => (
        <div className="list-row" key={item.id}>
          <strong>{item.name}</strong>
          <span>{item.category}</span>
          <span>{item.priority}</span>
          <span>{item.status}</span>
          <span>{money(item.realAmount || item.estimatedAmount)}</span>
          {onPaid && <button type="button" onClick={() => onPaid(item)}>Marcar pago</button>}
        </div>
      ))}
    </div>
  )
}

function InvestmentsPage({ snapshot }: { snapshot: PlanningSnapshot }) {
  const recommended = snapshot.realSurplus > 0 && snapshot.incomeGap <= 0 ? snapshot.realSurplus * 0.25 : 0
  return (
    <Panel title="Investimentos">
      <div className="decision-card">
        <strong>{money(recommended)}</strong>
        <span>
          {recommended > 0
            ? 'sugeridos para iniciar investimento sem comprometer metas obrigatórias.'
            : 'não recomendados agora, porque ainda existe gap para reserva, bebê ou casa.'}
        </span>
      </div>
      <div className="mini-metrics">
        <span>Sobra real: {money(snapshot.realSurplus)}</span>
        <span>Gap: {money(snapshot.incomeGap)}</span>
        <span>Prioridade: contas, reserva, bebê e casa</span>
      </div>
    </Panel>
  )
}

function Regularization({
  state,
  updateState,
  selectedMonth,
  addTransaction,
}: {
  state: AppState
  updateState: (updater: (current: AppState) => AppState) => void
  selectedMonth: string
  addTransaction: (transaction: Transaction) => void
}) {
  const reviews = state.dayReviews.filter((review) => review.competenceMonth === selectedMonth)
  const pending = reviews.filter((review) => review.status === 'pending')
  const [quickByDay, setQuickByDay] = useState<Record<string, string>>({})

  const markDay = (review: DayReview, status: DayReview['status']) => {
    updateState((current) =>
      recalculateFinancialMonths({
        ...current,
        dayReviews: current.dayReviews.map((item) =>
          item.id === review.id ? { ...item, status, reviewedAt: status === 'pending' ? undefined : new Date().toISOString() } : item,
        ),
      }),
    )
  }

  const saveQuickForDay = (review: DayReview, forcedType?: Transaction['type']) => {
    const text = quickByDay[review.date]
    const parsed = text ? parseQuickEntry(`${text} ${formatShortDate(review.date)}`, state) : null
    if (!parsed) return
    addTransaction({
      ...parsed,
      type: forcedType || parsed.type,
      transactionDate: review.date,
      competenceMonth: review.competenceMonth,
    })
    markDay(review, 'reviewed')
    setQuickByDay((current) => ({ ...current, [review.date]: '' }))
  }

  return (
    <Panel title="Regularização de mês incompleto">
      <div className="decision-card">
        <strong>{pending.length ? `${pending.length} dias pendentes` : 'Mês pronto para fechamento'}</strong>
        <span>
          {pending.length
            ? `Faltam revisar: ${pending.map((review) => formatShortDate(review.date)).join(', ')}.`
            : `Todos os dias estão revisados ou marcados sem movimento. O mês fecha automaticamente; próxima ação: abrir ${readableMonth(monthKey())}.`}
        </span>
      </div>
      <div className="calendar-grid">
        {reviews.map((review) => (
          <div className={`day-cell ${review.status}`} key={review.id}>
            <strong>{formatShortDate(review.date)}</strong>
            <span>{review.status}</span>
            <input
              value={quickByDay[review.date] || ''}
              onChange={(event) => setQuickByDay((current) => ({ ...current, [review.date]: event.target.value }))}
              placeholder="50 gasolina pix"
            />
            <div>
              <button type="button" onClick={() => saveQuickForDay(review, 'despesa')}>+ gasto</button>
              <button type="button" onClick={() => saveQuickForDay(review, 'ganho')}>+ ganho</button>
            </div>
            <DayTransactions state={state} date={review.date} />
            <div>
              {review.status === 'pending' ? (
                <>
                  <button type="button" onClick={() => markDay(review, 'reviewed')}>Marcar revisado</button>
                  <button type="button" onClick={() => markDay(review, 'no_movement')}>Sem movimentação</button>
                </>
              ) : (
                <button type="button" onClick={() => markDay(review, 'pending')}>Desfazer revisão</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function DayTransactions({ state, date }: { state: AppState; date: string }) {
  const transactions = state.transactions.filter((transaction) => transaction.transactionDate === date)
  const total = transactions
    .filter((transaction) => transaction.type !== 'ganho')
    .reduce((sum, transaction) => sum + transaction.amount, 0)

  return (
    <div className="day-transactions">
      <small>Total do dia: {money(total)}</small>
      {transactions.map((transaction) => (
        <span key={transaction.id}>{transaction.description}: {money(transaction.amount)}</span>
      ))}
    </div>
  )
}

function Simulator({
  updateState,
  snapshot,
}: {
  updateState: (updater: (current: AppState) => AppState) => void
  snapshot: PlanningSnapshot
}) {
  const [scenario, setScenario] = useState<Scenario>({
    id: makeId('scenario'),
    name: 'E se eu ganhar mais R$ 1.000 por mês?',
    type: 'outro',
    monthlyIncome: 1000,
    monthlyExpense: 0,
    initialCost: 0,
    newObligationAmount: 0,
  })

  const projectedIncome = snapshot.currentIncome + scenario.monthlyIncome
  const projectedNecessary = snapshot.necessaryIncome + scenario.monthlyExpense + scenario.newObligationAmount
  const projectedGap = projectedNecessary - projectedIncome
  const projectedSurplus = snapshot.realSurplus + scenario.monthlyIncome - scenario.monthlyExpense - scenario.newObligationAmount
  const risk: PlanningSnapshot['risk'] =
    projectedGap <= 0 && projectedSurplus > 0 ? 'seguro' : projectedGap < 800 ? 'atencao' : projectedGap < 2000 ? 'arriscado' : 'critico'

  return (
    <div className="page-grid">
      <Panel title="Simulador de decisões">
        <label className="field">
          <span>Cenário</span>
          <input value={scenario.name} onChange={(event) => setScenario({ ...scenario, name: event.target.value })} />
        </label>
        <div className="slider-grid">
          <Slider label="Renda extra mensal" value={scenario.monthlyIncome} setValue={(value) => setScenario({ ...scenario, monthlyIncome: value })} max={5000} />
          <Slider label="Novo custo mensal" value={scenario.monthlyExpense} setValue={(value) => setScenario({ ...scenario, monthlyExpense: value })} max={5000} />
          <Slider label="Custo inicial" value={scenario.initialCost} setValue={(value) => setScenario({ ...scenario, initialCost: value })} max={20000} />
          <Slider label="Nova parcela" value={scenario.newObligationAmount} setValue={(value) => setScenario({ ...scenario, newObligationAmount: value })} max={3000} />
        </div>
        <button
          type="button"
          onClick={() => updateState((current) => ({ ...current, scenarios: [{ ...scenario, id: makeId('scenario') }, ...current.scenarios] }))}
        >
          <Plus size={18} />
          Salvar cenário
        </button>
      </Panel>
      <section className="kpi-grid">
        <Kpi title="Saldo mensal" value={money(projectedSurplus)} icon={Wallet} tone={projectedSurplus > 0 ? 'good' : 'danger'} />
        <Kpi title="Gap projetado" value={money(projectedGap)} icon={AlertTriangle} tone={projectedGap > 0 ? 'danger' : 'good'} />
        <Kpi title="Risco" value={riskCopy[risk]} icon={Shield} tone={risk === 'seguro' ? 'good' : risk === 'atencao' ? 'warn' : 'danger'} />
      </section>
    </div>
  )
}

function Slider({ label, value, setValue, max }: { label: string; value: number; setValue: (value: number) => void; max: number }) {
  return (
    <label className="slider-field">
      <span>{label}</span>
      <strong>{money(value)}</strong>
      <input type="range" min="0" max={max} step="50" value={value} onChange={(event) => setValue(Number(event.target.value))} />
    </label>
  )
}

function HistoryPage({ state, selectedMonth }: { state: AppState; selectedMonth: string }) {
  const months = state.financialMonths
  const categoryRows = state.categories.map((category) => ({
    name: category.name,
    amount: state.transactions
      .filter((transaction) => transaction.categoryId === category.id && transaction.type !== 'ganho')
      .reduce((sum, transaction) => sum + transaction.amount, 0),
  })).filter((row) => row.amount > 0)
  const current = months.find((month) => month.month === selectedMonth)
  const lastClosed = [...months].reverse().find((month) => month.status === 'fechado')

  return (
    <div className="page-grid">
      <section className="kpi-grid">
        <Kpi title="Mês atual" value={current ? riskCopy[current.status === 'fechado' ? 'seguro' : current.status === 'incompleto' ? 'atencao' : 'arriscado'] : 'Sem dados'} icon={CalendarCheck} tone="neutral" />
        <Kpi title="Último fechado" value={lastClosed ? readableMonth(lastClosed.month) : 'Nenhum'} icon={CheckCircle2} tone="good" />
        <Kpi title="Meses incompletos" value={String(months.filter((month) => month.status === 'incompleto').length)} icon={AlertTriangle} tone="warn" />
      </section>
      <Panel title="Histórico mensal">
        <div className="chart-box">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={months.map((month) => ({ month: month.month, renda: month.totalIncome, gasto: month.totalExpense, essencial: month.totalExpense }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => money(Number(value))} />
              <Bar dataKey="renda" fill="#0f766e" />
              <Bar dataKey="gasto" fill="#dc2626" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="empty-copy">Meses incompletos não são usados como referência confiável para média final.</p>
      </Panel>
      <Panel title="Gastos por categoria">
        <TransactionCategoryChart rows={categoryRows} />
      </Panel>
      <Panel title="Todos os movimentos do período">
        <TransactionTable transactions={state.transactions.filter((transaction) => transaction.competenceMonth === selectedMonth)} state={state} />
      </Panel>
    </div>
  )
}

function TransactionCategoryChart({ rows }: { rows: Array<{ name: string; amount: number }> }) {
  if (!rows.length) return <p className="empty-copy">Ainda não há gastos suficientes para análise por categoria.</p>

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip formatter={(value) => money(Number(value))} />
          <Bar dataKey="amount" fill="#2563eb" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function MonthlyPlanning({
  state,
  updateState,
  snapshot,
  selectedMonth,
}: {
  state: AppState
  updateState: (updater: (current: AppState) => AppState) => void
  snapshot: PlanningSnapshot
  selectedMonth: string
}) {
  const [action, setAction] = useState('')

  return (
    <div className="page-grid">
      <section className="kpi-grid">
        <Kpi title="Renda esperada" value={money(snapshot.expectedIncome)} icon={CircleDollarSign} tone="neutral" />
        <Kpi title="Renda necessária" value={money(snapshot.necessaryIncome)} icon={Wallet} tone="warn" />
        <Kpi title="Gap do mês" value={money(snapshot.incomeGap)} icon={AlertTriangle} tone={snapshot.incomeGap > 0 ? 'danger' : 'good'} />
      </section>
      <Panel title={`Planejamento de ${readableMonth(selectedMonth)}`}>
        <div className="settings-grid">
          <label className="field">
            <span>Meta de renda mensal</span>
            <input
              type="number"
              value={state.settings.desiredMonthlyIncome}
              onChange={(event) =>
                updateState((current) => ({
                  ...current,
                  settings: { ...current.settings, desiredMonthlyIncome: Number(event.target.value) },
                }))
              }
            />
          </label>
          <label className="field wide">
            <span>Ações para bater a meta</span>
            <input value={action} onChange={(event) => setAction(event.target.value)} />
          </label>
        </div>
        <div className="decision-card">
          <strong>{money(Math.max(snapshot.necessaryIncome - snapshot.currentIncome, 0))}</strong>
          <span>é o valor que precisa entrar no mês atual para cumprir o plano.</span>
        </div>
      </Panel>
    </div>
  )
}

function AiPage({ state, snapshot }: { state: AppState; snapshot: PlanningSnapshot }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)

  const fallbackAnswer = () => {
    const facts = [
      `Dados analisados: renda considerada ${money(snapshot.currentIncome)}, renda confirmada ${money(snapshot.confirmedIncome)}, renda pendente ${money(snapshot.pendingIncome)}, custo essencial ${money(snapshot.essentialCost)} e metas obrigatórias ${money(snapshot.mandatoryMonthlyGoals)}.`,
      `Cálculos principais: renda necessária para viver o plano ${money(snapshot.necessaryIncome)} e Gap do Plano Familiar ${money(snapshot.incomeGap)}.`,
      `Interpretação: ${snapshot.incomeGap > 0 ? 'o plano familiar depende de renda adicional ou ajuste de prazo.' : 'o plano está sustentável no mês atual.'}`,
      `Riscos: cartão em ${percent(snapshot.cardIncomeRate)} da renda e reserva necessária de ${money(snapshot.emergencyNeeded)}.`,
      `Opções possíveis: aumentar renda, reduzir custos variáveis, adiar carro ou redistribuir pesos entre bebê e casa.`,
      `Recomendação: manter contas essenciais, reserva mínima, bebê e casa antes de investimentos.`,
      'Decisão final: cabe ao usuário confirmar prioridades e assumir ou não novos compromissos.',
    ]
    return facts.join('\n')
  }

  const ask = async () => {
    setLoading(true)
    try {
      const userQuestion = question.trim() || 'Quanto preciso ganhar para morar junto com minha namorada e cuidar do bebê?'
      const months = state.financialMonths.slice(-3).map((month) => month.month)
      const recentTransactions = state.transactions.filter((transaction) => months.includes(transaction.competenceMonth))
      const expensesByCategory = state.categories.map((category) => ({
        category: category.name,
        amount: recentTransactions
          .filter((transaction) => transaction.categoryId === category.id && transaction.type !== 'ganho')
          .reduce((sum, transaction) => sum + transaction.amount, 0),
      }))
      const prompt = `${userQuestion}

Responda sempre no formato:
1. Fatos
2. Cálculos
3. Interpretação
4. Riscos
5. Opções
6. Recomendação
7. Decisão final é do usuário

Dados reais:
${JSON.stringify({
  snapshot,
  projects: state.projects,
  transactionsLast3Months: recentTransactions,
  cardPurchases: state.cardPurchases,
  plannedItems: state.plannedItems,
  accounts: state.accounts,
  pendingMonths: state.financialMonths.filter((month) => month.status !== 'fechado'),
  expensesByCategory,
  closedHistory: state.financialMonths.filter((month) => month.status === 'fechado'),
  scenarios: state.scenarios,
})}`
      const deepSeekAnswer = await askDeepSeek(prompt)
      setAnswer(deepSeekAnswer || fallbackAnswer())
    } catch {
      setAnswer(fallbackAnswer())
    } finally {
      setLoading(false)
    }
  }

  return (
    <Panel title="Analista financeiro com IA">
      <label className="field">
        <span>Pergunta</span>
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} />
      </label>
      <div className="prompt-grid">
        {[
          'Análise do mês',
          'Análise de risco',
          'Gap para morar junto',
          'Gap para bebê',
          'Decisão de compra',
          'Decisão de parcelamento',
          'Plano de renda necessária',
          'Revisão do cartão',
          'Prioridades da semana',
          'Inconsistências do extrato',
        ].map((prompt) => (
          <button key={prompt} type="button" onClick={() => setQuestion(prompt)}>{prompt}</button>
        ))}
      </div>
      <button className="primary-button" type="button" onClick={ask} disabled={loading}>
        <Bot size={18} />
        {loading ? 'Analisando' : 'Analisar'}
      </button>
      {answer && <pre className="answer-box">{answer}</pre>}
      <div className="item-list">
        {state.aiInsights.map((insight) => (
          <div className="list-row" key={insight.id}>
            <strong>{insight.title}</strong>
            <span>{insight.severity}</span>
            <span>{insight.content}</span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function SettingsPage({
  state,
  updateState,
}: {
  state: AppState
  updateState: (updater: (current: AppState) => AppState) => void
}) {
  return (
    <div className="page-grid">
      <Panel title="Configurações">
        <div className="settings-grid">
          <label className="field">
            <span>Nome</span>
            <input
              value={state.profile.name}
              onChange={(event) => updateState((current) => ({ ...current, profile: { ...current.profile, name: event.target.value } }))}
            />
          </label>
          <label className="field">
            <span>Família</span>
            <input
              value={state.profile.familyName}
              onChange={(event) => updateState((current) => ({ ...current, profile: { ...current.profile, familyName: event.target.value } }))}
            />
          </label>
          <label className="field">
            <span>Meses de proteção</span>
            <input
              type="number"
              value={state.settings.emergencyMonths}
              onChange={(event) =>
                updateState((current) => ({
                  ...current,
                  settings: { ...current.settings, emergencyMonths: Number(event.target.value) },
                }))
              }
            />
          </label>
          <label className="field">
            <span>Renda desejada</span>
            <input
              type="number"
              value={state.settings.desiredMonthlyIncome}
              onChange={(event) =>
                updateState((current) => ({
                  ...current,
                  settings: { ...current.settings, desiredMonthlyIncome: Number(event.target.value) },
                }))
              }
            />
          </label>
        </div>
      </Panel>
      <Panel title="Integrações">
        <div className="mini-metrics">
          <span>Supabase: {supabase ? 'conectado' : 'modo local-first; dados salvos neste navegador'}</span>
          <span>DeepSeek: {hasDeepSeekConfig ? 'conectado' : 'IA avançada pausada; cálculos continuam funcionando'}</span>
          <span>Persistência: Dexie / IndexedDB</span>
        </div>
      </Panel>
      <AuthPanel />
    </div>
  )
}

function AuthPanel() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState(supabase ? 'Faça login para sincronizar com Supabase' : 'Configure Supabase para ativar login')

  const runAuth = async (mode: 'login' | 'signup' | 'logout') => {
    if (!supabase) {
      setStatus('Supabase não configurado no .env')
      return
    }

    const result =
      mode === 'logout'
        ? await supabase.auth.signOut()
        : mode === 'signup'
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password })

    setStatus(result.error ? result.error.message : mode === 'logout' ? 'Sessão encerrada' : 'Sessão ativa')
  }

  return (
    <Panel title="Login Supabase">
      <div className="form-inline">
        <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email" />
        <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="senha" type="password" />
        <button type="button" onClick={() => runAuth('login')}>Entrar</button>
        <button type="button" onClick={() => runAuth('signup')}>Criar conta</button>
        <button type="button" onClick={() => runAuth('logout')}>Sair</button>
      </div>
      <span className="status-pill">{status}</span>
    </Panel>
  )
}

function Onboarding({
  state,
  updateState,
  setRoute,
  snapshot,
}: {
  state: AppState
  updateState: (updater: (current: AppState) => AppState) => void
  setRoute: (route: RouteKey) => void
  snapshot: PlanningSnapshot
}) {
  const userIncome = state.incomeSources.find((income) => income.person === 'Usuário' || income.name === 'Renda atual do usuário')
  const partnerIncome = state.incomeSources.find((income) => income.person === 'Parceira' || income.name === 'Renda atual da parceira')
  const variableIncome = state.incomeSources.find((income) => income.name === 'Renda variável esperada')
  const familyHelp = state.incomeSources.find((income) => income.name === 'Ajuda familiar')
  const otherIncome = state.incomeSources.find((income) => income.name === 'Outras rendas')
  const reserve = state.projects.find((project) => project.type === 'reserva_emergencia')
  const baby = state.projects.find((project) => project.type === 'bebe')
  const home = state.projects.find((project) => project.type === 'casa')
  const car = state.projects.find((project) => project.type === 'carro')
  const upsertIncome = (name: string, person: string, value: number, kind: 'fixa' | 'variavel' | 'eventual' = 'fixa') => {
    updateState((current) => {
      const existing = current.incomeSources.find((income) => income.name === name)
      if (existing) {
        return {
          ...current,
          incomeSources: current.incomeSources.map((income) =>
            income.id === existing.id ? { ...income, expectedAmount: value, receivedAmount: kind === 'fixa' ? value : 0, status: kind === 'fixa' && value > 0 ? 'recebida' : 'prevista' } : income,
          ),
        }
      }
      return {
        ...current,
        incomeSources: [
          ...current.incomeSources,
          {
            id: makeId('income'),
            name,
            person,
            kind,
            expectedAmount: value,
            receivedAmount: kind === 'fixa' ? value : 0,
            recurrence: 'mensal',
            status: kind === 'fixa' && value > 0 ? 'recebida' : 'prevista',
          },
        ],
      }
    })
  }

  return (
    <div className="page-grid">
      <section className="decision-month">
        <div>
          <p className="eyebrow">Quanto precisamos ganhar?</p>
          <h2>Quanto precisamos ganhar para viver essa família?</h2>
          <p>
            Para morar junto, cuidar do bebê e formar reserva, vocês precisam de {money(snapshot.necessaryIncome)} por mês.
            A renda familiar considerada hoje é {money(snapshot.currentIncome)} e o Gap do Plano Familiar é {money(snapshot.incomeGap)}.
          </p>
          <p className="empty-copy">
            Este gap não significa que algo foi lançado errado. Ele mostra quanto falta de renda mensal para cumprir o Plano Familiar configurado.
          </p>
          <p className="empty-copy">
            Prioridade agora: aumentar renda, montar reserva mínima, preparar bebê, preparar casa e adiar carro/investimentos enquanto houver gap nas metas obrigatórias.
          </p>
        </div>
        <div className="decision-metrics">
          <span>Renda prevista familiar: <strong>{money(snapshot.expectedIncome)}</strong></span>
          <span>Renda confirmada no mês: <strong>{money(snapshot.confirmedIncome)}</strong></span>
          <span>Renda pendente: <strong>{money(snapshot.pendingIncome)}</strong></span>
          <span>Renda necessária: <strong>{money(snapshot.necessaryIncome)}</strong></span>
          <span>Gap do Plano Familiar: <strong>{money(snapshot.incomeGap)}</strong></span>
          <span>Status: <strong>{riskCopy[snapshot.risk]}</strong></span>
        </div>
      </section>

      <Panel title="Etapa 1 - Renda familiar">
        <div className="settings-grid">
          <label className="field">
            <span>Nome do usuário</span>
            <input
              value={state.profile.name}
              onChange={(event) => updateState((current) => ({ ...current, profile: { ...current.profile, name: event.target.value } }))}
            />
          </label>
          <label className="field">
            <span>Nome da namorada/parceira</span>
            <input
              value={state.profile.partnerName}
              onChange={(event) => updateState((current) => ({ ...current, profile: { ...current.profile, partnerName: event.target.value } }))}
            />
          </label>
          <label className="field">
            <span>Data prevista do bebê</span>
            <input
              type="date"
              value={state.profile.babyExpectedDate || ''}
              onChange={(event) =>
                updateState((current) => ({ ...current, profile: { ...current.profile, babyExpectedDate: event.target.value } }))
              }
            />
          </label>
          <label className="field">
            <span>Renda atual do usuário</span>
            <input inputMode="decimal" value={userIncome?.receivedAmount ? formatCurrencyBR(userIncome.receivedAmount) : ''} onChange={(event) => upsertIncome('Renda atual do usuário', 'Usuário', parseCurrencyBR(event.target.value))} />
          </label>
          <label className="field">
            <span>Renda atual da parceira</span>
            <input inputMode="decimal" value={partnerIncome?.receivedAmount ? formatCurrencyBR(partnerIncome.receivedAmount) : ''} onChange={(event) => upsertIncome('Renda atual da parceira', 'Parceira', parseCurrencyBR(event.target.value))} />
          </label>
          <label className="field">
            <span>Renda variável esperada</span>
            <input inputMode="decimal" value={variableIncome?.expectedAmount ? formatCurrencyBR(variableIncome.expectedAmount) : ''} onChange={(event) => upsertIncome('Renda variável esperada', 'Família', parseCurrencyBR(event.target.value), 'variavel')} />
          </label>
          <label className="field">
            <span>Ajuda familiar</span>
            <input inputMode="decimal" value={familyHelp?.expectedAmount ? formatCurrencyBR(familyHelp.expectedAmount) : ''} onChange={(event) => upsertIncome('Ajuda familiar', 'Família', parseCurrencyBR(event.target.value), 'eventual')} />
          </label>
          <label className="field">
            <span>Outras rendas</span>
            <input inputMode="decimal" value={otherIncome?.expectedAmount ? formatCurrencyBR(otherIncome.expectedAmount) : ''} onChange={(event) => upsertIncome('Outras rendas', 'Família', parseCurrencyBR(event.target.value), 'eventual')} />
          </label>
          <label className="field">
            <span>Meses de reserva desejados</span>
            <select
              value={state.settings.emergencyMonths}
              onChange={(event) => updateState((current) => ({ ...current, settings: { ...current.settings, emergencyMonths: Number(event.target.value) } }))}
            >
              <option value={3}>3 meses</option>
              <option value={6}>6 meses</option>
              <option value={12}>12 meses</option>
            </select>
          </label>
        </div>
      </Panel>

      <Panel title="Resumo de renda">
        <div className="mini-metrics">
          <span>Renda prevista familiar total: {money(snapshot.expectedIncome)}</span>
          <span>Renda confirmada por lançamentos: {money(snapshot.confirmedIncome)}</span>
          <span>Renda pendente: {money(snapshot.pendingIncome)}</span>
        </div>
      </Panel>

      {baby && (
        <Panel title="Etapa 3 - Bebê / filho">
          <ProjectEditor state={state} project={baby} updateState={updateState} type="bebe" />
          <div className="mini-metrics">
            <span>Falta para o bebê: {money(Math.max(baby.targetAmount - baby.reservedAmount - baby.spentAmount, 0))}</span>
            <span>Meta mensal do bebê: {money(snapshot.monthlyBabyGoal)}</span>
            <span>Impacto mensal futuro: {money(baby.futureMonthlyCost || 0)}</span>
          </div>
          <button type="button" onClick={() => setRoute('bebe')}>Abrir Bebê e Enxoval</button>
        </Panel>
      )}
      {home && (
        <Panel title="Etapa 2 - Morar juntos / Casa">
          <ProjectEditor state={state} project={home} updateState={updateState} type="casa" />
          <div className="mini-metrics">
            <span>Custo mensal futuro da casa: {money(home.futureMonthlyCost || 0)}</span>
            <span>Custo inicial para mudar: {money(home.initialCost || 0)}</span>
            <span>Meta mensal da casa: {money(snapshot.monthlyHomeGoal)}</span>
            <span>Impacto na renda necessária: {money((home.futureMonthlyCost || 0) + snapshot.monthlyHomeGoal)}</span>
          </div>
          <button type="button" onClick={() => setRoute('casa')}>Abrir Casa e Morar Junto</button>
        </Panel>
      )}
      {reserve && (
        <Panel title="Etapa 4 - Reserva de emergência">
          <ProjectEditor state={state} project={reserve} updateState={updateState} type="reserva_emergencia" />
          <div className="mini-metrics">
            <span>Reserva mínima: {money(snapshot.emergencyMinimum)}</span>
            <span>Reserva confortável: {money(snapshot.emergencyComfortable)}</span>
            <span>Reserva ideal: {money(snapshot.emergencyIdeal)}</span>
            <span>Meta mensal da reserva: {money(snapshot.monthlyReserveGoal)}</span>
          </div>
          <button type="button" onClick={() => setRoute('reserva')}>Abrir Reserva de Emergência</button>
        </Panel>
      )}
      {car && (
        <Panel title="Carro">
          <ProjectEditor state={state} project={car} updateState={updateState} type="carro" />
        </Panel>
      )}

      <Panel title="Etapa 5 - Cartão e dívidas">
        <div className="mini-metrics">
          <span>Impacto do cartão neste mês: {money(snapshot.cardImpact)}</span>
          <span>Comprometimento da renda: {percent(snapshot.cardIncomeRate)}</span>
          <span>Cartões cadastrados: {state.creditCards.length}</span>
        </div>
        <button type="button" onClick={() => setRoute('cartoes')}>Abrir Cartões e Dívidas</button>
      </Panel>

      <Panel title="Recomendação da IA">
        <AiSummary state={state} snapshot={snapshot} />
      </Panel>

      <Panel title="Resumo do plano">
        <div className="button-row">
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              updateState((current) => ({ ...current, onboardingComplete: true }))
              setRoute('dashboard')
            }}
          >
            <CheckCircle2 size={18} />
            Salvar Plano Familiar
          </button>
          <button type="button" onClick={() => setRoute('lancamento')}>Lançar primeiro movimento</button>
        </div>
      </Panel>
    </div>
  )
}

function nameById(items: Array<{ id: string; name: string }>, id?: string) {
  return id ? items.find((item) => item.id === id)?.name || id : ''
}

export default App
