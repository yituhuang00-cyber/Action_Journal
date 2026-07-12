import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase'
import { normalizeActionRecord, normalizeExerciseRecord } from '../lib/actionRecord'
import {
  fetchLegacyCloudState,
  fetchNormalizedState,
  getSyncStatus,
  persistNormalizedState,
  setSyncStatus,
  STORAGE_STATUS_EVENT,
} from './cloudSync'

const STORAGE_KEY = 'action-journal:state'
const STORAGE_OWNER_KEY = 'action-journal:state-owner'
const STORAGE_SYNC_META_KEY = 'action-journal:state-sync-meta'
const STORAGE_SAFETY_BACKUP_KEY = 'action-journal:state-safety-backup:last'
export const STORAGE_SYNC_EVENT = 'action-journal:state-changed'
export { STORAGE_STATUS_EVENT, getSyncStatus }

const DEFAULT_STATE = {
  goals: {},
  actions: {},
  exerciseGoals: {},
  exerciseActions: {},
  writingTemplates: {},
  writingEntries: {},
  weeklyPlans: {},
  dailyPlans: {},
  dailyAchievements: {},
  settings: { conservativeMinutes: 60, ambitiousMinutes: 180 },
}

let memoryState = null
let initializationPromise = null
let currentUserId = null
let remoteWriteChain = Promise.resolve()

function hasBrowserStorage() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state))
}

function emitStateChange() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(STORAGE_SYNC_EVENT))
}

function readLocalOwner() {
  if (!hasBrowserStorage()) return ''
  return localStorage.getItem(STORAGE_OWNER_KEY) || ''
}

function writeLocalOwner(userId) {
  if (!hasBrowserStorage()) return
  if (userId) {
    localStorage.setItem(STORAGE_OWNER_KEY, userId)
    return
  }

  localStorage.removeItem(STORAGE_OWNER_KEY)
}

function readLocalSyncMeta() {
  if (!hasBrowserStorage()) {
    return { pending: false, lastLocalChangeAt: '', lastSuccessfulSyncAt: '' }
  }

  try {
    const raw = localStorage.getItem(STORAGE_SYNC_META_KEY)
    if (!raw) {
      return { pending: false, lastLocalChangeAt: '', lastSuccessfulSyncAt: '' }
    }

    const parsed = JSON.parse(raw)
    return {
      pending: Boolean(parsed?.pending),
      lastLocalChangeAt: typeof parsed?.lastLocalChangeAt === 'string' ? parsed.lastLocalChangeAt : '',
      lastSuccessfulSyncAt: typeof parsed?.lastSuccessfulSyncAt === 'string' ? parsed.lastSuccessfulSyncAt : '',
    }
  } catch {
    return { pending: false, lastLocalChangeAt: '', lastSuccessfulSyncAt: '' }
  }
}

function writeLocalSyncMeta(patch) {
  if (!hasBrowserStorage()) return { pending: false, lastLocalChangeAt: '', lastSuccessfulSyncAt: '' }

  const nextMeta = { ...readLocalSyncMeta(), ...patch }
  localStorage.setItem(STORAGE_SYNC_META_KEY, JSON.stringify(nextMeta))
  return nextMeta
}

function markLocalStatePending() {
  return writeLocalSyncMeta({
    pending: true,
    lastLocalChangeAt: new Date().toISOString(),
  })
}

function markLocalStateSynced(syncedAt = new Date().toISOString()) {
  return writeLocalSyncMeta({
    pending: false,
    lastSuccessfulSyncAt: syncedAt,
  })
}

const SUB_TARGET_STATUS_SET = new Set(['want', 'doing', 'done'])

function uid(prefix = '') {
  return prefix + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)
}

function createDefaultState() {
  return {
    goals: {},
    actions: {},
    exerciseGoals: {},
    exerciseActions: {},
    writingTemplates: {},
    writingEntries: {},
    weeklyPlans: {},
    dailyPlans: {},
    dailyAchievements: {},
    settings: { conservativeMinutes: 60, ambitiousMinutes: 180 },
  }
}

function normalizeWritingTemplateSection(section = {}, previousSection = null) {
  return {
    id: section.id || previousSection?.id || uid('wts-'),
    question: typeof section.question === 'string' ? section.question : previousSection?.question || '',
    prompt: typeof section.prompt === 'string' ? section.prompt : previousSection?.prompt || '',
  }
}

function normalizeWritingTemplate(template = {}, templateId = template.id) {
  const previousSections = Array.isArray(template.sections) ? template.sections : []
  return {
    id: template.id || templateId || uid('wt-'),
    title: typeof template.title === 'string' ? template.title : '',
    purpose: typeof template.purpose === 'string' ? template.purpose : '',
    sections: previousSections.map((section) => normalizeWritingTemplateSection(section)),
    createdAt: typeof template.createdAt === 'string' ? template.createdAt : new Date().toISOString(),
    updatedAt: typeof template.updatedAt === 'string' ? template.updatedAt : new Date().toISOString(),
  }
}

