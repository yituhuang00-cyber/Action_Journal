import React, { useEffect, useMemo, useState } from 'react'
import {
  STORAGE_SYNC_EVENT,
  createWritingEntry,
  createWritingTemplate,
  deleteWritingEntry,
  deleteWritingTemplate,
  listWritingEntriesByTemplate,
  listWritingTemplates,
  updateWritingEntry,
  updateWritingTemplate,
} from '../storage/storage'

const LAST_TEMPLATE_KEY = 'action-journal:lastWritingTemplateId'

function createEmptySection() {
  return { id: '', question: '', prompt: '' }
}

function readTemplates() {
  return listWritingTemplates()
}

function readEntries(templateId) {
  return templateId ? listWritingEntriesByTemplate(templateId) : []
}

function readLastTemplateId() {
  try {
    return localStorage.getItem(LAST_TEMPLATE_KEY) || ''
  } catch {
    return ''
  }
}

function writeLastTemplateId(templateId) {
  try {
    if (templateId) {
      localStorage.setItem(LAST_TEMPLATE_KEY, templateId)
    } else {
      localStorage.removeItem(LAST_TEMPLATE_KEY)
    }
  } catch {
    // ignore persistence errors
  }
}

function pickTemplateId(templates, preferredTemplateId = '') {
  if (preferredTemplateId && templates.some((template) => template.id === preferredTemplateId)) {
    return preferredTemplateId
  }
  return templates[0]?.id || ''
}

function getInitialWritingSnapshot() {
  const templates = readTemplates()
  const selectedTemplateId = pickTemplateId(templates, readLastTemplateId())
  return {
    templates,
    selectedTemplateId,
    entries: readEntries(selectedTemplateId),
  }
}

function buildEmptyAnswers(template) {
  if (!template) return {}
  return Object.fromEntries((template.sections || []).map((section) => [section.id, '']))
}

