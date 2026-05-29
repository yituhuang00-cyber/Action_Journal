import React from 'react'

export default function IconStatus({ status = 'normal' }) {
  const color = status === 'normal' ? 'black' : status === 'warn' ? 'orange' : 'red'
  return (
    <span className="icon-status" style={{ color }} aria-hidden>
      ●
    </span>
  )
}
