import { useEffect, useState, useSyncExternalStore } from 'react'

import type { AppConfig } from '../config'
import { MonitorController, type MonitorState } from '../session/monitor'

export function useMonitor(config: AppConfig): [MonitorState, MonitorController] {
  const [controller] = useState(() => new MonitorController(config))
  useEffect(() => {
    controller.activate()
    return () => {
      controller.deactivate()
    }
  }, [controller])
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  return [state, controller]
}
