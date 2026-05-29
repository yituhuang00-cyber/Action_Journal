import { useEffect, useState } from 'react'
import { getSyncStatus, STORAGE_STATUS_EVENT } from '../storage/cloudSync'

export default function useStorageSyncStatus() {
  const [status, setStatus] = useState(() => getSyncStatus())

  useEffect(() => {
    function handleStatusChange() {
      setStatus(getSyncStatus())
    }

    window.addEventListener(STORAGE_STATUS_EVENT, handleStatusChange)
    return () => window.removeEventListener(STORAGE_STATUS_EVENT, handleStatusChange)
  }, [])

  return status
}