function normalizeWritingAnswer(answer = {}, previousAnswer = null) {
  return {
    sectionId: typeof answer.sectionId === 'string' ? answer.sectionId : previousAnswer?.sectionId || '',
    content: typeof answer.content === 'string' ? answer.content : previousAnswer?.content || '',
  }
}

function normalizeWritingEntry(entry = {}, entryId = entry.id) {
  const now = new Date().toISOString()
  return {
    id: entry.id || entryId || uid('we-'),
    templateId: typeof entry.templateId === 'string' ? entry.templateId : '',
    answers: Array.isArray(entry.answers) ? entry.answers.map((answer) => normalizeWritingAnswer(answer)) : [],
    createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : now,
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : now,
  }
}

function normalizeWeeklyPlanRef(ref) {
  if (!ref || typeof ref !== 'object') return null
  const goalId = typeof ref.goalId === 'string' ? ref.goalId : ''
  const subTargetId = typeof ref.subTargetId === 'string' ? ref.subTargetId : ''
  if (!goalId || !subTargetId) return null
  return { goalId, subTargetId }
}

function normalizeWeeklyPlanRefs(refs) {
  return Array.isArray(refs)
    ? refs
        .map(normalizeWeeklyPlanRef)
        .filter(Boolean)
        .filter((ref, index, allRefs) => allRefs.findIndex((item) => item.goalId === ref.goalId && item.subTargetId === ref.subTargetId) === index)
    : []
}

function normalizeWeeklyHourTarget(value, fallback) {
  const nextValue = Number(value)
  if (!Number.isFinite(nextValue) || nextValue <= 0) return fallback
  return nextValue
}

function normalizeWeeklyPlan(plan = {}, weekKey = '') {
  const legacyRefs = normalizeWeeklyPlanRefs(plan.subTargetRefs)
  const conservativeSubTargetRefs = normalizeWeeklyPlanRefs(plan.conservativeSubTargetRefs)
  const ambitiousSubTargetRefs = normalizeWeeklyPlanRefs(plan.ambitiousSubTargetRefs)
  const nextConservativeRefs = conservativeSubTargetRefs.length ? conservativeSubTargetRefs : legacyRefs
  const nextAmbitiousRefs = ambitiousSubTargetRefs.length ? ambitiousSubTargetRefs : nextConservativeRefs
  const unionRefMap = new Map()
  nextConservativeRefs.concat(nextAmbitiousRefs).forEach((ref) => {
    unionRefMap.set(`${ref.goalId}::${ref.subTargetId}`, ref)
  })
  const subTargetRefs = Array.from(unionRefMap.values())
  const conservativeHoursTarget = normalizeWeeklyHourTarget(plan.conservativeHoursTarget, 12)
  const ambitiousHoursTarget = normalizeWeeklyHourTarget(
    plan.ambitiousHoursTarget,
    Math.max(conservativeHoursTarget, 24),
  )

  return {
    weekKey: plan.weekKey || weekKey,
    startDate: normalizeDateOnly(plan.startDate, ''),
    endDate: normalizeDateOnly(plan.endDate, ''),
    conservativeHoursTarget,
    ambitiousHoursTarget,
    conservativeSubTargetRefs: nextConservativeRefs,
    ambitiousSubTargetRefs: nextAmbitiousRefs,
    subTargetRefs,
    confirmedAt: typeof plan.confirmedAt === 'string' ? plan.confirmedAt : '',
  }
}

function normalizeDateOnly(value, fallback = '') {
  if (typeof value !== 'string' || !value.trim()) return fallback
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return fallback
  return parsed.toISOString().slice(0, 10)
}

function normalizeSubTarget(subTarget = {}, previousSubTarget = null) {
  const now = new Date().toISOString()
  const nextStatus = SUB_TARGET_STATUS_SET.has(subTarget.status)
    ? subTarget.status
    : previousSubTarget?.status || 'want'
  const legacyWhen = typeof subTarget.when === 'string' ? subTarget.when : previousSubTarget?.when || ''
  const startDate = normalizeDateOnly(
    subTarget.startDate,
    normalizeDateOnly(previousSubTarget?.startDate, normalizeDateOnly(legacyWhen, '')),
  )
  const endDate = normalizeDateOnly(
    subTarget.endDate,
    normalizeDateOnly(previousSubTarget?.endDate, normalizeDateOnly(legacyWhen, '')),
  )
  const estimatedHoursValue = Number(
    Object.prototype.hasOwnProperty.call(subTarget, 'estimatedHours')
      ? subTarget.estimatedHours
      : previousSubTarget?.estimatedHours,
  )

  return {
    id: subTarget.id || previousSubTarget?.id || uid('st-'),
    startDate,
    endDate,
    content: typeof subTarget.content === 'string' ? subTarget.content : previousSubTarget?.content || '',
    estimatedHours: Number.isFinite(estimatedHoursValue) && estimatedHoursValue > 0
      ? Math.round(estimatedHoursValue * 100) / 100
      : null,
    status: nextStatus,
    createdAt: previousSubTarget?.createdAt || subTarget.createdAt || now,
    updatedAt: subTarget.updatedAt || now,
  }
}

