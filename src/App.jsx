import './App.css'
import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Activity, BookOpenText, CalendarDays, Dumbbell, Flame, PenLine, Target } from 'lucide-react'
import Goals from './pages/Goals'
import GoalDetail from './pages/GoalDetail'
import ActionEntry from './pages/Action'
import ExerciseEntry from './pages/Exercise'
import ExerciseDetail from './pages/ExerciseDetail'
import DailyPlanner from './pages/DailyPlanner'
import DailyAchievements from './pages/DailyAchievements'
import Writing from './pages/Writing'
import NewGoal from './pages/NewGoal'
import EditGoal from './pages/EditGoal'
import WorkExperience from './pages/WorkExperience'
import ProblemSolving from './pages/ProblemSolving'
import NewExercise from './pages/NewExercise'
import EditExercise from './pages/EditExercise'
import ExerciseWorkExperience from './pages/ExerciseWorkExperience'
import IconStatus from './components/IconStatus'
import AuthGate from './components/AuthGate'
import useHealthReminders from './hooks/useHealthReminders'
import useStorageSyncStatus from './hooks/useStorageSyncStatus'
import { exportData, importData, retryStorageSync } from './storage/storage'
import { getWeeklyBackupStatus, runWeeklyBackup } from './lib/weeklyBackup'

function padDatePart(value) {
  return String(value).padStart(2, '0')
}

function getDateKey(date = new Date()) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
}

function formatWorkDuration(totalMinutes) {
  const normalizedMinutes = Math.max(0, Math.round(Number(totalMinutes) || 0))
  const hours = Math.floor(normalizedMinutes / 60)
  const minutes = normalizedMinutes % 60
  return `${hours}小时${minutes}分钟`
}

function sanitizeBackupSegment(value, fallback = 'local') {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')

  return normalized.replace(/^-+|-+$/g, '') || fallback
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}

function App() {
  const reminders = useHealthReminders()
  const syncStatus = useStorageSyncStatus()

  return (
    <AuthGate>
      {({ session, signOut, localMode, syncAvailable, exitLocalMode }) => (
        <AppContent
          reminders={reminders}
          syncStatus={syncStatus}
          session={session}
          signOut={signOut}
          localMode={localMode}
          syncAvailable={syncAvailable}
          exitLocalMode={exitLocalMode}
        />
      )}
    </AuthGate>
  )
}

