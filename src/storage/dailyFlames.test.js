import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addAction,
  createFlameEntry,
  createGoal,
  deleteFlameEntry,
  getAction,
  getDailyFlame,
  importData,
  listFlameEntries,
  listDailyFlames,
  setDailyFlame,
  updateAction,
  updateFlameEntry,
} from './storage.js'

function resetState(state = {}) {
  importData(state, { merge: false })
}

test('每日火苗支持保存四种感受并兼容旧备份', () => {
  resetState({ goals: {} })
  assert.equal(getDailyFlame('2026-08-14').autonomy.intensity, null)

  setDailyFlame('2026-08-14', {
    autonomy: { content: '自己安排了行动顺序，很有掌控感。', intensity: 8 },
  })

  const saved = getDailyFlame('2026-08-14')
  assert.equal(saved.autonomy.intensity, 8)
  assert.equal(saved.autonomy.content, '自己安排了行动顺序，很有掌控感。')
  assert.equal(saved.connection.content, '')
})

test('自主火苗记录支持创建、编辑和删除多条内容', () => {
  resetState()
  const first = createFlameEntry('autonomy', { content: '我选择了今天先做最重要的任务。', intensity: 7 })
  const second = createFlameEntry('autonomy', { content: '我拒绝了一个不必要的安排。', intensity: 9 })

  assert.deepEqual(listFlameEntries().map((entry) => entry.id), [second.id, first.id])
  const updated = updateFlameEntry(first.id, { content: '我自己决定先完成最重要的任务。', intensity: 8 })
  assert.equal(updated.createdAt, first.createdAt)
  assert.equal(updated.intensity, 8)

  assert.equal(deleteFlameEntry(second.id), true)
  assert.deepEqual(listFlameEntries().map((entry) => entry.id), [first.id])
})

test('行动记录会保存并更新四种感受', () => {
  resetState()
  const goal = createGoal({ title: '完成一个目标' })
  const action = addAction(goal.id, {
    startTime: '2026-08-14T08:00:00.000Z',
    motivationalFeelings: {
      competence: { content: '完成了困难步骤，让我感到自己能够做好。', intensity: 7 },
    },
  })

  assert.equal(getAction(action.id).motivationalFeelings.competence.intensity, 7)

  updateAction(action.id, {
    motivationalFeelings: {
      ...action.motivationalFeelings,
      meaning: { content: '这件事符合长期目标，值得继续投入。', intensity: 9 },
    },
  })

  assert.equal(getAction(action.id).motivationalFeelings.meaning.intensity, 9)
})

test('自主记录可以连续保存为多条并按时间倒序读取', () => {
  resetState()
  setDailyFlame('2026-08-15T08:00:00.000Z', {
    autonomy: { content: '第一条自主感记录', intensity: 6 },
  })
  setDailyFlame('2026-08-15T09:00:00.000Z', {
    meaning: { content: '第二条意义感记录', intensity: 8 },
  })

  const entries = listDailyFlames()
  assert.deepEqual(entries.map((entry) => entry.date), [
    '2026-08-15T09:00:00.000Z',
    '2026-08-15T08:00:00.000Z',
  ])
  assert.equal(entries[0].feelings.meaning.content, '第二条意义感记录')
})