function normalizeSubTargets(subTargets, previousSubTargets = []) {
  if (!Array.isArray(subTargets)) return []

  const previousMap = new Map(previousSubTargets.map((subTarget) => [subTarget.id, subTarget]))
  return subTargets.map((subTarget) => normalizeSubTarget(subTarget, previousMap.get(subTarget?.id) || null))
}

function normalizeGoal(goal = {}, goalId = goal.id) {
  return {
    ...goal,
    id: goal.id || goalId,
    subTargets: normalizeSubTargets(goal.subTargets || []),
  }
}

function normalizeExerciseGoal(goal = {}, goalId = goal.id) {
  return {
    ...goal,
    id: goal.id || goalId,
    title: typeof goal.title === 'string' ? goal.title : '',
    reasons: Array.isArray(goal.reasons) ? goal.reasons.filter(Boolean) : [],
    supports: Array.isArray(goal.supports) ? goal.supports.filter(Boolean) : [],
    status: goal.status || 'want',
    startDate: normalizeDateOnly(goal.startDate, ''),
    completedDate: normalizeDateOnly(goal.completedDate, ''),
  }
}

function normalizeExerciseAction(action = {}, actionId = action.id) {
  return normalizeExerciseRecord({
    ...action,
    id: action.id || actionId || uid('ea-'),
  }, actionId)
}

function normalizeState(rawState = {}) {
  const parsed = rawState && typeof rawState === 'object' ? { ...createDefaultState(), ...rawState } : createDefaultState()
  parsed.goals = Object.fromEntries(
    Object.entries(parsed.goals || {}).map(([id, goal]) => [id, normalizeGoal(goal, id)]),
  )
  parsed.actions = Object.fromEntries(
    Object.entries(parsed.actions || {}).map(([id, action]) => [id, normalizeActionRecord(action, id)]),
  )
  parsed.exerciseGoals = Object.fromEntries(
    Object.entries(parsed.exerciseGoals || {}).map(([id, goal]) => [id, normalizeExerciseGoal(goal, id)]),
  )
  parsed.exerciseActions = Object.fromEntries(
    Object.entries(parsed.exerciseActions || {}).map(([id, action]) => [id, normalizeExerciseAction(action, id)]),
  )
  parsed.writingTemplates = Object.fromEntries(
    Object.entries(parsed.writingTemplates || {}).map(([id, template]) => [id, normalizeWritingTemplate(template, id)]),
  )
  parsed.writingEntries = Object.fromEntries(
    Object.entries(parsed.writingEntries || {}).map(([id, entry]) => [id, normalizeWritingEntry(entry, id)]),
  )
  parsed.weeklyPlans = Object.fromEntries(
    Object.entries(parsed.weeklyPlans || {}).map(([weekKey, plan]) => [weekKey, normalizeWeeklyPlan(plan, weekKey)]),
  )
  parsed.settings = { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) }
  parsed.dailyPlans = parsed.dailyPlans || {}
  parsed.dailyAchievements = parsed.dailyAchievements || {}
  return parsed
}

function readLocalState() {
  try {
    if (!hasBrowserStorage()) return createDefaultState()
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultState()
    const normalized = normalizeState(JSON.parse(raw))

    const nextRaw = JSON.stringify(normalized)
    if (raw !== nextRaw) {
      localStorage.setItem(STORAGE_KEY, nextRaw)
    }

    return normalized
  } catch (e) {
    console.error('读取存储失败', e)
    return createDefaultState()
  }
}

function readState() {
  if (!memoryState) {
    memoryState = readLocalState()
  }

  return memoryState
}

function countMeaningfulData(state) {
  if (!state) return 0

  return [
    'goals',
    'actions',
    'exerciseGoals',
    'exerciseActions',
    'writingTemplates',
    'writingEntries',
    'weeklyPlans',
    'dailyPlans',
    'dailyAchievements',
  ].reduce((total, key) => total + Object.keys(state[key] || {}).length, 0)
}

function hasMeaningfulData(state) {
  return countMeaningfulData(state) > 0
}

function writeLocalSafetyBackup(reason, state, ownerId = readLocalOwner()) {
  if (!hasBrowserStorage() || !hasMeaningfulData(state)) return

  try {
    localStorage.setItem(STORAGE_SAFETY_BACKUP_KEY, JSON.stringify({
      reason,
      ownerId,
      createdAt: new Date().toISOString(),
      itemCount: countMeaningfulData(state),
      state,
    }))
  } catch (error) {
    console.warn('Failed to write local safety backup', error)
  }
}

function persistLocalState(state, { emit = true, ownerId = currentUserId || readLocalOwner(), markPending = false, syncedAt = '' } = {}) {
  const nextState = normalizeState(state)
  memoryState = nextState

  if (hasBrowserStorage()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState))
  }

  writeLocalOwner(ownerId)

  if (markPending) {
    markLocalStatePending()
  } else if (syncedAt) {
    markLocalStateSynced(syncedAt)
  }

  if (emit) {
    emitStateChange()
  }

  return nextState
}

