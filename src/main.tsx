#!/usr/bin/env bun
import { program } from '@commander-js/extra-typings'
import React from 'react'
import { render } from 'ink'
import chalk from 'chalk'
import { friendlyError } from './utils/errors.js'

// Force true-color (24-bit) rendering — some terminals report lower capability
chalk.level = 3

const { version } = await import('../package.json', { with: { type: 'json' } })

// Credentials: `plexicus login` (loopback + PKCE, or --device) stores a revocable token in the OS
// keychain. There is no --token, no password login. PLEXICUS_TOKEN is honoured for non-interactive
// use only (never stored, never echoed; a warning is printed on a TTY).
async function startSession(): Promise<{ config: import('./services/config.js').Config; token: string }> {
  const { loadConfig } = await import('./services/config.js')
  const { migrateLegacyToken, resolveCredential } = await import('./services/auth/credentials.js')
  const { printSplash } = await import('./assets/splash.js')
  const config = await loadConfig()

  const migration = await migrateLegacyToken()
  if (migration.warning) console.warn(chalk.yellow(migration.warning))
  if (migration.migrated) console.log(chalk.gray('Moved your stored token from config.json to the credential store.'))

  printSplash(version, config.serverUrl)

  if (process.env.MOCK_PLEXICUS === '1') return { config, token: process.env.PLEXICUS_TOKEN ?? 'mock-token' }

  const cred = await resolveCredential({ serverUrl: config.serverUrl })
  if (cred) {
    if (cred.warning) console.warn(chalk.yellow(cred.warning))
    return { config, token: cred.token }
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(chalk.red('Not logged in. Run `plexicus login` (or set PLEXICUS_TOKEN for non-interactive use).'))
    process.exit(1)
  }
  console.log(chalk.cyan('You are not logged in. Starting login...'))
  const { runLogin } = await import('./commands/login.js')
  try {
    const out = await runLogin(config)
    console.log(chalk.green(`✓ Authenticated${out.email ? ` as ${out.email}` : ''}`))
    return { config, token: out.token }
  } catch (err: unknown) {
    console.error(chalk.red(friendlyError(err, 'Login failed')))
    process.exit(1)
  }
}

program
  .name('plexicus')
  .description('Plexicus ASPM TUI — security posture at your fingertips')
  .version(version)
  .option('--repo <name>', 'filter findings to a specific repository')
  .option('--cve <id>', 'jump directly to a finding by CVE ID')
  .action(async (options) => {
    const { config, token } = await startSession()
    const { default: App } = await import('./components/App.js')
    render(React.createElement(App, { ...options, config, token }))
  })

program
  .command('login')
  .description('Log in through your browser (loopback + PKCE); stores a revocable token in the OS keychain')
  .option('--device', 'use the device flow: print a code to enter at the verification URL (SSH, headless)')
  .action(async (options) => {
    const { loadConfig } = await import('./services/config.js')
    const { migrateLegacyToken } = await import('./services/auth/credentials.js')
    const { printSplash } = await import('./assets/splash.js')
    const { runLogin } = await import('./commands/login.js')
    const config = await loadConfig()
    await migrateLegacyToken()
    printSplash(version, config.serverUrl)
    try {
      const out = await runLogin(config, { device: Boolean(options.device) })
      console.log(chalk.green(`✓ Authenticated${out.email ? ` as ${out.email}` : ''}`))
      process.exit(0)
    } catch (err: unknown) {
      console.error(chalk.red(friendlyError(err, 'Login failed')))
      process.exit(1)
    }
  })

program
  .command('logout')
  .description('Revoke the stored token on the server and remove it from this machine')
  .action(async () => {
    const { loadConfig } = await import('./services/config.js')
    const { runLogout } = await import('./commands/logout.js')
    const config = await loadConfig()
    const result = await runLogout(config)
    for (const line of result.messages) {
      console.log(result.server === 'failed' ? chalk.yellow(line) : chalk.green(line))
    }
    process.exit(result.exitCode)
  })

program
  .command('repos')
  .description('Browse and manage repositories')
  .action(async () => {
    const { config, token } = await startSession()
    const { default: App } = await import('./components/App.js')
    render(React.createElement(App, { config, token }))
  })

program
  .command('config')
  .description('Manage plexicus configuration')
  .addCommand(
    program
      .createCommand('set')
      .argument('<key>', 'config key (e.g. serverUrl)')
      .argument('<value>', 'config value')
      .action(async (key, value) => {
        const { default: ConfigSetCommand } = await import('./commands/configSet.js')
        await ConfigSetCommand(key, value)
      }),
  )

program.parse()
