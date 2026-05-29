import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase'

const LEGACY_APP_STATE_TABLE = 'app_states'

const TABLES = {
  userSettings: 'user_settings',
  goals: 'goals',
  goalSubTargets: 'goal_sub_targets',
  actions: 'actions',
  exerciseGoals: 'exercise_goals',
  exerciseActions: 'exercise_actions',
  writingTemplates: 'writing_templates',
  writingTemplateSections: 'writing_template_sections',
  writingEntries: 'writing_entries',
  writingEntryAnswers: 'writing_entry_answers',
  weeklyPlans: 'weekly_plans',
  dailyPlans: 'daily_plans',
  dailyAchievements: 'daily_achievements',
}

export const STORAGE_STATUS_EVENT = 'action-journal:storage-status'

let syncStatus = {
  phase: isSupabaseConfigured() ? 'idle' : 'not-configured',
  pending: false,
  lastSyncedAt: '',
  lastError: '',
}

function emitSyncStatus() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(STORAGE_STATUS_EVENT))
}

export function getSyncStatus() {
  return syncStatus
}

export function setSyncStatus(patch) {
  syncStatus = { ...syncStatus, ...patch }
  emitSyncStatus()
  return syncStatus
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function ensureObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
}

function buildNormalizedRows(userId, state) {
  const goals = Object.values(state.goals || {})
  const actions = Object.values(state.actions || {})
  const exerciseGoals = Object.values(state.exerciseGoals || {})
  const exerciseActions = Object.values(state.exerciseActions || {})
  const writingTemplates = Object.values(state.writingTemplates || {})
  const writingEntries = Object.values(state.writingEntries || {})
  const weeklyPlans = Object.values(state.weeklyPlans || {})

  return {
    goals: goals.map((goal) => ({
      id: goal.id,
      user_id: userId,
      title: goal.title || '',
      reasons: ensureArray(goal.reasons),
      expected_outcome: goal.expectedOutcome || '',
      supports: ensureArray(goal.supports),
      factors: ensureArray(goal.factors),
      status: goal.status || 'want',
      start_date: goal.startDate || '',
      completed_date: goal.completedDate || null,
      created_at: goal.createdAt || new Date().toISOString(),
      updated_at: goal.updatedAt || new Date().toISOString(),
    })),
    goalSubTargets: goals.flatMap((goal) => ensureArray(goal.subTargets).map((subTarget, index) => ({
      id: subTarget.id,
      user_id: userId,
      goal_id: goal.id,
      position: index,
      start_date: subTarget.startDate || '',
      end_date: subTarget.endDate || '',
      content: subTarget.content || '',
      status: subTarget.status || 'want',
      created_at: subTarget.createdAt || new Date().toISOString(),
      updated_at: subTarget.updatedAt || new Date().toISOString(),
    }))),
    actions: actions.map((action) => ({
      id: action.id,
      user_id: userId,
      goal_id: action.goalId || '',
      start_time: action.startTime || null,
      end_time: action.endTime || null,
      expected_duration_minutes: action.expectedDurationMinutes ?? null,
      expected_outcome: action.expectedOutcome || '',
      content: action.content || '',
      next_action: action.nextAction || '',
      scores: ensureObject(action.scores, { arousal: 0, valence: 0 }),
      rant: action.rant || '',
      bingo: action.bingo || '',
      celebration: action.celebration || '',
      work_experience_title: action.workExperienceTitle || '',
      work_experience_html: action.workExperienceHtml || '',
      created_at: action.createdAt || new Date().toISOString(),
      updated_at: action.updatedAt || new Date().toISOString(),
    })),
    exerciseGoals: exerciseGoals.map((goal) => ({
      id: goal.id,
      user_id: userId,
      title: goal.title || '',
      reasons: ensureArray(goal.reasons),
      supports: ensureArray(goal.supports),
      status: goal.status || 'want',
      start_date: goal.startDate || '',
      completed_date: goal.completedDate || '',
      created_at: goal.createdAt || new Date().toISOString(),
      updated_at: goal.updatedAt || new Date().toISOString(),
    })),
    exerciseActions: exerciseActions.map((action) => ({
      id: action.id,
      user_id: userId,
      goal_id: action.goalId || '',
      start_time: action.startTime || null,
      end_time: action.endTime || null,
      exercise_name: action.exerciseName || '',
      content: action.content || '',
      scores: ensureObject(action.scores, { arousal: 0, valence: 0 }),
      bingo: action.bingo || '',
      celebration: action.celebration || '',
      work_experience_title: action.workExperienceTitle || '',
      work_experience_html: action.workExperienceHtml || '',
      created_at: action.createdAt || new Date().toISOString(),
      updated_at: action.updatedAt || new Date().toISOString(),
    })),
    writingTemplates: writingTemplates.map((template) => ({
      id: template.id,
      user_id: userId,
      title: template.title || '',
      purpose: template.purpose || '',
      created_at: template.createdAt || new Date().toISOString(),
      updated_at: template.updatedAt || new Date().toISOString(),
    })),
    writingTemplateSections: writingTemplates.flatMap((template) => ensureArray(template.sections).map((section, index) => ({
      id: section.id,
      user_id: userId,
      template_id: template.id,
      position: index,
      question: section.question || '',
      prompt: section.prompt || '',
    }))),
    writingEntries: writingEntries.map((entry) => ({
      id: entry.id,
      user_id: userId,
      template_id: entry.templateId || '',
      created_at: entry.createdAt || new Date().toISOString(),
      updated_at: entry.updatedAt || new Date().toISOString(),
    })),
    writingEntryAnswers: writingEntries.flatMap((entry) => ensureArray(entry.answers).map((answer, index) => ({
      id: `${entry.id}:${answer.sectionId || index}`,
      user_id: userId,
      entry_id: entry.id,
      section_id: answer.sectionId || '',
      position: index,
      content: answer.content || '',
    }))),
    weeklyPlans: weeklyPlans.map((plan) => ({
      user_id: userId,
      week_key: plan.weekKey,
      start_date: plan.startDate || '',
      end_date: plan.endDate || '',
      confirmed_at: plan.confirmedAt || '',
      sub_target_refs: ensureArray(plan.subTargetRefs),
    })),
    dailyPlans: Object.entries(state.dailyPlans || {}).map(([date, content]) => ({
      user_id: userId,
      plan_date: date,
      content: String(content ?? ''),
    })),
    dailyAchievements: Object.entries(state.dailyAchievements || {}).map(([date, content]) => ({
      user_id: userId,
      achievement_date: date,
      content: String(content ?? ''),
    })),
    userSettings: [{
      user_id: userId,
      conservative_minutes: Number(state.settings?.conservativeMinutes ?? 60),
      ambitious_minutes: Number(state.settings?.ambitiousMinutes ?? 180),
    }],
  }
}

