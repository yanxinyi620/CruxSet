import type { LocalUser, WebCapabilities } from './api.js'

/** Missing capabilities retain the local service's authoring features. */
export function webAccess(user: LocalUser | null, capabilities?: WebCapabilities) {
  const writes = Boolean(user) && capabilities?.readOnly !== true && capabilities?.writes !== false
  return {
    writes,
    wallAuthoring: writes && Boolean(user?.isAdmin) && capabilities?.wallAuthoring !== false && capabilities?.imageUpload !== false,
    requiresLogin: (route: string) => !user && ['me', 'create', 'wall-editor', 'problem-editor'].includes(route),
  }
}