async function persistRemoteStateForUser(userId, state) {
  return persistNormalizedState(userId, state)
}

function queueRemoteWrite(state) {
  const userId = currentUserId
  if (!userId) return remoteWriteChain

  const snapshot = cloneState(state)
  setSyncStatus({ phase: 'syncing', pending: true, lastError: '' })
  remoteWriteChain = remoteWriteChain
    .catch(() => undefined)
    .then(() => persistRemoteStateForUser(userId, snapshot))
    .then(() => {
      const syncedAt = new Date().toISOString()
      markLocalStateSynced(syncedAt)
      setSyncStatus({ phase: 'synced', pending: false, lastError: '', lastSyncedAt: syncedAt })
    })
    .catch((error) => {
      console.error('同步云端数据失败', error)
      setSyncStatus({ phase: 'error', pending: false, lastError: error.message || '同步云端数据失败' })
    })

  return remoteWriteChain
}

async function getSessionFromClient(providedSession) {
  if (typeof providedSession !== 'undefined') return providedSession

  const client = getSupabaseClient()
  if (!client) return null

  const { data, error } = await client.auth.getSession()
  if (error) throw error
  return data.session ?? null
}

export async function initializeStorage({ session, forceRefresh = false } = {}) {
  if (!forceRefresh && initializationPromise) {
    return initializationPromise
  }

  initializationPromise = (async () => {
    const activeSession = await getSessionFromClient(session)

    if (!isSupabaseConfigured() || !activeSession?.user?.id) {
      currentUserId = activeSession?.user?.id || null
      memoryState = readLocalState()
      setSyncStatus({
        phase: isSupabaseConfigured() ? 'signed-out' : 'not-configured',
        pending: false,
        lastError: '',
      })
      return memoryState
    }

    const userId = activeSession.user.id
    if (!forceRefresh && currentUserId === userId && memoryState) {
      return memoryState
    }

    currentUserId = userId
    setSyncStatus({ phase: 'loading', pending: true, lastError: '' })

    const localState = readLocalState()
    const localOwner = readLocalOwner()
    const localSyncMeta = readLocalSyncMeta()
    const normalizedRemoteState = await fetchNormalizedState(userId)

    if (normalizedRemoteState) {
      const localDataCount = countMeaningfulData(localState)
      const remoteDataCount = countMeaningfulData(normalizedRemoteState)

      if (remoteDataCount === 0 && localDataCount > 0 && (!localOwner || localOwner === userId)) {
        await persistRemoteStateForUser(userId, localState)
        const syncedAt = new Date().toISOString()
        const nextState = persistLocalState(localState, { ownerId: userId, syncedAt })
        setSyncStatus({ phase: 'synced', pending: false, lastError: '', lastSyncedAt: syncedAt })
        return nextState
      }

      if (localOwner === userId && localSyncMeta.pending) {
        if (localDataCount === 0 && remoteDataCount > 0) {
          console.warn('Skipped syncing empty local state over existing cloud data.')
          const syncedAt = new Date().toISOString()
          const nextState = persistLocalState(normalizedRemoteState, { ownerId: userId, syncedAt })
          setSyncStatus({ phase: 'synced', pending: false, lastError: '', lastSyncedAt: syncedAt })
          return nextState
        }

        await persistRemoteStateForUser(userId, localState)
        const syncedAt = new Date().toISOString()
        const nextState = persistLocalState(localState, { ownerId: userId, syncedAt })
        setSyncStatus({ phase: 'synced', pending: false, lastError: '', lastSyncedAt: syncedAt })
        return nextState
      }

      const syncedAt = new Date().toISOString()
      if (localDataCount > remoteDataCount) {
        writeLocalSafetyBackup('before-cloud-refresh', localState, localOwner || userId)
      }
      const nextState = persistLocalState(normalizedRemoteState, { ownerId: userId, syncedAt })
      setSyncStatus({ phase: 'synced', pending: false, lastError: '', lastSyncedAt: syncedAt })
      return nextState
    }

    const legacyCloudState = await fetchLegacyCloudState(userId)

    if (legacyCloudState) {
      const nextState = persistLocalState(legacyCloudState, { ownerId: userId })
      await persistRemoteStateForUser(userId, nextState)
      const syncedAt = new Date().toISOString()
      persistLocalState(nextState, { emit: false, ownerId: userId, syncedAt })
      setSyncStatus({ phase: 'synced', pending: false, lastError: '', lastSyncedAt: syncedAt })
      return nextState
    }

    const seedState = hasMeaningfulData(localState) && (!localOwner || localOwner === userId)
      ? localState
      : createDefaultState()

    if (!hasMeaningfulData(seedState) && hasMeaningfulData(localState)) {
      writeLocalSafetyBackup('before-empty-account-seed', localState, localOwner)
    }

    persistLocalState(seedState, { ownerId: userId })
    await persistRemoteStateForUser(userId, seedState)
    const syncedAt = new Date().toISOString()
    persistLocalState(seedState, { emit: false, ownerId: userId, syncedAt })
    setSyncStatus({ phase: 'synced', pending: false, lastError: '', lastSyncedAt: syncedAt })
    return memoryState
  })()
    .catch((error) => {
      console.error('初始化云端存储失败', error)
      memoryState = readLocalState()
      setSyncStatus({ phase: 'error', pending: false, lastError: error.message || '初始化云端存储失败' })
      return memoryState
    })
    .finally(() => {
      initializationPromise = null
    })

  return initializationPromise
}

