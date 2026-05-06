import { competenceFromDate, makeId } from '../data'
import type { AppState, Transaction, TransactionType } from '../types'

const today = () => new Date()

const toIso = (date: Date) => date.toISOString().slice(0, 10)

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()

const parseBrazilianDate = (text: string) => {
  const lower = normalize(text)
  const now = today()

  if (lower.includes('ONTEM')) {
    const date = new Date(now)
    date.setDate(date.getDate() - 1)
    return toIso(date)
  }

  if (lower.includes('HOJE')) return toIso(now)

  const match = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/)
  if (!match) return toIso(now)

  const day = Number(match[1])
  const month = Number(match[2])
  const year = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : now.getFullYear()
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const categoryByKeyword = (state: AppState, text: string) => {
  const normalized = normalize(text)
  const rule = state.classificationRules.find((item) => normalized.includes(normalize(item.keyword)))
  if (rule?.categoryId) return rule.categoryId

  const category = state.categories.find((item) => normalized.includes(normalize(item.name)))
  if (category) return category.id

  const byName = (name: string) => state.categories.find((item) => normalize(item.name) === normalize(name))?.id
  if (normalized.includes('GASOLINA') || normalized.includes('POSTO')) return byName('Combustível')
  if (normalized.includes('MERCADO') || normalized.includes('PADARIA') || normalized.includes('IFOOD')) return byName('Alimentação')
  if (normalized.includes('FRALDA') || normalized.includes('BEBE')) return byName('Bebê')
  if (normalized.includes('FARMACIA') || normalized.includes('DROGARIA')) return byName('Farmácia')
  if (normalized.includes('UBER') || normalized.includes('TRANSPORTE')) return byName('Transporte')
  if (normalized.includes('ESTAGIO') || normalized.includes('FREELANCER')) return byName('Renda')
  return byName('Outros')
}

const accountByKeyword = (state: AppState, text: string) => {
  const normalized = normalize(text)
  return state.accounts.find((account) => normalized.includes(normalize(account.name)))?.id || state.accounts[0]?.id
}

const projectByKeyword = (state: AppState, text: string) => {
  const normalized = normalize(text)
  if (normalized.includes('BEBE') || normalized.includes('FRALDA')) return state.projects.find((project) => project.type === 'bebe')?.id
  if (normalized.includes('CASA') || normalized.includes('MORAR')) return state.projects.find((project) => project.type === 'casa')?.id
  if (normalized.includes('CARRO')) return state.projects.find((project) => project.type === 'carro')?.id
  if (normalized.includes('RESERVA')) return state.projects.find((project) => project.type === 'reserva_emergencia')?.id
  return undefined
}

const transactionType = (text: string, amount: number): TransactionType => {
  const normalized = normalize(text)
  if (amount > 0 && (normalized.includes('RECEBIDO') || normalized.includes('ESTAGIO') || normalized.includes('SALARIO'))) return 'ganho'
  if (normalized.includes('GUARDAR') || normalized.includes('RESERVAR') || normalized.includes('CAIXINHA')) return 'reserva_objetivo'
  if (normalized.includes('TRANSFERIR') || normalized.includes('ENVIADOS') || normalized.includes('TRANSFERENCIA')) return 'transferencia'
  if (normalized.includes('FATURA') || normalized.includes('PAGAMENTO CARTAO')) return 'pagamento_cartao'
  if (amount > 0) return 'ganho'
  return 'despesa'
}

export function parseQuickEntry(input: string, state: AppState): Transaction | null {
  const valueMatch = input.match(/[-+]?\s*(?:R\$\s*)?(\d+(?:[.,]\d{1,2})?)/i)
  if (!valueMatch) return null

  const signed = input.trim().startsWith('-') ? -1 : 1
  const amount = Math.abs(Number(valueMatch[1].replace(',', '.'))) * (signed < 0 ? -1 : 1)
  const date = parseBrazilianDate(input)
  const type = transactionType(input, amount)
  const normalizedAmount = Math.abs(amount)
  const projectId = projectByKeyword(state, input)
  const categoryId = categoryByKeyword(state, input)
  const accountId = accountByKeyword(state, input)
  const destinationAccountId =
    type === 'reserva_objetivo' || type === 'transferencia'
      ? state.accounts.find((account) => projectId && account.goalId === projectId)?.id
      : undefined

  return {
    id: makeId('tx'),
    transactionDate: date,
    competenceMonth: competenceFromDate(date),
    type,
    amount: normalizedAmount,
    description: input
      .replace(valueMatch[0], '')
      .replace(/\b(hoje|ontem)\b/gi, '')
      .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, '')
      .trim(),
    categoryId,
    projectId,
    accountId,
    destinationAccountId,
    paymentMethod: normalize(input).includes('PIX') ? 'pix' : normalize(input).includes('CREDITO') ? 'credito' : 'debito',
    status: 'confirmed',
    source: 'quick',
    aiConfidence: 0.74,
    rawText: input,
    syncStatus: 'salvo_localmente',
  }
}

const monthMap: Record<string, string> = {
  JAN: '01',
  FEV: '02',
  MAR: '03',
  ABR: '04',
  MAI: '05',
  JUN: '06',
  JUL: '07',
  AGO: '08',
  SET: '09',
  OUT: '10',
  NOV: '11',
  DEZ: '12',
}

export function parseStatement(statement: string, state: AppState): Transaction[] {
  const parsed: Array<Transaction | null> = statement
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d{1,2})\s+([A-Za-zÇÃÁÉÍÓÚÂÊÔ]{3})\s+(.+?)\s+([+-]?\d+(?:[.,]\d{2}))$/i)
      if (!match) return null

      const day = match[1].padStart(2, '0')
      const month = monthMap[normalize(match[2]).slice(0, 3)] || String(today().getMonth() + 1).padStart(2, '0')
      const year = today().getFullYear()
      const date = `${year}-${month}-${day}`
      const amount = Number(match[4].replace(',', '.'))
      const type = transactionType(`${match[3]} ${amount > 0 ? 'recebido' : ''}`, amount)

      return {
        id: makeId('tx'),
        transactionDate: date,
        competenceMonth: competenceFromDate(date),
        type,
        amount: Math.abs(amount),
        description: match[3],
        categoryId: categoryByKeyword(state, match[3]),
        projectId: projectByKeyword(state, match[3]),
        accountId: state.accounts[0]?.id,
        paymentMethod: 'extrato',
        status: 'confirmed',
        source: 'statement',
        aiConfidence: 0.82,
        rawText: line,
        syncStatus: 'salvo_localmente',
      } satisfies Transaction
    })
  return parsed.filter((transaction): transaction is Transaction => transaction !== null)
}
