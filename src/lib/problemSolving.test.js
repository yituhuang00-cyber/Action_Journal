import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PROBLEM_SOLVING_QUESTIONS,
  getProblemSolvingEntryPreview,
  getProblemSolvingEntryStats,
  normalizeProblemSolvingEntries,
  normalizeProblemSolvingEntry,
} from './problemSolving.js'

test('normalizes every fixed question while retaining saved answers', () => {
  const entry = normalizeProblemSolvingEntry({
    id: 'ps-1',
    answers: [
      { questionId: 'problem-space', content: '问题从周一开始。', skipped: false },
      { questionId: 'progress', content: '', skipped: true },
    ],
    createdAt: '2026-08-14T10:00:00.000Z',
    updatedAt: '2026-08-14T11:00:00.000Z',
  })

  assert.equal(entry.answers.length, PROBLEM_SOLVING_QUESTIONS.length)
  assert.deepEqual(entry.answers[0], {
    questionId: 'problem-space',
    content: '问题从周一开始。',
    skipped: false,
  })
  assert.equal(entry.answers[1].skipped, true)
  assert.equal(entry.answers[8].content, '')
})

test('keeps the original creation time when an entry is updated', () => {
  const previousEntry = normalizeProblemSolvingEntry({
    id: 'ps-1',
    answers: [],
    createdAt: '2026-08-14T10:00:00.000Z',
    updatedAt: '2026-08-14T10:00:00.000Z',
  })
  const [updatedEntry] = normalizeProblemSolvingEntries([{
    id: 'ps-1',
    answers: [{ questionId: 'solutions', content: '先做一个小实验', skipped: false }],
    updatedAt: '2026-08-14T12:00:00.000Z',
  }], [previousEntry])

  assert.equal(updatedEntry.createdAt, previousEntry.createdAt)
  assert.equal(updatedEntry.updatedAt, '2026-08-14T12:00:00.000Z')
  assert.equal(updatedEntry.answers.find((answer) => answer.questionId === 'solutions').content, '先做一个小实验')
})

test('builds summary stats and preview from non-skipped answers', () => {
  const entry = normalizeProblemSolvingEntry({
    id: 'ps-1',
    answers: [
      { questionId: 'problem-space', content: '', skipped: true },
      { questionId: 'progress', content: '目前大约完成了 30%。', skipped: false },
    ],
  })

  assert.deepEqual(getProblemSolvingEntryStats(entry), {
    answered: 1,
    skipped: 1,
    total: PROBLEM_SOLVING_QUESTIONS.length,
  })
  assert.equal(getProblemSolvingEntryPreview(entry), '目前大约完成了 30%。')
})