function formatDateTime(value) {
  if (!value) return '未记录时间'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function hasEntryBeenUpdated(entry) {
  if (!entry?.createdAt || !entry?.updatedAt) return false
  return entry.updatedAt !== entry.createdAt
}

function getPreview(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return '未填写'
  return trimmed.length > 96 ? `${trimmed.slice(0, 96)}…` : trimmed
}

export default function Writing() {
  const [initialSnapshot] = useState(() => getInitialWritingSnapshot())
  const [templates, setTemplates] = useState(initialSnapshot.templates)
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialSnapshot.selectedTemplateId)
  const [entries, setEntries] = useState(initialSnapshot.entries)
  const [activeMode, setActiveMode] = useState('write')
  const [editingTemplateId, setEditingTemplateId] = useState('')
  const [createForm, setCreateForm] = useState({
    title: '',
    purpose: '',
    sections: [createEmptySection()],
  })
  const [answers, setAnswers] = useState({})
  const [editingEntryId, setEditingEntryId] = useState('')
  const [saving, setSaving] = useState(false)

  function syncTemplateSelection(nextTemplateId, nextTemplates = templates) {
    const normalizedId = pickTemplateId(nextTemplates, nextTemplateId)
    setSelectedTemplateId(normalizedId)
    setEntries(readEntries(normalizedId))
    writeLastTemplateId(normalizedId)

    const nextTemplate = nextTemplates.find((template) => template.id === normalizedId) || null
    setAnswers(buildEmptyAnswers(nextTemplate))

    if (editingEntryId && !readEntries(normalizedId).some((entry) => entry.id === editingEntryId)) {
      setEditingEntryId('')
    }
  }

  useEffect(() => {
    function onStorage() {
      const syncedTemplates = readTemplates()
      const nextSelectedTemplateId = pickTemplateId(syncedTemplates, selectedTemplateId)
      setTemplates(syncedTemplates)
      setSelectedTemplateId(nextSelectedTemplateId)
      setEntries(readEntries(nextSelectedTemplateId))
      writeLastTemplateId(nextSelectedTemplateId)

      const nextTemplate = syncedTemplates.find((template) => template.id === nextSelectedTemplateId) || null
      setAnswers(buildEmptyAnswers(nextTemplate))

      if (editingEntryId && !readEntries(nextSelectedTemplateId).some((entry) => entry.id === editingEntryId)) {
        setEditingEntryId('')
      }
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener(STORAGE_SYNC_EVENT, onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(STORAGE_SYNC_EVENT, onStorage)
    }
  }, [selectedTemplateId, editingEntryId])

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || null,
    [selectedTemplateId, templates],
  )

  function updateCreateField(field, value) {
    setCreateForm((current) => ({ ...current, [field]: value }))
  }

  function updateSection(index, field, value) {
    setCreateForm((current) => ({
      ...current,
      sections: current.sections.map((section, sectionIndex) => (
        sectionIndex === index ? { ...section, [field]: value } : section
      )),
    }))
  }

  function addSection() {
    setCreateForm((current) => ({
      ...current,
      sections: [...current.sections, createEmptySection()],
    }))
  }

  function removeSection(index) {
    setCreateForm((current) => {
      if (current.sections.length === 1) return current
      return {
        ...current,
        sections: current.sections.filter((_, sectionIndex) => sectionIndex !== index),
      }
    })
  }

  function resetCreateForm() {
    setCreateForm({
      title: '',
      purpose: '',
      sections: [createEmptySection()],
    })
    setEditingTemplateId('')
  }

  function startEditingTemplate(template) {
    if (!template) return
    setEditingTemplateId(template.id)
    setCreateForm({
      title: template.title || '',
      purpose: template.purpose || '',
      sections: template.sections?.length
        ? template.sections.map((section) => ({
          id: section.id || '',
          question: section.question || '',
          prompt: section.prompt || '',
        }))
        : [createEmptySection()],
    })
    setActiveMode('create')
  }

  function handleCreateTemplate(event) {
    event.preventDefault()
    const title = createForm.title.trim()
    const purpose = createForm.purpose.trim()
    const sections = createForm.sections
      .map((section) => ({
        id: section.id || undefined,
        question: section.question.trim(),
        prompt: section.prompt.trim(),
      }))
      .filter((section) => section.question || section.prompt)

    if (!title) {
      window.alert('请先填写模板名称。')
      return
    }

    if (!purpose) {
      window.alert('请先填写模板的意义。')
      return
    }

    if (!sections.length) {
      window.alert('请至少填写一个模板内容。')
      return
    }

    if (editingTemplateId) {
      updateWritingTemplate(editingTemplateId, { title, purpose, sections })
      const nextTemplates = readTemplates()
      setTemplates(nextTemplates)
      syncTemplateSelection(editingTemplateId, nextTemplates)
      setActiveMode('write')
      resetCreateForm()
      window.alert('模板已更新。')
      return
    }

    const template = createWritingTemplate({ title, purpose, sections })
    const nextTemplates = readTemplates()
    setTemplates(nextTemplates)
    syncTemplateSelection(template.id, nextTemplates)
    setActiveMode('write')
    resetCreateForm()
    window.alert('模板已创建，可以开始书写了。')
  }

  function handleDeleteTemplate(templateId) {
    const ok = window.confirm('确认删除这个模板吗？该模板下的所有书写记录也会一起删除。')
    if (!ok) return

    deleteWritingTemplate(templateId)
    const nextTemplates = readTemplates()
    setTemplates(nextTemplates)
    const fallbackId = nextTemplates[0]?.id || ''
    syncTemplateSelection(selectedTemplateId === templateId ? fallbackId : selectedTemplateId, nextTemplates)
  }

  function updateAnswer(sectionId, value) {
    setAnswers((current) => ({ ...current, [sectionId]: value }))
  }

  function startEditingEntry(entry) {
    if (!selectedTemplate || !entry) return
    setEditingEntryId(entry.id)
    setAnswers(() => {
      const next = {}
      selectedTemplate.sections.forEach((section) => {
        const matchedAnswer = entry.answers.find((answer) => answer.sectionId === section.id)
        next[section.id] = matchedAnswer?.content || ''
      })
      return next
    })
    setActiveMode('write')
  }

  function resetWritingForm() {
    if (!selectedTemplate) {
      setAnswers({})
    } else {
      setAnswers(Object.fromEntries(selectedTemplate.sections.map((section) => [section.id, ''])))
    }
    setEditingEntryId('')
  }

  function handleSaveWriting(event) {
    event.preventDefault()
    if (!selectedTemplate) {
      window.alert('请先选择一个模板。')
      return
    }

    const nextAnswers = selectedTemplate.sections.map((section) => ({
      sectionId: section.id,
      content: (answers[section.id] || '').trim(),
    }))

    if (!nextAnswers.some((item) => item.content)) {
      window.alert('请至少写下一段内容。')
      return
    }

    setSaving(true)
    if (editingEntryId) {
      updateWritingEntry(editingEntryId, { answers: nextAnswers })
    } else {
      createWritingEntry(selectedTemplate.id, { answers: nextAnswers })
    }
    const nextTemplates = readTemplates()
    setTemplates(nextTemplates)
    setEntries(readEntries(selectedTemplate.id))
    resetWritingForm()
    setSaving(false)
    setActiveMode('review')
    window.alert(editingEntryId ? '书写记录已更新。' : '书写内容已保存。')
  }

  function handleDeleteEntry(entryId) {
    const ok = window.confirm('确认删除这条书写记录吗？')
    if (!ok) return
    deleteWritingEntry(entryId)
    if (entryId === editingEntryId) {
      resetWritingForm()
    }
    setTemplates(readTemplates())
    setEntries(readEntries(selectedTemplateId))
  }

  return (
    <div className="page writing-page">
      <div className="page-shell">
        <div className="page-header">
          <div>
            <h2 className="page-title">书写</h2>
            <div className="page-subtitle">先创建模板，再按模板完成书写，并把每次内容保存到本地随时回顾。</div>
          </div>
          <div className="writing-mode-switch" role="group" aria-label="书写模式切换">
            <button
              type="button"
              className={`small-btn ${activeMode === 'create' ? 'active' : 'ghost'}`}
              onClick={() => setActiveMode('create')}
            >
              创建模板
            </button>
            <button
              type="button"
              className={`small-btn ${activeMode === 'write' ? 'active' : 'ghost'}`}
              onClick={() => setActiveMode('write')}
            >
              开始书写
            </button>
            <button
              type="button"
              className={`small-btn ${activeMode === 'review' ? 'active' : 'ghost'}`}
              onClick={() => setActiveMode('review')}
            >
              回顾记录
            </button>
          </div>
        </div>

        <div className="writing-layout">
          <aside className="writing-sidebar card-surface">
            <div className="writing-sidebar-header">
              <div>
                <div className="writing-sidebar-title">已有模板</div>
                <div className="muted">选择一个模板开始书写</div>
              </div>
            </div>

            {templates.length ? (
              <div className="writing-template-list">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={`writing-template-chip${template.id === selectedTemplateId ? ' active' : ''}`}
                    onClick={() => syncTemplateSelection(template.id)}
                  >
                    <span>{template.title}</span>
                    <small>{template.sections.length} 个问题</small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="writing-empty-state">还没有模板，先去创建一个。</div>
            )}
          </aside>

          <div className="writing-main">
            <section className="card-surface writing-panel" hidden={activeMode !== 'create'}>
              <div className="writing-panel-header">
                <div>
                  <h3>{editingTemplateId ? '编辑模板' : '创建模板'}</h3>
                  <p>{editingTemplateId ? '你可以修改模板名称、意义和问题列表，保存后会直接更新原模板。' : '模板由名称、意义和多个“问题 + 提示词”组成，问题数量可以自由增加。'}</p>
                </div>
              </div>

              <form className="writing-form" onSubmit={handleCreateTemplate}>
                <label>
                  模板名称
                  <input
                    type="text"
                    value={createForm.title}
                    onChange={(event) => updateCreateField('title', event.target.value)}
                    placeholder="例如：问题拆解书写"
                  />
                </label>

                <label>
                  模板的意义
                  <textarea
                    value={createForm.purpose}
                    onChange={(event) => updateCreateField('purpose', event.target.value)}
                    placeholder="例如：帮助我把模糊焦虑写清楚，判断值不值得继续投入。"
                    rows={4}
                  />
                </label>

                <div className="writing-section-stack">
                  {createForm.sections.map((section, index) => (
                    <div className="writing-section-editor" key={`section-${index}`}>
                      <div className="writing-section-editor-head">
                        <strong>模板内容 {index + 1}</strong>
                        <button
                          type="button"
                          className="small-btn ghost"
                          onClick={() => removeSection(index)}
                          disabled={createForm.sections.length === 1}
                        >
                          删除这一项
                        </button>
                      </div>

                      <label>
                        问题
                        <input
                          type="text"
                          value={section.question}
                          onChange={(event) => updateSection(index, 'question', event.target.value)}
                          placeholder="例如：我近期遇到的一个问题"
                        />
                      </label>

                      <label>
                        提示词
                        <textarea
                          value={section.prompt}
                          onChange={(event) => updateSection(index, 'prompt', event.target.value)}
                          placeholder="例如：一个典型的问题，常常以「如何…」开头，或者以「怎么办」结尾。"
                          rows={3}
                        />
                      </label>
                    </div>
                  ))}
                </div>

                <div className="writing-actions-row">
                  <button type="button" className="small-btn ghost" onClick={addSection}>＋ 新增一个模板内容</button>
                  <div className="writing-actions-inline">
                    <button type="button" className="small-btn ghost" onClick={resetCreateForm}>{editingTemplateId ? '取消编辑' : '清空'}</button>
                    <button type="submit" className="create-btn">{editingTemplateId ? '保存修改' : '保存模板'}</button>
                  </div>
                </div>
              </form>
            </section>

            <section className="card-surface writing-panel" hidden={activeMode !== 'write'}>
              <div className="writing-panel-header writing-panel-header-spread">
                <div>
                  <h3>开始书写</h3>
                  <p>选择一个模板后，页面会展示模板名称、模板意义和每一个书写问题。</p>
                </div>
                {selectedTemplate && (
                  <div className="writing-actions-inline">
                    <button type="button" className="small-btn ghost" onClick={() => startEditingTemplate(selectedTemplate)}>
                      编辑模板
                    </button>
                    <button type="button" className="small-btn danger" onClick={() => handleDeleteTemplate(selectedTemplate.id)}>
                      删除模板
                    </button>
                  </div>
                )}
              </div>

              {selectedTemplate ? (
                <form className="writing-form" onSubmit={handleSaveWriting}>
                  <div className="writing-template-summary">
                    <div className="writing-template-summary-card">
                      <div className="writing-kicker">模板名称</div>
                      <div className="writing-template-name">{selectedTemplate.title}</div>
                    </div>
                    <div className="writing-template-summary-card">
                      <div className="writing-kicker">模板意义</div>
                      <div className="writing-template-purpose">{selectedTemplate.purpose || '未填写模板意义'}</div>
                    </div>
                  </div>

                  <div className="writing-question-list">
                    {selectedTemplate.sections.map((section, index) => (
                      <div className="writing-question-card" key={section.id}>
                        <div className="writing-question-index">问题 {index + 1}</div>
                        <h4>{section.question || `未命名问题 ${index + 1}`}</h4>
                        <textarea
                          value={answers[section.id] || ''}
                          onChange={(event) => updateAnswer(section.id, event.target.value)}
                          rows={6}
                          placeholder={section.prompt || '请根据这个问题开始书写'}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="writing-actions-row">
                    <div className="muted">{editingEntryId ? '当前正在修改已保存记录，保存后会覆盖这条记录。' : '书写完成后点击保存，内容会保存在当前模板之下。'}</div>
                    <div className="writing-actions-inline">
                      {editingEntryId && (
                        <button type="button" className="small-btn ghost" onClick={resetWritingForm}>
                          取消修改
                        </button>
                      )}
                      <button type="submit" className="create-btn" disabled={saving}>{saving ? '保存中…' : editingEntryId ? '保存修改' : '保存书写内容'}</button>
                    </div>
                  </div>
                </form>
              ) : (
                <div className="writing-empty-state">请先创建模板，再开始书写。</div>
              )}
            </section>

            <section className="card-surface writing-panel" hidden={activeMode !== 'review'}>
              <div className="writing-panel-header">
                <div>
                  <h3>回顾记录</h3>
                  <p>所有书写记录都保存在本地，并按照模板归档。</p>
                </div>
              </div>

              {selectedTemplate ? (
                entries.length ? (
                  <div className="writing-review-list">
                    {entries.map((entry, entryIndex) => (
                      <article className="writing-review-card" key={entry.id}>
                        <div className="writing-review-head">
                          <div>
                            <div className="writing-kicker">第 {entries.length - entryIndex} 次书写</div>
                            <h4>{selectedTemplate.title}</h4>
                            <div className="muted">保存时间：{formatDateTime(entry.createdAt)}</div>
                            {hasEntryBeenUpdated(entry) && (
                              <div className="muted">最近修改：{formatDateTime(entry.updatedAt)}</div>
                            )}
                          </div>
                          <div className="writing-actions-inline">
                            <button type="button" className="small-btn ghost" onClick={() => startEditingEntry(entry)}>
                              修改记录
                            </button>
                            <button type="button" className="small-btn danger" onClick={() => handleDeleteEntry(entry.id)}>
                              删除记录
                            </button>
                          </div>
                        </div>

                        <div className="writing-review-body">
                          {selectedTemplate.sections.map((section) => {
                            const matchedAnswer = entry.answers.find((answer) => answer.sectionId === section.id)
                            return (
                              <section className="writing-review-section" key={`${entry.id}-${section.id}`}>
                                <div className="writing-review-question">{section.question || '未命名问题'}</div>
                                <div className="writing-review-prompt">提示词：{section.prompt || '未填写提示词'}</div>
                                <div className="writing-review-answer">{matchedAnswer?.content?.trim() || '这一次没有填写这部分内容。'}</div>
                              </section>
                            )
                          })}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="writing-empty-state">
                    当前模板下还没有书写记录。你可以先去“开始书写”，保存第一篇内容。
                    <div className="writing-empty-preview">当前模板：{selectedTemplate.title} · {selectedTemplate.sections.map((section) => getPreview(section.question)).join(' / ')}</div>
                  </div>
                )
              ) : (
                <div className="writing-empty-state">请选择一个模板后查看对应的书写记录。</div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
