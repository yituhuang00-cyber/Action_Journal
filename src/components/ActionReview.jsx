import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getActionFeelingText } from '../lib/actionRecord'
import { updateAction } from '../storage/storage'

export default function ActionReview({ action, onSave, onCancel } = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [arousal, setArousal] = useState(5)
  const [valence, setValence] = useState(0)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [content, setContent] = useState('')
  const [feeling, setFeeling] = useState('')
  const [celebration, setCelebration] = useState('')
  const [nextAction, setNextAction] = useState('')

  function formatExpectedDuration(minutesValue) {
    const minutes = Number(minutesValue)
    if (!Number.isFinite(minutes) || minutes <= 0) return '未设置'
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    if (!hours) return `${remainingMinutes}分钟`
    if (!remainingMinutes) return `${hours}小时`
    return `${hours}小时${remainingMinutes}分钟`
  }

  function isoToLocalInput(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  useEffect(() => {
    if (!action) return
    setArousal(action.scores?.arousal ?? 5)
    setValence(action.scores?.valence ?? 0)
    setStartTime(isoToLocalInput(action.startTime))
    setEndTime(isoToLocalInput(action.endTime))
    setContent(action.content || '')
    setFeeling(getActionFeelingText(action))
    setCelebration(action.celebration || '')
    setNextAction(action.nextAction || action.notes || '')
  }, [action])

  function buildPatch() {
    const parsedStart = new Date(startTime)
    if (Number.isNaN(parsedStart.getTime())) {
      window.alert('开始时间格式不正确')
      return null
    }

    let parsedEnd = null
    if (endTime) {
      parsedEnd = new Date(endTime)
      if (Number.isNaN(parsedEnd.getTime())) {
        window.alert('结束时间格式不正确')
        return null
      }
      if (parsedEnd.getTime() <= parsedStart.getTime()) {
        window.alert('结束时间需要晚于开始时间')
        return null
      }
    }

    return {
      startTime: parsedStart.toISOString(),
      endTime: parsedEnd ? parsedEnd.toISOString() : null,
      content,
      nextAction,
      scores: { arousal: Number(arousal), valence: Number(valence) },
      feeling,
      rant: feeling,
      bingo: '',
      celebration,
    }
  }

  function handleSave() {
    if (!action) return

    if (!startTime) {
      window.alert('请填写开始时间')
      return
    }

    const patch = buildPatch()
    if (!patch) return
    const updated = updateAction(action.id, patch)
    if (onSave) onSave(updated)
  }

  function handleOpenWorkExperience() {
    if (!action) return
    if (!startTime) {
      window.alert('请先填写开始时间，再进入工作经验页面')
      return
    }

    const patch = buildPatch()
    if (!patch) return

    updateAction(action.id, patch)

    const basePath = location.pathname.startsWith('/action') ? '/action' : '/goal'
    const returnTo = `${basePath}/${action.goalId}?reviewAction=${action.id}`
    navigate(`/goals/${action.goalId}/actions/${action.id}/work-experience`, {
      state: {
        returnTo,
        basePath,
      },
    })
  }

  if (!action) return null

  return (
    <div className="action-review">
      <div className="review-expectation-card">
        <div className="review-section-title">本次行动预期</div>
        <div className="review-expectation-grid">
          <div className="review-expectation-item">
            <div className="review-area-title">预期时长</div>
            <div className="review-expectation-value">{formatExpectedDuration(action.expectedDurationMinutes)}</div>
          </div>
        </div>
      </div>

      <div className="review-grid">
        <div className="review-section">
          <div className="review-section-title">情绪评分</div>

          <div className="score-row" style={{ marginBottom: 10 }}>
            <div className="score-label">行动时间</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>开始时间</div>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  title="开始时间"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>结束时间（可选）</div>
                <input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  title="结束时间（可选）"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>已改为上下布局，避免时间输入框被遮挡</div>
          </div>

          <div className="score-row">
            <div className="score-label">唤醒度（0-10）</div>
            <input
              type="range"
              min="0"
              max="10"
              value={arousal}
              onChange={(e) => setArousal(e.target.value)}
            />
            <input
              className="score-number"
              type="number"
              min="0"
              max="10"
              value={arousal}
              onChange={(e) => setArousal(e.target.value)}
            />
          </div>

          <div className="score-row">
            <div className="score-label">效价（-10 ~ 10）</div>
            <input
              type="range"
              min="-10"
              max="10"
              value={valence}
              onChange={(e) => setValence(e.target.value)}
            />
            <input
              className="score-number"
              type="number"
              min="-10"
              max="10"
              value={valence}
              onChange={(e) => setValence(e.target.value)}
            />
          </div>
        </div>

        <div className="review-section">
          <div className="review-section-title">行动回顾</div>

          <div className="review-areas">
            <div className="review-area">
              <div className="review-area-title">行动内容</div>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="这次具体做了什么？开始行动时写下的预期也会合并到这里。（可选）" />
            </div>

            <div className="review-area">
              <div className="review-area-title">行动感受</div>
              <textarea value={feeling} onChange={(e) => setFeeling(e.target.value)} placeholder="记录卡住、不满、满足、愉悦或成就感等真实感受。（可选）" />
            </div>
          </div>

          <div className="review-inline">
            <label className="review-inline-label">庆祝小活动</label>
            <input type="text" value={celebration} onChange={(e) => setCelebration(e.target.value)} placeholder="例如：喝杯好茶 / 出门走走" />
          </div>

          <div className="review-area" style={{ marginTop: 10 }}>
            <div className="review-area-title">下一步行动</div>
            <textarea value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="例如：明天先完成提纲，再专注 30 分钟写正文" />
          </div>
        </div>
      </div>

      <div className="review-actions">
        <button className="small-btn ghost" onClick={handleOpenWorkExperience}>工作经验</button>
        {onCancel && (
          <button className="small-btn ghost" onClick={onCancel}>稍后再写</button>
        )}
        <button className="btn-primary" onClick={handleSave}>保存回顾</button>
      </div>
    </div>
  )
}
