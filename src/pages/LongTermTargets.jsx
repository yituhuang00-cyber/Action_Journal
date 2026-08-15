import React, { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, CalendarDays, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createLongTermTarget,
  deleteLongTermTarget,
  listLongTermTargets,
  reorderLongTermTargets,
  STORAGE_SYNC_EVENT,
  updateLongTermTarget,
} from '../storage/storage'
import './LongTermTargets.css'

const CATEGORY_OPTIONS = [
  {
    value: 'conservative',
    label: '保守型长期目标',
    shortLabel: '保守型',
    description: '即使节奏平稳，也希望持续推进并实现的目标。',
  },
  {
    value: 'ambitious',
    label: '进取型长期目标',
    shortLabel: '进取型',
    description: '状态和条件理想时，愿意挑战的更高目标。',
  },
]

const VALID_CATEGORIES = new Set(CATEGORY_OPTIONS.map((option) => option.value))

function emptyForm(category = 'conservative') {
  return {
    title: '',
    periodStart: '',
    periodEnd: '',
    reasons: [''],
    descriptions: [''],
    pathways: [''],
    category,
  }
}

function readTargets() {
  const readCategory = (category) => {
    try {
      const result = listLongTermTargets(category)
      return Array.isArray(result) ? result : []
    } catch {
      return []
    }
  }

  return {
    conservative: readCategory('conservative'),
    ambitious: readCategory('ambitious'),
  }
}

function normalizeCategory(category) {
  return VALID_CATEGORIES.has(category) ? category : 'conservative'
}

