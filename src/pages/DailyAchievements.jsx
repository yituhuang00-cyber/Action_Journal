import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  MOTIVATIONAL_DIMENSIONS,
  countMotivationalFeelings,
  hasMotivationalFeeling,
  normalizeMotivationalFeeling,
  normalizeMotivationalFeelings,
} from '../lib/motivationalFeelings'
import { MotivationalFeelingFields } from '../components/MotivationalFeelings'
import {
  STORAGE_SYNC_EVENT,
  createFlameEntry,
  deleteFlameEntry,
  getAction,
  getDailyFlame,
  getExerciseAction,
  listAllActions,
  listAllExerciseActions,
  listDailyFlames,
  listFlameEntries,
  setDailyFlame,
  updateAction,
  updateExerciseAction,
  updateFlameEntry,
} from '../storage/storage'

function formatRecordedAt(value, fallback = '') {
  if (!value) return fallback || '未记录时间'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback || value
  return date.toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buildFeelingItems() {
  const regularActions = listAllActions().map((action) => ({
    key: `action:${action.id}`,
    kind: 'action',
    recordId: action.id,
    occurredAt: action.endTime || action.startTime || action.createdAt || '',
    detailPath: `/goal/${action.goalId}`,
    feelings: normalizeMotivationalFeelings(action.motivationalFeelings),
  }))
  const exerciseActions = listAllExerciseActions().map((action) => ({
    key: `exercise:${action.id}`,
    kind: 'exercise',
    recordId: action.id,
    occurredAt: action.endTime || action.startTime || action.createdAt || '',
    detailPath: `/exercise/${action.goalId}`,
    feelings: normalizeMotivationalFeelings(action.motivationalFeelings),
  }))
  const legacyDailyEntries = listDailyFlames().map((entry) => ({
    key: `daily:${entry.date}`,
    kind: 'daily',
    recordId: entry.date,
    occurredAt: `${entry.date}T12:00:00`,
    displayDate: entry.date,
    detailPath: '',
    feelings: entry.feelings,
  }))
  const manualEntries = listFlameEntries().map((entry) => ({
    key: `manual:${entry.id}`,
    kind: 'manual',
    recordId: entry.id,
    occurredAt: entry.createdAt,
    detailPath: '',
    feelings: normalizeMotivationalFeelings({
      [entry.dimension]: { content: entry.content, intensity: entry.intensity },
    }),
  }))

  return regularActions
    .concat(exerciseActions, legacyDailyEntries, manualEntries)
    .filter((item) => countMotivationalFeelings(item.feelings) > 0)
    .sort((left, right) => String(right.occurredAt).localeCompare(String(left.occurredAt)))
}

function sortFeelingItems(items, dimensionKey, sortMode) {
  return [...items].sort((left, right) => {
    if (sortMode === 'recent') return String(right.occurredAt).localeCompare(String(left.occurredAt))

    const leftScore = left.feelings[dimensionKey]?.intensity
    const rightScore = right.feelings[dimensionKey]?.intensity
    const leftMissing = leftScore === null || leftScore === undefined
    const rightMissing = rightScore === null || rightScore === undefined
    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1
    const normalizedLeft = leftMissing ? 0 : Number(leftScore)
    const normalizedRight = rightMissing ? 0 : Number(rightScore)
    const delta = sortMode === 'intensity-asc'
      ? normalizedLeft - normalizedRight
      : normalizedRight - normalizedLeft
    if (delta !== 0) return delta
    return String(right.occurredAt).localeCompare(String(left.occurredAt))
  })
}

export default function DailyAchievements() {
  const [drafts, setDrafts] = useState(() => normalizeMotivationalFeelings())
  const [feelingItems, setFeelingItems] = useState(() => buildFeelingItems())
  const [sortMode, setSortMode] = useState('intensity-desc')
  const [editingKey, setEditingKey] = useState('')
  const [editingValue, setEditingValue] = useState(() => normalizeMotivationalFeeling())

  const refreshItems = useCallback(() => {
    setFeelingItems(buildFeelingItems())
  }, [])

  function updateDraft(key, value) {
    setDrafts((current) => normalizeMotivationalFeelings({ ...current, [key]: value }))
  }

  function handleCreate(dimension) {
    const draft = normalizeMotivationalFeeling(drafts[dimension.key])
    if (!hasMotivationalFeeling(draft)) {
      window.alert('请先填写具体事件与感受，或选择一个强度。')
      return
    }
    createFlameEntry(dimension.key, draft)
    setDrafts((current) => normalizeMotivationalFeelings({
      ...current,
      [dimension.key]: normalizeMotivationalFeeling(),
    }))
    refreshItems()
  }

  function startEditing(item, dimensionKey) {
    setEditingKey(`${dimensionKey}:${item.key}`)
    setEditingValue(normalizeMotivationalFeeling(item.feelings[dimensionKey]))
  }

  function clearDimensionInAction(item, dimensionKey) {
    const emptyFeeling = normalizeMotivationalFeeling()
    if (item.kind === 'action') {
      const action = getAction(item.recordId)
      if (!action) return false
      return Boolean(updateAction(action.id, {
        motivationalFeelings: normalizeMotivationalFeelings({
          ...action.motivationalFeelings,
          [dimensionKey]: emptyFeeling,
        }),
      }))
    }
    if (item.kind === 'exercise') {
      const action = getExerciseAction(item.recordId)
      if (!action) return false
      return Boolean(updateExerciseAction(action.id, {
        motivationalFeelings: normalizeMotivationalFeelings({
          ...action.motivationalFeelings,
          [dimensionKey]: emptyFeeling,
        }),
      }))
    }
    if (item.kind === 'daily') {
      const feelings = getDailyFlame(item.recordId)
      setDailyFlame(item.recordId, normalizeMotivationalFeelings({ ...feelings, [dimensionKey]: emptyFeeling }))
      return true
    }
    return deleteFlameEntry(item.recordId)
  }

  function saveEditedItem(item, dimensionKey) {
    const nextFeeling = normalizeMotivationalFeeling(editingValue)
    if (!hasMotivationalFeeling(nextFeeling)) {
      window.alert('记录不能为空；如果不再需要，请使用删除。')
      return
    }

    let saved = null
    if (item.kind === 'manual') {
      saved = updateFlameEntry(item.recordId, nextFeeling)
    } else if (item.kind === 'action') {
      const action = getAction(item.recordId)
      if (action) {
        saved = updateAction(action.id, {
          motivationalFeelings: normalizeMotivationalFeelings({
            ...action.motivationalFeelings,
            [dimensionKey]: nextFeeling,
          }),
        })
      }
    } else if (item.kind === 'exercise') {
      const action = getExerciseAction(item.recordId)
      if (action) {
        saved = updateExerciseAction(action.id, {
          motivationalFeelings: normalizeMotivationalFeelings({
            ...action.motivationalFeelings,
            [dimensionKey]: nextFeeling,
          }),
        })
      }
    } else if (item.kind === 'daily') {
      const feelings = getDailyFlame(item.recordId)
      saved = setDailyFlame(item.recordId, normalizeMotivationalFeelings({
        ...feelings,
        [dimensionKey]: nextFeeling,
      }))
    }

    if (!saved) {
      window.alert('保存失败，请稍后再试。')
      return
    }
    setEditingKey('')
    setEditingValue(normalizeMotivationalFeeling())
    refreshItems()
  }

  function handleDelete(item, dimensionKey) {
    if (!window.confirm('确定删除这条火苗记录吗？')) return
    if (!clearDimensionInAction(item, dimensionKey)) {
      window.alert('删除失败，请稍后再试。')
      return
    }
    if (editingKey === `${dimensionKey}:${item.key}`) setEditingKey('')
    refreshItems()
  }

  useEffect(() => {
    const interval = window.setInterval(refreshItems, 15 * 1000)
    window.addEventListener('storage', refreshItems)
    window.addEventListener(STORAGE_SYNC_EVENT, refreshItems)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('storage', refreshItems)
      window.removeEventListener(STORAGE_SYNC_EVENT, refreshItems)
    }
  }, [refreshItems])

  const summary = useMemo(() => ({
    records: feelingItems.length,
    flames: feelingItems.reduce((count, item) => count + countMotivationalFeelings(item.feelings), 0),
  }), [feelingItems])

  return (
    <div className="page daily-achievements-page flame-page">
      <div className="page-shell achievements-shell flame-shell">
        <div className="page-header flame-page-header">
          <div>
            <div className="page-eyebrow">让内在动力保持燃烧</div>
            <h2 className="page-title">火苗</h2>
          </div>
          <div className="achievements-stats flame-stats">
            <div className="ach-stat"><div className="ach-stat-label">记录</div><div className="ach-stat-value">{summary.records}</div></div>
            <div className="ach-stat"><div className="ach-stat-label">火苗</div><div className="ach-stat-value">{summary.flames}</div></div>
          </div>
        </div>

        <div className="flame-toolbar card-surface">
          <label className="flame-sort-control">
            <span>记录排序</span>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
              <option value="intensity-desc">强度：从高到低</option>
              <option value="intensity-asc">强度：从低到高</option>
              <option value="recent">时间：最近优先</option>
            </select>
          </label>
        </div>

        <div className="flame-dimension-list">
          {MOTIVATIONAL_DIMENSIONS.map((dimension) => {
            const dimensionItems = sortFeelingItems(
              feelingItems.filter((item) => hasMotivationalFeeling(item.feelings[dimension.key])),
              dimension.key,
              sortMode,
            )
            return (
              <section className={`flame-dimension-board flame-${dimension.key}`} key={dimension.key}>
                <div className="flame-dimension-header">
                  <div className="flame-dimension-icon" aria-hidden="true">{dimension.icon}</div>
                  <div>
                    <h3>{dimension.label}</h3>
                    <p>{dimension.question}</p>
                  </div>
                  <span className="flame-count-chip">{dimensionItems.length} 条记录</span>
                </div>

                <div className="flame-board-grid">
                  <div className="flame-daily-entry">
                    <div className="flame-entry-kicker">记录此刻的感受</div>
                    <MotivationalFeelingFields
                      dimension={dimension}
                      value={drafts[dimension.key]}
                      onChange={(value) => updateDraft(dimension.key, value)}
                    />
                    <div className="flame-create-actions">
                      <button type="button" className="btn-primary" onClick={() => handleCreate(dimension)}>保存记录</button>
                    </div>
                  </div>

                  <div className="flame-action-column">
                    <div className="flame-entry-kicker">全部记录</div>
                    {dimensionItems.length ? (
                      <div className="flame-action-list">
                        {dimensionItems.map((item) => {
                          const feeling = item.feelings[dimension.key]
                          const itemEditKey = `${dimension.key}:${item.key}`
                          const isEditing = editingKey === itemEditKey
                          return (
                            <article className={`flame-action-card${isEditing ? ' is-editing' : ''}`} key={itemEditKey}>
                              {isEditing ? (
                                <>
                                  <MotivationalFeelingFields dimension={dimension} value={editingValue} onChange={setEditingValue} />
                                  <div className="flame-record-actions">
                                    <button type="button" className="small-btn ghost" onClick={() => setEditingKey('')}>取消</button>
                                    <button type="button" className="btn-primary" onClick={() => saveEditedItem(item, dimension.key)}>保存修改</button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="flame-action-card-head">
                                    <span>{formatRecordedAt(item.occurredAt, item.displayDate)}</span>
                                    {feeling.intensity !== null && <span className="flame-intensity-badge">{feeling.intensity}/10</span>}
                                  </div>
                                  {feeling.content.trim() && <div className="flame-action-copy">{feeling.content.trim()}</div>}
                                  <div className="flame-action-footer">
                                    <div className="flame-record-actions">
                                      {item.detailPath && <Link className="small-btn ghost" to={item.detailPath}>查看详情</Link>}
                                      <button type="button" className="small-btn ghost" onClick={() => startEditing(item, dimension.key)}>编辑</button>
                                      <button type="button" className="small-btn danger" onClick={() => handleDelete(item, dimension.key)}>删除</button>
                                    </div>
                                  </div>
                                </>
                              )}
                            </article>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="flame-empty-state">还没有{dimension.label}记录。</div>
                    )}
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
