import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listGoals, deleteGoal, updateGoal, STORAGE_SYNC_EVENT } from '../storage/storage'
import { Sparkles, Flame, BadgeCheck } from 'lucide-react'

export default function Goals() {
  const [goals, setGoals] = useState(() => listGoals())

  function getStartDate(g) {
    return g?.startDate || (g?.createdAt ? String(g.createdAt).slice(0, 10) : '')
  }

  function getCompletedDate(g) {
    return g?.completedDate || ''
  }

  function StatusIcon({ status }) {
    const s = status || 'want'
    if (s === 'doing') return <Flame className="goal-status-icon" aria-hidden />
    if (s === 'done') return <BadgeCheck className="goal-status-icon" aria-hidden />
    return <Sparkles className="goal-status-icon" aria-hidden />
  }

  useEffect(() => {
    function onStorage() {
      setGoals(listGoals())
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener(STORAGE_SYNC_EVENT, onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(STORAGE_SYNC_EVENT, onStorage)
    }
  }, [])

  async function handleDelete(id) {
    const ok = window.confirm('确认删除该目标？删除后其下所有行动也会被移除。')
    if (!ok) return
    deleteGoal(id)
    setGoals(listGoals())
  }

  function handleStatusChange(id, status) {
    updateGoal(id, { status })
    setGoals(listGoals())
  }

  return (
    <div className="page goals-page">
      <div className="page-shell">
        <div className="page-header">
          <div>
            <h2 className="page-title">目标</h2>
            <div className="page-subtitle">记录你想要努力的事情，并为行动与回顾提供锚点。</div>
          </div>
          <Link className="create-btn" to="/new-goal">＋ 新建目标</Link>
        </div>

        <div className="goals-grid">
          {goals.length ? goals.map((g) => (
            <div className="goal-card" key={g.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div className="goal-title"><Link to={`/action/${g.id}`}>{g.title}</Link></div>
                  <div className="goal-meta">{g.reasons && g.reasons.length ? g.reasons[0] : '没有填写理由'}</div>
                  <div className="goal-meta" style={{ marginTop: 4 }}>
                    开始：{getStartDate(g) || '未记录'}
                    {g.status === 'done' ? ` · 做完啦：${getCompletedDate(g) || '未记录'}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <span
                    className={`goal-tag goal-tag-${g.status || 'want'}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      const next = g.status === 'want' ? 'doing' : g.status === 'doing' ? 'done' : 'want'
                      handleStatusChange(g.id, next)
                    }}
                    title="点击切换状态：想要做 → 正在做 → 做完了"
                  >
                    <StatusIcon status={g.status} />
                    {g.status === 'want' ? '想要做' : g.status === 'doing' ? '正在做' : '做完了'}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Link className="small-btn ghost" to={`/edit-goal/${g.id}`}>编辑</Link>
                    <button className="small-btn danger" onClick={() => handleDelete(g.id)}>删除</button>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <div className="goal-meta">预期：{g.expectedOutcome || '未设置'}</div>
              </div>
            </div>
          )) : (
            <div className="card-surface" style={{ padding: 18 }}>
              还没有目标，点击右上角“＋ 新建目标”开始吧～
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
