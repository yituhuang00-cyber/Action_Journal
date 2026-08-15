import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import SidebarGoals from '../components/SidebarGoals'
import {
  PROBLEM_SOLVING_QUESTIONS,
  getProblemSolvingEntryStats,
} from '../lib/problemSolving'
import {
  createProblemSolvingEntry,
  getGoal,
  updateProblemSolvingEntry,
} from '../storage/storage'

function createAnswerState(entry = null) {
  const savedAnswers = new Map((entry?.answers || []).map((answer) => [answer.questionId, answer]))
  return Object.fromEntries(PROBLEM_SOLVING_QUESTIONS.map((question) => {
    const savedAnswer = savedAnswers.get(question.id)
    return [question.id, {
      content: savedAnswer?.content || '',
      skipped: Boolean(savedAnswer?.skipped),
    }]
  }))
}

function formatDateTime(value) {
  if (!value) return '未记录时间'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ProblemSolving() {
  const { goalId, entryId } = useParams()
  return <ProblemSolvingEditor key={`${goalId}:${entryId || 'new'}`} goalId={goalId} entryId={entryId} />
}

function ProblemSolvingEditor({ goalId, entryId }) {
  const location = useLocation()
  const navigate = useNavigate()
  const goal = getGoal(goalId)
  const entry = entryId
    ? goal?.problemSolvingEntries?.find((item) => item.id === entryId) || null
    : null
  const [answers, setAnswers] = useState(() => createAnswerState(entry))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const isEditing = Boolean(entryId)
  const basePath = location.state?.basePath || '/goal'
  const returnTo = location.state?.returnTo || `${basePath}/${goalId}`

  useEffect(() => {
    if (!dirty) return undefined
    function warnBeforeLeaving(event) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [dirty])

  const stats = useMemo(() => getProblemSolvingEntryStats({
    answers: PROBLEM_SOLVING_QUESTIONS.map((question) => ({
      questionId: question.id,
      ...answers[question.id],
    })),
  }), [answers])
  const remaining = stats.total - stats.answered - stats.skipped
  const completion = Math.round(((stats.answered + stats.skipped) / stats.total) * 100)

  function updateAnswer(questionId, content) {
    setAnswers((current) => ({
      ...current,
      [questionId]: { content, skipped: false },
    }))
    setDirty(true)
  }

  function toggleSkip(questionId) {
    setAnswers((current) => {
      const currentAnswer = current[questionId] || { content: '', skipped: false }
      return {
        ...current,
        [questionId]: { ...currentAnswer, skipped: !currentAnswer.skipped },
      }
    })
    setDirty(true)
  }

  function handleCancel() {
    if (dirty && !window.confirm('尚未完成的书写不会被保存，确定离开吗？')) return
    navigate(returnTo)
  }

  function handleComplete(event) {
    event.preventDefault()
    if (!goal) return
    if (!stats.answered && !stats.skipped) {
      window.alert('请至少回答或跳过一个问题。')
      return
    }

    const payload = {
      answers: PROBLEM_SOLVING_QUESTIONS.map((question) => ({
        questionId: question.id,
        content: (answers[question.id]?.content || '').trim(),
        skipped: Boolean(answers[question.id]?.skipped),
      })),
    }

    setSaving(true)
    const savedEntry = isEditing
      ? updateProblemSolvingEntry(goalId, entryId, payload)
      : createProblemSolvingEntry(goalId, payload)
    setSaving(false)

    if (!savedEntry) {
      window.alert('保存失败，请稍后再试。')
      return
    }

    setDirty(false)
    navigate(returnTo, { replace: true })
  }

  if (!goal || (isEditing && !entry)) {
    return (
      <div className="page page-with-sidebar problem-solving-page">
        <aside className="side-col">
          <SidebarGoals activeId={goalId} basePath={basePath} />
        </aside>
        <section className="main-col">
          <div className="card problem-solving-missing">
            <h1 className="goal-top-title">问题解决</h1>
            <div className="muted">没有找到对应的目标或问题解决记录。</div>
            <button type="button" className="small-btn ghost" onClick={() => navigate(returnTo)}>返回目标详情</button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="page page-with-sidebar problem-solving-page">
      <aside className="side-col">
        <SidebarGoals activeId={goalId} basePath={basePath} />
      </aside>

      <section className="main-col">
        <form className="problem-solving-shell" onSubmit={handleComplete}>
          <header className="card problem-solving-header">
            <div>
              <div className="problem-solving-kicker">问题解决 · 引导式书写</div>
              <h1 className="goal-top-title">{isEditing ? '编辑问题梳理' : '理清问题解决思路'}</h1>
              <p>目标：{goal.title}。不适合当前情况的问题可以跳过，点击完成后才会保存。</p>
              {entry?.createdAt && <div className="muted">首次保存：{formatDateTime(entry.createdAt)}</div>}
            </div>
            <div className="problem-solving-header-actions">
              <button type="button" className="small-btn ghost" onClick={handleCancel}>取消</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? '保存中…' : '完成并保存'}</button>
            </div>
          </header>

          <div className="card problem-solving-progress" aria-label={`已处理 ${stats.answered + stats.skipped} 个，共 ${stats.total} 个问题`}>
            <div className="problem-solving-progress-copy">
              <strong>书写进度 {completion}%</strong>
              <span>已回答 {stats.answered} · 已跳过 {stats.skipped} · 待处理 {remaining}</span>
            </div>
            <div className="problem-solving-progress-track" aria-hidden="true">
              <span style={{ width: `${completion}%` }} />
            </div>
          </div>

          <div className="problem-solving-question-list">
            {PROBLEM_SOLVING_QUESTIONS.map((question, index) => {
              const answer = answers[question.id] || { content: '', skipped: false }
              return (
                <section className={`problem-solving-question-card${answer.skipped ? ' is-skipped' : ''}`} key={question.id}>
                  <div className="problem-solving-question-head">
                    <div>
                      <div className="problem-solving-question-index">问题 {index + 1}</div>
                      <h2>{question.title}</h2>
                    </div>
                    <button type="button" className="small-btn ghost" onClick={() => toggleSkip(question.id)}>
                      {answer.skipped ? '继续回答' : '跳过'}
                    </button>
                  </div>

                  {answer.skipped ? (
                    <button type="button" className="problem-solving-skipped-state" onClick={() => toggleSkip(question.id)}>
                      <span>已跳过这个问题</span>
                      <small>点击这里可继续回答</small>
                    </button>
                  ) : (
                    <textarea
                      aria-label={`问题 ${index + 1}：${question.title}`}
                      value={answer.content}
                      onChange={(event) => updateAnswer(question.id, event.target.value)}
                      rows={index === 0 || index === 8 ? 8 : 6}
                      placeholder={question.prompt}
                    />
                  )}
                </section>
              )
            })}
          </div>

          <footer className="card problem-solving-footer">
            <div>
              <strong>{remaining ? `还有 ${remaining} 个问题未处理` : '所有问题都已处理'}</strong>
              <div className="muted">回答没有字数限制；跳过的题目会保留“已跳过”状态。</div>
            </div>
            <div className="problem-solving-header-actions">
              <button type="button" className="small-btn ghost" onClick={handleCancel}>取消</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? '保存中…' : '完成并保存'}</button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  )
}
