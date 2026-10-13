import { setConfigValue } from '../services/config.js'
import { friendlyError } from '../utils/errors.js'

export default async function ConfigSetCommand(key: string, value: string): Promise<void> {
  try {
    await setConfigValue(key, value)
    console.log(`✓ Set ${key} = ${value}`)
  } catch (err) {
    console.error(`✗ Failed to set ${key}: ${friendlyError(err, 'Unknown error')}`)
    process.exit(1)
  }
}
