export const MOTIVATIONAL_DIMENSIONS = [
  {
    key: 'autonomy',
    label: '自主感',
    icon: '🧭',
    question: '是什么让你感到可以自主选择和决定？',
    descriptionPlaceholder: '具体描述这种掌控方向、按照自己意愿行动的感受。',
  },
  {
    key: 'competence',
    label: '胜任感',
    icon: '🌱',
    question: '是什么让你感到自己能够做好这件事？',
    descriptionPlaceholder: '具体描述这种有能力、在进步或完成了挑战的感受。',
  },
  {
    key: 'meaning',
    label: '意义感',
    icon: '✨',
    question: '是什么让你感到这件事值得投入？',
    descriptionPlaceholder: '具体描述它与你重视的目标、价值或生活方向有什么联系。',
  },
  {
    key: 'connection',
    label: '联结感',
    icon: '🤝',
    question: '是什么让你感到与他人有所联结？',
    descriptionPlaceholder: '具体描述被理解、支持、陪伴，或与他人共同前进的感受。',
  },
]

export function normalizeFeelingIntensity(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.min(10, Math.max(1, Math.round(number)))
}

export function normalizeMotivationalFeeling(value = {}) {
  const legacyContent = [value.source, value.description]
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim())
    .join('\n\n')
  return {
    content: typeof value.content === 'string' ? value.content : legacyContent,
    intensity: normalizeFeelingIntensity(value.intensity),
  }
}

export function normalizeMotivationalFeelings(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return Object.fromEntries(MOTIVATIONAL_DIMENSIONS.map((dimension) => [
    dimension.key,
    normalizeMotivationalFeeling(source[dimension.key]),
  ]))
}

export function hasMotivationalFeeling(value) {
  const feeling = normalizeMotivationalFeeling(value)
  return Boolean(feeling.content.trim() || feeling.intensity !== null)
}

export function countMotivationalFeelings(value) {
  const feelings = normalizeMotivationalFeelings(value)
  return MOTIVATIONAL_DIMENSIONS.filter((dimension) => hasMotivationalFeeling(feelings[dimension.key])).length
}
