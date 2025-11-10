import path from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import electronIsDev from 'electron-is-dev'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { spawn, fork } from 'child_process'
import waitOn from 'wait-on'
import fs from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let appWindow = null

let nextServerProcess = null

// Function to find Node.js executable path
const findNodeExecutable = () => {
  if (electronIsDev) {
    // In dev, use 'node' from PATH
    return process.platform === 'win32' ? 'node.exe' : 'node'
  }

  // In production, use Electron's bundled Node.js runtime
  // Electron bundles Node.js, and we can use process.execPath (Electron executable)
  // with special flags to run Node.js scripts, or find the bundled Node.js
  try {
    // On macOS, Electron bundles Node.js in the app bundle
    // We can use process.execPath (Electron) with --eval or find the Node.js binary
    if (process.platform === 'darwin') {
      // Try to find Node.js in common system locations first (for compatibility)
      const commonPaths = ['/usr/local/bin/node', '/usr/bin/node', '/opt/homebrew/bin/node'].filter(
        Boolean,
      )

      for (const nodePath of commonPaths) {
        if (fs.existsSync(nodePath)) {
          console.log('Found system Node.js at:', nodePath)
          return nodePath
        }
      }

      // Use Electron's bundled Node.js runtime
      // Electron's process.execPath points to Electron, but we can use it with special handling
      // Actually, we'll use Electron's Node.js by requiring Next.js directly or using execPath
      console.log('Using Electron bundled Node.js runtime')
      // Return Electron executable - we'll handle this differently in spawn
      return process.execPath
    } else if (process.platform === 'win32') {
      // On Windows, try system Node.js first
      const commonPaths = [
        'C:\\Program Files\\nodejs\\node.exe',
        'C:\\Program Files (x86)\\nodejs\\node.exe',
      ]

      for (const nodePath of commonPaths) {
        if (fs.existsSync(nodePath)) {
          console.log('Found system Node.js at:', nodePath)
          return nodePath
        }
      }

      // Use Electron's bundled runtime
      return process.execPath
    } else {
      // Linux - try system Node.js first
      const commonPaths = ['/usr/bin/node', '/usr/local/bin/node']
      for (const nodePath of commonPaths) {
        if (fs.existsSync(nodePath)) {
          console.log('Found system Node.js at:', nodePath)
          return nodePath
        }
      }
      return process.execPath
    }
  } catch (error) {
    console.error('Error finding Node.js executable:', error)
    // Fallback to Electron's runtime
    return process.execPath
  }
}

