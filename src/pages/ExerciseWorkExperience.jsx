import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import SidebarExercises from '../components/SidebarExercises'
import { getExerciseAction, getExerciseGoal, updateExerciseAction } from '../storage/storage'

const TOOLBAR_ACTIONS = [
  { label: '加粗', command: 'bold' },
  { label: '斜体', command: 'italic' },
  { label: '下划线', command: 'underline' },
  { label: '标题', command: 'formatBlock', value: 'h2' },
  { label: '正文', command: 'formatBlock', value: 'p' },
  { label: '项目符号', command: 'insertUnorderedList' },
]

export default function ExerciseWorkExperience() {
  const { goalId, actionId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const editorRef = useRef(null)
  const [goal, setGoal] = useState(null)
  const [action, setAction] = useState(null)
  const [title, setTitle] = useState('')
  const [html, setHtml] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const titleRef = useRef('')
  const htmlRef = useRef('')
  const loadedRef = useRef(false)
  const lastSavedRef = useRef({ title: '', html: '' })

  const basePath = useMemo(() => {
    if (location.state?.basePath) return location.state.basePath
    return '/exercise'
  }, [location.state])

  const fallbackReturnTo = `${basePath}/${goalId}?reviewAction=${actionId}`
  const returnTo = location.state?.returnTo || fallbackReturnTo
  const returnLabel = location.state?.returnLabel || '返回运动回顾'

  useEffect(() => {
    const currentGoal = getExerciseGoal(goalId)
    const currentAction = getExerciseAction(actionId)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGoal(currentGoal)
    setAction(currentAction)
    const nextTitle = currentAction?.workExperienceTitle || ''
    const nextHtml = currentAction?.workExperienceHtml || ''
    setTitle(nextTitle)
    setHtml(nextHtml)
    titleRef.current = nextTitle
    htmlRef.current = nextHtml
    lastSavedRef.current = { title: nextTitle.trim(), html: nextHtml }
    loadedRef.current = true
  }, [goalId, actionId])

  useEffect(() => {
    if (!editorRef.current) return
    if (editorRef.current.innerHTML === html) return
    editorRef.current.innerHTML = html
  }, [html])

  useEffect(() => {
    if (!saveMessage) return undefined
    const timer = window.setTimeout(() => setSaveMessage(''), 1800)
    return () => window.clearTimeout(timer)
  }, [saveMessage])

  function getEditorHtml() {
    return editorRef.current?.innerHTML || ''
  }

  const persistExperience = useCallback(({ requireTitle = false, showMessage = false } = {}) => {
    if (!action) return null

    const nextTitle = titleRef.current.trim()
    const nextHtml = editorRef.current ? getEditorHtml() : htmlRef.current
    const lastSaved = lastSavedRef.current

    if (requireTitle && !nextTitle) {
      window.alert('请先为这条运动经验填写标题')
      return null
    }

    if (nextTitle === lastSaved.title && nextHtml === lastSaved.html) {
      if (showMessage) setSaveMessage('已保存运动经验')
      return action
    }

    setHtml(nextHtml)
    htmlRef.current = nextHtml
    const updated = updateExerciseAction(action.id, {
      workExperienceTitle: nextTitle,
      workExperienceHtml: nextHtml,
    })
    if (!updated) {
      if (showMessage) window.alert('保存失败，请重试')
      return null
    }

    lastSavedRef.current = { title: nextTitle, html: nextHtml }
    setAction(updated)
    if (showMessage) setSaveMessage('已保存运动经验')
    return updated
  }, [action, htmlRef, titleRef])

  function handleInput() {
    const nextHtml = getEditorHtml()
    htmlRef.current = nextHtml
    setHtml(nextHtml)
  }

  function applyCommand(command, value) {
    if (!editorRef.current) return
    editorRef.current.focus()
    document.execCommand(command, false, value)
    const nextHtml = getEditorHtml()
    htmlRef.current = nextHtml
    setHtml(nextHtml)
  }

  function saveExperience() {
    return persistExperience({ requireTitle: true, showMessage: true })
  }

  function handleBackToReview() {
    const updated = saveExperience()
    if (!updated) return
    navigate(returnTo)
  }

  useEffect(() => {
    titleRef.current = title
  }, [title])

  useEffect(() => {
    htmlRef.current = html
  }, [html])

  useEffect(() => {
    if (!loadedRef.current || !action) return undefined
    const timer = window.setTimeout(() => {
      persistExperience()
    }, 500)
    return () => window.clearTimeout(timer)
  }, [title, html, action, persistExperience])

  useEffect(() => {
    if (!action) return undefined

    function flushExperience() {
      persistExperience()
    }

    window.addEventListener('pagehide', flushExperience)
    window.addEventListener('beforeunload', flushExperience)

    return () => {
      flushExperience()
      window.removeEventListener('pagehide', flushExperience)
      window.removeEventListener('beforeunload', flushExperience)
    }
  }, [action, persistExperience])

  if (!goal || !action) {
    return (
      <div className="page page-with-sidebar work-experience-page">
        <aside className="side-col">
          <SidebarExercises activeId={goalId} basePath={basePath} />
        </aside>
        <section className="main-col">
          <div className="card work-experience-card">
            <h1 className="goal-top-title">运动经验</h1>
            <div className="muted">没有找到对应的运动或记录。</div>
            <div className="work-experience-actions-row">
              <Link className="small-btn ghost" to="/exercise">返回</Link>
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="page page-with-sidebar work-experience-page">
      <aside className="side-col">
        <SidebarExercises activeId={goalId} basePath={basePath} />
      </aside>

      <section className="main-col">
        <div className="work-experience-shell">
          <div className="work-experience-header card">
            <div>
              <h1 className="goal-top-title">运动经验</h1>
              <div className="muted" style={{ marginTop: 6 }}>
                运动：{goal.title} · 记录开始：{action.startTime ? new Date(action.startTime).toLocaleString() : '未记录'}
              </div>
            </div>
            <div className="work-experience-actions-row">
              <button className="small-btn ghost" onClick={saveExperience}>保存</button>
              <button className="btn-primary" onClick={handleBackToReview}>{returnLabel}</button>
            </div>
          </div>

          <div className="card work-experience-card">
            <div className="work-experience-title-field">
              <label htmlFor="exercise-work-experience-title" className="review-area-title">运动经验标题</label>
              <input
                id="exercise-work-experience-title"
                type="text"
                value={title}
                onChange={(event) => {
                  const nextTitle = event.target.value
                  titleRef.current = nextTitle
                  setTitle(nextTitle)
                }}
                placeholder="例如：这次训练里最有效的节奏安排"
              />
            </div>

            <div className="work-experience-toolbar" role="toolbar" aria-label="运动经验编辑工具栏">
              {TOOLBAR_ACTIONS.map((item) => (
                <button key={item.label} type="button" className="small-btn ghost" onClick={() => applyCommand(item.command, item.value)}>
                  {item.label}
                </button>
              ))}
            </div>

            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              把这次运动里对自己有效的经验、节奏、提醒和注意事项整理下来。
            </div>

            <div
              ref={editorRef}
              className="work-experience-editor"
              contentEditable
              suppressContentEditableWarning
              onInput={handleInput}
              onBlur={handleInput}
              onCompositionEnd={handleInput}
              data-placeholder="在这里记录你的运动经验、复盘心得、注意事项……"
            />

            <div className="work-experience-footer">
              <span className="muted">{saveMessage || '内容保存在当前运动记录中。'}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}