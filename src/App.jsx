import './App.css'
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
import { retryStorageSync } from './storage/storage'

function App() {
  const reminders = useHealthReminders()
  const syncStatus = useStorageSyncStatus()

  function renderSyncStatus(localMode) {
    if (localMode) return '离线本地模式，内容先保存在本机，恢复网络后可登录同步'
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
    <AuthGate>
      {({ session, signOut, localMode, exitLocalMode }) => (
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
                {localMode ? (
                  <button type="button" className="sign-out-btn" onClick={exitLocalMode}>登录并同步</button>
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
      )}
    </AuthGate>
  )
}

export default App