function AppContent({ reminders, syncStatus, session, signOut, localMode, syncAvailable = true, exitLocalMode }) {
  const userId = session?.user?.id
  const userEmail = session?.user?.email
  const [backupStatus, setBackupStatus] = useState(() => getWeeklyBackupStatus(session))
  const backupFileInputRef = useRef(null)
  const navItems = [
    { end: true, to: '/', label: '行动', hint: '今日执行', icon: Activity },
    { to: '/goals', label: '目标', hint: '方向与结果', icon: Target },
    { to: '/planner', label: '规划', hint: '周计划 / 日计划', icon: CalendarDays },
    { to: '/achievements', label: '火苗', hint: '四种心理感受', icon: Flame },
    { to: '/exercise', label: '运动', hint: '身体行动', icon: Dumbbell },
    { to: '/writing', label: '书写', hint: '记录与整理', icon: PenLine },
  ]

  useEffect(() => {
    if (!userId) {
      setBackupStatus(getWeeklyBackupStatus(null))
      return
    }

    const nextStatus = runWeeklyBackup({
      session: { user: { id: userId, email: userEmail } },
      exportData,
      localMode,
    })
    setBackupStatus(nextStatus)
  }, [userId, userEmail, localMode])

  function formatBackupStatus() {
    if (!syncAvailable) return '当前数据保存在此设备，请定期导出备份。'
    if (!session?.user?.id) return '登录后可启用每日自动备份。'
    if (!backupStatus.hasBackupToday) return `今日备份未生成（${backupStatus.dateKey}）`
    if (!backupStatus.lastBackupAt) return `今日已备份（${backupStatus.dateKey}）`

    const formatted = new Date(backupStatus.lastBackupAt)
    const label = Number.isNaN(formatted.getTime())
      ? backupStatus.lastBackupAt
      : formatted.toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

    return `今日已备份：${label}`
  }

  function handleManualBackup() {
    if (!session?.user?.id) return

    const nextStatus = runWeeklyBackup({
      session,
      exportData,
      localMode,
      force: true,
    })
    setBackupStatus(nextStatus)
  }

  function handleExportBackup() {
    try {
      const createdAt = new Date()
      const rawState = exportData()
      const state = JSON.parse(rawState)
      const owner = session?.user?.email || session?.user?.id || 'local'
      const filename = `action-journal-backup-${sanitizeBackupSegment(owner)}-${getDateKey(createdAt)}.json`

      downloadJsonFile(filename, {
        meta: {
          createdAt: createdAt.toISOString(),
          dateKey: getDateKey(createdAt),
          backupCadence: 'manual',
          source: 'action-journal',
          localMode,
          userId: session?.user?.id || '',
        },
        state,
      })
    } catch {
      window.alert('导出失败，请稍后再试。')
    }
  }

  function handleImportBackupClick() {
    backupFileInputRef.current?.click()
  }

  async function handleBackupFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const confirmed = window.confirm(syncAvailable
      ? '导入备份会合并到当前数据，并自动同步到云端。同 ID 的记录会以备份文件为准。继续导入吗？'
      : '导入备份会合并到当前数据。同 ID 的记录会以备份文件为准。继续导入吗？')
    if (!confirmed) {
      event.target.value = ''
      return
    }

    try {
      const content = await file.text()
      importData(content, { merge: true })
      window.alert('\u5907\u4efd\u5bfc\u5165\u6210\u529f\uff0c\u9875\u9762\u6570\u636e\u5df2\u66f4\u65b0\u3002')
    } catch {
      window.alert('\u5bfc\u5165\u5931\u8d25\uff0c\u8bf7\u9009\u62e9\u6709\u6548\u7684\u5907\u4efd JSON \u6587\u4ef6\u3002')
    } finally {
      event.target.value = ''
    }
  }

  function renderSyncStatus(localModeValue) {
    if (!syncAvailable) return '本机保存中'
    if (localModeValue) return '本机保存中，联网后可登录同步'
    if (syncStatus.phase === 'loading') return '正在读取云端数据'
    if (syncStatus.phase === 'syncing') return '正在同步到云端'
    if (syncStatus.phase === 'synced') {
      if (!syncStatus.lastSyncedAt) return '云端已连接'
      return `已同步 ${new Date(syncStatus.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    }
    if (syncStatus.phase === 'error') return '同步暂时不可用'
    if (syncStatus.phase === 'signed-out') return '请登录后同步'
    if (syncStatus.phase === 'not-configured') return '本机保存中'
    return '云端待命'
  }

  return (
    <BrowserRouter>
      <div className="app-shell">
        <aside className="app-sidebar">
          <div className="brand-block">
            <div className="brand-mark">
              <BookOpenText size={22} strokeWidth={2.2} />
            </div>
            <div>
              <h1 className="app-title">行动手账</h1>
              <p>行动记录与复盘</p>
            </div>
          </div>

          <nav className="main-nav" aria-label="主导航">
            {navItems.map((item) => {
              const NavIcon = item.icon

              return (
                <NavLink key={item.to} end={item.end} to={item.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                  <NavIcon size={18} strokeWidth={2.1} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                  </span>
                </NavLink>
              )
            })}
          </nav>

          <div className="sidebar-card">
            <div className="sidebar-card-stat">
              <div className="sidebar-card-label">本周专注时长</div>
              <div className="sidebar-card-value">{formatWorkDuration(reminders.totalMinutesThisWeek)}</div>
            </div>
            <div className="sidebar-card-stat">
              <div className="sidebar-card-label">本日专注时长</div>
              <div className="sidebar-card-value">{formatWorkDuration(reminders.totalMinutesToday)}</div>
            </div>
            <div className="sidebar-card-foot">
              <IconStatus status={reminders.status} />
              <span>{renderSyncStatus(localMode)}</span>
            </div>
          </div>
        </aside>

        <div className="app-workspace">
          <header className="app-header">
            <div>
              <div className="header-kicker">今日工作台</div>
              <h2 className="workspace-title">人生行动手账本</h2>
              <div className="sync-caption">
              {localMode
                ? syncAvailable
                  ? '当前使用本机数据。恢复网络后，可登录并继续同步到云端。'
                  : '当前使用本机数据，记录会保存在此设备。'
                : `已登录：${session?.user?.email || '当前账号'}`}
              </div>
              <div className="sync-caption">{formatBackupStatus()}</div>
            </div>
            <div className="header-actions">
              <div className={`sync-status sync-status-${localMode ? 'signed-out' : syncStatus.phase || 'idle'}`}>
                <span>{renderSyncStatus(localMode)}</span>
                {!localMode && syncStatus.phase === 'error' ? (
                  <button type="button" className="sync-retry-btn" onClick={() => { void retryStorageSync() }}>
                    重试同步
                  </button>
                ) : null}
              </div>
              {session?.user?.id ? (
                <button type="button" className="sync-retry-btn" onClick={handleManualBackup}>立即备份</button>
              ) : (
                <button type="button" className="sync-retry-btn" onClick={handleExportBackup}>导出备份</button>
              )}
              <button type="button" className="sync-retry-btn" onClick={handleImportBackupClick}>导入备份</button>
              <input
                ref={backupFileInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={handleBackupFileChange}
              />
              {localMode && syncAvailable ? (
                <button type="button" className="sign-out-btn" onClick={exitLocalMode}>{session ? '恢复云端同步' : '登录并同步'}</button>
              ) : !localMode ? (
                <button type="button" className="sign-out-btn" onClick={signOut}>退出登录</button>
              ) : null}
            </div>
          </header>

          <main className="app-main">
            <Routes>
              <Route path="/" element={<ActionEntry />} />
              <Route path="/goals" element={<Goals />} />
              <Route path="/goal/:id" element={<GoalDetail />} />
              <Route path="/action" element={<ActionEntry />} />
              <Route path="/action/:id" element={<GoalDetail />} />
              <Route path="/goals/:goalId/actions/:actionId/work-experience" element={<WorkExperience />} />
              <Route path="/goals/:goalId/problem-solving/new" element={<ProblemSolving />} />
              <Route path="/goals/:goalId/problem-solving/:entryId" element={<ProblemSolving />} />
              <Route path="/exercise" element={<ExerciseEntry />} />
              <Route path="/exercise/:id" element={<ExerciseDetail />} />
              <Route path="/exercise-goals/:goalId/actions/:actionId/work-experience" element={<ExerciseWorkExperience />} />
              <Route path="/new-goal" element={<NewGoal />} />
              <Route path="/edit-goal/:id" element={<EditGoal />} />
              <Route path="/new-exercise" element={<NewExercise />} />
              <Route path="/edit-exercise/:id" element={<EditExercise />} />
              <Route path="/planner" element={<DailyPlanner />} />
              <Route path="/achievements" element={<DailyAchievements />} />
              <Route path="/writing" element={<Writing />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}

export default App