function sortByPosition(rows) {
  return [...rows].sort((left, right) => {
    const positionDelta = Number(left.position ?? 0) - Number(right.position ?? 0)
    if (positionDelta !== 0) return positionDelta
    return String(left.id || '').localeCompare(String(right.id || ''))
  })
}

function composeStateFromRows(rows) {
  const state = {
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

  rows.goals.forEach((goal) => {
    state.goals[goal.id] = {
      id: goal.id,
      title: goal.title || '',
      reasons: ensureArray(goal.reasons),
      expectedOutcome: goal.expected_outcome || '',
      supports: ensureArray(goal.supports),
      factors: ensureArray(goal.factors),
      status: goal.status || 'want',
      startDate: goal.start_date || '',
      completedDate: goal.completed_date || null,
      subTargets: [],
      createdAt: goal.created_at || new Date().toISOString(),
      updatedAt: goal.updated_at || goal.created_at || new Date().toISOString(),
    }
  })

  sortByPosition(rows.goalSubTargets).forEach((subTarget) => {
    const goal = state.goals[subTarget.goal_id]
    if (!goal) return
    goal.subTargets.push({
      id: subTarget.id,
      startDate: subTarget.start_date || '',
      endDate: subTarget.end_date || '',
      content: subTarget.content || '',
      status: subTarget.status || 'want',
      createdAt: subTarget.created_at || new Date().toISOString(),
      updatedAt: subTarget.updated_at || subTarget.created_at || new Date().toISOString(),
    })
  })

  rows.actions.forEach((action) => {
    state.actions[action.id] = {
      id: action.id,
      goalId: action.goal_id || '',
      startTime: action.start_time || null,
      endTime: action.end_time || null,
      expectedDurationMinutes: action.expected_duration_minutes ?? null,
      expectedOutcome: action.expected_outcome || '',
      content: action.content || '',
      nextAction: action.next_action || '',
      scores: ensureObject(action.scores, { arousal: 0, valence: 0 }),
      rant: action.rant || '',
      bingo: action.bingo || '',
      celebration: action.celebration || '',
      workExperienceTitle: action.work_experience_title || '',
      workExperienceHtml: action.work_experience_html || '',
      createdAt: action.created_at || new Date().toISOString(),
      updatedAt: action.updated_at || action.created_at || new Date().toISOString(),
    }
  })

  rows.exerciseGoals.forEach((goal) => {
    state.exerciseGoals[goal.id] = {
      id: goal.id,
      title: goal.title || '',
      reasons: ensureArray(goal.reasons),
      supports: ensureArray(goal.supports),
      status: goal.status || 'want',
      startDate: goal.start_date || '',
      completedDate: goal.completed_date || '',
      createdAt: goal.created_at || new Date().toISOString(),
      updatedAt: goal.updated_at || goal.created_at || new Date().toISOString(),
    }
  })

  rows.exerciseActions.forEach((action) => {
    state.exerciseActions[action.id] = {
      id: action.id,
      goalId: action.goal_id || '',
      startTime: action.start_time || null,
      endTime: action.end_time || null,
      exerciseName: action.exercise_name || '',
      content: action.content || '',
      scores: ensureObject(action.scores, { arousal: 0, valence: 0 }),
      bingo: action.bingo || '',
      celebration: action.celebration || '',
      workExperienceTitle: action.work_experience_title || '',
      workExperienceHtml: action.work_experience_html || '',
      createdAt: action.created_at || new Date().toISOString(),
      updatedAt: action.updated_at || action.created_at || new Date().toISOString(),
    }
  })

  rows.writingTemplates.forEach((template) => {
    state.writingTemplates[template.id] = {
      id: template.id,
      title: template.title || '',
      purpose: template.purpose || '',
      sections: [],
      createdAt: template.created_at || new Date().toISOString(),
      updatedAt: template.updated_at || template.created_at || new Date().toISOString(),
    }
  })

  sortByPosition(rows.writingTemplateSections).forEach((section) => {
    const template = state.writingTemplates[section.template_id]
    if (!template) return
    template.sections.push({
      id: section.id,
      question: section.question || '',
      prompt: section.prompt || '',
    })
  })

  rows.writingEntries.forEach((entry) => {
    state.writingEntries[entry.id] = {
      id: entry.id,
      templateId: entry.template_id || '',
      answers: [],
      createdAt: entry.created_at || new Date().toISOString(),
      updatedAt: entry.updated_at || entry.created_at || new Date().toISOString(),
    }
  })

  sortByPosition(rows.writingEntryAnswers).forEach((answer) => {
    const entry = state.writingEntries[answer.entry_id]
    if (!entry) return
    entry.answers.push({
      sectionId: answer.section_id || '',
      content: answer.content || '',
    })
  })

  rows.weeklyPlans.forEach((plan) => {
    state.weeklyPlans[plan.week_key] = {
      weekKey: plan.week_key,
      startDate: plan.start_date || '',
      endDate: plan.end_date || '',
      confirmedAt: plan.confirmed_at || '',
      subTargetRefs: ensureArray(plan.sub_target_refs),
    }
  })

  rows.dailyPlans.forEach((plan) => {
    state.dailyPlans[plan.plan_date] = String(plan.content ?? '')
  })

  rows.dailyAchievements.forEach((achievement) => {
    state.dailyAchievements[achievement.achievement_date] = String(achievement.content ?? '')
  })

  const settingsRow = rows.userSettings[0]
  if (settingsRow) {
    state.settings = {
      conservativeMinutes: Number(settingsRow.conservative_minutes ?? 60),
      ambitiousMinutes: Number(settingsRow.ambitious_minutes ?? 180),
    }
  }

  return state
}

async function fetchTable(client, table, userId, columns = '*') {
  const { data, error } = await client.from(table).select(columns).eq('user_id', userId)
  if (error) throw error
  return data || []
}

export async function fetchNormalizedState(userId) {
  if (!userId || !isSupabaseConfigured()) return null

  const client = getSupabaseClient()
  if (!client) return null

  const [
    goals,
    goalSubTargets,
    actions,
    exerciseGoals,
    exerciseActions,
    writingTemplates,
    writingTemplateSections,
    writingEntries,
    writingEntryAnswers,
    weeklyPlans,
    dailyPlans,
    dailyAchievements,
    userSettings,
  ] = await Promise.all([
    fetchTable(client, TABLES.goals, userId),
    fetchTable(client, TABLES.goalSubTargets, userId),
    fetchTable(client, TABLES.actions, userId),
    fetchTable(client, TABLES.exerciseGoals, userId),
    fetchTable(client, TABLES.exerciseActions, userId),
    fetchTable(client, TABLES.writingTemplates, userId),
    fetchTable(client, TABLES.writingTemplateSections, userId),
    fetchTable(client, TABLES.writingEntries, userId),
    fetchTable(client, TABLES.writingEntryAnswers, userId),
    fetchTable(client, TABLES.weeklyPlans, userId),
    fetchTable(client, TABLES.dailyPlans, userId),
    fetchTable(client, TABLES.dailyAchievements, userId),
    fetchTable(client, TABLES.userSettings, userId),
  ])

  const rows = {
    goals,
    goalSubTargets,
    actions,
    exerciseGoals,
    exerciseActions,
    writingTemplates,
    writingTemplateSections,
    writingEntries,
    writingEntryAnswers,
    weeklyPlans,
    dailyPlans,
    dailyAchievements,
    userSettings,
  }

  const hasRows = Object.values(rows).some((value) => Array.isArray(value) && value.length)
  return hasRows ? composeStateFromRows(rows) : null
}

export async function fetchLegacyCloudState(userId) {
  if (!userId || !isSupabaseConfigured()) return null
  const client = getSupabaseClient()
  if (!client) return null

  const { data, error } = await client
    .from(LEGACY_APP_STATE_TABLE)
    .select('state')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    const message = String(error.message || '')
    if (message.toLowerCase().includes('does not exist')) {
      return null
    }
    throw error
  }

  return data?.state || null
}

