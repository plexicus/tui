#!/usr/bin/env bun
import { program } from '@commander-js/extra-typings'
import React from 'react'
import { render } from 'ink'
import chalk from 'chalk'

// Force true-color (24-bit) rendering — some terminals report lower capability
chalk.level = 3

const { version } = await import('../package.json', { with: { type: 'json' } })

program
  .name('plexicus')
  .description('Plexicus ASPM TUI — security posture at your fingertips')
  .version(version)
  .option('--repo <name>', 'filter findings to a specific repository')
  .option('--cve <id>', 'jump directly to a finding by CVE ID')
  .option('--token <token>', 'authenticate with a Bearer token')
  .action(async (options) => {
    const { loadConfig } = await import('./services/config.js')
    const { printSplash } = await import('./assets/splash.js')
    const config = await loadConfig()

    printSplash(version, config.serverUrl)

    const token = options.token ?? process.env.PLEXICUS_TOKEN ?? config.token

    const { default: App } = await import('./components/App.js')
    render(React.createElement(App, { ...options, config, token }))
  })

program
  .command('login')
  .description('Authenticate with the Plexicus API')
  .option('--token <token>', 'skip interactive login, store this token directly')
  .option('--headless', 'use email/password instead of browser redirect')
  .action(async (options) => {
    const { loadConfig, saveConfig } = await import('./services/config.js')
    const { AppStateProvider } = await import('./state/AppState.js')
    const { LoginForm } = await import('./components/LoginForm.js')
    const config = await loadConfig()

    const onDone = (email: string) => {
      console.log(chalk.green(`✓ Authenticated as ${email}`))
      process.exit(0)
    }

    if (options.token) {
      const loginEl = React.createElement(LoginForm, { prefilledToken: options.token, onDone })
      render(React.createElement(AppStateProvider, { initialTheme: config.theme, children: loginEl }))
      return
    }

    const { canOpenBrowser } = await import('./utils/canOpenBrowser.js')
    const { deriveWebUrl } = await import('./utils/url.js')

    const webUrl = deriveWebUrl(config)
    const useWebRedirect = !options.headless && !!webUrl && canOpenBrowser()

    if (useWebRedirect) {
      try {
        const { loginViaWebRedirect } = await import('./services/auth/webRedirect.js')
        const { token, email } = await loginViaWebRedirect(webUrl!)
        await saveConfig({ ...config, token })
        console.log(chalk.green(`✓ Authenticated as ${email}`))
        process.exit(0)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(chalk.yellow(`Browser auth failed (${msg}), falling back to password login.`))
      }
    } else if (!options.headless && !webUrl) {
      console.warn(chalk.yellow('webUrl not configured — falling back to email/password login.'))
      console.warn(chalk.gray('  Set it with: plexicus config set webUrl https://your-app-domain'))
    }

    const loginEl = React.createElement(LoginForm, { onDone })
    render(React.createElement(AppStateProvider, { initialTheme: config.theme, children: loginEl }))
  })

program
  .command('logout')
  .description('Sign out and remove stored credentials')
  .action(async () => {
    const { loadConfig, saveConfig } = await import('./services/config.js')
    const config = await loadConfig()
    const token = process.env.PLEXICUS_TOKEN ?? config.token

    if (!token) {
      console.log(chalk.yellow('Not logged in.'))
      process.exit(0)
    }

    try {
      const { PlexicusApi } = await import('./services/plexicusApi.js')
      const api = new PlexicusApi({ baseUrl: config.serverUrl, token })
      await api.logout()
    } catch {
      // best-effort — clear local token regardless of server response
    }

    await saveConfig({ ...config, token: undefined })
    console.log(chalk.green('✓ Logged out successfully.'))
  })

program
  .command('repos')
  .description('Browse and manage repositories')
  .action(async () => {
    const { loadConfig } = await import('./services/config.js')
    const { default: App } = await import('./components/App.js')
    const config = await loadConfig()
    const token = process.env.PLEXICUS_TOKEN ?? config.token
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
