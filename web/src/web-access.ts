import type { LocalUser, WebCapabilities } from './api.js'

/** Backend capabilities govern lab access in both deployments. */
export function webAccess(user: LocalUser | null, capabilities?: WebCapabilities, _localLab = false) {
  const writes = Boolean(user) && capabilities?.readOnly !== true && capabilities?.writes !== false
  return {
    writes,
    manageOwnWalls: writes && (Boolean(user?.isAdmin) || capabilities?.manageOwnWalls === true),
    segmentationLab: Boolean(user) && capabilities?.segmentationLab === true,
    wallAuthoring: writes && Boolean(user?.isAdmin) && capabilities?.wallAuthoring !== false && capabilities?.imageUpload !== false,
    requiresLogin: (route: string) => !user && ['me', 'create', 'wall-editor', 'problem-editor'].includes(route),
  }
}
