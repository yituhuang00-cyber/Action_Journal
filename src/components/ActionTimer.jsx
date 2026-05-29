import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { addAction, updateAction, listActionsByGoal } from '../storage/storage'
import useHealthReminders from '../hooks/useHealthReminders'

export default function ActionTimer({ goalId, onStopped, onStarted } = {}) {
  const [running, setRunning] = useState(false)
  const [startTime, setStartTime] = useState(null)
  const [currentActionId, setCurrentActionId] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [startPromptOpen, setStartPromptOpen] = useState(false)
  const [expectedDurationMinutes, setExpectedDurationMinutes] = useState('')
  const [expectedOutcome, setExpectedOutcome] = useState('')
  const [startPromptError, setStartPromptError] = useState('')
  const reminders = useHealthReminders()

  function renderStartPrompt() {
    if (!startPromptOpen || typeof document === 'undefined') return null

    return createPortal(
      <div className="modal-overlay" onMouseDown={closeStartPrompt} role="presentation">
        <div className="modal-content start-action-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="开始行动前确认预期">
          <div className="modal-header">
            <div>
              <div className="modal-title">开始行动前，先设定这次预期</div>
              <div className="muted" style={{ marginTop: 2, fontSize: 13 }}>先想清楚做多久、做到什么，能让行动更聚焦。</div>
            </div>
            <button className="small-btn ghost" onClick={closeStartPrompt}>取消</button>
          </div>

          <form
            className="manual-step-form start-action-form"
            onSubmit={(e) => {
              e.preventDefault()
              confirmStart()
            }}
          >
            <div className="start-action-grid">
              <div>
                <label htmlFor="expected-duration">1. 你期待本次行动的持续时长是多少？</label>
                <input
                  id="expected-duration"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={expectedDurationMinutes}
                  onChange={(e) => {
                    setExpectedDurationMinutes(e.target.value)
                    if (startPromptError) setStartPromptError('')
                  }}
                  placeholder="例如：45"
                />
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  预计时长：{formatExpectedDuration(expectedDurationMinutes)}
                </div>
              </div>

              <div>
                <label htmlFor="expected-outcome">2. 你期待本次行动结束之后，你可以达成怎样的目标？具体、可实现、可量化。</label>
                <textarea
                  id="expected-outcome"
                  rows="4"
                  value={expectedOutcome}
                  onChange={(e) => {
                    setExpectedOutcome(e.target.value)
                    if (startPromptError) setStartPromptError('')
                  }}
                  placeholder="例如：完成 1 页提纲，并写出 300 字初稿"
                />
              </div>
            </div>

            {startPromptError && <div className="start-action-error">{startPromptError}</div>}

            <div className="review-actions">
              <button type="button" className="small-btn ghost" onClick={closeStartPrompt}>取消</button>
              <button type="submit" className="btn-primary">确认并开始行动</button>
            </div>
          </form>
        </div>
      </div>,
      document.body,
    )
  }

  useEffect(() => {
    if (!goalId) return
    const actions = listActionsByGoal(goalId)
    const ongoing = actions.find((a) => a.startTime && !a.endTime)
    if (!ongoing) {
      setRunning(false)
      setStartTime(null)
      setCurrentActionId(null)
      setElapsed(0)
      return
    }

    setCurrentActionId(ongoing.id)
    setStartTime(ongoing.startTime)
    setRunning(true)
    const diff = Date.now() - new Date(ongoing.startTime).getTime()
    setElapsed(Math.max(0, Math.floor(diff / 1000)))
  }, [goalId])

  useEffect(() => {
    let t = null
    if (running && startTime) {
      // update every second
      t = setInterval(() => {
        const diff = Date.now() - new Date(startTime).getTime()
        setElapsed(Math.floor(diff / 1000))
      }, 1000)
    } else {
      setElapsed(0)
    }
    return () => clearInterval(t)
  }, [running, startTime])

  useEffect(() => {
    if (!startPromptOpen) return undefined
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        setStartPromptOpen(false)
        setStartPromptError('')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [startPromptOpen])

  function openStartPrompt() {
    setExpectedDurationMinutes('')
    setExpectedOutcome('')
    setStartPromptError('')
    setStartPromptOpen(true)
  }

  function closeStartPrompt() {
    setStartPromptOpen(false)
    setStartPromptError('')
  }

  async function confirmStart() {
    const duration = Number(expectedDurationMinutes)
    const outcome = expectedOutcome.trim()

    if (!Number.isFinite(duration) || duration <= 0) {
      setStartPromptError('请填写大于 0 的预期持续时长（分钟）。')
      return
    }

    if (!outcome) {
      setStartPromptError('请填写本次行动结束后期待达成的具体目标。')
      return
    }

    const total = reminders.totalMinutesToday
    const conservative = reminders.conservativeMinutes
    const ambitious = reminders.ambitiousMinutes

    // 逻辑：
    // 1) 超过进取时长 -> 弹出第二个提示（更强提醒）
    // 2) 超过保守时长（但未超过进取时长）-> 弹出第一个提示
    if (total > ambitious) {
      const ok = window.confirm('【提示2】你已超过今日设定的进取时长。如果继续行动，可能会效率下降并增加疲惫感。仍要继续创建行动吗？')
      if (!ok) return
    } else if (total > conservative) {
      const ok = window.confirm('【提示1】你已超过今日设定的保守时长。你可以休息一下，或继续创建新的行动。是否继续？')
      if (!ok) return
    }

    const now = new Date().toISOString()
    const action = addAction(goalId, {
      startTime: now,
      expectedDurationMinutes: Math.round(duration),
      expectedOutcome: outcome,
    })
    setCurrentActionId(action.id)
    setStartTime(now)
    setRunning(true)
    closeStartPrompt()
    if (onStarted) onStarted(action)
  }

  function formatExpectedDuration(minutesValue) {
    const minutes = Number(minutesValue)
    if (!Number.isFinite(minutes) || minutes <= 0) return '未设置'
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    if (!hours) return `${remainingMinutes} 分钟`
    if (!remainingMinutes) return `${hours} 小时`
    return `${hours} 小时 ${remainingMinutes} 分钟`
  }

  function handleStop() {
    if (!currentActionId) {
      setRunning(false)
      return
    }
    const now = new Date().toISOString()
    const updated = updateAction(currentActionId, { endTime: now })
    setRunning(false)
    setStartTime(null)
    setCurrentActionId(null)
    setElapsed(0)
    if (onStopped) onStopped(updated)
  }

  function formatElapsed(sec) {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  return (
    <>
      <div className="action-timer">
        <div>本次行动开始的时间是：{startTime ? new Date(startTime).toLocaleString() : '尚未开始'}</div>
        <div style={{ marginTop: 6 }}>已用时：{running ? formatElapsed(elapsed) : '-'}</div>
        <div className="timer-controls" style={{ marginTop: 8 }}>
          {!running ? (
            <button onClick={openStartPrompt} className="btn-primary">开始行动</button>
          ) : (
            <button onClick={handleStop} className="btn-secondary">行动结束</button>
          )}
        </div>
      </div>

      {renderStartPrompt()}
    </>
  )
}
