import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getExerciseFeelingText } from '../lib/actionRecord'
import { updateExerciseAction } from '../storage/storage'

function isoToLocalInput(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function createDraft(action) {
  return {
    arousal: action?.scores?.arousal ?? 5,
    valence: action?.scores?.valence ?? 0,
    startTime: isoToLocalInput(action?.startTime),
    endTime: isoToLocalInput(action?.endTime),
    content: action?.content || '',
    feeling: getExerciseFeelingText(action),
    celebration: action?.celebration || '',
  }
}

export default function ExerciseReview({ action, exerciseTitle = '', onSave, onCancel } = {}) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState(() => createDraft(action))
  const selectedExerciseLabel = exerciseTitle || action?.exerciseName || '当前运动'

  function buildPatch() {
    const parsedStart = new Date(draft.startTime)
    if (Number.isNaN(parsedStart.getTime())) {
      window.alert('开始时间格式不正确')
      return null
    }

    let parsedEnd = null
    if (draft.endTime) {
      parsedEnd = new Date(draft.endTime)
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
      exerciseName: selectedExerciseLabel,
      content: draft.content,
      scores: { arousal: Number(draft.arousal), valence: Number(draft.valence) },
      feeling: draft.feeling,
      bingo: '',
      celebration: draft.celebration,
    }
  }

  function handleSave() {
    if (!action) return
    if (!draft.startTime) {
      window.alert('请填写开始时间')
      return
    }

    const patch = buildPatch()
    if (!patch) return
    const updated = updateExerciseAction(action.id, patch)
    if (onSave) onSave(updated)
  }

  function handleOpenWorkExperience() {
    if (!action) return
    if (!draft.startTime) {
      window.alert('请先填写开始时间，再进入运动经验页面')
      return
    }

    const patch = buildPatch()
    if (!patch) return
    updateExerciseAction(action.id, patch)
    navigate(`/exercise-goals/${action.goalId}/actions/${action.id}/work-experience`, {
      state: {
        returnTo: `/exercise/${action.goalId}?reviewAction=${action.id}`,
        returnLabel: '返回运动记录',
        basePath: '/exercise',
      },
    })
  }

  if (!action) return null

  return (
    <div className="action-review exercise-review">
      <div className="exercise-review-hero">
        <div>
          <div className="exercise-review-eyebrow">运动回顾</div>
          <div className="exercise-review-heading">把这次训练的感受、亮点和经验沉淀下来</div>
          <div className="exercise-review-summary">当前记录对象：{selectedExerciseLabel}</div>
        </div>
        <div className="exercise-review-hero-card">
          <div className="review-area-title">记录建议</div>
          <div className="review-expectation-value">先补齐时间和情绪，再写下动作内容、这次最满意的点，以及给自己的小奖励。</div>
        </div>
      </div>

      <div className="review-expectation-card exercise-review-focus-card">
        <div className="review-section-title">本次运动</div>
        <div className="review-expectation-grid">
          <div className="review-expectation-item review-expectation-item-wide exercise-review-highlight">
            <div className="review-area-title">当前运动项目</div>
            <div className="review-expectation-value">{selectedExerciseLabel}</div>
          </div>
        </div>
      </div>

      <div className="review-grid">
        <div className="review-section exercise-review-panel exercise-review-panel-primary">
          <div className="review-section-title">状态与体感</div>

          <div className="score-row exercise-review-time-row" style={{ marginBottom: 10 }}>
            <div className="score-label">运动时间</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>开始时间</div>
                <input type="datetime-local" value={draft.startTime} onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))} title="开始时间" style={{ width: '100%' }} />
              </div>
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>结束时间（可选）</div>
                <input type="datetime-local" value={draft.endTime} onChange={(event) => setDraft((current) => ({ ...current, endTime: event.target.value }))} title="结束时间（可选）" style={{ width: '100%' }} />
              </div>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>运动项目已由当前页面确定，这里只需要修正时间与感受。</div>
          </div>

          <div className="score-row">
            <div className="score-label">唤醒度（0-10）</div>
            <input type="range" min="0" max="10" value={draft.arousal} onChange={(event) => setDraft((current) => ({ ...current, arousal: event.target.value }))} />
            <input className="score-number" type="number" min="0" max="10" value={draft.arousal} onChange={(event) => setDraft((current) => ({ ...current, arousal: event.target.value }))} />
          </div>

          <div className="score-row">
            <div className="score-label">效价（-10 ~ 10）</div>
            <input type="range" min="-10" max="10" value={draft.valence} onChange={(event) => setDraft((current) => ({ ...current, valence: event.target.value }))} />
            <input className="score-number" type="number" min="-10" max="10" value={draft.valence} onChange={(event) => setDraft((current) => ({ ...current, valence: event.target.value }))} />
          </div>
        </div>

        <div className="review-section exercise-review-panel exercise-review-panel-secondary">
          <div className="review-section-title">运动回顾</div>

          <div className="review-areas">
            <div className="review-area exercise-review-area-main">
              <div className="review-area-title">运动内容</div>
              <textarea value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} placeholder="这次具体做了什么？（可选）" />
            </div>

            <div className="review-area exercise-review-area-accent">
              <div className="review-area-title">运动感受</div>
              <textarea value={draft.feeling} onChange={(event) => setDraft((current) => ({ ...current, feeling: event.target.value }))} placeholder="记录疲惫、卡住、满足、愉悦或成就感等真实感受。（可选）" />
            </div>

            <div className="review-area exercise-review-area-celebration">
              <div className="review-area-title">庆祝小活动</div>
              <textarea value={draft.celebration} onChange={(event) => setDraft((current) => ({ ...current, celebration: event.target.value }))} placeholder="例如：喝杯电解质水 / 拉伸 10 分钟" />
            </div>
          </div>
        </div>
      </div>

      <div className="review-actions">
        <button className="small-btn ghost" onClick={handleOpenWorkExperience}>运动经验</button>
        {onCancel && <button className="small-btn ghost" onClick={onCancel}>稍后再写</button>}
        <button className="btn-primary" onClick={handleSave}>保存回顾</button>
      </div>
    </div>
  )
}