async function deleteUserRows(client, table, userId) {
  const { error } = await client.from(table).delete().eq('user_id', userId)
  if (error) throw error
}

async function upsertRows(client, table, rows, onConflict) {
  if (!rows.length) return
  const { error } = await client.from(table).upsert(rows, onConflict ? { onConflict } : undefined)
  if (error) throw error
}

export async function persistNormalizedState(userId, state) {
  if (!userId || !isSupabaseConfigured()) return false

  const client = getSupabaseClient()
  if (!client) return false

  const rows = buildNormalizedRows(userId, state)

  await deleteUserRows(client, TABLES.dailyAchievements, userId)
  await deleteUserRows(client, TABLES.dailyPlans, userId)
  await deleteUserRows(client, TABLES.weeklyPlans, userId)
  await deleteUserRows(client, TABLES.userSettings, userId)
  await deleteUserRows(client, TABLES.goals, userId)
  await deleteUserRows(client, TABLES.exerciseGoals, userId)
  await deleteUserRows(client, TABLES.writingTemplates, userId)

  await upsertRows(client, TABLES.goals, rows.goals, 'id')
  await upsertRows(client, TABLES.exerciseGoals, rows.exerciseGoals, 'id')
  await upsertRows(client, TABLES.writingTemplates, rows.writingTemplates, 'id')
  await upsertRows(client, TABLES.goalSubTargets, rows.goalSubTargets, 'id')
  await upsertRows(client, TABLES.actions, rows.actions, 'id')
  await upsertRows(client, TABLES.exerciseActions, rows.exerciseActions, 'id')
  await upsertRows(client, TABLES.writingTemplateSections, rows.writingTemplateSections, 'id')
  await upsertRows(client, TABLES.writingEntries, rows.writingEntries, 'id')
  await upsertRows(client, TABLES.writingEntryAnswers, rows.writingEntryAnswers, 'id')
  await upsertRows(client, TABLES.weeklyPlans, rows.weeklyPlans, 'user_id,week_key')
  await upsertRows(client, TABLES.dailyPlans, rows.dailyPlans, 'user_id,plan_date')
  await upsertRows(client, TABLES.dailyAchievements, rows.dailyAchievements, 'user_id,achievement_date')
  await upsertRows(client, TABLES.userSettings, rows.userSettings, 'user_id')
  return true
}
