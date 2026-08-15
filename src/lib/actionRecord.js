import { normalizeMotivationalFeelings } from './motivationalFeelings.js'

function asString(value) {
  return typeof value === 'string' ? value : ''
}

function trimText(value) {
  return asString(value).trim()
}

function normalizeForComparison(value) {
  return trimText(value).replace(/\s+/g, ' ')
}

export function hasText(value) {
  return Boolean(trimText(value))
}

export function hasExpectedDuration(minutesValue) {
  const minutes = Number(minutesValue)
  return Number.isFinite(minutes) && minutes > 0
}

export function getActionFeelingText(action = {}) {
  const feeling = trimText(action.feeling)
  if (feeling) return feeling

  const rant = trimText(action.rant)
  const bingo = trimText(action.bingo)

  if (rant && bingo) {
    return `吐槽：${rant}\n\nBingo：${bingo}`
  }

  return rant || bingo
}

export function getExerciseFeelingText(action = {}) {
  const feeling = trimText(action.feeling)
  if (feeling) return feeling
  return trimText(action.bingo)
}

export function mergeExpectedOutcomeIntoContent(content, expectedOutcome) {
  const nextContent = trimText(content)
  const nextExpectedOutcome = trimText(expectedOutcome)

  if (!nextExpectedOutcome) return nextContent
  if (!nextContent) return nextExpectedOutcome

  if (normalizeForComparison(nextContent).includes(normalizeForComparison(nextExpectedOutcome))) {
    return nextContent
  }

  return `${nextExpectedOutcome}\n\n${nextContent}`
}

export function normalizeActionRecord(action = {}, actionId = action.id) {
  const now = new Date().toISOString()
  const endTime = action.endTime || null
  const expectedOutcome = trimText(action.expectedOutcome)
  const content = endTime
    ? mergeExpectedOutcomeIntoContent(action.content, expectedOutcome)
    : trimText(action.content)
  const feeling = getActionFeelingText(action)
  const nextAction = trimText(action.nextAction || action.notes)

  return {
    ...action,
    id: action.id || actionId || '',
    goalId: action.goalId || '',
    startTime: action.startTime || null,
    endTime,
    expectedDurationMinutes: hasExpectedDuration(action.expectedDurationMinutes)
      ? Number(action.expectedDurationMinutes)
      : null,
    expectedOutcome: endTime ? '' : expectedOutcome,
    content,
    nextAction,
    scores: action.scores && typeof action.scores === 'object' && !Array.isArray(action.scores)
      ? action.scores
      : { arousal: 0, valence: 0 },
    feeling,
    rant: feeling,
    bingo: '',
    celebration: trimText(action.celebration),
    motivationalFeelings: normalizeMotivationalFeelings(action.motivationalFeelings),
    workExperienceTitle: trimText(action.workExperienceTitle),
    workExperienceHtml: asString(action.workExperienceHtml),
    createdAt: action.createdAt || now,
    updatedAt: action.updatedAt || now,
  }
}

export function normalizeExerciseRecord(action = {}, actionId = action.id) {
  const now = new Date().toISOString()
  const feeling = getExerciseFeelingText(action)

  return {
    ...action,
    id: action.id || actionId || '',
    goalId: action.goalId || '',
    startTime: action.startTime || null,
    endTime: action.endTime || null,
    exerciseName: trimText(action.exerciseName),
    content: trimText(action.content),
    scores: action.scores && typeof action.scores === 'object' && !Array.isArray(action.scores)
      ? action.scores
      : { arousal: 0, valence: 0 },
    feeling,
    bingo: '',
    celebration: trimText(action.celebration),
    motivationalFeelings: normalizeMotivationalFeelings(action.motivationalFeelings),
    workExperienceTitle: trimText(action.workExperienceTitle),
    workExperienceHtml: asString(action.workExperienceHtml),
    createdAt: action.createdAt || now,
    updatedAt: action.updatedAt || now,
  }
}