export async function refreshStorageFromCloud() {
  return initializeStorage({ forceRefresh: true })
}

export async function retryStorageSync() {
  if (!currentUserId) return false
  await queueRemoteWrite(readState())
  return true
}

function writeState(state) {
  const nextState = persistLocalState(state, { markPending: true })
  void queueRemoteWrite(nextState)
}

export function listGoals() {
  const s = readState()
  return Object.values(s.goals).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function getGoal(id) {
  const s = readState()
  return s.goals[id] || null
}

export function createGoal(payload) {
  const s = readState()
  const id = uid('g-')
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  const goal = {
    id,
    title: payload.title || '未命名目标',
    reasons: payload.reasons || [],
    expectedOutcome: payload.expectedOutcome || '',
    supports: payload.supports || [],
    factors: payload.factors || [],
    // status: 'want' | 'doing' | 'done'
    status: payload.status || 'want',
    // goal lifecycle dates (YYYY-MM-DD)
    startDate: payload.startDate || today,
    completedDate: payload.completedDate || null,
    subTargets: normalizeSubTargets(payload.subTargets || []),
    createdAt: now,
    updatedAt: now,
  }
  s.goals[id] = goal
  writeState(s)
  return goal
}

export function updateGoal(id, patch) {
  const s = readState()
  if (!s.goals[id]) return null

  const prev = s.goals[id]
  const updatedAt = new Date().toISOString()
  const today = updatedAt.slice(0, 10)
  const nextPatch = { ...patch }

  if (Object.prototype.hasOwnProperty.call(nextPatch, 'subTargets')) {
    nextPatch.subTargets = normalizeSubTargets(nextPatch.subTargets, prev.subTargets || [])
  }

  if (Object.prototype.hasOwnProperty.call(nextPatch, 'status')) {
    const nextStatus = nextPatch.status
    const prevStatus = prev.status

    // When switching into done, record completion date.
    if (nextStatus === 'done' && prevStatus !== 'done') {
      if (!Object.prototype.hasOwnProperty.call(nextPatch, 'completedDate')) {
        nextPatch.completedDate = today
      }
    }

    // When switching out of done, clear completion date unless explicitly set.
    if (nextStatus !== 'done' && prevStatus === 'done') {
      if (!Object.prototype.hasOwnProperty.call(nextPatch, 'completedDate')) {
        nextPatch.completedDate = null
      }
    }
  }

  s.goals[id] = { ...prev, ...nextPatch, updatedAt }
  writeState(s)
  return s.goals[id]
}

export function addSubTarget(goalId, payload) {
  const s = readState()
  const goal = s.goals[goalId]
  if (!goal) return null

  const now = new Date().toISOString()
  const subTarget = normalizeSubTarget(payload)
  s.goals[goalId] = {
    ...goal,
    subTargets: [...(goal.subTargets || []), subTarget],
    updatedAt: now,
  }
  writeState(s)
  return subTarget
}

export function addSubTargets(goalId, payloads) {
  const s = readState()
  const goal = s.goals[goalId]
  if (!goal || !Array.isArray(payloads) || !payloads.length) return []

  const now = new Date().toISOString()
  const subTargets = payloads.map((payload) => normalizeSubTarget(payload))

  s.goals[goalId] = {
    ...goal,
    subTargets: [...(goal.subTargets || []), ...subTargets],
    updatedAt: now,
  }
  writeState(s)
  return subTargets
}

export function updateSubTarget(goalId, subTargetId, patch) {
  const s = readState()
  const goal = s.goals[goalId]
  if (!goal) return null

  const currentSubTargets = goal.subTargets || []
  const existingSubTarget = currentSubTargets.find((subTarget) => subTarget.id === subTargetId)
  if (!existingSubTarget) return null

  const now = new Date().toISOString()
  const nextSubTarget = normalizeSubTarget(
    { ...existingSubTarget, ...patch, id: subTargetId, updatedAt: now },
    existingSubTarget,
  )

  s.goals[goalId] = {
    ...goal,
    subTargets: currentSubTargets.map((subTarget) => (subTarget.id === subTargetId ? nextSubTarget : subTarget)),
    updatedAt: now,
  }
  writeState(s)
  return nextSubTarget
}

export function deleteSubTarget(goalId, subTargetId) {
  const s = readState()
  const goal = s.goals[goalId]
  if (!goal) return false

  const nextSubTargets = (goal.subTargets || []).filter((subTarget) => subTarget.id !== subTargetId)
  if (nextSubTargets.length === (goal.subTargets || []).length) return false

  s.goals[goalId] = {
    ...goal,
    subTargets: nextSubTargets,
    updatedAt: new Date().toISOString(),
  }
  writeState(s)
  return true
}

export function deleteGoal(id) {
  const s = readState()
  if (!s.goals[id]) return false
  delete s.goals[id]
  // also remove related actions
  for (const aid of Object.keys(s.actions)) {
    if (s.actions[aid].goalId === id) delete s.actions[aid]
  }
  writeState(s)
  return true
}

export function listActionsByGoal(goalId) {
  const s = readState()
  return Object.values(s.actions)
    .filter((a) => a.goalId === goalId)
    .sort((a, b) => (a.startTime < b.startTime ? 1 : -1))
}

export function getAction(id) {
  const s = readState()
  return s.actions[id] || null
}

export function addAction(goalId, payload) {
  const s = readState()
  const id = uid('a-')
  const now = new Date().toISOString()
  const action = normalizeActionRecord({
    id,
    goalId,
    startTime: payload.startTime || null,
    endTime: payload.endTime || null,
    expectedDurationMinutes: Number.isFinite(Number(payload.expectedDurationMinutes)) ? Number(payload.expectedDurationMinutes) : null,
    expectedOutcome: payload.expectedOutcome || '',
    content: payload.content || '',
    nextAction: payload.nextAction || payload.notes || '',
    scores: payload.scores || { arousal: 0, valence: 0 },
    feeling: payload.feeling || payload.rant || payload.bingo || '',
    rant: payload.rant || '',
    bingo: payload.bingo || '',
    celebration: payload.celebration || '',
    workExperienceTitle: payload.workExperienceTitle || '',
    workExperienceHtml: payload.workExperienceHtml || '',
    createdAt: now,
    updatedAt: now,
  }, id)
  s.actions = s.actions || {}
  s.actions[id] = action
  writeState(s)
  return action
}

export function updateAction(id, patch) {
  const s = readState()
  if (!s.actions[id]) return null
  s.actions[id] = normalizeActionRecord({
    ...s.actions[id],
    ...patch,
    updatedAt: new Date().toISOString(),
  }, id)
  writeState(s)
  return s.actions[id]
}

export function deleteAction(id) {
  const s = readState()
  if (!s.actions[id]) return false
  delete s.actions[id]
  writeState(s)
  return true
}

export function listExerciseGoals() {
  const s = readState()
  return Object.values(s.exerciseGoals || {}).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function getExerciseGoal(id) {
  const s = readState()
  return s.exerciseGoals[id] || null
}

export function createExerciseGoal(payload) {
  const s = readState()
  const id = uid('eg-')
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  const goal = normalizeExerciseGoal({
    id,
    title: payload.title || '未命名运动',
    reasons: payload.reasons || [],
    supports: payload.supports || [],
    status: payload.status || 'want',
    startDate: payload.startDate || today,
    completedDate: payload.completedDate || '',
    createdAt: now,
    updatedAt: now,
  }, id)
  s.exerciseGoals[id] = goal
  writeState(s)
  return goal
}

export function updateExerciseGoal(id, patch) {
  const s = readState()
  if (!s.exerciseGoals[id]) return null

  const prev = s.exerciseGoals[id]
  const updatedAt = new Date().toISOString()
  const today = updatedAt.slice(0, 10)
  const nextPatch = { ...patch }

  if (Object.prototype.hasOwnProperty.call(nextPatch, 'status')) {
    const nextStatus = nextPatch.status
    const prevStatus = prev.status

    if (nextStatus === 'done' && prevStatus !== 'done' && !Object.prototype.hasOwnProperty.call(nextPatch, 'completedDate')) {
      nextPatch.completedDate = today
    }

    if (nextStatus !== 'done' && prevStatus === 'done' && !Object.prototype.hasOwnProperty.call(nextPatch, 'completedDate')) {
      nextPatch.completedDate = ''
    }
  }

  s.exerciseGoals[id] = normalizeExerciseGoal({ ...prev, ...nextPatch, updatedAt }, id)
  s.exerciseGoals[id].updatedAt = updatedAt
  writeState(s)
  return s.exerciseGoals[id]
}

export function deleteExerciseGoal(id) {
  const s = readState()
  if (!s.exerciseGoals[id]) return false
  delete s.exerciseGoals[id]
  for (const actionId of Object.keys(s.exerciseActions || {})) {
    if (s.exerciseActions[actionId].goalId === id) delete s.exerciseActions[actionId]
  }
  writeState(s)
  return true
}

export function listExerciseActionsByGoal(goalId) {
  const s = readState()
  return Object.values(s.exerciseActions || {})
    .filter((action) => action.goalId === goalId)
    .sort((a, b) => (a.startTime < b.startTime ? 1 : -1))
}

export function getExerciseAction(id) {
  const s = readState()
  return s.exerciseActions[id] || null
}

export function addExerciseAction(goalId, payload) {
  const s = readState()
  const id = uid('ea-')
  const now = new Date().toISOString()
  const action = normalizeExerciseAction({
    id,
    goalId,
    startTime: payload.startTime || null,
    endTime: payload.endTime || null,
    exerciseName: payload.exerciseName || '',
    content: payload.content || '',
    scores: payload.scores || { arousal: 0, valence: 0 },
    feeling: payload.feeling || payload.bingo || '',
    bingo: payload.bingo || '',
    celebration: payload.celebration || '',
    workExperienceTitle: payload.workExperienceTitle || '',
    workExperienceHtml: payload.workExperienceHtml || '',
    createdAt: now,
    updatedAt: now,
  }, id)
  s.exerciseActions[id] = action
  writeState(s)
  return action
}

export function updateExerciseAction(id, patch) {
  const s = readState()
  if (!s.exerciseActions[id]) return null
  s.exerciseActions[id] = normalizeExerciseAction({
    ...s.exerciseActions[id],
    ...patch,
    updatedAt: new Date().toISOString(),
  }, id)
  writeState(s)
  return s.exerciseActions[id]
}

export function deleteExerciseAction(id) {
  const s = readState()
  if (!s.exerciseActions[id]) return false
  delete s.exerciseActions[id]
  writeState(s)
  return true
}

export function listWritingTemplates() {
  const s = readState()
  return Object.values(s.writingTemplates || {}).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

export function getWritingTemplate(id) {
  const s = readState()
  return s.writingTemplates?.[id] || null
}

export function createWritingTemplate(payload) {
  const s = readState()
  const now = new Date().toISOString()
  const template = normalizeWritingTemplate({
    id: uid('wt-'),
    title: payload.title || '未命名模板',
    purpose: payload.purpose || '',
    sections: Array.isArray(payload.sections) ? payload.sections : [],
    createdAt: now,
    updatedAt: now,
  })
  s.writingTemplates = s.writingTemplates || {}
  s.writingTemplates[template.id] = template
  writeState(s)
  return template
}

export function updateWritingTemplate(id, patch) {
  const s = readState()
  if (!s.writingTemplates?.[id]) return null
  const prev = s.writingTemplates[id]
  const next = normalizeWritingTemplate({
    ...prev,
    ...patch,
    id,
    createdAt: prev.createdAt,
    updatedAt: new Date().toISOString(),
  }, id)
  s.writingTemplates[id] = next
  writeState(s)
  return next
}

export function deleteWritingTemplate(id) {
  const s = readState()
  if (!s.writingTemplates?.[id]) return false
  delete s.writingTemplates[id]
  for (const entryId of Object.keys(s.writingEntries || {})) {
    if (s.writingEntries[entryId].templateId === id) delete s.writingEntries[entryId]
  }
  writeState(s)
  return true
}

export function listWritingEntriesByTemplate(templateId) {
  const s = readState()
  return Object.values(s.writingEntries || {})
    .filter((entry) => entry.templateId === templateId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function createWritingEntry(templateId, payload) {
  const s = readState()
  const now = new Date().toISOString()
  const entry = normalizeWritingEntry({
    id: uid('we-'),
    templateId,
    answers: Array.isArray(payload.answers) ? payload.answers : [],
    createdAt: now,
    updatedAt: now,
  })
  s.writingEntries = s.writingEntries || {}
  s.writingEntries[entry.id] = entry
  if (s.writingTemplates?.[templateId]) {
    s.writingTemplates[templateId] = {
      ...s.writingTemplates[templateId],
      updatedAt: now,
    }
  }
  writeState(s)
  return entry
}

export function updateWritingEntry(id, patch) {
  const s = readState()
  if (!s.writingEntries?.[id]) return null
  const prev = s.writingEntries[id]
  const next = normalizeWritingEntry({
    ...prev,
    ...patch,
    id,
    createdAt: prev.createdAt,
    updatedAt: new Date().toISOString(),
  }, id)
  s.writingEntries[id] = next
  writeState(s)
  return next
}

export function deleteWritingEntry(id) {
  const s = readState()
  if (!s.writingEntries?.[id]) return false
  delete s.writingEntries[id]
  writeState(s)
  return true
}

export function exportData() {
  const s = readState()
  return JSON.stringify(s)
}

export function importData(json, { merge = true } = {}) {
  let incoming
  try {
    incoming = typeof json === 'string' ? JSON.parse(json) : json
  } catch {
    throw new Error('导入的数据不是合法的 JSON')
  }
  if (!incoming || typeof incoming !== 'object') throw new Error('导入的数据结构不正确')

  if (incoming.state && typeof incoming.state === 'object' && !Array.isArray(incoming.state)) {
    incoming = incoming.state
  }

  writeLocalSafetyBackup(merge ? 'before-import-merge' : 'before-import-replace', readState(), currentUserId || readLocalOwner())

  if (!merge) {
    // ensure settings default if missing
    incoming.settings = incoming.settings || { conservativeMinutes: 60, ambitiousMinutes: 180 }
    incoming.weeklyPlans = incoming.weeklyPlans || {}
    incoming.dailyPlans = incoming.dailyPlans || {}
    incoming.dailyAchievements = incoming.dailyAchievements || {}
    incoming.exerciseGoals = incoming.exerciseGoals || {}
    incoming.exerciseActions = incoming.exerciseActions || {}
    incoming.writingTemplates = incoming.writingTemplates || {}
    incoming.writingEntries = incoming.writingEntries || {}
    writeState(incoming)
    return
  }

  const s = readState()
  s.goals = { ...s.goals, ...(incoming.goals || {}) }
  s.actions = { ...s.actions, ...(incoming.actions || {}) }
  s.exerciseGoals = { ...(s.exerciseGoals || {}), ...(incoming.exerciseGoals || {}) }
  s.exerciseActions = { ...(s.exerciseActions || {}), ...(incoming.exerciseActions || {}) }
  s.writingTemplates = { ...(s.writingTemplates || {}), ...(incoming.writingTemplates || {}) }
  s.writingEntries = { ...(s.writingEntries || {}), ...(incoming.writingEntries || {}) }
  s.weeklyPlans = { ...(s.weeklyPlans || {}), ...(incoming.weeklyPlans || {}) }
  s.settings = { ...s.settings, ...(incoming.settings || {}) }
  s.dailyPlans = { ...(s.dailyPlans || {}), ...(incoming.dailyPlans || {}) }
  s.dailyAchievements = { ...(s.dailyAchievements || {}), ...(incoming.dailyAchievements || {}) }
  writeState(s)
}

export function getWeeklyPlan(weekKey) {
  if (!weekKey) return null
  const s = readState()
  const plan = s.weeklyPlans?.[weekKey]
  return plan ? normalizeWeeklyPlan(plan, weekKey) : null
}

export function setWeeklyPlan(weekKey, payload) {
  if (!weekKey) return null
  const s = readState()
  const nextPlan = normalizeWeeklyPlan({ ...payload, weekKey }, weekKey)
  s.weeklyPlans = s.weeklyPlans || {}
  s.weeklyPlans[weekKey] = nextPlan
  writeState(s)
  return nextPlan
}

export function getDailyPlan(dateStr) {
  const s = readState()
  const date = dateStr || new Date().toISOString().slice(0, 10)
  return (s.dailyPlans && s.dailyPlans[date]) || ''
}

export function setDailyPlan(dateStr, text) {
  const s = readState()
  const date = dateStr || new Date().toISOString().slice(0, 10)
  s.dailyPlans = s.dailyPlans || {}
  s.dailyPlans[date] = String(text ?? '')
  writeState(s)
  return s.dailyPlans[date]
}

export function getDailyAchievement(dateStr) {
  const s = readState()
  const date = dateStr || new Date().toISOString().slice(0, 10)
  return (s.dailyAchievements && s.dailyAchievements[date]) || ''
}

export function setDailyAchievement(dateStr, text) {
  const s = readState()
  const date = dateStr || new Date().toISOString().slice(0, 10)
  s.dailyAchievements = s.dailyAchievements || {}
  s.dailyAchievements[date] = String(text ?? '')
  writeState(s)
  return s.dailyAchievements[date]
}

export function getSettings() {
  const s = readState()
  return s.settings || { conservativeMinutes: 60, ambitiousMinutes: 180 }
}

export function updateSettings(patch) {
  const s = readState()
  s.settings = { ...(s.settings || { conservativeMinutes: 60, ambitiousMinutes: 180 }), ...patch }
  writeState(s)
  return s.settings
}

export function clearAll() {
  const ownerId = currentUserId || readLocalOwner()
  writeLocalSafetyBackup('before-clear-all', readState(), ownerId)
  const nextState = persistLocalState(createDefaultState(), { ownerId, markPending: true })
  void queueRemoteWrite(nextState)
}

export default {
  listGoals,
  getGoal,
  createGoal,
  updateGoal,
  addSubTarget,
  updateSubTarget,
  deleteSubTarget,
  deleteGoal,
  listActionsByGoal,
  getAction,
  addAction,
  updateAction,
  deleteAction,
  listExerciseGoals,
  getExerciseGoal,
  createExerciseGoal,
  updateExerciseGoal,
  deleteExerciseGoal,
  listExerciseActionsByGoal,
  getExerciseAction,
  addExerciseAction,
  updateExerciseAction,
  deleteExerciseAction,
  listWritingTemplates,
  getWritingTemplate,
  createWritingTemplate,
  updateWritingTemplate,
  deleteWritingTemplate,
  listWritingEntriesByTemplate,
  createWritingEntry,
  updateWritingEntry,
  deleteWritingEntry,
  exportData,
  importData,
  getWeeklyPlan,
  setWeeklyPlan,
  clearAll,
}

// Additional helpers
export function listAllActions() {
  const s = readState()
  return Object.values(s.actions || {})
}

export function listActionsForDate(dateStr) {
  // dateStr format: 'YYYY-MM-DD', defaults to today
  const s = readState()
  const all = Object.values(s.actions || {})
  const date = dateStr || new Date().toISOString().slice(0, 10)
  return all.filter((a) => {
    // consider action completed today if endTime exists and endTime's date matches
    if (a.endTime) {
      return a.endTime.slice(0, 10) === date
    }
    // or if action started today and not ended, consider as today's ongoing
    if (a.startTime && !a.endTime) {
      return a.startTime.slice(0, 10) === date
    }
    return false
  })
}