const startNextServer = async () => {
  if (electronIsDev) return

  // Determine the correct path to the unpacked app directory
  let nextServerPath
  if (process.resourcesPath) {
    // Check if asar is enabled or disabled
    const appAsarUnpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked')
    const appPath = path.join(process.resourcesPath, 'app')

    // If app.asar.unpacked exists, use it (asar enabled)
    // Otherwise, use app directory (asar disabled)
    if (fs.existsSync(appAsarUnpackedPath)) {
      nextServerPath = appAsarUnpackedPath
    } else if (fs.existsSync(appPath)) {
      nextServerPath = appPath
    } else {
      // Fallback: try app path replacement
      nextServerPath = app.getAppPath().replace('app.asar', 'app.asar.unpacked')
      // If that doesn't exist, try just the app path
      if (!fs.existsSync(nextServerPath)) {
        nextServerPath = app.getAppPath().replace('app.asar', 'app')
      }
    }
  } else {
    // Fallback: use app path
    const appPath = app.getAppPath()
    if (appPath.includes('app.asar')) {
      // Try unpacked first, then regular app
      nextServerPath = appPath.replace('app.asar', 'app.asar.unpacked')
      if (!fs.existsSync(nextServerPath)) {
        nextServerPath = appPath.replace('app.asar', 'app')
      }
    } else {
      nextServerPath = appPath
    }
  }

  console.log('Next.js working directory:', nextServerPath)
  console.log('App path:', app.getAppPath())
  console.log('Resources path:', process.resourcesPath)

  // Verify the directory exists
  try {
    if (!fs.existsSync(nextServerPath)) {
      throw new Error(`Next.js server path does not exist: ${nextServerPath}`)
    }
  } catch (err) {
    console.error('Path check error:', err)
    throw new Error(`Cannot access Next.js server directory: ${nextServerPath}`)
  }

  try {
    // Find Node.js executable path
    const nodeCommand = findNodeExecutable()
    const nextCliPath = path.join(nextServerPath, 'node_modules/next/dist/bin/next')

    // Verify next binary exists
    if (!fs.existsSync(nextCliPath)) {
      throw new Error(`Next.js binary not found at: ${nextCliPath}`)
    }

    // Set environment variables
    const env = {
      ...process.env,
      NODE_OPTIONS: '--no-deprecation',
      NODE_ENV: 'production',
      PORT: '3000',
    }

    console.log('Starting Next.js server...')
    console.log('Node command:', nodeCommand)
    console.log('Next.js CLI path:', nextCliPath)
    console.log('CWD:', nextServerPath)

    // Check if we're using Electron's bundled runtime (process.execPath)
    const isUsingElectronRuntime = nodeCommand === process.execPath

    if (isUsingElectronRuntime) {
      // Use fork() which uses Electron's bundled Node.js runtime
      // Fork automatically uses the current Node.js runtime (Electron's)
      console.log('Using Electron bundled Node.js runtime with fork()')
      nextServerProcess = fork(nextCliPath, ['start'], {
        cwd: nextServerPath,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: env,
      })
    } else {
      // Use spawn() with system Node.js
      console.log('Using system Node.js with spawn()')
      const args = [nextCliPath, 'start']
      env.PATH =
        process.env.PATH ||
        ['/usr/local/bin', '/usr/bin', '/bin', '/opt/homebrew/bin'].join(path.delimiter)

      nextServerProcess = spawn(nodeCommand, args, {
        cwd: nextServerPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        env: env,
      })
    }

    // Log stdout/stderr for debugging
    nextServerProcess.stdout.on('data', (data) => {
      console.log(`Next.js stdout: ${data}`)
    })

    nextServerProcess.stderr.on('data', (data) => {
      console.error(`Next.js stderr: ${data}`)
    })

    nextServerProcess.on('error', (error) => {
      console.error('Next.js process error:', error)
      throw error
    })

    nextServerProcess.on('exit', (code, signal) => {
      if (code !== null && code !== 0) {
        console.error(`Next.js process exited with code ${code}`)
      }
      if (signal) {
        console.error(`Next.js process killed with signal ${signal}`)
      }
    })

    // Wait for server to be ready
    await waitOn({ resources: ['http://localhost:3000'], timeout: 30000 })
    console.log('Next.js server started successfully.')
  } catch (error) {
    console.error('Error starting Next.js server:', error)
    if (nextServerProcess) {
      nextServerProcess.kill()
    }
    throw new Error(`Failed to start Next.js server: ${error.message}\nPath: ${nextServerPath}`)
  }
}

const spawnAppWindow = async () => {
  try {
    await startNextServer() // Ensure Next.js starts before launching Electron

    const PRELOAD_PATH = path.join(__dirname, 'preload.js')

    appWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: false, // Don't show until ready
      webPreferences: {
        preload: PRELOAD_PATH,
      },
    })

    // Load Next.js app in Electron
    const url = electronIsDev ? 'http://localhost:3000' : 'http://localhost:3000' // Use server, not file://

    appWindow.loadURL(url)

    appWindow.once('ready-to-show', () => {
      appWindow.maximize()
      appWindow.setMenu(null)
      appWindow.show()
    })

    if (electronIsDev) appWindow.webContents.openDevTools({ mode: 'right' })

    appWindow.on('closed', () => {
      appWindow = null
      if (nextServerProcess) {
        nextServerProcess.kill()
        nextServerProcess = null
      }
    })

    // Handle navigation errors
    appWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Failed to load URL:', errorCode, errorDescription)
      if (errorCode !== -3) {
        // -3 is ERR_ABORTED, which is normal for navigation
        appWindow.webContents.executeJavaScript(`
          document.body.innerHTML = '<div style="padding: 20px; font-family: sans-serif;"><h1>Failed to load application</h1><p>Error: ${errorDescription}</p><p>Please check the console for more details.</p></div>';
        `)
      }
    })
  } catch (error) {
    console.error('Error creating app window:', error)
    // Create error window if main window doesn't exist
    if (!appWindow) {
      appWindow = new BrowserWindow({
        width: 600,
        height: 400,
        show: true,
      })
      appWindow.loadURL(
        `data:text/html,<html><body style="padding: 20px; font-family: sans-serif;"><h1>Error Starting Application</h1><p>${error.message}</p><p>Please check the console for more details.</p></body></html>`,
      )
    } else {
      appWindow.webContents.executeJavaScript(`alert('Error: ${error.message}')`)
    }
  }
}

app.on('ready', async () => {
  try {
    await spawnAppWindow()
  } catch (error) {
    console.error('Failed to spawn app window:', error)
    if (appWindow) {
      appWindow.webContents.executeJavaScript(`alert('Error: ${error.message}')`)
    }
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (nextServerProcess) nextServerProcess.kill()
    app.quit()
  }
})

ipcMain.handle('sample:ping', () => 'pong')
