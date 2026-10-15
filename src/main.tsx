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
  .description('Plexicus AppSec TUI — security posture at your fingertips')
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
  .command('credits')
  .description('Show your remaining AI credits and Pentest Units')
  .action(async () => {
    const { config, token } = await startSession()
    const { apiFor, creditsText } = await import('./commands/clientViews.js')
    try {
      console.log(await creditsText(apiFor(config, token)))
    } catch (err: unknown) {
      console.error(chalk.red(friendlyError(err, 'Could not read credits')))
      process.exit(1)
    }
  })

program
  .command('pentests')
  .description('List your AI pentests and their status (read-only)')
  .option('--status <status>', 'draft | pending | running | completed | failed | cancelled')
  .option('--page <n>', 'page number', v => Number.parseInt(v, 10))
  .action(async (options) => {
    const { config, token } = await startSession()
    const { apiFor, pentestsText, PENTEST_STATUSES } = await import('./commands/clientViews.js')
    if (options.status && !(PENTEST_STATUSES as readonly string[]).includes(options.status)) {
      console.error(chalk.red(`--status must be one of: ${PENTEST_STATUSES.join(', ')}`))
      process.exit(1)
    }
    try {
      for (const line of await pentestsText(apiFor(config, token), { status: options.status, page: options.page })) console.log(line)
    } catch (err: unknown) {
      console.error(chalk.red(friendlyError(err, 'Could not list pentests')))
      process.exit(1)
    }
  })

program
  .command('support')
  .description('File an in-app support ticket (question, bug, feature_request, billing, security, other)')
  .option('--category <category>', 'question | bug | feature_request | billing | security | other')
  .option('--subject <text>', 'subject (max 200 characters)')
  .option('--message <text>', 'message (max 5000 characters)')
  .option('--yes', 'skip the confirmation prompt (all fields must be given)')
  .action(async (options) => {
    const { config, token } = await startSession()
    const { runSupport } = await import('./commands/support.js')
    const { createInterface } = await import('node:readline')
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false })
    const buffered: string[] = []
    let waiter: ((v: string | null) => void) | null = null
    let closed = false
    rl.on('line', l => (waiter ? ((w) => { waiter = null; w(l) })(waiter) : buffered.push(l)))
    rl.on('close', () => { closed = true; waiter?.(null) })
    const ask = (prompt: string) =>
      new Promise<string | null>(resolve => {
        if (prompt) process.stdout.write(prompt)
        if (buffered.length) return resolve(buffered.shift()!)
        if (closed) return resolve(null)
        waiter = resolve
      })
    try {
      const out = await runSupport(config, token, options, { ask, print: l => console.log(l) })
      if (out.sent) {
        console.log(chalk.green(`✓ Ticket sent${out.ticketId ? ` (reference ${out.ticketId})` : ''}. We reply by email.`))
      } else {
        console.error(chalk.yellow(out.reason ?? 'Nothing was sent.'))
        process.exitCode = 1
      }
    } catch (err: unknown) {
      console.error(chalk.red(friendlyError(err, 'Could not send the ticket')))
      process.exitCode = 1
    } finally {
      rl.close()
    }
    process.exit(process.exitCode ?? 0)
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
