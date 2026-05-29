import React, { useMemo } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { listGoals } from '../storage/storage'

const LAST_GOAL_KEY = 'action-journal:lastGoalId'

export default function ActionEntry() {
  const goals = useMemo(() => {
    try {
      return listGoals()
    } catch {
      return []
    }
  }, [])

  const targetId = useMemo(() => {
    if (!goals.length) return null

    let last = null
    try {
      last = localStorage.getItem(LAST_GOAL_KEY)
    } catch {
      last = null
    }

    if (last && goals.some((g) => g.id === last)) return last

    const doing = goals.find((g) => g.status === 'doing')
    if (doing) return doing.id

    return goals[0].id
  }, [goals])

  if (!targetId) {
    return (
      <div className="page">
        <div className="page-shell">
          <div className="page-header">
            <div>
              <h2 className="page-title">行动</h2>
              <div className="page-subtitle">开始一次行动计时，结束后进行回顾。</div>
            </div>
          </div>

          <div className="card-surface" style={{ padding: 14 }}>
            <div className="muted">还没有目标，先创建一个目标再开始行动与回顾。</div>
            <div style={{ marginTop: 12 }}>
              <Link className="create-btn" to="/new-goal">＋ 新建目标</Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <Navigate to={`/action/${targetId}`} replace />
}
