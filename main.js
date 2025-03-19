const { app, Tray, Menu, nativeImage, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

app.commandLine.appendSwitch('high-dpi-support', 'true');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
const path = require('path');
const simpleGit = require('simple-git');
const { spawn } = require('child_process');
const fs = require('fs');

let tray = null;
let nodeProcess = null;
let appDataPath = path.join(process.env.APPDATA, 'dsmodinstaller');
let repoPath = path.join(appDataPath, 'sheltupdate6686');

async function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function cloneOrPullRepo() {
  try {
    await ensureDirectoryExists(appDataPath);
    const git = simpleGit();
    
    if (!fs.existsSync(repoPath)) {
      console.log('Repository not found, attempting to clone...');
      await git.clone('https://github.com/6686-repos/sheltupdate6686', repoPath);
      console.log('Repository cloned successfully');
    } else {
      console.log('Repository exists, pulling latest changes...');
      await git.cwd(repoPath).pull();
      console.log('Repository updated successfully');
    }
  } catch (error) {
    console.error('Git operation failed:', error.message);
    throw new Error(`Git operation failed: ${error.message}`);
  }
}

async function installDependencies() {
  return new Promise((resolve, reject) => {
    console.log('Starting npm install...');
    const npm = spawn('npm', ['install'], { cwd: repoPath, shell: true });
    
    let stdoutData = '';
    let stderrData = '';
    
    npm.stdout.on('data', (data) => {
      stdoutData += data;
      console.log(`npm install output: ${data}`);
    });
    
    npm.stderr.on('data', (data) => {
      stderrData += data;
      console.error(`npm install error: ${data}`);
    });
    
    npm.on('error', (error) => {
      console.error('Failed to start npm process:', error);
      reject(new Error(`Failed to start npm: ${error.message}`));
    });
    
    npm.on('close', (code) => {
      if (code === 0) {
        console.log('npm install completed successfully');
        resolve();
      } else {
        const errorMessage = `npm install failed with code ${code}\nOutput: ${stdoutData}\nErrors: ${stderrData}`;
        console.error(errorMessage);
        reject(new Error(errorMessage));
      }
    });
  });}


function startNodeProcess() {
  if (nodeProcess) {
    nodeProcess.kill();
  }
  
  nodeProcess = spawn('node', ['src/index.js'], { cwd: repoPath });
  
  nodeProcess.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });
  
  nodeProcess.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });
  
  nodeProcess.on('close', (code) => {
    console.log(`Child process exited with code ${code}`);
  });
}

async function initialize() {
  try {
    console.log('Starting initialization...');
    console.log('Cloning or pulling repository...');
    await cloneOrPullRepo();
    console.log('Installing dependencies...');
    await installDependencies();
    console.log('Starting node process...');
    startNodeProcess();
    console.log('Initialization completed successfully');
  } catch (error) {
    console.error('Initialization failed:', error.stack || error);
    if (error.message.includes('Failed to start npm')) {
      console.error('Failed to start npm. Please ensure npm is installed and accessible in your PATH.');
    } else if (error.message.includes('npm install failed')) {
      console.error('Failed to install dependencies. Check the error log above for details.');
      console.error('Common solutions:\n1. Check your internet connection\n2. Clear npm cache (run npm cache clean --force)\n3. Delete node_modules folder and try again');
    } else if (error.message.includes('git')) {
      console.error('Failed to clone/pull repository. Please check your internet connection and try again.');
    }
    app.quit();
  }
}

function checkForUpdates() {
  autoUpdater.logger = require('electron-log');
  autoUpdater.logger.transports.file.level = 'info';
  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: 'A new version is available. The update will be downloaded automatically.',
      buttons: ['OK']
    });
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'Update has been downloaded. The application will restart to install the update.',
      buttons: ['Restart']
    }).then(() => {
      autoUpdater.quitAndInstall(true, true);
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('AutoUpdater error:', err);
  });
}

app.whenReady().then(() => {
  checkForUpdates();
  const iconPath = path.join(__dirname, 'icon.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      console.error('Failed to load tray icon - image is empty');
      trayIcon = nativeImage.createEmpty();
    }
    // Resize icon for better visibility
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  } catch (error) {
    console.error('Failed to load tray icon:', error);
    trayIcon = nativeImage.createEmpty();
  }
  tray = new Tray(trayIcon);

  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'DS Mod Installer',
      enabled: false,
      icon: trayIcon
    },
    { type: 'separator' },
    {
      label: 'Restart',
      click: async () => {
        try {
          await cloneOrPullRepo();
          await installDependencies();
          startNodeProcess();
        } catch (error) {
          console.error('Failed to restart process:', error);
        }
      }
    },
    {
      label: 'Exit',
      click: () => {
        if (nodeProcess) {
          nodeProcess.kill();
        }
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('DS Mod Installer');
  tray.setContextMenu(contextMenu);
  
  initialize();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (nodeProcess) {
    nodeProcess.kill();
  }
});