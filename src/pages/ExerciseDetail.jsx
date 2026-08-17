import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { getExerciseFeelingText, hasText } from '../lib/actionRecord'
import SidebarExercises from '../components/SidebarExercises'
import ExerciseReview from '../components/ExerciseReview'
import { MotivationalFeelingsSummary } from '../components/MotivationalFeelings'
import {
  addExerciseAction,
  deleteExerciseAction,
  deleteExerciseGoal,
  getExerciseAction,
  getExerciseGoal,
  listExerciseActionsByGoal,
  updateExerciseGoal,
} from '../storage/storage'

export default function ExerciseDetail() {
  const { id } = useParams()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [goal, setGoal] = useState(null)
  const [actions, setActions] = useState([])
  const [currentActionForReview, setCurrentActionForReview] = useState(null)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [manualWizardOpen, setManualWizardOpen] = useState(false)
  const [manualStep, setManualStep] = useState(1)
  const [manualAction, setManualAction] = useState(null)
  const [timeScope, setTimeScope] = useState('all')
  const [recordDateFrom, setRecordDateFrom] = useState('')
  const [recordDateTo, setRecordDateTo] = useState('')
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')
  const [nowTs, setNowTs] = useState(() => Date.now())

  function getStartDate(currentGoal) {
    return currentGoal?.startDate || (currentGoal?.createdAt ? String(currentGoal.createdAt).slice(0, 10) : '')
  }

  function getCompletedDate(currentGoal) {
    return currentGoal?.completedDate || ''
  }

  function formatDateTime(iso) {
    if (!iso) return ''
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString()
  }

  function formatDuration(startIso, endIso) {
    if (!startIso) return '0小时0分钟'
    const start = new Date(startIso).getTime()
    const end = endIso ? new Date(endIso).getTime() : nowTs
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return '0小时0分钟'
    const totalMinutesSpent = Math.floor((end - start) / 60000)
    const hours = Math.floor(totalMinutesSpent / 60)
    const minutes = totalMinutesSpent % 60
    return `${hours}小时${minutes}分钟`
  }

  function getStatusText(status) {
    if (status === 'doing') return '正在做'
    if (status === 'done') return '做完了'
    return '想要做'
  }

  function renderExerciseTextRow(label, value) {
    if (!hasText(value)) return null
    return <div className="action-kv-full action-kv-text"><strong>{label}：</strong>{value}</div>
  }

  const load = useCallback(() => {
    setGoal(getExerciseGoal(id))
    setActions(listExerciseActionsByGoal(id))
  }, [id])

  function openReviewForAction(actionId) {
    const fresh = getExerciseAction(actionId)
    if (!fresh) return
    setCurrentActionForReview(fresh)
    setReviewModalOpen(true)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('reviewAction', actionId)
    setSearchParams(nextParams, { replace: true })
  }

  useEffect(() => {
    if (!id) return
    try {
      localStorage.setItem('action-journal:lastExerciseGoalId', id)
    } catch {
      // ignore
    }
  }, [id])

  function handleReviewSaved() {
    closeReviewModal()
    load()
  }

  const closeReviewModal = useCallback(() => {
    setReviewModalOpen(false)
    setCurrentActionForReview(null)
    if (searchParams.get('reviewAction')) {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('reviewAction')
      setSearchParams(nextParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  function openManualWizard() {
    setManualStart('')
    setManualEnd('')
    setManualAction(null)
    setManualStep(1)
    setManualWizardOpen(true)
  }

  function closeManualWizard() {
    setManualWizardOpen(false)
    setManualAction(null)
    setManualStep(1)
    setManualStart('')
    setManualEnd('')
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    const reviewActionId = searchParams.get('reviewAction')
    if (!reviewActionId) return
    const fresh = getExerciseAction(reviewActionId)
    if (!fresh || fresh.goalId !== id) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentActionForReview(fresh)
    setReviewModalOpen(true)
  }, [id, searchParams, actions])

  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 60 * 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!reviewModalOpen && !manualWizardOpen) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        if (manualWizardOpen) closeManualWizard()
        else closeReviewModal()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [reviewModalOpen, manualWizardOpen, closeReviewModal])

  function handleManualStep1Next(event) {
    event.preventDefault()
    if (!manualStart) return window.alert('请填写开始时间')

    const start = new Date(manualStart)
    if (Number.isNaN(start.getTime())) return window.alert('开始时间格式不正确')

    let endIso = null
    if (manualEnd) {
      const end = new Date(manualEnd)
      if (Number.isNaN(end.getTime())) return window.alert('结束时间格式不正确')
      if (end.getTime() <= start.getTime()) return window.alert('结束时间需要晚于开始时间')
      endIso = end.toISOString()
    }

    const payload = {
      startTime: start.toISOString(),
      exerciseName: goal?.title || '',
    }
    if (endIso) payload.endTime = endIso

    const created = addExerciseAction(id, payload)
    const fresh = getExerciseAction(created.id) || created
    setManualAction(fresh)
    setManualStep(2)
    load()
  }

  function handleDeleteAction(actionId) {
    const ok = window.confirm('确定删除这条运动记录吗？此操作不可恢复。')
    if (!ok) return
    deleteExerciseAction(actionId)
    if (currentActionForReview?.id === actionId) setCurrentActionForReview(null)
    load()
  }

  function handleDeleteGoal() {
    const ok = window.confirm('确认删除该运动？删除后其下所有运动记录也会被移除。')
    if (!ok) return
    deleteExerciseGoal(id)
    window.location.assign('/exercise')
  }

  function handleStatusChange() {
    if (!goal) return
    const next = goal.status === 'want' ? 'doing' : goal.status === 'doing' ? 'done' : 'want'
    updateExerciseGoal(goal.id, { status: next })
    load()
  }

  function getWorkExperiencePath(actionId) {
    const query = searchParams.toString()
    return `/exercise-goals/${id}/actions/${actionId}/work-experience${query ? `?${query}` : ''}`
  }

  function getWorkExperienceState() {
    const query = searchParams.toString()
    return {
      returnTo: location.pathname + (query ? `?${query}` : ''),
      returnLabel: '返回运动记录',
      basePath: '/exercise',
    }
  }

  function isActionInScope(action) {
    if (!action.startTime) return false
    if (timeScope === 'all') return true

    const start = new Date(action.startTime)
    if (Number.isNaN(start.getTime())) return false
    const now = new Date()

    if (timeScope === 'today') {
      const today = now.toISOString().slice(0, 10)
      return start.toISOString().slice(0, 10) === today
    }

    const day = now.getDay() || 7
    const weekStart = new Date(now)
    weekStart.setHours(0, 0, 0, 0)
    weekStart.setDate(now.getDate() - day + 1)
    return start >= weekStart
  }

  const scopedActions = actions.filter(isActionInScope)

  const totalMinutes = scopedActions.reduce((accumulator, action) => {
    if (!action.startTime) return accumulator
    const start = new Date(action.startTime).getTime()
    const end = action.endTime ? new Date(action.endTime).getTime() : nowTs
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return accumulator
    return accumulator + Math.floor((end - start) / 60000)
  }, 0)
  const totalHoursPart = Math.floor(totalMinutes / 60)
  const totalMinutesPart = totalMinutes % 60

  const filteredActions = useMemo(() => actions.filter((action) => {
    if (!action.startTime) return false
    const start = new Date(action.startTime)
    if (Number.isNaN(start.getTime())) return false

    if (recordDateFrom) {
      const from = new Date(`${recordDateFrom}T00:00:00`)
      if (start < from) return false
    }

    if (recordDateTo) {
      const to = new Date(`${recordDateTo}T23:59:59`)
      if (start > to) return false
    }

    return true
  }), [actions, recordDateFrom, recordDateTo])

  const workExperienceActions = actions.filter((action) => action.workExperienceTitle || action.workExperienceHtml)

  if (!goal) {
    return (
      <div className="page page-with-sidebar goal-detail-page">
        <aside className="side-col">
          <SidebarExercises activeId={id} basePath="/exercise" />
        </aside>
        <section className="main-col">
          <div className="card-surface" style={{ padding: 18 }}>
            <div className="muted">没有找到对应的运动。</div>
            <div style={{ marginTop: 12 }}>
              <Link className="create-btn" to="/new-exercise">＋ 新建运动</Link>
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="page page-with-sidebar goal-detail-page">
      <aside className="side-col">
        <SidebarExercises activeId={id} basePath="/exercise" />
      </aside>

      <section className="main-col">
        <div className="goal-detail-inner">
          <div className="right-panel">
            <div className="goal-head-row">
              <h1 className="goal-top-title">{goal.title}</h1>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link className="small-btn ghost" to="/new-exercise">新建运动</Link>
                <Link className="small-btn ghost" to={`/edit-exercise/${goal.id}`}>编辑运动</Link>
                <button className="small-btn ghost" onClick={handleDeleteGoal}>删除运动</button>
              </div>
            </div>
            <div className="goal-head-meta muted">
              开始：{getStartDate(goal) || '未记录'}
              {goal.status === 'done' ? ` · 做完啦：${getCompletedDate(goal) || '未记录'}` : ''}
            </div>

            <div className="goal-right-grid">
              <div className="card card-why">
                <h3>运动详细信息</h3>

                <div className="goal-info-status-row">
                  <span className={`goal-tag goal-tag-${goal.status || 'want'}`} style={{ cursor: 'pointer' }} onClick={handleStatusChange} title="点击切换状态：想要做 → 正在做 → 做完了">
                    {getStatusText(goal.status)}
                  </span>
                </div>

                <div className="goal-info-block">
                  <div className="goal-info-title">为什么自己想要做这件事？</div>
                  <ul className="goal-info-list">
                    {goal.reasons && goal.reasons.length ? goal.reasons.map((reason, index) => <li key={index}>{reason}</li>) : <li className="muted">尚未填写</li>}
                  </ul>
                </div>

                <div className="goal-info-block">
                  <div className="goal-info-title">在运动的过程中，有哪些人际联结，可以为我提供动力和支持</div>
                  <ul className="goal-info-list">
                    {goal.supports && goal.supports.length ? goal.supports.map((support, index) => <li key={index}>{support}</li>) : <li className="muted">尚未填写</li>}
                  </ul>
                </div>
              </div>

              <div className="card card-action-panel">
                <h3>行动面板</h3>
                <div className="muted">这里只保留手动补录，用来记录已经完成的运动。</div>
                <div style={{ marginTop: 12 }}>
                  <button className="btn-primary" onClick={openManualWizard}>运动记录</button>
                </div>
              </div>

              <div className="card card-total-time">
                <h3>运动总时间</h3>
                <div className="time-scope-switch">
                  <button className={`small-btn ${timeScope === 'all' ? 'active' : 'ghost'}`} onClick={() => setTimeScope('all')}>全部</button>
                  <button className={`small-btn ${timeScope === 'today' ? 'active' : 'ghost'}`} onClick={() => setTimeScope('today')}>今日</button>
                  <button className={`small-btn ${timeScope === 'week' ? 'active' : 'ghost'}`} onClick={() => setTimeScope('week')}>本周</button>
                </div>
                <div className="time-total-highlight">
                  <span className="time-total-number">{totalHoursPart}</span>
                  <span className="time-total-unit">小时</span>
                  <span className="time-total-number">{totalMinutesPart}</span>
                  <span className="time-total-unit">分钟</span>
                </div>
                <div className="muted" style={{ marginTop: 6 }}>统计范围：{timeScope === 'all' ? '全部' : timeScope === 'today' ? '今日' : '本周'}</div>
              </div>

              <div className="card card-records">
                <h3>运动记录</h3>
                <div className="record-filter-row">
                  <label>开始日期</label>
                  <input type="date" value={recordDateFrom} onChange={(event) => setRecordDateFrom(event.target.value)} />
                  <label>结束日期</label>
                  <input type="date" value={recordDateTo} onChange={(event) => setRecordDateTo(event.target.value)} />
                  <button className="small-btn ghost" onClick={() => { setRecordDateFrom(''); setRecordDateTo('') }}>清空</button>
                </div>

                {filteredActions.length ? (
                  <div className="action-list">
                    {filteredActions.map((action) => (
                      <div className="action-record" key={action.id} style={{ borderBottom: '1px solid #eee', padding: '8px 0' }}>
                        <div className="action-record-header">
                          <div className="action-record-meta">
                            <div className="action-times">{action.startTime ? formatDateTime(action.startTime) : '无开始时间'} — {action.endTime ? formatDateTime(action.endTime) : '进行中'}</div>
                            <div className="action-duration muted">持续时间：{formatDuration(action.startTime, action.endTime)}</div>
                          </div>
                          <div className="action-record-actions">
                            <button className="small-btn ghost" onClick={() => openReviewForAction(action.id)}>编辑</button>
                            <button className="small-btn danger" onClick={() => handleDeleteAction(action.id)}>删除</button>
                          </div>
                        </div>
                        <div className="action-kv-grid">
                          <div><strong>唤醒度：</strong>{action.scores?.arousal ?? '-'}</div>
                          <div><strong>效价：</strong>{action.scores?.valence ?? '-'}</div>
                          {renderExerciseTextRow('运动内容', action.content)}
                          {renderExerciseTextRow('运动感受', getExerciseFeelingText(action))}
                          {renderExerciseTextRow('庆祝小活动', action.celebration)}
                          <MotivationalFeelingsSummary value={action.motivationalFeelings} />
                          {(action.workExperienceTitle || action.workExperienceHtml) && (
                            <div className="action-kv-full action-work-experience-row">
                              <strong>运动经验：</strong>
                              <span className="action-work-experience-title">{action.workExperienceTitle || '未命名运动经验'}</span>
                              <Link className="small-btn ghost" to={getWorkExperiencePath(action.id)} state={getWorkExperienceState()}>查看运动经验</Link>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="muted">该筛选范围内暂无运动记录</div>
                )}
              </div>

              <div className="card card-work-experience-summary">
                <h3>运动经验</h3>
                {workExperienceActions.length ? (
                  <div className="work-experience-summary-list">
                    {workExperienceActions.map((action) => (
                      <Link key={action.id} className="work-experience-summary-item" to={getWorkExperiencePath(action.id)} state={getWorkExperienceState()}>
                        <span className="work-experience-summary-title">{action.workExperienceTitle || '未命名运动经验'}</span>
                        <span className="work-experience-summary-meta">{goal.title || '当前运动'} · {action.startTime ? formatDateTime(action.startTime) : '未记录时间'} · {formatDuration(action.startTime, action.endTime)}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="muted">当前还没有填写任何运动经验。</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {reviewModalOpen && currentActionForReview && (
        <div className="modal-overlay" onMouseDown={closeReviewModal} role="presentation">
          <div className="modal-content" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="回顾本次运动">
            <div className="modal-header">
              <div>
                <div className="modal-title">回顾本次运动</div>
                <div className="muted" style={{ marginTop: 2, fontSize: 13 }}>
                  {currentActionForReview.startTime ? new Date(currentActionForReview.startTime).toLocaleString() : ''}
                  {currentActionForReview.endTime ? ` — ${new Date(currentActionForReview.endTime).toLocaleString()}` : ''}
                </div>
              </div>
              <button className="small-btn ghost" onClick={closeReviewModal}>关闭</button>
            </div>

            <ExerciseReview key={currentActionForReview.id} action={currentActionForReview} exerciseTitle={goal.title} onSave={handleReviewSaved} onCancel={closeReviewModal} />
          </div>
        </div>
      )}

      {manualWizardOpen && (
        <div className="modal-overlay" onMouseDown={closeManualWizard} role="presentation">
          <div className="modal-content" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="运动记录">
            <div className="modal-header">
              <div>
                <div className="modal-title">运动记录 <span className="step-badge">{manualStep}/2</span></div>
                <div className="muted" style={{ marginTop: 2, fontSize: 13 }}>第 1 步补时间，第 2 步补回顾内容。当前记录对象就是左侧正在查看的这项运动。</div>
              </div>
              <button className="small-btn ghost" onClick={closeManualWizard}>关闭</button>
            </div>

            {manualStep === 1 ? (
              <form className="manual-step-form" onSubmit={handleManualStep1Next}>
                <div className="manual-step-grid">
                  <div>
                    <label>开始时间</label>
                    <input type="datetime-local" value={manualStart} onChange={(event) => setManualStart(event.target.value)} />
                  </div>
                  <div>
                    <label>结束时间（可选）</label>
                    <input type="datetime-local" value={manualEnd} onChange={(event) => setManualEnd(event.target.value)} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label>当前记录的运动</label>
                    <div className="card-surface" style={{ padding: '10px 12px' }}>{goal.title}</div>
                  </div>
                </div>
                <div className="review-actions">
                  <button type="button" className="small-btn ghost" onClick={closeManualWizard}>取消</button>
                  <button type="submit" className="btn-primary">下一步：填写回顾</button>
                </div>
              </form>
            ) : (
              <div style={{ paddingTop: 12 }}>
                <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
                  {manualAction?.startTime ? new Date(manualAction.startTime).toLocaleString() : ''}
                  {manualAction?.endTime ? ` — ${new Date(manualAction.endTime).toLocaleString()}` : ''}
                  {manualAction?.exerciseName ? ` · ${manualAction.exerciseName}` : ''}
                </div>
                <ExerciseReview
                  key={manualAction?.id}
                  action={manualAction}
                  exerciseTitle={goal.title}
                  onSave={() => {
                    closeManualWizard()
                    load()
                  }}
                  onCancel={closeManualWizard}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
