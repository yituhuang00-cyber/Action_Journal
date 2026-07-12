import React, { useEffect, useMemo, useRef, useState } from 'react'
import { listAllActions, getDailyAchievement, getGoal, getAction, setDailyAchievement, STORAGE_SYNC_EVENT } from '../storage/storage'
import ActionReview from '../components/ActionReview'

function getTodayKey() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000)
  return local.toISOString().slice(0, 10)
}

function isoToLocalDateKey(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return local.toISOString().slice(0, 10)
}

function buildTodayActions(todayKey) {
  return listAllActions()
    .filter((action) => !!action.endTime && isoToLocalDateKey(action.endTime) === todayKey)
    .sort((left, right) => (right.endTime || '').localeCompare(left.endTime || ''))
}

export default function DailyAchievements() {
  const [todayKey] = useState(() => getTodayKey())
  const [todayActions, setTodayActions] = useState(() => buildTodayActions(getTodayKey()))
  const [selectedForReview, setSelectedForReview] = useState(null)
  const [achievementText, setAchievementText] = useState(() => getDailyAchievement(getTodayKey()))
  const achievementHydratedRef = useRef(false)

  useEffect(() => {
    achievementHydratedRef.current = true
  }, [])

  useEffect(() => {
    if (!achievementHydratedRef.current) return
    const t = setTimeout(() => {
      setDailyAchievement(todayKey, achievementText)
    }, 400)
    return () => clearTimeout(t)
  }, [achievementText, todayKey])

  function timeText(iso) {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  function durationMinutes(a) {
    if (!a?.startTime || !a?.endTime) return 0
    const start = new Date(a.startTime).getTime()
    const end = new Date(a.endTime).getTime()
    const mins = Math.round((end - start) / 60000)
    return Number.isFinite(mins) && mins > 0 ? mins : 0
  }

  useEffect(() => {
    function refreshTodayActions() {
      setTodayActions(buildTodayActions(todayKey))
    }

    const id = setInterval(refreshTodayActions, 15 * 1000)
    function onStorage() { refreshTodayActions() }
    window.addEventListener('storage', onStorage)
    window.addEventListener(STORAGE_SYNC_EVENT, onStorage)
    return () => {
      clearInterval(id)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(STORAGE_SYNC_EVENT, onStorage)
    }
  }, [todayKey])

  const grouped = useMemo(() => {
    const map = new Map()
    for (const a of todayActions) {
      const goal = getGoal(a.goalId)
      const goalId = a.goalId || 'none'
      if (!map.has(goalId)) {
        map.set(goalId, {
          goalId,
          goalTitle: goal?.title || '无目标',
          actions: [],
          minutes: 0,
        })
      }
      const g = map.get(goalId)
      g.actions.push(a)
      g.minutes += durationMinutes(a)
    }

    const list = Array.from(map.values())
    list.sort((a, b) => {
      if (b.minutes !== a.minutes) return b.minutes - a.minutes
      return a.goalTitle.localeCompare(b.goalTitle)
    })
    return list
  }, [todayActions])

  const summary = useMemo(() => {
    const totalMinutes = todayActions.reduce((sum, a) => sum + durationMinutes(a), 0)
    const goalCount = new Set(todayActions.map((a) => a.goalId || 'none')).size
    return {
      count: todayActions.length,
      minutes: totalMinutes,
      goalCount,
    }
  }, [todayActions])

  return (
    <div className="page daily-achievements-page">
      <div className="page-shell achievements-shell">
        <div className="page-header">
          <div>
            <h2 className="page-title">日成就</h2>
            <div className="page-subtitle">今天（{todayKey}）的完成与感受</div>
          </div>

          <div className="achievements-stats">
            <div className="ach-stat">
              <div className="ach-stat-label">完成行动</div>
              <div className="ach-stat-value">{summary.count}</div>
            </div>
            <div className="ach-stat">
              <div className="ach-stat-label">累计分钟</div>
              <div className="ach-stat-value">{summary.minutes}</div>
            </div>
            <div className="ach-stat">
              <div className="ach-stat-label">涉及目标</div>
              <div className="ach-stat-value">{summary.goalCount}</div>
            </div>
          </div>
        </div>

        <div className="achievements-grid">
          <div className="ach-card">
            <div className="ach-card-title">今天的成就</div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>写下你完成了什么、哪里做得好、以及此刻的感受。</div>
            <textarea
              className="large-textarea"
              placeholder="写下今天你完成了什么，以及你的感受"
              value={achievementText}
              onChange={(e) => setAchievementText(e.target.value)}
              onBlur={() => setDailyAchievement(todayKey, achievementText)}
            />
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}></div>
          </div>

          <div className="ach-card">
            <div className="ach-card-title">今天完成的行动</div>
            {grouped.length ? (
              <div className="ach-groups">
                {grouped.map((g) => (
                  <div key={g.goalId} className="ach-group">
                    <div className="ach-group-header">
                      <div className="ach-group-title">{g.goalTitle}</div>
                      <div className="ach-group-meta muted">{g.actions.length} 条 · {g.minutes} 分钟</div>
                    </div>
                    <div className="ach-action-list">
                      {g.actions.map((a) => {
                        const mins = durationMinutes(a)
                        const arousal = a.scores?.arousal ?? 0
                        const valence = a.scores?.valence ?? 0
                        const valenceClass = valence > 0 ? 'pos' : valence < 0 ? 'neg' : 'neu'
                        return (
                          <div key={a.id} className="ach-action-row">
                            <div className="ach-action-main">
                              <div className="ach-action-time">
                                {timeText(a.startTime)}{a.startTime && a.endTime ? ' – ' : ''}{timeText(a.endTime)}
                                {mins ? <span className="ach-dot">·</span> : null}
                                {mins ? <span>{mins} 分钟</span> : null}
                              </div>
                              <div className="ach-action-content">
                                {a.content || a.nextAction || a.notes || '（未填写内容）'}
                              </div>
                              {a.content && (a.nextAction || a.notes) ? (
                                <div className="ach-action-notes muted">下一步行动：{a.nextAction || a.notes}</div>
                              ) : null}
                            </div>

                            <div className="ach-action-meta">
                              <span className="ach-badge">唤醒 {arousal}</span>
                              <span className={`ach-badge ${valenceClass}`}>效价 {valence}</span>
                              <button
                                className="small-btn ghost"
                                onClick={() => {
                                  const fresh = getAction(a.id)
                                  setSelectedForReview(fresh)
                                }}
                              >
                                回顾
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ach-empty">
                <div style={{ fontWeight: 700 }}>今天还没有完成的行动</div>
                <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>去“行动”页开始一次计时，结束后会自动出现在这里。</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedForReview && (
        <div className="modal-overlay" onMouseDown={() => setSelectedForReview(null)}>
          <div className="modal-content" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">行动回顾</div>
                <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                  {getGoal(selectedForReview.goalId)?.title || '无目标'} · {timeText(selectedForReview.startTime)} – {timeText(selectedForReview.endTime)}
                </div>
              </div>
              <button className="small-btn ghost" onClick={() => setSelectedForReview(null)}>关闭</button>
            </div>

            <ActionReview
              action={selectedForReview}
              onCancel={() => setSelectedForReview(null)}
              onSave={() => {
                setSelectedForReview(null)
                setTodayActions(buildTodayActions(todayKey))
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
