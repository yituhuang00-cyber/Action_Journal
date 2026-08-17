import { useEffect, useMemo, useRef, useState } from 'react'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase'
import { initializeStorage, refreshStorageFromCloud } from '../storage/storage'

const initialForm = {
  email: '',
  password: '',
}

function getFriendlyAuthError(error, fallback) {
  const message = String(error?.message || '').toLowerCase()

  if (message.includes('invalid login credentials')) return '邮箱或密码不正确，请重新输入。'
  if (message.includes('email not confirmed')) return '请先完成邮箱确认，再回来登录。'
  if (message.includes('already registered') || message.includes('already exists')) return '这个邮箱已经注册，请直接登录。'
  if (message.includes('password') && message.includes('6')) return '密码至少需要 6 位。'
  if (message.includes('failed to fetch') || message.includes('network') || message.includes('fetch')) return '网络连接异常，请稍后再试。'

  return fallback
}

function hasStoredStateSnapshot() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false

  try {
    return Boolean(localStorage.getItem('action-journal:state'))
  } catch {
    return false
  }
}

function LoadingView({ text }) {
  return (
    <div className="auth-gate-shell">
      <div className="auth-card card-surface">
        <div className="auth-eyebrow">云端同步</div>
        <h2 className="auth-title">{text}</h2>
      </div>
    </div>
  )
}

