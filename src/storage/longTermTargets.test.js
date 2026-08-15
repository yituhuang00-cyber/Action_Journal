import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createLongTermTarget,
  deleteLongTermTarget,
  exportData,
  importData,
  listLongTermTargets,
  reorderLongTermTargets,
  updateLongTermTarget,
} from './storage.js'

function resetState(state = {}) {
  importData(state, { merge: false })
}

test('旧备份会自动补齐长期目标集合', () => {
  resetState({ goals: {} })

  assert.deepEqual(listLongTermTargets(), [])
  assert.deepEqual(JSON.parse(exportData()).longTermTargets, {})
})

test('长期目标支持创建、分类、编辑和删除', () => {
  resetState()

  const conservative = createLongTermTarget({
    title: '  建立稳定的被动收入  ',
    reasons: ['获得更多选择', '  降低风险  ', ''],
    descriptions: ['  每月覆盖基本生活成本  ', '收入来源多元化', ''],
    pathways: ['持续投资低成本指数基金', '建立可复用的数字产品'],
    category: 'conservative',
    periodStart: '2026-08-09',
    periodEnd: '2031-08-09',
  })
  const ambitious = createLongTermTarget({
    title: '创办有国际影响力的公司',
    reasons: ['解决重要问题'],
    category: 'ambitious',
    periodStart: '2026-08-09',
    periodEnd: '2036-08-09',
  })

  assert.equal(conservative.title, '建立稳定的被动收入')
  assert.deepEqual(conservative.reasons, ['获得更多选择', '降低风险'])
  assert.deepEqual(conservative.descriptions, ['每月覆盖基本生活成本', '收入来源多元化'])
  assert.deepEqual(conservative.pathways, ['持续投资低成本指数基金', '建立可复用的数字产品'])
  assert.deepEqual(listLongTermTargets('conservative').map((target) => target.id), [conservative.id])
  assert.deepEqual(listLongTermTargets('ambitious').map((target) => target.id), [ambitious.id])

  const moved = updateLongTermTarget(conservative.id, {
    category: 'ambitious',
    title: '建立可持续的被动收入',
  })
  assert.equal(moved.category, 'ambitious')
  assert.deepEqual(listLongTermTargets('ambitious').map((target) => target.id), [ambitious.id, conservative.id])

  assert.equal(deleteLongTermTarget(ambitious.id), true)
  assert.deepEqual(listLongTermTargets('ambitious').map((target) => target.id), [conservative.id])
})

test('拖拽排序只改变指定分类并保存连续位置', () => {
  resetState()

  const first = createLongTermTarget({ title: '目标一', category: 'conservative' })
  const second = createLongTermTarget({ title: '目标二', category: 'conservative' })
  const ambitious = createLongTermTarget({ title: '进取目标', category: 'ambitious' })

  reorderLongTermTargets('conservative', [second.id, first.id])

  const conservativeTargets = listLongTermTargets('conservative')
  assert.deepEqual(conservativeTargets.map((target) => target.id), [second.id, first.id])
  assert.deepEqual(conservativeTargets.map((target) => target.position), [0, 1])
  assert.deepEqual(listLongTermTargets('ambitious').map((target) => target.id), [ambitious.id])
})

test('导入时会清理非法的长期目标字段', () => {
  resetState({
    longTermTargets: {
      legacy: {
        id: 'legacy',
        title: '  旧目标  ',
        reasons: ['  理由  ', '', null],
        descriptions: ['  描述  ', null],
        pathways: 'not-an-array',
        category: 'unknown',
        periodStart: 'not-a-date',
        periodEnd: '2030-01-01',
        position: -3,
      },
    },
  })

  const [target] = listLongTermTargets()
  assert.equal(target.title, '旧目标')
  assert.deepEqual(target.reasons, ['理由'])
  assert.deepEqual(target.descriptions, ['描述'])
  assert.deepEqual(target.pathways, [])
  assert.equal(target.category, 'conservative')
  assert.equal(target.periodStart, '')
  assert.equal(target.periodEnd, '2030-01-01')
  assert.equal(target.position, 0)
})
