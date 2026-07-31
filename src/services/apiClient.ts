import { PlexicusApi } from './plexicusApi.js'
import { loadConfig } from './config.js'

export async function createApiClient(token: string | null | undefined): Promise<PlexicusApi> {
  const config = await loadConfig()
  return new PlexicusApi({ baseUrl: config.serverUrl, token: token ?? config.token })
}
