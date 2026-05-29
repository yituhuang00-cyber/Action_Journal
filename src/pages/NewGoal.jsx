import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createGoal } from '../storage/storage'

export default function NewGoal() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [reasons, setReasons] = useState([''])
  const [expectedOutcome, setExpectedOutcome] = useState('')
  const [supports, setSupports] = useState([''])
  const [factors, setFactors] = useState([{ name: '', controllability: 5 }])

  function updateReason(i, v) {
    const next = [...reasons]
    next[i] = v
    setReasons(next)
  }

  function addReason() { setReasons([...reasons, '']) }
  function removeReason(i) { setReasons(reasons.filter((_, idx) => idx !== i)) }

  function updateSupport(i, v) {
    const next = [...supports]
    next[i] = v
    setSupports(next)
  }
  function addSupport() { setSupports([...supports, '']) }
  function removeSupport(i) { setSupports(supports.filter((_, idx) => idx !== i)) }

  function updateFactor(i, key, v) {
    const next = [...factors]
    next[i] = { ...next[i], [key]: v }
    setFactors(next)
  }
  function addFactor() { setFactors([...factors, { name: '', controllability: 5 }]) }
  function removeFactor(i) { setFactors(factors.filter((_, idx) => idx !== i)) }

  function handleSave(e) {
    e.preventDefault()
    if (!title.trim()) return window.alert('请填写目标标题')

    const payload = {
      title: title.trim(),
      reasons: reasons.filter((r) => r && r.trim()),
      expectedOutcome: expectedOutcome.trim(),
      supports: supports.filter((s) => s && s.trim()),
      factors: factors.filter((f) => f.name && f.name.trim()).map((f) => ({ name: f.name.trim(), controllability: Number(f.controllability) })),
      status: 'want',
    }

    createGoal(payload)
    navigate('/')
  }

  return (
    <div className="page new-goal-page">
      <h2>新建目标</h2>
      <form onSubmit={handleSave} style={{ maxWidth: 760 }}>
        <div style={{ marginBottom: 12 }}>
          <label>目标</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：学习写作" style={{ width: '100%', padding: 8, borderRadius: 8 }} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>为什么自己想要做这件事？</label>
          {reasons.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input value={r} onChange={(e) => updateReason(i, e.target.value)} style={{ flex: 1, padding: 8, borderRadius: 6 }} placeholder={`理由 ${i + 1}`} />
              <button type="button" onClick={() => removeReason(i)} className="small-btn danger">删除</button>
            </div>
          ))}
          <div style={{ marginTop: 8 }}><button type="button" onClick={addReason} className="small-btn ghost">添加理由</button></div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>我期待在什么时候，获得什么结果/实现什么目标</label>
          <textarea
            value={expectedOutcome}
            onChange={(e) => setExpectedOutcome(e.target.value)}
            style={{ width: '100%', padding: 8, borderRadius: 8, minHeight: 96, resize: 'vertical' }}
            placeholder="例如：\n- 时间：3 个月内\n- 结果：完成 10 篇短文"
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>在实现目标的过程中，哪些人际联结，可能为我提供动力和支持</label>
          {supports.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input value={s} onChange={(e) => updateSupport(i, e.target.value)} style={{ flex: 1, padding: 8, borderRadius: 6 }} placeholder={`支持 ${i + 1}`} />
              <button type="button" onClick={() => removeSupport(i)} className="small-btn danger">删除</button>
            </div>
          ))}
          <div style={{ marginTop: 8 }}><button type="button" onClick={addSupport} className="small-btn ghost">添加支持</button></div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>可能影响结果的内部和外部因素，并给它们的可控程度进行打分（0-10）</label>
          {factors.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <input value={f.name} onChange={(e) => updateFactor(i, 'name', e.target.value)} placeholder={`因素 ${i + 1}`} style={{ flex: 1, padding: 8, borderRadius: 6 }} />
              <input type="number" value={f.controllability} min="0" max="10" onChange={(e) => updateFactor(i, 'controllability', e.target.value)} style={{ width: 80, padding: 8, borderRadius: 6 }} />
              <button type="button" onClick={() => removeFactor(i)} className="small-btn danger">删除</button>
            </div>
          ))}
          <div style={{ marginTop: 8 }}><button type="button" onClick={addFactor} className="small-btn ghost">添加因素</button></div>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button className="create-btn" type="submit">保存并返回</button>
          <button type="button" className="small-btn ghost" onClick={() => navigate('/')}>取消</button>
        </div>
      </form>
    </div>
  )
}
