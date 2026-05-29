import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listExerciseGoals, STORAGE_SYNC_EVENT } from '../storage/storage'

const SIDEBAR_FILTER_KEY = 'action-journal:sidebarExerciseStatusFilter'
const VALID_FILTERS = new Set(['all', 'want', 'doing', 'done'])

function normalizeFilter(value) {
  return VALID_FILTERS.has(value) ? value : 'all'
}

export default function SidebarExercises({ activeId, basePath = '/exercise' } = {}) {
  const [goals, setGoals] = useState([])
  const [statusFilter, setStatusFilter] = useState(() => {
    try {
      return normalizeFilter(localStorage.getItem(SIDEBAR_FILTER_KEY))
    } catch {
      return 'all'
    }
  })

  function getStartDate(goal) {
    return goal?.startDate || (goal?.createdAt ? String(goal.createdAt).slice(0, 10) : '')
  }

  function getCompletedDate(goal) {
    return goal?.completedDate || ''
  }

  function persistFilter(next) {
    const normalized = normalizeFilter(next)
    setStatusFilter(normalized)
    try {
      localStorage.setItem(SIDEBAR_FILTER_KEY, normalized)
    } catch {
      // ignore
    }
  }

  function load() {
    try {
      setGoals(listExerciseGoals())
    } catch {
      setGoals([])
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    function onStorage(event) {
      if (event?.key === SIDEBAR_FILTER_KEY) {
        setStatusFilter(normalizeFilter(event.newValue))
        return
      }
      load()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(STORAGE_SYNC_EVENT, onStorage)
    const id = setInterval(load, 60 * 1000)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(STORAGE_SYNC_EVENT, onStorage)
      clearInterval(id)
    }
  }, [])

  const normalizedFilter = normalizeFilter(statusFilter)
  const filteredGoals = goals.filter((goal) => {
    if (normalizedFilter === 'all') return true
    return (goal.status || 'want') === normalizedFilter
  })

  const activeGoal = activeId ? goals.find((goal) => goal.id === activeId) : null
  const activeInFilter = activeGoal ? filteredGoals.some((goal) => goal.id === activeGoal.id) : true

  function statusLabel(status) {
    if (status === 'doing') return '正在做'
    if (status === 'done') return '做完了'
    return '想要做'
  }

  return (
    <div className="sidebar-goals">
      <h4>当前在做的运动</h4>

      <div className="sidebar-filter-row" role="group" aria-label="按状态筛选运动">
        <button type="button" className={`small-btn ${statusFilter === 'all' ? 'active' : 'ghost'}`} onClick={() => persistFilter('all')}>全部</button>
        <button type="button" className={`small-btn ${statusFilter === 'want' ? 'active' : 'ghost'}`} onClick={() => persistFilter('want')}>想要做</button>
        <button type="button" className={`small-btn ${statusFilter === 'doing' ? 'active' : 'ghost'}`} onClick={() => persistFilter('doing')}>正在做</button>
        <button type="button" className={`small-btn ${statusFilter === 'done' ? 'active' : 'ghost'}`} onClick={() => persistFilter('done')}>做完了</button>
      </div>

      {normalizedFilter !== 'all' && activeGoal && !activeInFilter && (
        <div className="muted" style={{ fontSize: 12, margin: '6px 0 10px' }}>
          当前打开：{activeGoal.title}（{statusLabel(activeGoal.status)}），不在该筛选范围。
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <button type="button" className="small-btn ghost" onClick={() => persistFilter('all')}>切到全部</button>
            <button type="button" className="small-btn ghost" onClick={() => persistFilter(activeGoal.status || 'want')}>切到{statusLabel(activeGoal.status)}</button>
          </div>
        </div>
      )}

      <ul>
        {filteredGoals.length ? (
          filteredGoals.map((goal) => (
            <li key={goal.id} className={goal.id === activeId ? 'active' : ''}>
              <div>
                <Link to={`${basePath}/${goal.id}`}>{goal.title}</Link>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  开始：{getStartDate(goal) || '未记录'}
                  {goal.status === 'done' ? ` · 做完啦：${getCompletedDate(goal) || '未记录'}` : ''}
                </div>
              </div>
            </li>
          ))
        ) : (
          <li>{goals.length ? '该筛选下暂无运动' : '还没有运动项，去创建一个吧'}</li>
        )}
      </ul>
    </div>
  )
}