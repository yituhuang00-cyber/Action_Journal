export const PROBLEM_SOLVING_QUESTIONS = [
  {
    id: 'problem-space',
    title: '使用「问题空间」的方式，重新描述你选择解决的问题',
    prompt: `只包含事实的部分，尽可能具体、精确，使用数据描述这些状态\n\n（1）问题起点（我是什么时候想要解决它的，当时的问题状态是什么）\n（2）问题现状（此时，问题的状态是什么）\n（3）问题终点（当实现了什么具体的目标，就意味着问题被解决了）`,
  },
  {
    id: 'progress',
    title: '画出「问题进度条」。0 是毫无进展，100% 是完成目标。现在的进展是多少？',
    prompt: '请根据这个问题开始书写',
  },
  {
    id: 'progress-actions',
    title: '如果问题取得了一些进展，我是如何做到的？',
    prompt: '请根据这个问题开始书写',
  },
  {
    id: 'past-solutions',
    title: '类似的问题，之前发生过吗？我是如何解决的？',
    prompt: '请根据这个问题开始书写',
  },
  {
    id: 'exceptions',
    title: '哪些时候，这个问题不存在或者不严重？那时候发生了什么？',
    prompt: '请根据这个问题开始书写',
  },
  {
    id: 'resources',
    title: '有哪些有助于问题解决的外部资源？先列出来，再去找它们',
    prompt: `（1）可以和你协助的盟友\n（2）可以为你提供建议的专家\n（3）如何获取更多可靠的信息`,
  },
  {
    id: 'solutions',
    title: '列出目前的解决方案',
    prompt: `可以先发散，生成尽可能多的解决方案\n\n然后再收敛，通过目标匹配度、可行性和成本—收益分析，选出最值得尝试的方案`,
  },
  {
    id: 'next-five-percent',
    title: '如果想要把当前的进度推进 5%，我的下一个小目标具体会是什么？',
    prompt: '请根据这个问题开始书写',
  },
  {
    id: 'next-actions',
    title: '为了实现这个小目标，我可以做什么？',
    prompt: `行动 1：\n预计发生和持续时间：\n预计发生的地点：\n预计的行动过程：\n如果（有这些意外 / 阻碍）：\n那么（我将做出这些替代的行动）：`,
  },
]

function normalizeAnswer(answer = {}, questionId = '') {
  return {
    questionId,
    content: typeof answer.content === 'string' ? answer.content : '',
    skipped: Boolean(answer.skipped),
  }
}

export function normalizeProblemSolvingEntry(entry = {}, fallbackId = '', previousEntry = null) {
  const now = new Date().toISOString()
  const answerMap = new Map(
    (Array.isArray(entry.answers) ? entry.answers : [])
      .filter((answer) => answer && typeof answer === 'object')
      .map((answer) => [answer.questionId, answer]),
  )
  const previousAnswerMap = new Map(
    (Array.isArray(previousEntry?.answers) ? previousEntry.answers : [])
      .map((answer) => [answer.questionId, answer]),
  )

  return {
    id: entry.id || previousEntry?.id || fallbackId,
    answers: PROBLEM_SOLVING_QUESTIONS.map((question) => normalizeAnswer(
      answerMap.get(question.id) || previousAnswerMap.get(question.id),
      question.id,
    )),
    createdAt: previousEntry?.createdAt || entry.createdAt || now,
    updatedAt: entry.updatedAt || previousEntry?.updatedAt || now,
  }
}

export function normalizeProblemSolvingEntries(entries, previousEntries = []) {
  if (!Array.isArray(entries)) return []

  const previousMap = new Map(
    (Array.isArray(previousEntries) ? previousEntries : []).map((entry) => [entry.id, entry]),
  )

  return entries.map((entry, index) => normalizeProblemSolvingEntry(
    entry,
    `problem-solving-${index + 1}`,
    previousMap.get(entry?.id) || null,
  ))
}

export function getProblemSolvingEntryPreview(entry) {
  const firstAnswer = (entry?.answers || []).find((answer) => answer.content?.trim() && !answer.skipped)
  const text = firstAnswer?.content?.trim() || ''
  if (!text) return '本次梳理没有填写文字内容'
  return text.length > 90 ? `${text.slice(0, 90)}…` : text
}

export function getProblemSolvingEntryStats(entry) {
  const answers = Array.isArray(entry?.answers) ? entry.answers : []
  return {
    answered: answers.filter((answer) => answer.content?.trim() && !answer.skipped).length,
    skipped: answers.filter((answer) => answer.skipped).length,
    total: PROBLEM_SOLVING_QUESTIONS.length,
  }
}