export default function AuthGate({ children }) {
  const syncAvailable = isSupabaseConfigured()
  const client = useMemo(() => getSupabaseClient(), [])
  const [session, setSession] = useState(null)
  const [mode, setMode] = useState('sign-in')
  const [form, setForm] = useState(initialForm)
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [localMode, setLocalMode] = useState(false)
  const [status, setStatus] = useState({ loading: true, submitting: false, error: '', message: '' })
  const hadSessionRef = useRef(false)
  const sessionUserIdRef = useRef(null)
  const explicitSignOutRef = useRef(false)
  const onlineRef = useRef(online)

  useEffect(() => {
    onlineRef.current = online
  }, [online])

  useEffect(() => {
    function handleOnline() {
      setOnline(true)
    }

    function handleOffline() {
      setOnline(false)
      if (!session && !explicitSignOutRef.current) {
        setLocalMode(true)
      }
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [session])

  useEffect(() => {
    if (!syncAvailable || !client) {
      let cancelled = false
      setLocalMode(true)
      setStatus({ loading: true, submitting: false, error: '', message: '' })
      void initializeStorage({ session: null, forceRefresh: true })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) {
            setStatus({ loading: false, submitting: false, error: '', message: '' })
          }
        })
      return () => {
        cancelled = true
      }
    }

    let cancelled = false

    async function bootstrap(nextSession) {
      try {
        if (!onlineRef.current && (nextSession || hasStoredStateSnapshot())) {
          setLocalMode(true)
          await initializeStorage({ session: null, forceRefresh: true })
          return
        }

        await initializeStorage({ session: nextSession, forceRefresh: true })
      } catch (error) {
        if (!cancelled) {
          setStatus((prev) => ({ ...prev, error: getFriendlyAuthError(error, '同步暂时不可用，请稍后再试。') }))
        }
      }
    }

    async function loadSession() {
      setStatus((prev) => ({ ...prev, loading: true, error: '' }))
      const { data, error } = await client.auth.getSession()
      if (cancelled) return

      if (error) {
        if (!onlineRef.current || hasStoredStateSnapshot()) {
          setLocalMode(true)
        }
        setStatus({ loading: false, submitting: false, error: getFriendlyAuthError(error, '读取登录状态失败，请稍后再试。'), message: '' })
        return
      }

      const nextSession = data.session ?? null
      hadSessionRef.current = Boolean(nextSession)
      sessionUserIdRef.current = nextSession?.user?.id || null
      setSession(nextSession)
      if (nextSession && !onlineRef.current) {
        setLocalMode(true)
      }
      if (!nextSession && !onlineRef.current && !explicitSignOutRef.current) {
        setLocalMode(true)
      }
      await bootstrap(nextSession)
      if (!cancelled) {
        setStatus((prev) => ({ ...prev, loading: false }))
      }
    }

    void loadSession()

    const { data: authListener } = client.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user?.id || null
      const isSameAuthenticatedUser = Boolean(nextUserId && nextUserId === sessionUserIdRef.current && hadSessionRef.current)

      setSession(nextSession)

      if (isSameAuthenticatedUser) {
        explicitSignOutRef.current = false
        setLocalMode(!onlineRef.current)
        return
      }

      sessionUserIdRef.current = nextUserId
      setStatus((prev) => ({ ...prev, loading: true, error: '' }))

      if (nextSession) {
        hadSessionRef.current = true
        explicitSignOutRef.current = false
        setLocalMode(!onlineRef.current)
      } else {
        const shouldUseLocalMode = !explicitSignOutRef.current && (!onlineRef.current || hadSessionRef.current || hasStoredStateSnapshot())
        hadSessionRef.current = false
        sessionUserIdRef.current = null
        setLocalMode(shouldUseLocalMode)
      }

      void bootstrap(nextSession)
        .then(() => {
          if (!cancelled) {
            setStatus((prev) => ({ ...prev, loading: false }))
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setStatus({ loading: false, submitting: false, error: getFriendlyAuthError(error, '同步暂时不可用，请稍后再试。'), message: '' })
          }
        })
    })

    return () => {
      cancelled = true
      authListener.subscription.unsubscribe()
    }
  }, [client, syncAvailable])

  useEffect(() => {
    if (!session || !online) return undefined

    function syncOnFocus() {
      void refreshStorageFromCloud()
    }

    function syncOnVisible() {
      if (document.visibilityState === 'visible') {
        void refreshStorageFromCloud()
      }
    }

    window.addEventListener('focus', syncOnFocus)
    document.addEventListener('visibilitychange', syncOnVisible)

    return () => {
      window.removeEventListener('focus', syncOnFocus)
      document.removeEventListener('visibilitychange', syncOnVisible)
    }
  }, [session, online])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!client) return

    setStatus({ loading: false, submitting: true, error: '', message: '' })

    try {
      if (mode === 'sign-in') {
        const { error } = await client.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        })
        if (error) throw error
        setStatus({ loading: false, submitting: false, error: '', message: '' })
        return
      }

      const { data, error } = await client.auth.signUp({
        email: form.email,
        password: form.password,
      })
      if (error) throw error

      const needsEmailConfirmation = !data.session
      setStatus({
        loading: false,
        submitting: false,
        error: '',
        message: needsEmailConfirmation ? '注册成功，请去邮箱完成确认后再登录。' : '注册成功，正在初始化数据。',
      })
    } catch (error) {
      setStatus({
        loading: false,
        submitting: false,
        error: getFriendlyAuthError(error, mode === 'sign-in' ? '登录失败，请检查邮箱和密码。' : '注册失败，请稍后再试。'),
        message: '',
      })
    }
  }

  async function handleSignOut() {
    if (!client) return

    explicitSignOutRef.current = true
    setLocalMode(false)
    setStatus((prev) => ({ ...prev, loading: true, error: '' }))
    const { error } = await client.auth.signOut()
    if (error) {
      explicitSignOutRef.current = false
      setStatus({ loading: false, submitting: false, error: getFriendlyAuthError(error, '退出失败，请稍后再试。'), message: '' })
      return
    }

    setStatus({ loading: false, submitting: false, error: '', message: '' })
  }

  if (status.loading) {
    return <LoadingView text={syncAvailable ? (session ? '正在同步云端数据…' : '正在读取登录状态…') : '正在准备本机数据…'} />
  }

  if (!session && localMode) {
    return typeof children === 'function'
      ? children({
          session: null,
          signOut: handleSignOut,
          localMode: true,
          syncAvailable,
          exitLocalMode: () => setLocalMode(false),
        })
      : children
  }

  if (!session) {
    return (
      <div className="auth-gate-shell">
        <div className="auth-card card-surface">
          <div className="auth-eyebrow">人生行动手账本</div>
          <h2 className="auth-title">登录后自动同步到云端</h2>
          <p className="auth-copy">
            登录后会把记录安全同步到云端，并可在不同设备间继续使用。
          </p>
          {!online ? <p className="auth-copy auth-copy-muted">当前离线。你也可以先使用本机数据继续记录，恢复网络后再登录同步。</p> : null}
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              邮箱
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                required
                autoComplete="email"
              />
            </label>
            <label>
              密码
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                required
                minLength={6}
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              />
            </label>
            {status.error ? <div className="auth-error">{status.error}</div> : null}
            {status.message ? <div className="auth-message">{status.message}</div> : null}
            <button className="btn-primary auth-submit" type="submit" disabled={status.submitting}>
              {status.submitting ? '提交中…' : mode === 'sign-in' ? '登录' : '注册'}
            </button>
          </form>
          <button
            type="button"
            className="auth-toggle"
            onClick={() => {
              setMode((prev) => (prev === 'sign-in' ? 'sign-up' : 'sign-in'))
              setStatus({ loading: false, submitting: false, error: '', message: '' })
            }}
          >
            {mode === 'sign-in' ? '没有账号？去注册' : '已有账号？去登录'}
          </button>
          {!online ? (
            <button
              type="button"
              className="auth-toggle"
              onClick={() => setLocalMode(true)}
            >
              先离线使用本地数据
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  return typeof children === 'function'
    ? children({ session, signOut: handleSignOut, localMode, syncAvailable, exitLocalMode: () => setLocalMode(false) })
    : children
}
