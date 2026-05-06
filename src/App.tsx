import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Baby,
  Bot,
  CalendarCheck,
  Car,
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
  SlidersHorizontal,
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
import { createInitialUserState, emptyState, makeId, todayIso } from './data'
import {
  askDeepSeek,
  hasDeepSeekConfig,
  loadLocalState,
  loadRemoteState,
  saveLocalState,
  saveRemoteState,
  supabase,
} from './lib/storage'
import { parseQuickEntry, parseStatement } from './lib/parser'
import {
  calculatePlanning,
  formatShortDate,
  money,
  monthKey,
  monthlyGoal,
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
  | 'ia'
  | 'configuracoes'

const navItems: Array<{ key: RouteKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'lancamento', label: 'Lançamento rápido', icon: Plus },
  { key: 'transacoes', label: 'Transações', icon: ReceiptText },
  { key: 'rendas', label: 'Rendas', icon: CircleDollarSign },
  { key: 'despesas', label: 'Despesas', icon: Wallet },
  { key: 'cartoes', label: 'Cartões', icon: CreditCard },
  { key: 'contas', label: 'Contas', icon: Landmark },
  { key: 'metas', label: 'Metas', icon: PiggyBank },
  { key: 'reserva', label: 'Reserva', icon: Shield },
  { key: 'bebe', label: 'Bebê', icon: Baby },
  { key: 'casa', label: 'Casa', icon: Home },
  { key: 'carro', label: 'Carro', icon: Car },
  { key: 'investimentos', label: 'Investimentos', icon: LineChartIcon },
  { key: 'regularizacao', label: 'Regularização', icon: CalendarCheck },
  { key: 'simulador', label: 'Simulador', icon: SlidersHorizontal },
  { key: 'ia', label: 'IA financeira', icon: Bot },
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

function App() {
  const [state, setState] = useState<AppState>(emptyState)
  const [route, setRoute] = useState<RouteKey>('dashboard')
  const [selectedMonth, setSelectedMonth] = useState(monthKey())
  const [hydrated, setHydrated] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [syncMessage, setSyncMessage] = useState('Carregando')

  useEffect(() => {
    if (!supabase) {
      loadLocalState()
        .then((localState) => {
          if (localState) setState(localState)
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
        setState(emptyState)
        setHydrated(true)
        setSyncMessage('Faça login')
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) {
        setState(emptyState)
        setHydrated(true)
        setSyncMessage('Faça login')
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

    loadRemoteState(user)
      .then(async (remoteState) => {
        const nextState = remoteState ?? createInitialUserState(user.email)
        if (!remoteState) await saveRemoteState(user.id, nextState)
        if (active) {
          setState(nextState)
          setHydrated(true)
          setSyncMessage(remoteState ? 'Sincronizado' : 'Perfil criado')
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

    if (supabase && user) {
      queueMicrotask(() => setSyncMessage('Salvando'))
      saveRemoteState(user.id, state)
        .then(() => setSyncMessage('Sincronizado'))
        .catch((error: Error) => setSyncMessage(error.message))
      return
    }

    if (!supabase) {
      void saveLocalState(state)
    }
  }, [hydrated, state, user])

  const snapshot = useMemo(() => calculatePlanning(state, selectedMonth), [state, selectedMonth])

  const updateState = (updater: (current: AppState) => AppState) => {
    setState((current) => updater(current))
  }

  const addTransaction = (transaction: Transaction) => {
    updateState((current) => applyTransaction(current, transaction))
  }

  const page = {
    dashboard: <Dashboard state={state} snapshot={snapshot} selectedMonth={selectedMonth} setRoute={setRoute} />,
    onboarding: <Onboarding state={state} updateState={updateState} setRoute={setRoute} />,
    lancamento: <QuickEntry state={state} addTransaction={addTransaction} updateState={updateState} />,
    transacoes: <Transactions state={state} selectedMonth={selectedMonth} />,
    rendas: <IncomePage state={state} updateState={updateState} snapshot={snapshot} />,
    despesas: <ExpensesPage state={state} snapshot={snapshot} selectedMonth={selectedMonth} />,
    cartoes: <CardsPage state={state} updateState={updateState} snapshot={snapshot} />,
    contas: <AccountsPage state={state} updateState={updateState} />,
    metas: <GoalsPage state={state} updateState={updateState} />,
    reserva: <ProjectFocus state={state} updateState={updateState} snapshot={snapshot} type="reserva_emergencia" />,
    bebe: <ProjectFocus state={state} updateState={updateState} snapshot={snapshot} type="bebe" />,
    casa: <ProjectFocus state={state} updateState={updateState} snapshot={snapshot} type="casa" />,
    carro: <ProjectFocus state={state} updateState={updateState} snapshot={snapshot} type="carro" />,
    investimentos: <InvestmentsPage snapshot={snapshot} />,
    regularizacao: <Regularization state={state} updateState={updateState} selectedMonth={selectedMonth} />,
    simulador: <Simulator updateState={updateState} snapshot={snapshot} />,
    ia: <AiPage state={state} snapshot={snapshot} />,
    configuracoes: <SettingsPage state={state} updateState={updateState} />,
  }[route]

  if (supabase && hydrated && !user) {
    return (
      <main className="auth-screen">
        <div className="auth-card">
          <div>
            <span className="brand-icon">
              <Wallet size={22} />
            </span>
            <h1>Analista Financeiro</h1>
            <p>Entre com Supabase para usar dados reais. Nenhum dado demo será carregado.</p>
          </div>
          <AuthPanel />
        </div>
      </main>
    )
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
            <small>{hasDeepSeekConfig ? 'DeepSeek configurado' : 'DeepSeek ausente'}</small>
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

function pageTitle(route: RouteKey) {
  return navItems.find((item) => item.key === route)?.label || 'Onboarding inicial'
}

function applyTransaction(state: AppState, transaction: Transaction): AppState {
  const accounts = state.accounts.map((account) => {
    if (transaction.type === 'ganho' && account.id === transaction.accountId) {
      return { ...account, currentBalance: account.currentBalance + transaction.amount }
    }
    if (
      ['despesa', 'compra_planejada', 'pagamento_cartao', 'pagamento_parcela'].includes(transaction.type) &&
      account.id === transaction.accountId
    ) {
      return { ...account, currentBalance: account.currentBalance - transaction.amount }
    }
    if ((transaction.type === 'transferencia' || transaction.type === 'reserva_objetivo') && account.id === transaction.accountId) {
      return { ...account, currentBalance: account.currentBalance - transaction.amount }
    }
    if ((transaction.type === 'transferencia' || transaction.type === 'reserva_objetivo') && account.id === transaction.destinationAccountId) {
      return { ...account, currentBalance: account.currentBalance + transaction.amount }
    }
    return account
  })

  const projects = state.projects.map((project) => {
    if (project.id !== transaction.projectId) return project
    if (transaction.type === 'reserva_objetivo' || transaction.type === 'transferencia') {
      return { ...project, reservedAmount: project.reservedAmount + transaction.amount }
    }
    if (transaction.type === 'despesa' || transaction.type === 'compra_planejada') {
      return { ...project, spentAmount: project.spentAmount + transaction.amount }
    }
    return project
  })

  return {
    ...state,
    accounts,
    projects,
    transactions: [transaction, ...state.transactions],
  }
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
          <h2>Centro de decisões da família</h2>
          <p>
            Renda necessária, metas obrigatórias e riscos recalculados sempre que uma movimentação muda.
          </p>
        </div>
        <div className="score-ring">
          <span>{snapshot.score}</span>
          <small>/100</small>
        </div>
      </section>

      <section className="kpi-grid">
        <Kpi title="Renda atual" value={money(snapshot.currentIncome)} icon={CircleDollarSign} tone="good" />
        <Kpi title="Renda necessária" value={money(snapshot.necessaryIncome)} icon={Wallet} tone="neutral" />
        <Kpi title="Gap de renda" value={money(snapshot.incomeGap)} icon={AlertTriangle} tone={snapshot.incomeGap > 0 ? 'danger' : 'good'} />
        <Kpi title="Saldo livre real" value={money(snapshot.freeBalance)} icon={Landmark} tone="neutral" />
        <Kpi title="Saldo reservado" value={money(snapshot.reservedBalance)} icon={PiggyBank} tone="good" />
        <Kpi title="Reserva necessária" value={money(snapshot.emergencyNeeded)} icon={Shield} tone="warn" />
        <Kpi title="Cartão do mês" value={money(snapshot.cardImpact)} icon={CreditCard} tone={snapshot.cardIncomeRate > 0.35 ? 'danger' : 'neutral'} />
        <Kpi title="Sobra real" value={money(snapshot.realSurplus)} icon={LineChartIcon} tone={snapshot.realSurplus > 0 ? 'good' : 'danger'} />
      </section>

      <section className="split-grid">
        <Panel title="Metas obrigatórias" action={<button type="button" onClick={() => setRoute('metas')}>Abrir</button>}>
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

function QuickEntry({
  state,
  addTransaction,
  updateState,
}: {
  state: AppState
  addTransaction: (transaction: Transaction) => void
  updateState: (updater: (current: AppState) => AppState) => void
}) {
  const [entry, setEntry] = useState('50 gasolina nubank ontem')
  const [statement, setStatement] = useState('25 ABR POSTO SHELL -50,00\n26 ABR PADARIA CENTRAL -12,50\n27 ABR PIX RECEBIDO +100,00\n30 ABR UBER -18,90')
  const [preview, setPreview] = useState<Transaction[]>([])

  const parsed = useMemo(() => parseQuickEntry(entry, state), [entry, state])

  return (
    <div className="page-grid">
      <Panel title="Lançamento rápido">
        <div className="quick-layout">
          <label className="field">
            <span>Digite a movimentação</span>
            <input value={entry} onChange={(event) => setEntry(event.target.value)} placeholder="80 fralda bebê pix 25/04" />
          </label>
          <button
            className="primary-button"
            type="button"
            disabled={!parsed}
            onClick={() => {
              if (parsed) {
                addTransaction(parsed)
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

      <Panel title="Importação de extrato com IA">
        <label className="field">
          <span>Extrato colado</span>
          <textarea value={statement} onChange={(event) => setStatement(event.target.value)} rows={6} />
        </label>
        <div className="button-row">
          <button type="button" onClick={() => setPreview(parseStatement(statement, state))}>
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

function Transactions({ state, selectedMonth }: { state: AppState; selectedMonth: string }) {
  const transactions = state.transactions.filter((transaction) => transaction.competenceMonth === selectedMonth)
  return (
    <Panel title="Lista de transações">
      <TransactionTable transactions={transactions} state={state} />
    </Panel>
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
  const [form, setForm] = useState({ name: 'Freelancer', amount: 500, person: state.profile.name })

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
          <input type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} />
          <button
            type="button"
            onClick={() =>
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
            }
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
}: {
  state: AppState
  updateState: (updater: (current: AppState) => AppState) => void
  snapshot: PlanningSnapshot
}) {
  const [purchase, setPurchase] = useState({ description: 'Compra parcelada', amount: 120, installments: 3 })
  const card = state.creditCards[0]
  return (
    <div className="page-grid">
      <section className="kpi-grid">
        <Kpi title="Fatura prevista" value={money(snapshot.cardImpact)} icon={CreditCard} tone="warn" />
        <Kpi title="Comprometimento" value={percent(snapshot.cardIncomeRate)} icon={AlertTriangle} tone={snapshot.cardIncomeRate > 0.35 ? 'danger' : 'neutral'} />
        <Kpi title="Limite" value={money(card?.limitAmount || 0)} icon={Wallet} tone="neutral" />
      </section>
      <Panel title="Nova compra no cartão">
        <div className="form-inline">
          <input value={purchase.description} onChange={(event) => setPurchase({ ...purchase, description: event.target.value })} />
          <input type="number" value={purchase.amount} onChange={(event) => setPurchase({ ...purchase, amount: Number(event.target.value) })} />
          <input type="number" value={purchase.installments} onChange={(event) => setPurchase({ ...purchase, installments: Number(event.target.value) })} />
          <button
            type="button"
            onClick={() =>
              updateState((current) => ({
                ...current,
                cardPurchases: [
                  {
                    id: makeId('cardp'),
                    cardId: card.id,
                    purchaseDate: todayIso(),
                    description: purchase.description,
                    amount: purchase.amount,
                    installments: Math.max(purchase.installments, 1),
                    currentInstallment: 1,
                  },
                  ...current.cardPurchases,
                ],
              }))
            }
          >
            <Plus size={18} />
            Adicionar
          </button>
        </div>
        <CardPurchaseList purchases={state.cardPurchases} cards={state.creditCards} />
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
  const [name, setName] = useState('Nova conta')
  return (
    <Panel title="Contas e caixinhas">
      <div className="form-inline">
        <input value={name} onChange={(event) => setName(event.target.value)} />
        <button
          type="button"
          onClick={() =>
            updateState((current) => ({
              ...current,
              accounts: [
                ...current.accounts,
                {
                  id: makeId('acc'),
                  name,
                  type: 'corrente',
                  initialBalance: 0,
                  currentBalance: 0,
                  isGoalAccount: false,
                  active: true,
                },
              ],
            }))
          }
        >
          <Plus size={18} />
          Adicionar
        </button>
      </div>
      <div className="account-grid">
        {state.accounts.map((account) => (
          <article className="account-card" key={account.id}>
            <strong>{account.name}</strong>
            <span>{account.type}</span>
            <b>{money(account.currentBalance)}</b>
          </article>
        ))}
      </div>
    </Panel>
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

function ProjectFocus({
  state,
  updateState,
  snapshot,
  type,
}: {
  state: AppState
  updateState: (updater: (current: AppState) => AppState) => void
  snapshot: PlanningSnapshot
  type: Project['type']
}) {
  const project = state.projects.find((item) => item.type === type)
  const [itemName, setItemName] = useState(type === 'bebe' ? 'Carrinho' : 'Item planejado')

  if (!project) return <Panel title="Projeto"><p>Projeto não configurado.</p></Panel>

  const items = state.plannedItems.filter((item) => item.projectId === project.id)
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
      </section>
      <Panel title={project.name}>
        <ProgressRow label="Progresso" value={project.reservedAmount + project.spentAmount} max={project.targetAmount} />
        {type === 'reserva_emergencia' && (
          <div className="mini-metrics">
            <span>Mínima: {money(snapshot.emergencyMinimum)}</span>
            <span>Confortável: {money(snapshot.emergencyComfortable)}</span>
            <span>Ideal: {money(snapshot.emergencyIdeal)}</span>
          </div>
        )}
      </Panel>
      <Panel title="Itens planejados">
        <div className="form-inline">
          <input value={itemName} onChange={(event) => setItemName(event.target.value)} />
          <button
            type="button"
            onClick={() =>
              updateState((current) => ({
                ...current,
                plannedItems: [
                  ...current.plannedItems,
                  {
                    id: makeId('item'),
                    projectId: project.id,
                    name: itemName,
                    category: project.name,
                    estimatedAmount: 0,
                    realAmount: 0,
                    priority: 'media',
                    status: 'planejado',
                  },
                ],
              }))
            }
          >
            <Plus size={18} />
            Adicionar
          </button>
        </div>
        <PlannedItemList items={items} />
      </Panel>
    </div>
  )
}

function PlannedItemList({ items }: { items: PlannedItem[] }) {
  return (
    <div className="item-list">
      {items.map((item) => (
        <div className="list-row" key={item.id}>
          <strong>{item.name}</strong>
          <span>{item.category}</span>
          <span>{item.priority}</span>
          <span>{item.status}</span>
          <span>{money(item.realAmount || item.estimatedAmount)}</span>
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
            : 'recomendados agora, porque ainda existe gap para reserva, bebê ou casa.'}
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
}: {
  state: AppState
  updateState: (updater: (current: AppState) => AppState) => void
  selectedMonth: string
}) {
  const reviews = state.dayReviews.filter((review) => review.competenceMonth === selectedMonth)
  const pending = reviews.filter((review) => review.status === 'pending')

  const markDay = (review: DayReview, status: DayReview['status']) => {
    updateState((current) => ({
      ...current,
      dayReviews: current.dayReviews.map((item) =>
        item.id === review.id ? { ...item, status, reviewedAt: new Date().toISOString() } : item,
      ),
    }))
  }

  return (
    <Panel title="Regularização de mês incompleto">
      <div className="decision-card">
        <strong>{pending.length ? `${pending.length} dias pendentes` : 'Mês pronto para fechamento'}</strong>
        <span>
          {pending.length
            ? `Faltam revisar: ${pending.map((review) => formatShortDate(review.date)).join(', ')}.`
            : 'Todos os dias estão revisados ou marcados sem movimento.'}
        </span>
      </div>
      <div className="calendar-grid">
        {reviews.map((review) => (
          <div className={`day-cell ${review.status}`} key={review.id}>
            <strong>{formatShortDate(review.date)}</strong>
            <span>{review.status}</span>
            {review.status === 'pending' && (
              <div>
                <button type="button" onClick={() => markDay(review, 'reviewed')}>Revisado</button>
                <button type="button" onClick={() => markDay(review, 'no_movement')}>Sem mov.</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Panel>
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

function AiPage({ state, snapshot }: { state: AppState; snapshot: PlanningSnapshot }) {
  const [question, setQuestion] = useState('Qual é meu gap de renda para cumprir bebê, casa e reserva?')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)

  const fallbackAnswer = () => {
    const facts = [
      `Dados analisados: renda atual ${money(snapshot.currentIncome)}, custo essencial ${money(snapshot.essentialCost)} e metas obrigatórias ${money(snapshot.mandatoryMonthlyGoals)}.`,
      `Cálculos principais: renda necessária ${money(snapshot.necessaryIncome)} e gap ${money(snapshot.incomeGap)}.`,
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
      const prompt = `${question}\n\nDados: ${JSON.stringify({ snapshot, projects: state.projects, cards: state.cardPurchases })}`
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
          <span>Supabase: {supabase ? 'conectado' : 'aguardando VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY'}</span>
          <span>DeepSeek: {hasDeepSeekConfig ? 'conectado' : 'aguardando VITE_DEEPSEEK_API_KEY'}</span>
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
  const [status, setStatus] = useState(supabase ? 'Aguardando login' : 'Configure Supabase para ativar login')

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
}: {
  state: AppState
  updateState: (updater: (current: AppState) => AppState) => void
  setRoute: (route: RouteKey) => void
}) {
  return (
    <Panel title="Diagnóstico inicial">
      <div className="settings-grid">
        <label className="field">
          <span>Nome do usuário</span>
          <input
            value={state.profile.name}
            onChange={(event) => updateState((current) => ({ ...current, profile: { ...current.profile, name: event.target.value } }))}
          />
        </label>
        <label className="field">
          <span>Nome da namorada/esposa</span>
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
      </div>
      <button
        className="primary-button"
        type="button"
        onClick={() => {
          updateState((current) => ({ ...current, onboardingComplete: true }))
          setRoute('dashboard')
        }}
      >
        <CheckCircle2 size={18} />
        Gerar resultado inicial
      </button>
    </Panel>
  )
}

function nameById(items: Array<{ id: string; name: string }>, id?: string) {
  return id ? items.find((item) => item.id === id)?.name || id : ''
}

export default App
