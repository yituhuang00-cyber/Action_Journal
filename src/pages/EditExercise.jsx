import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getExerciseGoal, updateExerciseGoal } from '../storage/storage'

export default function EditExercise() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [reasons, setReasons] = useState([''])
  const [supports, setSupports] = useState([''])

  useEffect(() => {
    const goal = getExerciseGoal(id)
    if (!goal) {
      window.alert('未找到该运动，可能已被删除。')
      navigate('/exercise')
      return
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(goal.title || '')
    setReasons(goal.reasons && goal.reasons.length ? goal.reasons : [''])
    setSupports(goal.supports && goal.supports.length ? goal.supports : [''])
    setLoading(false)
  }, [id, navigate])

  function updateReason(index, value) {
    const next = [...reasons]
    next[index] = value
    setReasons(next)
  }

  function addReason() {
    setReasons([...reasons, ''])
  }

  function removeReason(index) {
    const next = reasons.filter((_, currentIndex) => currentIndex !== index)
    setReasons(next.length ? next : [''])
  }

  function updateSupport(index, value) {
    const next = [...supports]
    next[index] = value
    setSupports(next)
  }

  function addSupport() {
    setSupports([...supports, ''])
  }

  function removeSupport(index) {
    const next = supports.filter((_, currentIndex) => currentIndex !== index)
    setSupports(next.length ? next : [''])
  }

  function handleSave(event) {
    event.preventDefault()
    if (!title.trim()) return window.alert('请填写运动标题')

    updateExerciseGoal(id, {
      title: title.trim(),
      reasons: reasons.filter((item) => item && item.trim()),
      supports: supports.filter((item) => item && item.trim()),
    })
    navigate('/exercise')
  }

  if (loading) return null

  return (
    <div className="page new-goal-page">
      <h2>编辑运动</h2>
      <form onSubmit={handleSave} style={{ maxWidth: 760 }}>
        <div style={{ marginBottom: 12 }}>
          <label>运动主题</label>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：慢跑 / 力量训练 / 游泳" style={{ width: '100%', padding: 8, borderRadius: 8 }} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>为什么自己想要做这件事？</label>
          {reasons.map((reason, index) => (
            <div key={index} style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input value={reason} onChange={(event) => updateReason(index, event.target.value)} style={{ flex: 1, padding: 8, borderRadius: 6 }} placeholder={`理由 ${index + 1}`} />
              <button type="button" onClick={() => removeReason(index)} className="small-btn danger">删除</button>
            </div>
          ))}
          <div style={{ marginTop: 8 }}><button type="button" onClick={addReason} className="small-btn ghost">添加理由</button></div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>在运动的过程中，有哪些人际联结，可以为我提供动力和支持</label>
          {supports.map((support, index) => (
            <div key={index} style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input value={support} onChange={(event) => updateSupport(index, event.target.value)} style={{ flex: 1, padding: 8, borderRadius: 6 }} placeholder={`支持 ${index + 1}`} />
              <button type="button" onClick={() => removeSupport(index)} className="small-btn danger">删除</button>
            </div>
          ))}
          <div style={{ marginTop: 8 }}><button type="button" onClick={addSupport} className="small-btn ghost">添加支持</button></div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="create-btn" type="submit">保存修改</button>
          <button type="button" className="small-btn ghost" onClick={() => navigate('/exercise')}>取消</button>
        </div>
      </form>
    </div>
  )
}