import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createGoal,
  createProblemSolvingEntry,
  deleteProblemSolvingEntry,
  getGoal,
  importData,
  updateProblemSolvingEntry,
} from './storage.js'

function resetState(state = {}) {
  importData(state, { merge: false })
}

test('旧目标会自动补齐问题解决记录集合', () => {
  resetState({
    goals: {
      legacy: { id: 'legacy', title: '旧目标', subTargets: [] },
    },
  })

  assert.deepEqual(getGoal('legacy').problemSolvingEntries, [])
})

test('问题解决记录支持创建、编辑和删除', () => {
  resetState()
  const goal = createGoal({ title: '解决一个具体问题' })
  const created = createProblemSolvingEntry(goal.id, {
    answers: [
      { questionId: 'problem-space', content: '当前每天会被打断 6 次。', skipped: false },
      { questionId: 'exceptions', content: '', skipped: true },
    ],
  })

  assert.equal(getGoal(goal.id).problemSolvingEntries.length, 1)
  assert.equal(created.answers.find((answer) => answer.questionId === 'exceptions').skipped, true)

  const updated = updateProblemSolvingEntry(goal.id, created.id, {
    answers: [{ questionId: 'next-five-percent', content: '先安排 25 分钟不受打扰的时间。', skipped: false }],
  })
  assert.equal(updated.createdAt, created.createdAt)
  assert.equal(
    updated.answers.find((answer) => answer.questionId === 'next-five-percent').content,
    '先安排 25 分钟不受打扰的时间。',
  )

  assert.equal(deleteProblemSolvingEntry(goal.id, created.id), true)
  assert.deepEqual(getGoal(goal.id).problemSolvingEntries, [])
})
