import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MOTIVATIONAL_DIMENSIONS,
  countMotivationalFeelings,
  hasMotivationalFeeling,
  normalizeMotivationalFeelings,
} from './motivationalFeelings.js'

test('四种感受会被补齐并将强度限制在 1 到 10', () => {
  const feelings = normalizeMotivationalFeelings({
    autonomy: { content: '我自己选择了方案，因此感觉更有掌控感。', intensity: 12 },
    competence: { content: '完成了一个困难步骤。', intensity: 0 },
  })

  assert.deepEqual(Object.keys(feelings), MOTIVATIONAL_DIMENSIONS.map((dimension) => dimension.key))
  assert.equal(feelings.autonomy.intensity, 10)
  assert.equal(feelings.competence.intensity, 1)
  assert.equal(feelings.meaning.intensity, null)
})

test('文字或强度任一存在时都会被视为一条火苗记录', () => {
  assert.equal(hasMotivationalFeeling({ content: '来自同伴的反馈让我感到被支持。' }), true)
  assert.equal(hasMotivationalFeeling({ intensity: 7 }), true)
  assert.equal(hasMotivationalFeeling({ content: '  ', intensity: null }), false)
})

test('旧版的具体事件和具体感受会自动合并进大框', () => {
  const feelings = normalizeMotivationalFeelings({
    connection: { source: '朋友主动询问进展', description: '感觉自己不是一个人在努力', intensity: 8 },
  })

  assert.equal(feelings.connection.content, '朋友主动询问进展\n\n感觉自己不是一个人在努力')
  assert.equal(feelings.connection.intensity, 8)
})

test('可以统计已经填写的感受数量', () => {
  const feelings = normalizeMotivationalFeelings({
    autonomy: { content: '自由选择', intensity: 8 },
    competence: { content: '做到了', intensity: 6 },
    meaning: { content: '符合目标' },
  })

  assert.equal(countMotivationalFeelings(feelings), 3)
})
