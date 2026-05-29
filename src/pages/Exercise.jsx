import React, { useMemo } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { listExerciseGoals } from '../storage/storage'

const LAST_GOAL_KEY = 'action-journal:lastExerciseGoalId'

export default function ExerciseEntry() {
  const goals = useMemo(() => {
    try {
      return listExerciseGoals()
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

    if (last && goals.some((goal) => goal.id === last)) return last

    const doing = goals.find((goal) => goal.status === 'doing')
    if (doing) return doing.id

    return goals[0].id
  }, [goals])

  if (!targetId) {
    return (
      <div className="page">
        <div className="page-shell">
          <div className="page-header">
            <div>
              <h2 className="page-title">运动</h2>
              <div className="page-subtitle">记录你想坚持的运动，并补录每一次运动回顾。</div>
            </div>
          </div>

          <div className="card-surface" style={{ padding: 14 }}>
            <div className="muted">还没有运动项，先创建一个运动，再开始记录。</div>
            <div style={{ marginTop: 12 }}>
              <Link className="create-btn" to="/new-exercise">＋ 新建运动</Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <Navigate to={`/exercise/${targetId}`} replace />
}