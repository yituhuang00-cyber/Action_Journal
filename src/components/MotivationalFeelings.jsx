import React from 'react'
import {
  MOTIVATIONAL_DIMENSIONS,
  hasMotivationalFeeling,
  normalizeMotivationalFeeling,
  normalizeMotivationalFeelings,
} from '../lib/motivationalFeelings'

export function MotivationalFeelingFields({ dimension, value, onChange }) {
  const feeling = normalizeMotivationalFeeling(value)

  function update(field, nextValue) {
    onChange({ ...feeling, [field]: nextValue })
  }

  return (
    <div className={`motivation-fields motivation-fields-${dimension.key}`}>
      <label>
        <span>具体事件与感受</span>
        <textarea
          rows={6}
          value={feeling.content}
          onChange={(event) => update('content', event.target.value)}
          placeholder={`${dimension.question}\n\n${dimension.descriptionPlaceholder}`}
        />
      </label>
      <div className="motivation-intensity-field">
        <div className="motivation-intensity-head">
          <span>感受强度</span>
          <strong>{feeling.intensity === null ? '未评分' : `${feeling.intensity} / 10`}</strong>
        </div>
        <div className="motivation-intensity-controls">
          <input
            type="range"
            min="1"
            max="10"
            value={feeling.intensity ?? 1}
            className={feeling.intensity === null ? 'is-empty' : ''}
            onChange={(event) => update('intensity', Number(event.target.value))}
            aria-label={`${dimension.label}强度`}
          />
          <input
            type="number"
            min="1"
            max="10"
            value={feeling.intensity ?? ''}
            onChange={(event) => update('intensity', event.target.value === '' ? null : Number(event.target.value))}
            aria-label={`${dimension.label}强度数值`}
            placeholder="1-10"
          />
          {feeling.intensity !== null && (
            <button type="button" className="small-btn ghost" onClick={() => update('intensity', null)}>清除</button>
          )}
        </div>
      </div>
    </div>
  )
}

export function MotivationalFeelingsEditor({ value, onChange, title = '这次行动中的四种感受' }) {
  const feelings = normalizeMotivationalFeelings(value)

  function updateDimension(key, nextFeeling) {
    onChange({ ...feelings, [key]: nextFeeling })
  }

  return (
    <section className="motivation-editor">
      <div className="motivation-editor-header">
        <div>
          <div className="review-section-title">{title}</div>
          <div className="muted">可以只填写这次真实出现的感受；强度使用 1–10 分量化。</div>
        </div>
      </div>
      <div className="motivation-editor-grid">
        {MOTIVATIONAL_DIMENSIONS.map((dimension) => (
          <article className={`motivation-editor-card motivation-${dimension.key}`} key={dimension.key}>
            <div className="motivation-card-title"><span aria-hidden="true">{dimension.icon}</span>{dimension.label}</div>
            <MotivationalFeelingFields
              dimension={dimension}
              value={feelings[dimension.key]}
              onChange={(nextFeeling) => updateDimension(dimension.key, nextFeeling)}
            />
          </article>
        ))}
      </div>
    </section>
  )
}

export function MotivationalFeelingsSummary({ value, emptyText = '' }) {
  const feelings = normalizeMotivationalFeelings(value)
  const populated = MOTIVATIONAL_DIMENSIONS.filter((dimension) => hasMotivationalFeeling(feelings[dimension.key]))

  if (!populated.length) return emptyText ? <div className="muted">{emptyText}</div> : null

  return (
    <div className="motivation-summary action-kv-full">
      <div className="motivation-summary-heading">四种感受</div>
      <div className="motivation-summary-grid">
        {populated.map((dimension) => {
          const feeling = feelings[dimension.key]
          return (
            <div className={`motivation-summary-item motivation-${dimension.key}`} key={dimension.key}>
              <div className="motivation-summary-title">
                <span>{dimension.icon} {dimension.label}</span>
                {feeling.intensity !== null && <strong>{feeling.intensity}/10</strong>}
              </div>
              {feeling.content.trim() && <div>{feeling.content.trim()}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
