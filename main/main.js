import path from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import electronIsDev from 'electron-is-dev'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { spawn } from 'child_process'
import waitOn from 'wait-on'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let appWindow = null

let nextServerProcess = null



const startNextServer = async () => {
  if (electronIsDev) return;

  const nextServerPath = path.join(process.resourcesPath, 'app.asar.unpacked');
  console.log('Next.js working directory:', nextServerPath);

  try {
    const command = process.platform === 'win32' ? 'node.exe' : 'node';
    const nextCliPath = path.join(nextServerPath, 'node_modules/next/dist/bin/next');
    const args = [nextCliPath, 'start'];

    nextServerProcess = spawn(command, args, {
      cwd: nextServerPath,
      stdio: 'ignore',
      detached: true,
    });

    nextServerProcess.unref();
    await waitOn({ resources: ['http://localhost:3000'], timeout: 30000 });
    console.log('Next.js server started successfully.');
  } catch (error) {
    console.error('Error starting Next.js server:', error);
    throw new Error(`Error: ${error.message}\nPath: ${nextServerPath}`);
  }
};

const spawnAppWindow = async () => {
  try {
    await startNextServer(); // Ensure Next.js starts before launching Electron

    const PRELOAD_PATH = path.join(__dirname, 'preload.js');

    appWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: true,
      webPreferences: {
        preload: PRELOAD_PATH,
      },
    });

    // Load Next.js app in Electron
    const url = electronIsDev
      ? 'http://localhost:3000'
      : 'http://localhost:3000'; // Use server, not file://

    appWindow.loadURL(url);
    appWindow.maximize();
    appWindow.setMenu(null);
    appWindow.show();

    if (electronIsDev) appWindow.webContents.openDevTools({ mode: 'right' });

    appWindow.on('closed', () => {
      appWindow = null;
      if (nextServerProcess) nextServerProcess.kill();
    });
  } catch (error) {
    // Display the error message in the window
    if (appWindow) {
      appWindow.webContents.executeJavaScript(`alert('Error: ${error.message}')`);
    } else {
      console.error('Error creating app window:', error);
    }
  }
};

app.on('ready', async () => {
  try {
    await spawnAppWindow();
  } catch (error) {
    console.error('Failed to spawn app window:', error);
    if (appWindow) {
      appWindow.webContents.executeJavaScript(`alert('Error: ${error.message}')`);
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (nextServerProcess) nextServerProcess.kill();
    app.quit();
  }
});

ipcMain.handle('sample:ping', () => 'pong');