function formatDate(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey || '')
  if (!match) return dateKey || '未设置'
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`
}

function placeIdBefore(ids, movingId, targetId = '') {
  if (!ids.includes(movingId)) return ids
  if (movingId === targetId) return ids

  const nextIds = ids.filter((id) => id !== movingId)
  if (!targetId) return [...nextIds, movingId]

  const targetIndex = nextIds.indexOf(targetId)
  if (targetIndex === -1) return ids
  nextIds.splice(targetIndex, 0, movingId)
  return nextIds
}

function parseDragPayload(rawValue) {
  if (!rawValue) return null
  try {
    const parsed = JSON.parse(rawValue)
    if (!parsed?.id || !VALID_CATEGORIES.has(parsed.category)) return null
    return { id: String(parsed.id), category: parsed.category }
  } catch {
    return null
  }
}

function MultiPointField({
  field,
  label,
  itemLabel,
  addLabel,
  values,
  optional = false,
  multiline = false,
  onUpdate,
  onAdd,
  onRemove,
}) {
  return (
    <div className="long-term-form-field long-term-form-field-wide">
      <div className="long-term-point-heading">
        <label>{label}{optional ? '（选填）' : ''}</label>
        <button type="button" className="small-btn ghost" onClick={() => onAdd(field)}>
          <Plus size={14} aria-hidden="true" />
          {addLabel}
        </button>
      </div>
      <div className="long-term-point-list">
        {values.map((value, index) => {
          const controlId = `long-term-${field}-${index}`
          return (
            <div className="long-term-point-row" key={index}>
              <label className="long-term-sr-only" htmlFor={controlId}>
                {itemLabel} {index + 1}
              </label>
              {multiline ? (
                <textarea
                  id={controlId}
                  rows="2"
                  value={value}
                  onChange={(event) => onUpdate(field, index, event.target.value)}
                  placeholder={`${itemLabel} ${index + 1}`}
                />
              ) : (
                <input
                  id={controlId}
                  type="text"
                  value={value}
                  onChange={(event) => onUpdate(field, index, event.target.value)}
                  placeholder={`${itemLabel} ${index + 1}`}
                />
              )}
              <button
                type="button"
                className="small-btn danger"
                aria-label={`删除${itemLabel} ${index + 1}`}
                onClick={() => onRemove(field, index)}
              >
                删除
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function LongTermTargets() {
  const [targets, setTargets] = useState(readTargets)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTargetId, setEditingTargetId] = useState('')
  const [form, setForm] = useState(() => emptyForm())
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [draggingTarget, setDraggingTarget] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [sortAnnouncement, setSortAnnouncement] = useState('')
  const modalRef = useRef(null)
  const titleInputRef = useRef(null)
  const returnFocusRef = useRef(null)
  const dragPayloadRef = useRef(null)
  const modalTitleId = useId()
  const modalDescriptionId = useId()
  const modalErrorId = useId()

  function refreshTargets() {
    setTargets(readTargets())
  }

  useEffect(() => {
    function handleStorageChange() {
      refreshTargets()
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener(STORAGE_SYNC_EVENT, handleStorageChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener(STORAGE_SYNC_EVENT, handleStorageChange)
    }
  }, [])

  useEffect(() => {
    if (!modalOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => titleInputRef.current?.focus(), 0)

    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
    }
  }, [modalOpen])

  function openCreateModal(category = 'conservative') {
    returnFocusRef.current = document.activeElement
    setEditingTargetId('')
    setForm(emptyForm(normalizeCategory(category)))
    setFormError('')
    setModalOpen(true)
  }

  function openEditModal(target) {
    returnFocusRef.current = document.activeElement
    setEditingTargetId(target.id)
    setForm({
      title: target.title || '',
      periodStart: target.periodStart || '',
      periodEnd: target.periodEnd || '',
      reasons: Array.isArray(target.reasons) && target.reasons.length ? [...target.reasons] : [''],
      descriptions: Array.isArray(target.descriptions) && target.descriptions.length ? [...target.descriptions] : [''],
      pathways: Array.isArray(target.pathways) && target.pathways.length ? [...target.pathways] : [''],
      category: normalizeCategory(target.category),
    })
    setFormError('')
    setModalOpen(true)
  }

  function closeModal() {
    if (saving) return
    setModalOpen(false)
    setEditingTargetId('')
    setFormError('')
    window.requestAnimationFrame(() => returnFocusRef.current?.focus?.())
  }

  function updateFormField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    if (formError) setFormError('')
  }

  function updatePoint(field, index, value) {
    setForm((current) => ({
      ...current,
      [field]: current[field].map((item, itemIndex) => (itemIndex === index ? value : item)),
    }))
    if (formError) setFormError('')
  }

  function addPoint(field) {
    setForm((current) => ({ ...current, [field]: [...current[field], ''] }))
  }

  function removePoint(field, index) {
    setForm((current) => {
      const nextItems = current[field].filter((_, itemIndex) => itemIndex !== index)
      return { ...current, [field]: nextItems.length ? nextItems : [''] }
    })
  }

  function handleDialogKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeModal()
      return
    }

    if (event.key !== 'Tab' || !modalRef.current) return
    const focusableElements = Array.from(modalRef.current.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ))
    if (!focusableElements.length) return

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault()
      lastElement.focus()
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const title = form.title.trim()
    const periodStart = form.periodStart
    const periodEnd = form.periodEnd
    const reasons = form.reasons.map((reason) => reason.trim()).filter(Boolean)
    const descriptions = form.descriptions.map((description) => description.trim()).filter(Boolean)
    const pathways = form.pathways.map((pathway) => pathway.trim()).filter(Boolean)
    const category = normalizeCategory(form.category)

    if (!title) {
      setFormError('请填写长期目标。')
      titleInputRef.current?.focus()
      return
    }
    if (!periodStart || !periodEnd) {
      setFormError('请选择开始日期和目标日期。')
      return
    }
    if (periodEnd < periodStart) {
      setFormError('目标日期不能早于开始日期。')
      return
    }
    if (!reasons.length) {
      setFormError('请至少填写一条想实现这个目标的理由。')
      return
    }
    if (!pathways.length) {
      setFormError('请至少填写一条实现这个目标的路径。')
      return
    }

    setSaving(true)
    setFormError('')
    try {
      const payload = { title, periodStart, periodEnd, reasons, descriptions, pathways, category }
      if (editingTargetId) {
        await Promise.resolve(updateLongTermTarget(editingTargetId, payload))
      } else {
        await Promise.resolve(createLongTermTarget(payload))
      }
      refreshTargets()
      setModalOpen(false)
      setEditingTargetId('')
      window.requestAnimationFrame(() => returnFocusRef.current?.focus?.())
    } catch {
      setFormError('保存失败，请稍后再试。')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(target) {
    const confirmed = window.confirm(`确认删除长期目标“${target.title}”吗？`)
    if (!confirmed) return

    try {
      await Promise.resolve(deleteLongTermTarget(target.id))
      refreshTargets()
    } catch {
      window.alert('删除失败，请稍后再试。')
    }
  }

  function persistOrder(category, orderedIds, announcement) {
    try {
      reorderLongTermTargets(category, orderedIds)
      refreshTargets()
      setSortAnnouncement(announcement)
    } catch {
      window.alert('顺序保存失败，请稍后再试。')
    }
  }

  function moveTarget(category, targetId, direction) {
    const categoryTargets = targets[category] || []
    const currentIndex = categoryTargets.findIndex((target) => target.id === targetId)
    const nextIndex = currentIndex + direction
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= categoryTargets.length) return

    const orderedIds = categoryTargets.map((target) => target.id)
    ;[orderedIds[currentIndex], orderedIds[nextIndex]] = [orderedIds[nextIndex], orderedIds[currentIndex]]
    const target = categoryTargets[currentIndex]
    persistOrder(
      category,
      orderedIds,
      `“${target.title}”已${direction < 0 ? '上移' : '下移'}到第 ${nextIndex + 1} 位。`,
    )
  }

  function handleDragStart(event, target) {
    const payload = { id: target.id, category: normalizeCategory(target.category) }
    dragPayloadRef.current = payload
    setDraggingTarget(payload)
    event.dataTransfer.setData('text/plain', JSON.stringify(payload))
    event.dataTransfer.effectAllowed = 'move'
  }

  function getDragPayload(event) {
    return dragPayloadRef.current || parseDragPayload(event.dataTransfer.getData('text/plain'))
  }

  function handleDragOver(event, category, targetId = '') {
    const payload = getDragPayload(event)
    if (!payload || payload.category !== category) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (dropTarget?.category !== category || dropTarget?.id !== targetId) {
      setDropTarget({ category, id: targetId })
    }
  }

  function finishDragging() {
    dragPayloadRef.current = null
    setDraggingTarget(null)
    setDropTarget(null)
  }

  function handleDrop(event, category, targetId = '') {
    const payload = getDragPayload(event)
    if (!payload || payload.category !== category) return

    event.preventDefault()
    event.stopPropagation()
    const categoryTargets = targets[category] || []
    const currentIds = categoryTargets.map((target) => target.id)
    const orderedIds = placeIdBefore(currentIds, payload.id, targetId)
    const movedTarget = categoryTargets.find((target) => target.id === payload.id)
    const hasChanged = orderedIds.some((id, index) => id !== currentIds[index])

    if (hasChanged) {
      const nextIndex = orderedIds.indexOf(payload.id)
      persistOrder(
        category,
        orderedIds,
        `“${movedTarget?.title || '长期目标'}”已移动到第 ${nextIndex + 1} 位。`,
      )
    }
    finishDragging()
  }

  const dialogTitle = editingTargetId ? '编辑长期目标' : '新建长期目标'

  return (
    <div className="long-term-targets-page">
      <div className="page-header long-term-targets-header">
        <div>
          <h2 className="page-title">长期目标</h2>
          <div className="page-subtitle">把重要的远期方向分成稳妥方案与进取方案，并按重要程度排好顺序。</div>
        </div>
        <button type="button" className="create-btn" onClick={() => openCreateModal()}>
          <Plus size={17} aria-hidden="true" />
          新建长期目标
        </button>
      </div>

      <div className="long-term-priority-hint" id="long-term-priority-hint">
        <GripVertical size={17} aria-hidden="true" />
        拖动卡片右上角的把手可调整重要顺序，越靠上越重要；也可以使用上移、下移按钮。
      </div>

      <div className="long-term-target-columns">
        {CATEGORY_OPTIONS.map((categoryOption) => {
          const categoryTargets = targets[categoryOption.value] || []
          return (
            <section
              className={`long-term-column long-term-column-${categoryOption.value}`}
              key={categoryOption.value}
              aria-labelledby={`long-term-${categoryOption.value}-heading`}
            >
              <div className="long-term-column-header">
                <div>
                  <div className="long-term-column-title-row">
                    <h3 id={`long-term-${categoryOption.value}-heading`}>{categoryOption.label}</h3>
                    <span className={`long-term-count long-term-count-${categoryOption.value}`}>
                      {categoryTargets.length} 项
                    </span>
                  </div>
                  <p>{categoryOption.description}</p>
                </div>
                <button
                  type="button"
                  className="small-btn ghost long-term-column-create"
                  onClick={() => openCreateModal(categoryOption.value)}
                >
                  <Plus size={15} aria-hidden="true" />
                  新建
                </button>
              </div>

              {categoryTargets.length ? (
                <div className="long-term-card-list" aria-describedby="long-term-priority-hint">
                  {categoryTargets.map((target, index) => {
                    const isDragging = draggingTarget?.id === target.id
                    const isDropTarget = dropTarget?.category === categoryOption.value && dropTarget?.id === target.id
                    const reasons = Array.isArray(target.reasons) ? target.reasons.filter(Boolean) : []
                    const descriptions = Array.isArray(target.descriptions) ? target.descriptions.filter(Boolean) : []
                    const pathways = Array.isArray(target.pathways) ? target.pathways.filter(Boolean) : []
                    return (
                      <article
                        className={`long-term-target-card${isDragging ? ' is-dragging' : ''}${isDropTarget ? ' is-drop-target' : ''}`}
                        key={target.id}
                        onDragOver={(event) => handleDragOver(event, categoryOption.value, target.id)}
                        onDrop={(event) => handleDrop(event, categoryOption.value, target.id)}
                      >
                        <div className="long-term-card-top">
                          <div className="long-term-card-heading">
                            <span className="long-term-priority-number" aria-label={`重要度第 ${index + 1} 位`}>
                              {index + 1}
                            </span>
                            <div>
                              <h4>{target.title}</h4>
                              <span className={`long-term-category-badge long-term-category-badge-${categoryOption.value}`}>
                                {categoryOption.shortLabel}
                              </span>
                            </div>
                          </div>

                          <div className="long-term-order-controls" aria-label={`调整“${target.title}”的重要顺序`}>
                            <span
                              className="long-term-drag-handle"
                              draggable
                              aria-hidden="true"
                              title="拖动调整重要顺序"
                              onDragStart={(event) => handleDragStart(event, target)}
                              onDragEnd={finishDragging}
                            >
                              <GripVertical size={19} />
                            </span>
                            <button
                              type="button"
                              className="long-term-order-btn"
                              disabled={index === 0}
                              aria-label={`上移“${target.title}”`}
                              title="上移"
                              onClick={() => moveTarget(categoryOption.value, target.id, -1)}
                            >
                              <ArrowUp size={17} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="long-term-order-btn"
                              disabled={index === categoryTargets.length - 1}
                              aria-label={`下移“${target.title}”`}
                              title="下移"
                              onClick={() => moveTarget(categoryOption.value, target.id, 1)}
                            >
                              <ArrowDown size={17} aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        <div className="long-term-period">
                          <CalendarDays size={16} aria-hidden="true" />
                          <span>{formatDate(target.periodStart)} 至 {formatDate(target.periodEnd)}</span>
                        </div>

                        <div className="long-term-detail-block">
                          <div className="long-term-detail-label">具体描述</div>
                          {descriptions.length ? (
                            <ul>
                              {descriptions.map((description, descriptionIndex) => (
                                <li key={`${target.id}-description-${descriptionIndex}`}>{description}</li>
                              ))}
                            </ul>
                          ) : (
                            <div className="muted">暂未填写具体描述</div>
                          )}
                        </div>

                        <div className="long-term-detail-block">
                          <div className="long-term-detail-label">我想实现它，因为</div>
                          {reasons.length ? (
                            <ul>
                              {reasons.map((reason, reasonIndex) => <li key={`${target.id}-reason-${reasonIndex}`}>{reason}</li>)}
                            </ul>
                          ) : (
                            <div className="muted">暂未填写理由</div>
                          )}
                        </div>

                        <div className="long-term-detail-block">
                          <div className="long-term-detail-label">实现路径</div>
                          {pathways.length ? (
                            <ol>
                              {pathways.map((pathway, pathwayIndex) => (
                                <li key={`${target.id}-pathway-${pathwayIndex}`}>{pathway}</li>
                              ))}
                            </ol>
                          ) : (
                            <div className="muted">暂未填写实现路径</div>
                          )}
                        </div>

                        <div className="long-term-card-actions">
                          <button type="button" className="small-btn ghost" onClick={() => openEditModal(target)}>
                            <Pencil size={14} aria-hidden="true" />
                            编辑
                          </button>
                          <button type="button" className="small-btn danger" onClick={() => handleDelete(target)}>
                            <Trash2 size={14} aria-hidden="true" />
                            删除
                          </button>
                        </div>
                      </article>
                    )
                  })}

                  <div
                    className={`long-term-end-dropzone${draggingTarget?.category === categoryOption.value ? ' is-visible' : ''}${dropTarget?.category === categoryOption.value && dropTarget?.id === '' ? ' is-drop-target' : ''}`}
                    onDragOver={(event) => handleDragOver(event, categoryOption.value)}
                    onDrop={(event) => handleDrop(event, categoryOption.value)}
                  >
                    拖到这里置于末尾
                  </div>
                </div>
              ) : (
                <div className="long-term-empty-state">
                  <div>这里还没有{categoryOption.label}。</div>
                  <button type="button" className="small-btn ghost" onClick={() => openCreateModal(categoryOption.value)}>
                    创建第一项目标
                  </button>
                </div>
              )}
            </section>
          )
        })}
      </div>

      <div className="long-term-sr-only" aria-live="polite" aria-atomic="true">
        {sortAnnouncement}
      </div>

      {modalOpen && typeof document !== 'undefined' ? createPortal(
        <div className="modal-overlay long-term-modal-overlay" role="presentation" onMouseDown={closeModal}>
          <div
            ref={modalRef}
            className="modal-content long-term-target-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            aria-describedby={`${modalDescriptionId}${formError ? ` ${modalErrorId}` : ''}`}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={handleDialogKeyDown}
          >
            <div className="modal-header long-term-modal-header">
              <div>
                <div className="modal-title" id={modalTitleId}>{dialogTitle}</div>
                <div className="muted long-term-modal-description" id={modalDescriptionId}>
                  写下目标、具体描述、实现周期、真实理由和可行路径，之后仍可随时编辑。
                </div>
              </div>
              <button type="button" className="small-btn ghost" onClick={closeModal} disabled={saving}>关闭</button>
            </div>

            <form className="long-term-target-form" onSubmit={handleSubmit}>
              <div className="long-term-form-field long-term-form-field-wide">
                <label htmlFor="long-term-target-title">长期目标</label>
                <input
                  ref={titleInputRef}
                  id="long-term-target-title"
                  type="text"
                  value={form.title}
                  onChange={(event) => updateFormField('title', event.target.value)}
                  placeholder="例如：建立稳定且可持续的个人事业"
                  required
                />
              </div>

              <MultiPointField
                field="descriptions"
                label="目标的具体描述"
                itemLabel="描述要点"
                addLabel="添加描述"
                values={form.descriptions}
                optional
                multiline
                onUpdate={updatePoint}
                onAdd={addPoint}
                onRemove={removePoint}
              />

              <div className="long-term-form-field">
                <label htmlFor="long-term-period-start">开始日期</label>
                <input
                  id="long-term-period-start"
                  type="date"
                  value={form.periodStart}
                  max={form.periodEnd || undefined}
                  onChange={(event) => updateFormField('periodStart', event.target.value)}
                  required
                />
              </div>

              <div className="long-term-form-field">
                <label htmlFor="long-term-period-end">目标日期</label>
                <input
                  id="long-term-period-end"
                  type="date"
                  value={form.periodEnd}
                  min={form.periodStart || undefined}
                  onChange={(event) => updateFormField('periodEnd', event.target.value)}
                  required
                />
              </div>

              <fieldset className="long-term-category-fieldset long-term-form-field-wide">
                <legend>目标类型</legend>
                <div className="long-term-category-options">
                  {CATEGORY_OPTIONS.map((option) => (
                    <label
                      className={`long-term-category-option long-term-category-option-${option.value}${form.category === option.value ? ' is-selected' : ''}`}
                      key={option.value}
                    >
                      <input
                        type="radio"
                        name="long-term-category"
                        value={option.value}
                        checked={form.category === option.value}
                        onChange={(event) => updateFormField('category', event.target.value)}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <MultiPointField
                field="reasons"
                label="为什么想实现这个目标？"
                itemLabel="理由"
                addLabel="添加理由"
                values={form.reasons}
                onUpdate={updatePoint}
                onAdd={addPoint}
                onRemove={removePoint}
              />

              <MultiPointField
                field="pathways"
                label="这个目标可以怎么实现？"
                itemLabel="实现路径"
                addLabel="添加路径"
                values={form.pathways}
                multiline
                onUpdate={updatePoint}
                onAdd={addPoint}
                onRemove={removePoint}
              />

              {formError ? (
                <div className="long-term-form-error long-term-form-field-wide" id={modalErrorId} role="alert">
                  {formError}
                </div>
              ) : null}

              <div className="long-term-form-actions long-term-form-field-wide">
                <button type="button" className="small-btn ghost" onClick={closeModal} disabled={saving}>取消</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? '保存中…' : editingTargetId ? '保存修改' : '创建长期目标'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}
