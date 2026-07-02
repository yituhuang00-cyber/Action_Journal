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
      <div className="page-shell form-page-shell">
        <div className="page-header form-page-header">
          <div>
            <div className="page-eyebrow">目标设计</div>
            <h2 className="page-title">新建目标</h2>
            <div className="page-subtitle">先把目标、动机和外部条件说清楚，再进入行动。</div>
          </div>
          <button type="button" className="small-btn ghost" onClick={() => navigate('/')}>返回</button>
        </div>

        <form onSubmit={handleSave} className="goal-form-shell">
          <section className="goal-form-card goal-form-card-primary">
            <div className="form-section-heading">
              <span>01</span>
              <div>
                <h3>目标本身</h3>
                <p>用一句话写清楚你要推进的方向。</p>
              </div>
            </div>
            <label className="field-label">目标</label>
            <input className="field-control field-control-lg" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：学习写作" />
          </section>

          <section className="goal-form-card">
            <div className="form-section-heading">
              <span>02</span>
              <div>
                <h3>内在动机</h3>
                <p>记录你为什么想做这件事，后面回顾时会很有用。</p>
              </div>
            </div>
            <label className="field-label">为什么自己想要做这件事？</label>
            <div className="repeat-list">
              {reasons.map((r, i) => (
                <div key={i} className="repeat-row">
                  <input value={r} onChange={(e) => updateReason(i, e.target.value)} placeholder={`理由 ${i + 1}`} />
                  <button type="button" onClick={() => removeReason(i)} className="small-btn danger">删除</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addReason} className="small-btn ghost">添加理由</button>
          </section>

          <section className="goal-form-card">
            <div className="form-section-heading">
              <span>03</span>
              <div>
                <h3>期望结果</h3>
                <p>把时间和结果写具体，目标才更容易被执行。</p>
              </div>
            </div>
            <label className="field-label">我期待在什么时候，获得什么结果/实现什么目标</label>
            <textarea
              value={expectedOutcome}
              onChange={(e) => setExpectedOutcome(e.target.value)}
              className="field-control goal-textarea"
              placeholder={'例如：\n- 时间：3 个月内\n- 结果：完成 10 篇短文'}
            />
          </section>

          <section className="goal-form-card">
            <div className="form-section-heading">
              <span>04</span>
              <div>
                <h3>支持系统</h3>
                <p>哪些人或关系能给你提醒、反馈和动力。</p>
              </div>
            </div>
            <label className="field-label">在实现目标的过程中，哪些人际联结，可能为我提供动力和支持</label>
            <div className="repeat-list">
              {supports.map((s, i) => (
                <div key={i} className="repeat-row">
                  <input value={s} onChange={(e) => updateSupport(i, e.target.value)} placeholder={`支持 ${i + 1}`} />
                  <button type="button" onClick={() => removeSupport(i)} className="small-btn danger">删除</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addSupport} className="small-btn ghost">添加支持</button>
          </section>

          <section className="goal-form-card">
            <div className="form-section-heading">
              <span>05</span>
              <div>
                <h3>影响因素</h3>
                <p>列出可能影响结果的变量，并估计可控程度。</p>
              </div>
            </div>
            <label className="field-label">可能影响结果的内部和外部因素，并给它们的可控程度进行打分（0-10）</label>
            <div className="repeat-list">
              {factors.map((f, i) => (
                <div key={i} className="repeat-row factor-row">
                  <input value={f.name} onChange={(e) => updateFactor(i, 'name', e.target.value)} placeholder={`因素 ${i + 1}`} />
                  <input type="number" value={f.controllability} min="0" max="10" onChange={(e) => updateFactor(i, 'controllability', e.target.value)} aria-label="可控程度" />
                  <button type="button" onClick={() => removeFactor(i)} className="small-btn danger">删除</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addFactor} className="small-btn ghost">添加因素</button>
          </section>

          <div className="form-sticky-actions">
            <button className="create-btn" type="submit">保存目标</button>
            <button type="button" className="small-btn ghost" onClick={() => navigate('/')}>取消</button>
          </div>
        </form>
      </div>
    </div>
  )
}
