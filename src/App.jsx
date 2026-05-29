import './App.css'
import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
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
import NewExercise from './pages/NewExercise'
import EditExercise from './pages/EditExercise'
import ExerciseWorkExperience from './pages/ExerciseWorkExperience'
import IconStatus from './components/IconStatus'
import AuthGate from './components/AuthGate'
import useHealthReminders from './hooks/useHealthReminders'
import useStorageSyncStatus from './hooks/useStorageSyncStatus'
import { exportData, retryStorageSync } from './storage/storage'
import { getWeeklyBackupStatus, runWeeklyBackup } from './lib/weeklyBackup'

function App() {
  const reminders = useHealthReminders()
  const syncStatus = useStorageSyncStatus()

  return (
    <AuthGate>
      {({ session, signOut, localMode, exitLocalMode }) => (
        <AppContent
          reminders={reminders}
          syncStatus={syncStatus}
          session={session}
          signOut={signOut}
          localMode={localMode}
          exitLocalMode={exitLocalMode}
        />
      )}
    </AuthGate>
  )
}

function AppContent({ reminders, syncStatus, session, signOut, localMode, exitLocalMode }) {
  const [backupStatus, setBackupStatus] = useState(() => getWeeklyBackupStatus(session))

  useEffect(() => {
    if (!session?.user?.id) {
      setBackupStatus(getWeeklyBackupStatus(null))
      return
    }

    const nextStatus = runWeeklyBackup({
      session,
      exportData,
      localMode,
    })
    setBackupStatus(nextStatus)
  }, [session?.user?.id, session?.user?.email, localMode])

  function formatBackupStatus() {
    if (!session?.user?.id) return '登录后可启用每周自动备份。'
    if (!backupStatus.hasBackupThisWeek) return `本周备份未生成（${backupStatus.weekKey}）`
    if (!backupStatus.lastBackupAt) return `本周已备份（${backupStatus.weekKey}）`

    const formatted = new Date(backupStatus.lastBackupAt)
    const label = Number.isNaN(formatted.getTime())
      ? backupStatus.lastBackupAt
      : formatted.toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

    return `本周已备份：${label}`
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

  function renderSyncStatus(localModeValue) {
    if (localModeValue) return '离线本地模式，内容先保存在本机，恢复网络后可登录同步'
    if (syncStatus.phase === 'loading') return '正在读取云端数据'
    if (syncStatus.phase === 'syncing') return '正在同步到云端'
    if (syncStatus.phase === 'synced') {
      if (!syncStatus.lastSyncedAt) return '云端已连接'
      return `已同步 ${new Date(syncStatus.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    }
    if (syncStatus.phase === 'error') return syncStatus.lastError || '云端同步失败'
    if (syncStatus.phase === 'signed-out') return '请登录后同步'
    if (syncStatus.phase === 'not-configured') return '云端未配置'
    return '云端待命'
  }

  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="app-header">
          <div>
            <h1 className="app-title">人生行动手账本</h1>
            <div className="sync-caption">
              {localMode
                ? '当前处于离线本地模式。恢复网络后，可切回登录并继续同步到云端。'
                : `云端数据库已连接，当前账号：${session?.user?.email || '未命名用户'}`}
            </div>
            <div className="sync-caption">{formatBackupStatus()}</div>
            <div className={`sync-status sync-status-${localMode ? 'signed-out' : syncStatus.phase || 'idle'}`}>
              <span>{renderSyncStatus(localMode)}</span>
              {!localMode && syncStatus.phase === 'error' ? (
                <button type="button" className="sync-retry-btn" onClick={() => { void retryStorageSync() }}>
                  重试同步
                </button>
              ) : null}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <IconStatus status={reminders.status} />
              <small style={{ color: '#666' }}>{reminders.totalMinutesToday} 分钟今日行动</small>
            </div>
            {session?.user?.id ? (
              <button type="button" className="sync-retry-btn" onClick={handleManualBackup}>立即备份</button>
            ) : null}
            {localMode ? (
              <button type="button" className="sign-out-btn" onClick={exitLocalMode}>{session ? '恢复云端同步' : '登录并同步'}</button>
            ) : (
              <button type="button" className="sign-out-btn" onClick={signOut}>退出登录</button>
            )}
          </div>
          <nav className="main-nav">
            <NavLink end to="/" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>行动</NavLink>
            <NavLink to="/exercise" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>运动</NavLink>
            <NavLink to="/goals" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>目标</NavLink>
            <NavLink to="/planner" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>周规划/日规划</NavLink>
            <NavLink to="/achievements" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>日成就</NavLink>
            <NavLink to="/writing" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>书写</NavLink>
          </nav>
        </header>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<ActionEntry />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/goal/:id" element={<GoalDetail />} />
            <Route path="/action" element={<ActionEntry />} />
            <Route path="/action/:id" element={<GoalDetail />} />
            <Route path="/goals/:goalId/actions/:actionId/work-experience" element={<WorkExperience />} />
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
    </BrowserRouter>
  )
}

export default App
