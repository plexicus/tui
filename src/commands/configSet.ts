import { setConfigValue } from '../services/config.js'

export default async function ConfigSetCommand(key: string, value: string): Promise<void> {
  try {
    await setConfigValue(key, value)
    const isSensitive = key === 'token'
    console.log(`✓ Set ${key} = ${isSensitive ? '***' : value}`)
  } catch (err) {
    console.error(`✗ Failed to set ${key}: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}
