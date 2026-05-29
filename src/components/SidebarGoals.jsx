import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listGoals, STORAGE_SYNC_EVENT } from '../storage/storage'

const SIDEBAR_FILTER_KEY = 'action-journal:sidebarGoalStatusFilter'
const VALID_FILTERS = new Set(['all', 'want', 'doing', 'done'])

function normalizeFilter(v) {
  return VALID_FILTERS.has(v) ? v : 'all'
}

export default function SidebarGoals({ activeId, basePath = '/goal' } = {}) {
  const [goals, setGoals] = useState(() => {
    try {
      return listGoals()
    } catch {
      return []
    }
  })
  const [statusFilter, setStatusFilter] = useState(() => {
    try {
      return normalizeFilter(localStorage.getItem(SIDEBAR_FILTER_KEY))
    } catch {
      return 'all'
    }
  })

  function getStartDate(g) {
    return g?.startDate || (g?.createdAt ? String(g.createdAt).slice(0, 10) : '')
  }

  function getCompletedDate(g) {
    return g?.completedDate || ''
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
      setGoals(listGoals())
    } catch {
      setGoals([])
    }
  }

  useEffect(() => {
    function onStorage(e) {
      if (e?.key === SIDEBAR_FILTER_KEY) {
        setStatusFilter(normalizeFilter(e.newValue))
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
  const filteredGoals = goals.filter((g) => {
    if (normalizedFilter === 'all') return true
    return (g.status || 'want') === normalizedFilter
  })

  const activeGoal = activeId ? goals.find((g) => g.id === activeId) : null
  const activeInFilter = activeGoal ? filteredGoals.some((g) => g.id === activeGoal.id) : true
  const sidebarGoals = filteredGoals

  function statusLabel(s) {
    if (s === 'doing') return '正在做'
    if (s === 'done') return '做完了'
    return '想要做'
  }

  return (
    <div className="sidebar-goals">
      <h4>当前努力的事情</h4>

      <div className="sidebar-filter-row" role="group" aria-label="按状态筛选目标">
        <button
          type="button"
          className={`small-btn ${statusFilter === 'all' ? 'active' : 'ghost'}`}
          onClick={() => persistFilter('all')}
        >
          全部
        </button>
        <button
          type="button"
          className={`small-btn ${statusFilter === 'want' ? 'active' : 'ghost'}`}
          onClick={() => persistFilter('want')}
        >
          想要做
        </button>
        <button
          type="button"
          className={`small-btn ${statusFilter === 'doing' ? 'active' : 'ghost'}`}
          onClick={() => persistFilter('doing')}
        >
          正在做
        </button>
        <button
          type="button"
          className={`small-btn ${statusFilter === 'done' ? 'active' : 'ghost'}`}
          onClick={() => persistFilter('done')}
        >
          做完了
        </button>
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
        {sidebarGoals.length ? (
          sidebarGoals.map((g) => (
            <li key={g.id} className={g.id === activeId ? 'active' : ''}>
              <div>
                <Link to={`${basePath}/${g.id}`}>{g.title}</Link>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  开始：{getStartDate(g) || '未记录'}
                  {g.status === 'done' ? ` · 做完啦：${getCompletedDate(g) || '未记录'}` : ''}
                </div>
              </div>
            </li>
          ))
        ) : (
          <li>{goals.length ? '该筛选下暂无目标' : '还没有目标，去创建一个吧'}</li>
        )}
      </ul>
    </div>
  )
}
