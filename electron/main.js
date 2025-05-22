const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, crashReporter, screen, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const Store = require('electron-store');
const log = require('electron-log');
const https = require('https');
const { pipeline } = require('stream');
const axios = require('axios');
const os = require('os');
const MPServerless = require('@alicloud/mpserverless-node-sdk').default;

/**
 * 依赖管理系统更新记录
 * 
 * 2023-05-10：初始版本
 *   - 添加基础依赖检测和安装功能
 *   - 支持区分核心依赖和文档处理依赖
 *   
 * 2023-09-20：优化国内镜像源支持
 *   - 添加多个国内镜像源，自动切换失败的源
 *   - 改进安装过程的日志记录
 * 
 * 2024-05-01：强制依赖安装功能
 *   - 添加专用的依赖安装窗口，禁止用户关闭
 *   - 对核心依赖实施强制安装，不再提供取消选项
 *   - 对文档处理依赖保留选择性安装
 *   - 实时显示安装进度和日志记录
 */

// 配置日志
log.transports.file.level = 'info';
log.info('应用启动中...');

// 配置自动更新日志
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// 初始化存储
const store = new Store();

let mainWindow;
let pythonProcess = null;
let apiBaseUrl = 'http://localhost:8000';
let pythonInstallationInProgress = false;

// 记录应用状态
let appState = {
  pythonServerRunning: false,
  serverUrl: 'http://localhost:8000'
};

// 用户数据统计功能
const EMAS_CONFIG = {
  spaceId: 'YOUR_SPACE_ID',  // 服务空间标识 - 请替换为你自己的服务空间ID
  serverSecret: 'YOUR_SERVER_SECRET_KEY',   // 服务空间secret key - 请替换为你自己的密钥
  endpoint: 'https://api.next.bspapp.com'      // 服务空间地址
};

// 创建主窗口
function createWindow() {
  // 禁用安全策略
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Access-Control-Allow-Origin': ['*'],
        'Access-Control-Allow-Methods': ['*'],
        'Access-Control-Allow-Headers': ['*']
      }
    });
  });
  
  // 确定窗口图标
  let iconPath = null;
  if (process.platform === 'darwin') {
    const pngIcon = path.join(__dirname, '..', 'public', 'app.png');
    if (fs.existsSync(pngIcon)) {
      iconPath = pngIcon;
    }
  } else if (process.platform === 'win32') {
    const icoIcon = path.join(__dirname, '..', 'public', 'favicon.ico');
    if (fs.existsSync(icoIcon)) {
      iconPath = icoIcon;
    }
  } else {
    const pngIcon = path.join(__dirname, '..', 'public', 'app.png');
    if (fs.existsSync(pngIcon)) {
      iconPath = pngIcon;
    }
  }
  
  // 创建窗口配置
  const windowOptions = {
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false // 禁用网页安全策略
    }
  };
  
  // 如果图标存在，添加到窗口配置
  if (iconPath) {
    windowOptions.icon = iconPath;
    log.info(`设置窗口图标: ${iconPath}`);
  } else {
    log.warn('找不到合适的窗口图标');
  }
  
  mainWindow = new BrowserWindow(windowOptions);

  // 加载React应用
  if (app.isPackaged) {
    // 生产环境：加载打包好的React页面
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    // 开发环境：加载React开发服务器
    // 如果启动了webpack开发服务器，则从那里加载；否则加载打包后的文件
    try {
      mainWindow.loadURL('http://localhost:3000');
      log.info('从开发服务器加载应用');
      
      // 开发环境下打开开发者工具
      mainWindow.webContents.openDevTools();
    } catch (error) {
      log.warn('无法从开发服务器加载，尝试加载构建文件', error);
      const distPath = path.join(__dirname, 'dist', 'index.html');
      if (fs.existsSync(distPath)) {
        mainWindow.loadFile(distPath);
        log.info('从构建目录加载应用');
      } else {
        log.error('找不到应用页面，请先运行npm run build:react');
        dialog.showErrorBox(
          '启动失败', 
          '找不到应用页面，请先运行npm run build:react构建React应用'
        );
        app.quit();
      }
    }
  }

  // 窗口关闭时不退出应用，而是隐藏窗口
  mainWindow.on('close', (event) => {
    // 如果不是应用退出过程中，则阻止窗口关闭
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      
      // 不再显示通知小红点
      // if (process.platform === 'darwin') {
      //   app.dock.setBadge('•');
      // }
      
      return false;
    }
  });

  // 窗口关闭时清理资源
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 获取应用数据目录
function getAppDataPath() {
  // 创建一个不含空格的路径
  // 使用用户主目录和应用名的组合，而不是默认的Application Support路径
  const userHome = app.getPath('home');
  const appDataPath = path.join(userHome, '.findmeapp');
  
  if (!fs.existsSync(appDataPath)) {
    fs.mkdirSync(appDataPath, { recursive: true });
  }
  
  // 记录使用的数据路径
  log.info(`使用应用数据目录: ${appDataPath}`);
  
  return appDataPath;
}

// 检查Python是否已安装
async function checkPythonInstallation() {
  // 检查应用数据目录中是否已有Python环境
  const appDataPath = getAppDataPath();
  const pythonExecutable = process.platform === 'win32' 
    ? path.join(appDataPath, 'python', 'python.exe')
    : path.join(appDataPath, 'python', 'bin', 'python');
    
  // 检查Python可执行文件是否存在
  if (fs.existsSync(pythonExecutable)) {
    log.info(`找到已安装的Python: ${pythonExecutable}`);
    return { installed: true, path: pythonExecutable };
  }
  
  // 如果是打包后的应用，不使用系统Python，而是安装应用自己的Python环境
  if (app.isPackaged) {
    log.info('打包环境中未找到Python安装，将安装应用自己的Python环境');
    return { installed: false };
  }
  
  // 在开发环境中，可以使用系统Python
  // 检查系统Python
  return new Promise((resolve) => {
    exec('python3 --version', (error, stdout) => {
      if (!error && stdout) {
        log.info(`找到系统Python: ${stdout.trim()}`);
        resolve({ installed: true, path: 'python3', system: true });
      } else {
        exec('python --version', (error2, stdout2) => {
          if (!error2 && stdout2) {
            log.info(`找到系统Python: ${stdout2.trim()}`);
            resolve({ installed: true, path: 'python', system: true });
          } else {
            log.info('未找到Python安装');
            resolve({ installed: false });
          }
        });
      }
    });
  });
}

// 显示Python安装进度窗口
function showPythonInstallationWindow() {
  const installWindow = new BrowserWindow({
    width: 550,
    height: 520,
    parent: mainWindow,
    modal: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    resizable: true
  });
  
  installWindow.loadFile(path.join(__dirname, 'python_install.html'));
  installWindow.once('ready-to-show', () => {
    installWindow.show();
  });
  
  return installWindow;
}

// 安装Python
async function installPython() {
  if (pythonInstallationInProgress) {
    log.info('Python安装已在进行中');
    return;
  }
  
  pythonInstallationInProgress = true;
  log.info('开始安装Python...');
  
  const installWindow = showPythonInstallationWindow();
  const appDataPath = getAppDataPath();
  
  // 检查路径是否包含空格
  if (appDataPath.includes(' ')) {
    log.error(`应用数据路径包含空格，这可能导致安装失败: ${appDataPath}`);
    const { response } = await dialog.showMessageBox(installWindow, {
      type: 'warning',
      buttons: ['继续', '取消'],
      defaultId: 0,
      title: '警告：路径包含空格',
      message: '安装路径包含空格可能导致Python安装失败',
      detail: `Miniconda安装程序不支持包含空格的路径。应用将使用替代路径：${appDataPath}`
    });
    
    if (response !== 0) {
      // 用户取消安装
      pythonInstallationInProgress = false;
      installWindow.close();
      throw new Error('用户取消了安装（路径包含空格警告）');
    }
  }
  
  // 根据平台选择不同的Python安装包
  let downloadUrl;
  let pythonInstallerPath;
  let extractionCmd;
  let pythonPath;
  
  // 设置Python路径
  pythonPath = path.join(appDataPath, 'python');
  
  // 如果Python目录已存在，询问是否覆盖
  if (fs.existsSync(pythonPath)) {
    const { response } = await dialog.showMessageBox(installWindow, {
      type: 'warning',
      buttons: ['覆盖', '取消'],
      defaultId: 0,
      title: 'Python环境已存在',
      message: '检测到已有Python环境',
      detail: `目录 ${pythonPath} 已存在，继续安装将覆盖现有环境。您确定要继续吗？`
    });
    
    if (response !== 0) {
      // 用户取消覆盖
      pythonInstallationInProgress = false;
      installWindow.close();
      throw new Error('用户取消覆盖现有Python环境');
    }
    
    // 尝试删除现有Python目录
    try {
      installWindow.webContents.send('update-progress', { 
        status: '正在清理现有环境...', 
        progress: 5 
      });
      
      log.info(`移除现有Python目录: ${pythonPath}`);
      fs.rmSync(pythonPath, { recursive: true, force: true });
      log.info('现有Python目录已移除');
    } catch (error) {
      log.error(`无法删除现有Python目录: ${error.message}`);
      // 继续安装，可能会导致一些问题，但让我们尝试一下
    }
  }
  
  // 根据平台设置安装包路径和下载URL
  if (process.platform === 'darwin') {
    pythonInstallerPath = path.join(appDataPath, 'python-installer.sh');
    // macOS - 使用多个国内镜像备选源
    const mirrorUrls = [
      'https://mirrors.tuna.tsinghua.edu.cn/anaconda/miniconda/Miniconda3-latest-MacOSX-x86_64.sh',
      'https://mirrors.bfsu.edu.cn/anaconda/miniconda/Miniconda3-latest-MacOSX-x86_64.sh',
      'https://mirrors.aliyun.com/anaconda/miniconda/Miniconda3-latest-MacOSX-x86_64.sh',
      'https://mirrors.ustc.edu.cn/anaconda/miniconda/Miniconda3-latest-MacOSX-x86_64.sh',
      'https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-x86_64.sh'
    ];
    downloadUrl = mirrorUrls[0];
  } else if (process.platform === 'win32') {
    pythonInstallerPath = path.join(appDataPath, 'python-installer.exe');
    // Windows - 使用多个国内镜像备选源
    const mirrorUrls = [
      'https://mirrors.tuna.tsinghua.edu.cn/anaconda/miniconda/Miniconda3-latest-Windows-x86_64.exe',
      'https://mirrors.bfsu.edu.cn/anaconda/miniconda/Miniconda3-latest-Windows-x86_64.exe',
      'https://mirrors.aliyun.com/anaconda/miniconda/Miniconda3-latest-Windows-x86_64.exe',
      'https://mirrors.ustc.edu.cn/anaconda/miniconda/Miniconda3-latest-Windows-x86_64.exe',
      'https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-x86_64.exe'
    ];
    downloadUrl = mirrorUrls[0];
  } else {
    pythonInstallerPath = path.join(appDataPath, 'python-installer.sh');
    // Linux - 使用多个国内镜像备选
    const mirrorUrls = [
      'https://mirrors.tuna.tsinghua.edu.cn/anaconda/miniconda/Miniconda3-latest-Linux-x86_64.sh',
      'https://mirrors.bfsu.edu.cn/anaconda/miniconda/Miniconda3-latest-Linux-x86_64.sh',
      'https://mirrors.aliyun.com/anaconda/miniconda/Miniconda3-latest-Linux-x86_64.sh',
      'https://mirrors.ustc.edu.cn/anaconda/miniconda/Miniconda3-latest-Linux-x86_64.sh',
      'https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh' // 官方源作为最后备选
    ];
    downloadUrl = mirrorUrls[0]; // 默认使用第一个URL
    pythonInstallerPath = path.join(appDataPath, 'python-installer.sh');
    pythonPath = path.join(appDataPath, 'python');
  }
  
  try {
    // 直接下载Python安装包，不再询问用户
    installWindow.webContents.send('update-progress', { status: '正在下载Python安装包...', progress: 10 });
    log.info(`自动下载Python安装包`);
    
    // 获取系统平台的镜像URL列表
    const mirrorUrls = getMirrorUrlsForPlatform();
    let downloadSuccess = false;
    let lastError = null;
    
    // 依次尝试不同的镜像源
    for (let i = 0; i < mirrorUrls.length; i++) {
      const currentUrl = mirrorUrls[i];
      log.info(`尝试从镜像下载 (${i+1}/${mirrorUrls.length}): ${currentUrl}`);
      installWindow.webContents.send('update-progress', { 
        status: `正在从镜像下载Python安装包 (${i+1}/${mirrorUrls.length})...`, 
        progress: 10 
      });
      
      try {
        await downloadFile(currentUrl, pythonInstallerPath);
        log.info(`Python安装包下载完成: ${pythonInstallerPath}`);
        downloadSuccess = true;
        break; // 下载成功，跳出循环
      } catch (downloadError) {
        lastError = downloadError;
        log.error(`从 ${currentUrl} 下载失败: ${downloadError.message}`);
        // 继续尝试下一个镜像
      }
    }
    
    if (!downloadSuccess) {
      // 所有镜像下载失败，询问用户是否要手动选择本地安装包
      const { response: useLocalAfterFail } = await dialog.showMessageBox(installWindow, {
        type: 'error',
        buttons: ['选择本地安装包', '取消安装'],
        defaultId: 0,
        title: '下载失败',
        message: '所有镜像源下载失败',
        detail: `所有下载源均失败，最后一个错误: ${lastError.message}\n\n您可以选择本地已下载的安装包继续安装，或取消安装。`
      });
      
      if (useLocalAfterFail === 0) {
        // 用户选择使用本地安装包
        const result = await dialog.showOpenDialog(installWindow, {
          title: '选择Python安装包',
          properties: ['openFile'],
          filters: [
            { name: 'Python安装包', 
              extensions: process.platform === 'win32' ? ['exe'] : ['sh'] }
          ]
        });
        
        if (result.canceled || result.filePaths.length === 0) {
          // 用户取消了选择
          throw new Error('用户取消了选择本地安装包');
        }
        
        // 使用选择的本地安装包
        const localInstallerPath = result.filePaths[0];
        log.info(`使用本地安装包: ${localInstallerPath}`);
        
        // 复制安装包到应用数据目录
        installWindow.webContents.send('update-progress', { 
          status: '正在准备本地安装包...', 
          progress: 30 
        });
        
        fs.copyFileSync(localInstallerPath, pythonInstallerPath);
        log.info(`已复制安装包到: ${pythonInstallerPath}`);
      } else {
        throw new Error(`所有镜像源下载失败，用户取消安装`);
      }
    }
    
    // 安装Python
    installWindow.webContents.send('update-progress', { status: '正在安装Python...', progress: 40 });
    
    if (process.platform === 'darwin') {
      // macOS: 使用bash安装Miniconda
      log.info(`开始安装Miniconda到: ${pythonPath}`);
      
      // 确保安装脚本有执行权限
      try {
        fs.chmodSync(pythonInstallerPath, '755');
        log.info('已设置安装脚本执行权限');
      } catch (chmodError) {
        log.warn(`设置脚本执行权限失败: ${chmodError.message}`);
        // 继续尝试安装
      }
      
      await new Promise((resolve, reject) => {
        // 使用单引号而不是双引号，以减少shell转义问题
        const installCmd = `bash '${pythonInstallerPath}' -b -p '${pythonPath}'`;
        log.info(`执行安装命令: ${installCmd}`);
        
        exec(installCmd, (error, stdout, stderr) => {
          if (error) {
            log.error(`Miniconda安装错误: ${error.message}`);
            log.error(`命令: ${installCmd}`);
            log.error(`Stderr: ${stderr}`);
            
            // 尝试使用另一种方式安装
            if (error.message.includes('Cannot install into directories with spaces')) {
              log.error('检测到路径空格问题，尝试使用替代安装方法');
              
              // 创建一个临时脚本来执行安装
              const tmpScript = path.join(appDataPath, 'install_python.sh');
              const scriptContent = `#!/bin/bash
# 临时安装脚本
# 先进入到一个无空格的目录中
cd "$HOME" 
# 然后执行带有绝对路径的安装命令
bash "${pythonInstallerPath}" -b -p "${pythonPath}"
exit $?
`;
              
              fs.writeFileSync(tmpScript, scriptContent);
              fs.chmodSync(tmpScript, '755');
              
              // 执行临时脚本
              log.info('执行临时安装脚本');
              exec(tmpScript, (error2, stdout2, stderr2) => {
                if (error2) {
                  log.error(`临时脚本安装失败: ${error2.message}`);
                  log.error(`Stderr: ${stderr2}`);
                  reject(error2);
                  return;
                }
                log.info(`临时脚本安装成功: ${stdout2}`);
                resolve();
              });
              return;
            }
            
            reject(error);
            return;
          }
          log.info(`Miniconda安装输出: ${stdout}`);
          resolve();
        });
      });
    } else if (process.platform === 'win32') {
      // Windows: 静默安装Miniconda
      // Windows路径需要特殊处理
      // Miniconda安装程序需要正斜杠路径格式
      const windowsPythonPath = pythonPath.replace(/\\/g, '/');
      log.info(`开始在Windows上安装Miniconda到: ${windowsPythonPath}`);
      
      await new Promise((resolve, reject) => {
        // 注意：Windows上Miniconda安装程序的/D参数必须是最后一个参数
        const cmd = `"${pythonInstallerPath}" /S /InstallationType=JustMe /RegisterPython=0 /AddToPath=0 /D=${windowsPythonPath}`;
        log.info(`执行命令: ${cmd}`);
        
        exec(cmd, (error, stdout, stderr) => {
          if (error) {
            log.error(`Windows Miniconda安装错误: ${error.message}`);
            log.error(`Stderr: ${stderr}`);
            reject(error);
            return;
          }
          log.info(`Windows Miniconda安装输出: ${stdout || '没有输出'}`);
          
          // Windows安装程序可能立即返回，但实际安装还在进行中
          // 等待几秒钟以确保安装完成
          setTimeout(resolve, 5000);
        });
      });
      
      // 检查Python可执行文件是否存在（验证安装）
      const pythonExe = path.join(pythonPath, 'python.exe');
      if (!fs.existsSync(pythonExe)) {
        log.error(`安装似乎完成但Python可执行文件不存在: ${pythonExe}`);
        throw new Error(`Python安装失败：找不到可执行文件`);
      }
      
    } else {
      // Linux: 使用bash安装Miniconda
      log.info(`开始在Linux上安装Miniconda到: ${pythonPath}`);
      await new Promise((resolve, reject) => {
        exec(`bash "${pythonInstallerPath}" -b -p "${pythonPath}"`, (error, stdout, stderr) => {
          if (error) {
            log.error(`Linux Miniconda安装错误: ${error.message}`);
            log.error(`Stderr: ${stderr}`);
            reject(error);
            return;
          }
          log.info(`Linux Miniconda安装输出: ${stdout}`);
          resolve();
        });
      });
    }
    
    // 配置pip使用国内镜像源
    installWindow.webContents.send('update-progress', { status: '正在配置国内镜像源...', progress: 60 });
    
    // Windows需要特殊处理pip配置文件路径
    let pipConfigDir;
    if (process.platform === 'win32') {
      pipConfigDir = path.join(process.env.APPDATA || process.env.USERPROFILE, 'pip');
        } else {
      pipConfigDir = path.join(process.env.HOME || process.env.USERPROFILE, '.pip');
    }
    
    if (!fs.existsSync(pipConfigDir)) {
      fs.mkdirSync(pipConfigDir, { recursive: true });
    }
    
    // Windows下使用pip.ini，其他系统使用pip.conf
    const pipConfigFile = process.platform === 'win32' ? 'pip.ini' : 'pip.conf';
    const pipConfigPath = path.join(pipConfigDir, pipConfigFile);
    
    const pipConfigContent = `[global]
index-url = https://pypi.tuna.tsinghua.edu.cn/simple
trusted-host = pypi.tuna.tsinghua.edu.cn
timeout = 300
`;
    
    fs.writeFileSync(pipConfigPath, pipConfigContent);
    log.info(`已配置pip国内镜像源: ${pipConfigPath}`);
    
    // 确定Python可执行文件的路径
    let pythonExe;
    if (process.platform === 'win32') {
      pythonExe = path.join(pythonPath, 'python.exe');
    } else {
      pythonExe = path.join(pythonPath, 'bin', 'python');
    }
    
    // 检查Python可执行文件是否存在
    if (!fs.existsSync(pythonExe)) {
      log.error(`Python可执行文件不存在: ${pythonExe}`);
      throw new Error(`Python安装失败：找不到可执行文件 ${pythonExe}`);
    }
    
    log.info(`使用Python可执行文件: ${pythonExe}`);
    
    // 安装依赖
    installWindow.webContents.send('update-progress', { status: '正在安装必要依赖...', progress: 80 });
    const reqPath = path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'requirements.txt');
    log.info(`开始安装依赖，requirements文件: ${reqPath}`);
    
    // 定义基础和核心依赖，核心依赖优先单独安装以提高成功率
    const baseDependencies = [
      'pip', // 先更新pip自身
      'wheel', // 确保wheel可用，避免编译问题
      'setuptools>=68.0.0', // 更新setuptools
      'watchdog>=3.0.0', // 文件系统监控，优先安装
      'httpx>=0.26.0', // 基础HTTP客户端
      'orjson>=3.9.12' // JSON处理
    ];
    
    const coreDependencies = [
      'fastapi==0.110.0',
      'uvicorn==0.25.0',
      'Pillow>=10.0.1' // 注意避开10.0.0版本存在的问题
    ];
    
    // 文档处理相关依赖
    const docProcessingDependencies = [
      'pypdf>=3.0.0',           // PDF文件处理
      'python-docx>=1.1.0',     // Word文档处理
      'python-pptx>=0.6.23',    // PPT文件处理
      'pandas>=2.2.1',          // 数据处理
      'PyMuPDF>=1.20.0',        // PDF高级处理
      'pdfminer.six>=20231228', // PDF文本提取
      'pytesseract==0.3.10',    // OCR识别
      'openpyxl>=3.0.0'         // Excel文件处理
    ];
    
    // 向量数据库和嵌入相关依赖
    const vectorDependencies = [
      'faiss-cpu>=1.7.4'           // 向量检索库CPU版本
    ];
    
    // 定义多个pip镜像源，按优先级排序
    const mirrors = [
      'https://mirrors.aliyun.com/pypi/simple',
      'https://pypi.tuna.tsinghua.edu.cn/simple',
      'https://mirrors.cloud.tencent.com/pypi/simple',
      'https://mirrors.bfsu.edu.cn/pypi/simple',
      'https://pypi.org/simple' // 官方源作为最后备选
    ];
    
    // 增强版依赖安装函数，支持多镜像源轮询和进度显示
    async function installPackageWithProgress(pythonExe, packageName, progressStart, progressEnd) {
      // 更新安装开始进度
      installWindow.webContents.send('update-progress', { 
        status: `正在安装 ${packageName}...`, 
        progress: progressStart 
      });
      
      try {
        // 使用增强的installDependency函数
        const result = await installDependency(pythonExe, packageName);
        
        // 展示成功安装的依赖
        if (result && result.success && result.success.length > 0) {
          installWindow.webContents.send('update-progress', { 
            status: `已成功安装: ${result.success.join(', ')}`, 
            progress: progressEnd 
          });
          
          // 如果有部分失败，也一并展示
          if (result.failure && result.failure.length > 0) {
            setTimeout(() => {
              installWindow.webContents.send('update-progress', { 
                status: `部分依赖安装失败: ${result.failure.map(f => f.package).join(', ')}`, 
                progress: progressEnd 
              });
            }, 1000);
          }
        }
        
        return true;
      } catch (err) {
        // 显示安装失败信息
        installWindow.webContents.send('update-progress', { 
          status: `安装 ${packageName} 失败: ${err.message}`, 
          progress: progressStart 
        });
        
        log.error(`安装 ${packageName} 失败: ${err.message}`);
        return false;
      }
    }
    
    // 安装基础依赖
    let allSuccess = true;
    
    // 基础依赖安装（占进度的80-85%）
    installWindow.webContents.send('update-progress', { 
      status: '正在安装基础依赖...', 
      progress: 80 
    });
    
    try {
      const baseDepsSuccess = await installPackageWithProgress(pythonExe, baseDependencies.join(' '), 80, 82);
      if (!baseDepsSuccess) {
        log.warn('基础依赖安装失败或部分失败，但将继续安装其他依赖');
      }
      
      // 核心依赖安装（占进度的82-85%）
      installWindow.webContents.send('update-progress', { 
        status: '正在安装核心依赖...', 
        progress: 82 
      });
      
      const coreDepsSuccess = await installPackageWithProgress(pythonExe, coreDependencies.join(' '), 82, 85);
      if (!coreDepsSuccess) {
        log.error('核心依赖安装失败，可能导致应用无法正常工作');
        allSuccess = false;
      }
      
      // 文档处理依赖安装（占进度的85-88%）
      installWindow.webContents.send('update-progress', { 
        status: '正在安装文档处理依赖...', 
        progress: 85 
      });
      
      const docDepsSuccess = await installPackageWithProgress(pythonExe, docProcessingDependencies.join(' '), 85, 88);
      if (!docDepsSuccess) {
        log.warn('部分文档处理依赖安装失败，部分文件类型可能无法处理');
        // 不因文档处理依赖失败而终止整个流程
      }
      
      // 向量数据库依赖安装（占进度的88-92%）
      installWindow.webContents.send('update-progress', { 
        status: '正在安装向量数据库依赖...', 
        progress: 88 
      });
      
      const vectorDepsSuccess = await installPackageWithProgress(pythonExe, vectorDependencies.join(' '), 88, 92);
      if (!vectorDepsSuccess) {
        log.warn('部分向量数据库依赖安装失败，搜索和索引功能可能受影响');
        // 不因向量数据库依赖失败而终止整个流程
      }
      
      // 安装剩余依赖 (占进度的92-95%)
      installWindow.webContents.send('update-progress', { 
        status: '正在安装剩余依赖...', 
        progress: 92 
      });
      
      // 尝试多个镜像源安装requirements.txt
      let reqSuccess = false;
      for (let i = 0; i < mirrors.length && !reqSuccess; i++) {
        const mirror = mirrors[i];
        installWindow.webContents.send('update-progress', { 
          status: `正在安装所有依赖... (镜像: ${i+1}/${mirrors.length})`, 
          progress: 85 + (i * 2) 
        });
        
        try {
          await new Promise((resolve, reject) => {
            const pipCmd = `"${pythonExe}" -m pip install -r "${reqPath}" -i ${mirror} --timeout 300`;
            log.info(`从镜像 ${mirror} 执行依赖安装命令: ${pipCmd}`);
            
            exec(pipCmd, (error, stdout, stderr) => {
              if (error) {
                log.error(`从镜像 ${mirror} 安装依赖失败: ${error.message}`);
                log.error(`Stderr: ${stderr}`);
                reject(error);
                return;
              }
              log.info(`从镜像 ${mirror} 安装依赖成功`);
              resolve();
            });
          });
          
          // 如果成功安装，标记并跳出循环
          reqSuccess = true;
          break;
        } catch (reqError) {
          log.error(`从镜像 ${mirror} 安装requirements.txt依赖失败: ${reqError.message}`);
          // 尝试下一个镜像
        }
      }
      
      // 处理最终结果
      if (!reqSuccess) {
        log.warn('从所有镜像安装requirements.txt依赖均失败，但应用可能仍能工作');
        // 这里我们可以选择继续，因为核心依赖可能已经安装成功
        installWindow.webContents.send('update-progress', { 
          status: '部分依赖安装失败，但关键依赖已安装', 
          progress: 95 
        });
      } else {
        installWindow.webContents.send('update-progress', { 
          status: '所有依赖安装成功！', 
          progress: 95 
        });
      }
      
      // 最后确认是否所有核心依赖都已安装
      const checkCoreDepsSuccess = await verifyCoreDependencies(pythonExe);
      if (!checkCoreDepsSuccess) {
        // 如果核心依赖验证失败，弹出警告
        const { response } = await dialog.showMessageBox(installWindow, {
          type: 'warning',
          buttons: ['继续', '取消'],
          defaultId: 0,
          title: '依赖安装不完整',
          message: '一些核心依赖可能未正确安装',
          detail: '应用可能无法正常工作。建议重新启动应用或重新安装。'
        });
        
        if (response !== 0) {
          // 用户取消继续
          throw new Error('用户取消了安装（核心依赖不完整）');
        }
      }
    } catch (depError) {
      log.error('安装依赖过程中出错:', depError);
      allSuccess = false;
      
      // 尝试继续，但在UI上显示警告
      installWindow.webContents.send('update-progress', { 
        status: `依赖安装出错: ${depError.message}`, 
        progress: 95 
      });
      
      // 给用户时间看到错误消息
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    installWindow.webContents.send('update-progress', { status: '正在完成设置...', progress: 95 });
    
    // 清理下载的安装包
    try {
      if (fs.existsSync(pythonInstallerPath)) {
        fs.unlinkSync(pythonInstallerPath);
        log.info(`已删除安装包: ${pythonInstallerPath}`);
      }
    } catch (cleanupError) {
      log.warn(`清理安装包失败: ${cleanupError.message}`);
      // 非致命错误，继续执行
    }
    
    installWindow.webContents.send('update-progress', { status: '安装完成!', progress: 100 });
    
    // 等待一下，让用户看到完成消息
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    installWindow.close();
    pythonInstallationInProgress = false;
    
    return { installed: true, path: pythonExe };
  } catch (error) {
    log.error('Python安装失败:', error);
    installWindow.webContents.send('update-progress', { status: `安装失败: ${error.message}`, progress: 0 });
    
    // 尝试清理
    try {
      if (fs.existsSync(pythonInstallerPath)) {
        fs.unlinkSync(pythonInstallerPath);
        log.info(`已删除安装包: ${pythonInstallerPath}`);
      }
    } catch (cleanupError) {
      log.warn(`清理安装包失败: ${cleanupError.message}`);
    }
    
    // 等待用户确认
    await new Promise(resolve => {
      ipcMain.once('installation-error-confirmed', resolve);
    });
    
    installWindow.close();
    pythonInstallationInProgress = false;
    throw error;
  }
}

// 复制文件夹
function copyFolderRecursive(source, target) {
  // 确保目标目录存在
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  
  // 读取源目录中的所有文件和子目录
  const items = fs.readdirSync(source);
  
  for (const item of items) {
    const sourcePath = path.join(source, item);
    const targetPath = path.join(target, item);
    
    // 获取文件/目录的状态
    const stat = fs.statSync(sourcePath);
    
    if (stat.isDirectory()) {
      // 递归复制子目录
      copyFolderRecursive(sourcePath, targetPath);
    } else {
      // 复制文件
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

// 下载文件
function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    // 如果目标文件已存在，先删除
    if (fs.existsSync(destination)) {
      try {
        fs.unlinkSync(destination);
        log.info(`已删除现有文件: ${destination}`);
      } catch (err) {
        log.warn(`删除现有文件失败: ${err.message}`);
      }
    }

    const file = fs.createWriteStream(destination);
    log.info(`开始从 ${url} 下载文件`);
    
    const request = https.get(url, (response) => {
      // 检查HTTP状态码
      if (response.statusCode === 301 || response.statusCode === 302) {
        // 处理重定向
        log.info(`重定向到: ${response.headers.location}`);
        file.close();
        fs.unlinkSync(destination); // 删除未完成的文件
        
        // 递归调用，处理重定向URL
        downloadFile(response.headers.location, destination)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        // 处理错误状态码
        const error = new Error(`下载失败，状态码: ${response.statusCode}`);
        file.close();
        fs.unlinkSync(destination); // 删除未完成的文件
        reject(error);
        return;
      }
      
      // 显示下载进度
      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;
      let lastLogTime = Date.now();
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        
        // 每秒最多记录一次日志，避免日志过多
        const now = Date.now();
        if (now - lastLogTime > 1000) {
          if (totalSize) {
            const progress = Math.round((downloadedSize / totalSize) * 100);
            log.info(`下载进度: ${progress}% (${downloadedSize}/${totalSize})`);
          } else {
            log.info(`已下载: ${Math.round(downloadedSize / 1024)} KB`);
          }
          lastLogTime = now;
        }
      });
      
      // 管道下载数据到文件
      pipeline(response, file, (err) => {
        if (err) {
          log.error(`下载管道错误: ${err.message}`);
          reject(err);
          return;
        }
        
        log.info(`下载完成: ${destination}`);
        resolve();
      });
    });
    
    // 设置超时，避免长时间挂起
    request.setTimeout(30000, () => {
      request.abort();
      file.close();
      fs.unlinkSync(destination); // 删除未完成的文件
      reject(new Error('下载超时'));
    });
    
    // 处理请求错误
    request.on('error', (err) => {
      log.error(`下载请求错误: ${err.message}`);
      file.close();
      fs.unlink(destination, () => {}); // 删除可能不完整的文件
      reject(err);
    });
  });
}

// 启动Python后端服务
async function startPythonServer() {
  return new Promise(async (resolve, reject) => {
    try {
      const startTime = Date.now();
      log.info(`[${new Date().toISOString()}] 开始启动Python服务器...`);
      
      // 如果Python进程已经在运行，直接返回已有URL
      if (pythonProcess) {
        log.info(`[${new Date().toISOString()}] Python进程已在运行，使用现有连接`);
        appState.pythonServerRunning = true;
        appState.serverUrl = apiBaseUrl;
        resolve(apiBaseUrl);
        return;
      }
      
      // 检查Python安装
      log.info(`[${new Date().toISOString()}] 检查Python安装...`);
      let pythonInfo = await checkPythonInstallation();
      const elapsedAfterCheck = ((Date.now() - startTime) / 1000).toFixed(2);
      log.info(`[${new Date().toISOString()}] [+${elapsedAfterCheck}s] Python安装检查完成: ${JSON.stringify(pythonInfo)}`);
      
      // 如果Python未安装，则安装它
      if (!pythonInfo.installed) {
        try {
          if (mainWindow) {
            const { response } = await dialog.showMessageBox(mainWindow, {
              type: 'question',
              buttons: ['安装', '取消'],
              defaultId: 0,
              title: '需要安装Python',
              message: '为了保障您的信息安全，所有文件将完全在本地处理，不会上传至云端。因此需要Python环境才能运行，是否现在安装？',
              detail: '安装过程可能需要几分钟时间，请耐心等待。'
            });
            
            if (response !== 0) {
              reject(new Error('用户取消了Python安装'));
              return;
            }
          }
          
          pythonInfo = await installPython();
        } catch (installError) {
          log.error('Python安装失败:', installError);
          reject(new Error(`Python安装失败: ${installError.message}`));
          return;
        }
      }
      
      // 确定Python脚本路径
      let pythonScript;
      
      if (app.isPackaged) {
        // 在生产环境中，使用应用数据目录中的Python脚本
        const appDataPath = getAppDataPath();
        pythonScript = path.join(appDataPath, 'app_python', 'api.py');
        
        // 如果脚本不存在，尝试从资源目录复制
        if (!fs.existsSync(pythonScript)) {
          const sourcePythonDir = path.join(process.resourcesPath, 'python');
          const targetPythonDir = path.join(appDataPath, 'app_python');
          
          if (!fs.existsSync(targetPythonDir)) {
            fs.mkdirSync(targetPythonDir, { recursive: true });
          }
          
          log.info(`[${new Date().toISOString()}] 复制Python代码从 ${sourcePythonDir} 到 ${targetPythonDir}...`);
          copyFolderRecursive(sourcePythonDir, targetPythonDir);
          const elapsedAfterCopy = ((Date.now() - startTime) / 1000).toFixed(2);
          log.info(`[${new Date().toISOString()}] [+${elapsedAfterCopy}s] Python代码复制完成`);
        }
      } else {
        // 开发环境使用项目目录中的脚本
        pythonScript = path.join(app.getAppPath(), 'python', 'api.py');
      }
      
      // 确保脚本文件存在
      if (!fs.existsSync(pythonScript)) {
        log.error(`[${new Date().toISOString()}] Python脚本不存在: ${pythonScript}`);
        reject(new Error(`Python脚本不存在: ${pythonScript}`));
        return;
      }
      
      // 在启动Python进程前，先验证所有依赖是否已安装
      log.info(`[${new Date().toISOString()}] 验证Python依赖是否已安装...`);
      try {
        const dependenciesOk = await verifyCoreDependencies(pythonInfo.path);
        if (!dependenciesOk) {
          log.warn(`[${new Date().toISOString()}] 部分依赖可能缺失，但将继续启动应用...`);
          // 继续启动应用，依赖缺失时对应功能会在用户使用时提示
        } else {
          log.info(`[${new Date().toISOString()}] 所有核心依赖已正确安装`);
        }
      } catch (verifyError) {
        log.error(`[${new Date().toISOString()}] 依赖验证出错: ${verifyError.message}`);
        // 继续启动应用，不因验证错误而中断
      }
      
      const elapsedBeforeSpawn = ((Date.now() - startTime) / 1000).toFixed(2);
      log.info(`[${new Date().toISOString()}] [+${elapsedBeforeSpawn}s] 启动Python服务: ${pythonInfo.path} ${pythonScript}`);
      
      // 准备环境变量
      let envVars = {
        ...process.env,
        PYTHONUNBUFFERED: '1', // 禁用Python输出缓冲
      };
      
      // 如果是打包后的应用，确保加载.env文件中的环境变量
      if (app.isPackaged) {
        try {
          const envPath = path.join(process.resourcesPath, '.env');
          log.info(`[${new Date().toISOString()}] 尝试加载环境变量文件: ${envPath}`);
          
          if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            const envLines = envContent.split('\n');
            
            // 解析.env文件内容并加入环境变量
            for (const line of envLines) {
              // 忽略注释和空行
              if (line.trim() && !line.startsWith('#')) {
                const match = line.match(/^([^=]+)=(.*)$/);
                if (match) {
                  let key = match[1].trim();
                  // 去除引号
                  let value = match[2].trim().replace(/^["']|["']$/g, '');
                  // 删除末尾可能存在的百分号等字符
                  value = value.replace(/[%\s]+$/, '');
                  
                  envVars[key] = value;
                  log.info(`[${new Date().toISOString()}] 已加载环境变量: ${key}=${value.substring(0, 3)}...`);
                }
              }
            }
          } else {
            log.warn(`[${new Date().toISOString()}] 环境变量文件不存在: ${envPath}`);
          }
        } catch (envError) {
          log.error(`[${new Date().toISOString()}] 加载环境变量文件时出错: ${envError.message}`);
          // 继续运行，因为应用可能在没有某些环境变量的情况下仍能工作
        }
      }
      
      // 启动Python进程
      const spawnTime = Date.now();
      log.info(`[${new Date().toISOString()}] 正在启动Python进程...`);
      pythonProcess = spawn(pythonInfo.path, [pythonScript], { env: envVars });
      const elapsedAfterSpawn = ((Date.now() - startTime) / 1000).toFixed(2);
      log.info(`[${new Date().toISOString()}] [+${elapsedAfterSpawn}s] Python进程已启动，PID: ${pythonProcess.pid}`);
      
      // 设置Python进程的监听器
      setupPythonProcessListeners(pythonProcess, resolve, reject, pythonInfo, pythonScript, envVars);
    } catch (error) {
      log.error(`[${new Date().toISOString()}] 启动Python服务器失败:`, error);
      appState.pythonServerRunning = false;
      reject(error);
    }
  });
}

// 选择文件夹的IPC处理
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled) {
    return result.filePaths[0];
  }
  return null;
});

// 保存配置的IPC处理
ipcMain.handle('save-config', async (event, config) => {
  store.set('config', config);
  return true;
});

// 获取配置的IPC处理
ipcMain.handle('get-config', async () => {
  return store.get('config');
});

// 提交用户反馈的IPC处理
ipcMain.handle('submit-feedback', async (event, { email, content }) => {
  return await submitUserFeedback(email, content);
});

// 获取公告的IPC处理
ipcMain.handle('get-announcements', async (event) => {
  return await getAnnouncements();
});

// 应用准备就绪时创建窗口
app.whenReady().then(async () => {
  try {
    const appStartTime = Date.now();
    log.info(`[${new Date().toISOString()}] 应用启动开始...`);
    
    // 禁用同源策略
    app.commandLine.appendSwitch('disable-web-security');
    app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');
    app.commandLine.appendSwitch('disable-site-isolation-trials');
    
    // 在macOS上设置应用不在dock中显示时保持运行
    if (process.platform === 'darwin') {
      try {
        const iconPath = path.join(__dirname, '..', 'public', 'app.png');
        if (fs.existsSync(iconPath)) {
          app.dock.setIcon(iconPath);
          log.info(`[${new Date().toISOString()}] 设置了Dock图标: ${iconPath}`);
        } else {
          log.warn(`[${new Date().toISOString()}] Dock图标文件不存在: ${iconPath}`);
        }
        // 在macOS上我们不要使用accessory策略，否则窗口可能无法正常显示
        // app.setActivationPolicy('accessory');
      } catch (error) {
        log.error(`[${new Date().toISOString()}] 设置Dock图标失败: ${error.message}`);
        // 继续执行，不要因为图标设置失败而中断应用启动
      }
    }
    
    // 创建托盘图标
    try {
      const tray = createTray();
      if (!tray) {
        log.warn('[${new Date().toISOString()}] 创建托盘图标失败，将继续启动应用');
      }
    } catch (trayError) {
      log.error(`[${new Date().toISOString()}] 创建托盘时出错: ${trayError.message}`);
      // 继续启动应用
    }
    
    // 创建窗口
    log.info(`[${new Date().toISOString()}] 创建主窗口...`);
    createWindow();
    const elapsedAfterCreateWindow = ((Date.now() - appStartTime) / 1000).toFixed(2);
    log.info(`[${new Date().toISOString()}] [+${elapsedAfterCreateWindow}s] 主窗口已创建`);
    
    // 上传用户统计数据（启动时）
    checkAndUploadStatistics();
    
    // 启动Python后端
    let startPythonSuccess = true;
    try {
      log.info(`[${new Date().toISOString()}] 开始启动Python后端...`);
      const pythonStartTime = Date.now();
      const serverUrl = await startPythonServer();
      const elapsedPythonStart = ((Date.now() - pythonStartTime) / 1000).toFixed(2);
      log.info(`[${new Date().toISOString()}] [+${elapsedPythonStart}s] Python后端启动完成: ${serverUrl}`);
      
      // 更新应用状态
      appState.pythonServerRunning = true;
      appState.serverUrl = serverUrl;
      
      // 通知渲染进程Python服务器已启动
      if (mainWindow) {
        log.info(`[${new Date().toISOString()}] 向渲染进程发送python-ready事件: ${serverUrl}`);
        // 直接发送事件，不等待窗口加载完成
        mainWindow.webContents.send('python-ready', serverUrl);
        
        // 确保窗口加载完成后也能收到事件（以防窗口尚未加载完成）
        mainWindow.webContents.on('did-finish-load', () => {
          const readyEventTime = Date.now();
          const elapsedSinceStart = ((readyEventTime - appStartTime) / 1000).toFixed(2);
          log.info(`[${new Date().toISOString()}] [+${elapsedSinceStart}s] 主窗口加载完成，再次发送python-ready事件: ${serverUrl}`);
          mainWindow.webContents.send('python-ready', serverUrl);
        });
      }
    } catch (error) {
      log.error(`[${new Date().toISOString()}] 应用启动失败:`, error);
      appState.pythonServerRunning = false;
      startPythonSuccess = false;
      
      // 显示启动失败对话框，而不是立即退出应用
      if (mainWindow) {
        const startupResult = await dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'Python服务启动失败',
          message: '启动Python服务失败',
          detail: `错误信息: ${error.message}\n\n应用需要Python服务才能正常工作。`,
          buttons: ['重试', '退出应用'],
          defaultId: 0
        });
        
        if (startupResult.response === 0) {
          // 用户选择重试
          log.info('用户选择重试启动Python服务');
          
          try {
            // 重新尝试启动Python服务
            const serverUrl = await startPythonServer();
            
            // 如果成功，更新状态并通知渲染进程
            appState.pythonServerRunning = true;
            appState.serverUrl = serverUrl;
            
            if (mainWindow) {
              mainWindow.webContents.send('python-ready', serverUrl);
              log.info(`重试启动Python服务成功: ${serverUrl}`);
              startPythonSuccess = true;
            }
          } catch (retryError) {
            log.error(`重试启动Python服务失败:`, retryError);
            
            // 如果重试也失败，询问用户是否继续尝试
            const retryResult = await dialog.showMessageBox(mainWindow, {
              type: 'error',
              title: '重试失败',
              message: '重试启动Python服务仍然失败',
              detail: `错误信息: ${retryError.message}\n\n是否继续尝试?`,
              buttons: ['再次重试', '退出应用'],
              defaultId: 0
            });
            
            if (retryResult.response === 0) {
              // 用户选择再次重试
              log.info('用户选择再次重试启动Python服务');
              
              try {
                // 最后一次尝试启动Python服务
                const serverUrl = await startPythonServer();
                
                // 如果成功，更新状态并通知渲染进程
                appState.pythonServerRunning = true;
                appState.serverUrl = serverUrl;
                
                if (mainWindow) {
                  mainWindow.webContents.send('python-ready', serverUrl);
                  log.info(`再次重试启动Python服务成功: ${serverUrl}`);
                  startPythonSuccess = true;
                }
              } catch (finalError) {
                log.error(`最终启动Python服务失败:`, finalError);
                dialog.showErrorBox(
                  '无法启动应用',
                  `多次尝试启动Python服务均失败，应用将退出。\n\n错误信息: ${finalError.message}`
                );
                app.quit();
              }
            } else {
              // 用户选择退出
              log.info('用户选择退出应用');
              app.quit();
            }
          }
        } else {
          // 用户选择退出
          log.info('用户选择退出应用');
          app.quit();
          return; // 防止继续执行后续代码
        }
      } else {
        // 无窗口时直接退出
        dialog.showErrorBox('启动失败', `启动Python服务器时出错: ${error.message}`);
        app.quit();
        return; // 防止继续执行后续代码
      }
    }
    
    // 只有在Python服务启动成功的情况下才继续执行后续操作
    if (startPythonSuccess) {
      // 检查更新
      checkForUpdates();
    }
  } catch (error) {
    log.error(`[${new Date().toISOString()}] 应用启动过程中出现意外错误:`, error);
    dialog.showErrorBox('启动失败', `应用启动过程中出现意外错误: ${error.message}`);
    app.quit();
  }
});

// 关闭所有窗口时退出应用（在macOS上除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // macOS上点击dock图标时，如果窗口存在则显示，否则创建新窗口
  if (mainWindow === null) {
    createWindow();
    
    // 检查Python服务器是否正在运行
    if (pythonProcess) {
      log.info(`[${new Date().toISOString()}] Python服务器已在运行，连接到现有服务器`);
      appState.pythonServerRunning = true;
      appState.serverUrl = apiBaseUrl;
      
      // 立即发送事件，不等待窗口加载完成
      if (mainWindow) {
        log.info(`[${new Date().toISOString()}] 向主窗口发送python-ready事件: ${apiBaseUrl}`);
        mainWindow.webContents.send('python-ready', apiBaseUrl);
      }
      
      // 确保窗口加载完成后也能收到事件
      mainWindow.webContents.on('did-finish-load', () => {
        log.info(`[${new Date().toISOString()}] 主窗口已加载，再次发送python-ready事件: ${apiBaseUrl}`);
        mainWindow.webContents.send('python-ready', apiBaseUrl);
      });
    } else {
      log.info(`[${new Date().toISOString()}] Python服务器未运行，尝试启动`);
      startPythonServer()
        .then(url => {
          appState.pythonServerRunning = true;
          appState.serverUrl = url;
          
          // 立即发送事件，不等待窗口加载完成
          if (mainWindow) {
            log.info(`[${new Date().toISOString()}] 向主窗口发送python-ready事件: ${url}`);
            mainWindow.webContents.send('python-ready', url);
          }
          
          // 确保窗口加载完成后也能收到事件
          if (mainWindow) {
            mainWindow.webContents.on('did-finish-load', () => {
              log.info(`[${new Date().toISOString()}] 主窗口已加载，再次发送python-ready事件: ${url}`);
              mainWindow.webContents.send('python-ready', url);
            });
          }
        })
        .catch(error => {
          log.error(`[${new Date().toISOString()}] 启动Python服务器失败:`, error);
          
          if (mainWindow) {
            // 立即发送错误事件
            log.info(`[${new Date().toISOString()}] 向主窗口发送python-error事件`);
            mainWindow.webContents.send('python-error', `启动Python服务器失败: ${error.message}`);
            
            // 确保窗口加载完成后也能收到事件
            mainWindow.webContents.on('did-finish-load', () => {
              log.info(`[${new Date().toISOString()}] 主窗口已加载，再次发送python-error事件`);
              mainWindow.webContents.send('python-error', `启动Python服务器失败: ${error.message}`);
            });
          }
        });
    }
  } else {
    mainWindow.show();
    
    // 如果Python服务器已运行，确保窗口知道服务器状态
    if (pythonProcess && appState.pythonServerRunning) {
      log.info(`[${new Date().toISOString()}] 向显示的窗口发送python-ready事件: ${appState.serverUrl}`);
      mainWindow.webContents.send('python-ready', appState.serverUrl);
    }
  }
});

// 应用退出前清理资源
app.on('before-quit', () => {
  // 标记应用正在退出，这样窗口关闭事件不会被阻止
  app.isQuitting = true;
  appState.pythonServerRunning = false;
  
  if (pythonProcess) {
    try {
      process.kill(pythonProcess.pid);
    pythonProcess = null;
    } catch (error) {
      log.error('结束Python进程失败:', error);
    }
  }
});

// 安装错误确认的IPC处理
ipcMain.on('installation-error-confirmed', () => {
  // 事件处理在installPython中
});

async function checkDBExists(folder) {
  try {
    const response = await fetch(`${apiBaseUrl}/check-db`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ folder: folder })
    });
    
    // 先检查响应状态
    if (!response.ok) {
      console.error('API响应错误:', response.status, response.statusText);
      return false;
    }
    
    const data = await response.json();
    return data.exists;
  } catch (error) {
    console.error('检查数据库失败:', error);
    return false;
  }
}

// 添加托盘图标，允许用户从托盘中恢复窗口或退出应用
function createTray() {
  // 使用指定的托盘图标
  const trayIconPath = path.join(__dirname, '..', 'public', 'tray_app.png');
  
  // 检查托盘图标是否存在
  if (!fs.existsSync(trayIconPath)) {
    log.warn(`指定的托盘图标不存在: ${trayIconPath}，将尝试使用备用图标`);
    
    // 使用备用图标
    let iconExists = false;
    let iconPath;
    
    if (fs.existsSync(path.join(__dirname, '..', 'public', 'favicon.ico'))) {
      iconPath = path.join(__dirname, '..', 'public', 'favicon.ico');
      iconExists = true;
    } else if (fs.existsSync(path.join(__dirname, '..', 'public', 'app.png'))) {
      iconPath = path.join(__dirname, '..', 'public', 'app.png');
      iconExists = true;
    }
    
    if (!iconExists) {
      log.error('找不到任何可用的托盘图标');
      return null;
    }
    
    log.info(`使用备用托盘图标: ${iconPath}`);
    
    try {
      const tray = new Tray(iconPath);
      setupTray(tray);
      return tray;
    } catch (error) {
      log.error(`创建托盘图标失败: ${error.message}`);
      return null;
    }
  }
  
  log.info(`使用指定的托盘图标: ${trayIconPath}`);
  
  try {
    const tray = new Tray(trayIconPath);
    setupTray(tray);
    return tray;
  } catch (error) {
    log.error(`创建托盘图标失败: ${error.message}`);
    return null;
  }
}

// 设置托盘图标菜单和行为
function setupTray(tray) {
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: '显示窗口', 
      click: () => {
        if (mainWindow === null) {
          createWindow();
        } else {
          mainWindow.show();
        }
      } 
    },
    { type: 'separator' },
    { 
      label: '退出', 
      click: () => { 
        app.isQuitting = true;
        app.quit();
      } 
    }
  ]);
  
  tray.setToolTip('找我呀');
  tray.setContextMenu(contextMenu);
  
  // 点击托盘图标显示窗口
  tray.on('click', () => {
    if (mainWindow === null) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });
}

// 添加安装依赖的函数
function installDependency(pythonPath, packageName, options = {}) {
  return new Promise((resolve, reject) => {
    log.info(`开始安装Python依赖: ${packageName}`);
    
    // 解析可能包含多个依赖的参数
    let packages = [];
    if (typeof packageName === 'string' && packageName.includes(' ')) {
      // 如果是空格分隔的多个依赖，处理为数组
      packages = packageName.split(' ').filter(p => p.trim());
      log.info(`检测到多个依赖需要安装: ${packages.join(', ')}`);
    } else if (typeof packageName === 'string') {
      // 单个依赖转为数组
      packages = [packageName];
    } else {
      reject(new Error('无效的依赖参数'));
      return;
    }
    
    // 创建安装窗口（如果要求显示）
    let installWindow = null;
    if (options.showWindow) {
      const isRequired = options.required === true;
      const title = isRequired ? '正在安装必要依赖' : '正在安装依赖';
      let details = '';
      
      if (isRequired) {
        details = `正在安装应用运行所必需的依赖：<br>${packages.join(', ')}<br><br>请耐心等待安装完成。`;
      } else {
        details = `正在安装功能所需的依赖：<br>${packages.join(', ')}<br><br>请耐心等待安装完成。`;
      }
      
      installWindow = showDependencyInstallationWindow(title, details, packages);
      
      // 初始化进度
      installWindow.webContents.send('dependency-install-progress', { 
        progress: 0, 
        status: '初始化安装环境...'
      });
    }
    
    // 定义多个pip镜像源，按优先级排序
    const mirrors = [
      'https://mirrors.aliyun.com/pypi/simple',
      'https://pypi.tuna.tsinghua.edu.cn/simple',
      'https://mirrors.cloud.tencent.com/pypi/simple',
      'https://mirrors.bfsu.edu.cn/pypi/simple',
      'https://pypi.org/simple' // 官方源作为最后备选
    ];
    
    // 安装单个包的函数
    function installSinglePackage(pkg, mirrorIndex) {
      return new Promise((resolvePackage, rejectPackage) => {
        if (mirrorIndex >= mirrors.length) {
          rejectPackage(new Error(`所有镜像源安装 ${pkg} 均失败`));
          return;
        }
        
        const mirror = mirrors[mirrorIndex];
        const installCmd = process.platform === 'win32'
          ? `"${pythonPath}" -m pip install "${pkg}" -i ${mirror} --timeout 300`
          : `${pythonPath} -m pip install "${pkg}" -i ${mirror} --timeout 300`;
        
        const logMessage = `尝试从镜像 ${mirror} 安装依赖: ${pkg}`;
        log.info(logMessage);
        
        // 如果有安装窗口，发送日志
        if (installWindow) {
          installWindow.webContents.send('dependency-install-log', logMessage);
          
          // 更新进度 - 计算当前包的进度
          const totalPackages = packages.length;
          const currentPackageIndex = packages.indexOf(pkg);
          const mirrorProgress = (mirrorIndex / mirrors.length) * 100 / totalPackages;
          const baseProgress = (currentPackageIndex / totalPackages) * 100;
          const progress = Math.floor(baseProgress + mirrorProgress);
          
          installWindow.webContents.send('dependency-install-progress', { 
            progress: progress, 
            status: `安装 ${pkg} (镜像 ${mirrorIndex + 1}/${mirrors.length})...`
          });
        }
        
        exec(installCmd, (error, stdout, stderr) => {
          if (error) {
            const errorMessage = `从镜像 ${mirror} 安装依赖失败: ${pkg}`;
            log.warn(errorMessage);
            log.warn(`错误信息: ${error.message}`);
            log.warn(`安装输出: ${stderr}`);
            
            // 如果有安装窗口，发送日志
            if (installWindow) {
              installWindow.webContents.send('dependency-install-log', errorMessage);
              installWindow.webContents.send('dependency-install-log', `错误: ${error.message}`);
            }
            
            // 尝试下一个镜像
            installSinglePackage(pkg, mirrorIndex + 1)
              .then(resolvePackage)
              .catch(rejectPackage);
            return;
          }
          
          const successMessage = `从镜像 ${mirror} 安装依赖成功: ${pkg}`;
          log.info(successMessage);
          log.info(`安装输出: ${stdout}`);
          
          // 如果有安装窗口，发送日志
          if (installWindow) {
            installWindow.webContents.send('dependency-install-log', successMessage);
            
            // 更新进度 - 当前包安装完成
            const totalPackages = packages.length;
            const currentPackageIndex = packages.indexOf(pkg);
            const progress = Math.floor(((currentPackageIndex + 1) / totalPackages) * 100);
            
            installWindow.webContents.send('dependency-install-progress', { 
              progress: progress, 
              status: `已完成: ${pkg}`
            });
          }
          
          resolvePackage();
        });
      });
    }
    
    // 依次安装所有包
    async function installAllPackages() {
      const results = {
        success: [],
        failure: []
      };
      
      for (const pkg of packages) {
        try {
          await installSinglePackage(pkg, 0);
          results.success.push(pkg);
        } catch (error) {
          log.error(`安装依赖 ${pkg} 失败: ${error.message}`);
          
          // 如果有安装窗口，发送日志
          if (installWindow) {
            installWindow.webContents.send('dependency-install-log', `❌ 安装失败: ${pkg} - ${error.message}`);
          }
          
          results.failure.push({ package: pkg, error: error.message });
        }
      }
      
      // 如果有安装窗口，更新最终进度
      if (installWindow) {
        installWindow.webContents.send('dependency-install-progress', { 
          progress: 100, 
          status: results.failure.length === 0 ? '安装完成' : '安装部分完成'
        });
        
        installWindow.webContents.send('dependency-install-log', 
          `--- 安装结果摘要 ---`);
        installWindow.webContents.send('dependency-install-log', 
          `安装成功: ${results.success.length} 个依赖`);
        installWindow.webContents.send('dependency-install-log', 
          `安装失败: ${results.failure.length} 个依赖`);
        
        // 等待3秒后关闭窗口
        setTimeout(() => {
          try {
            if (!installWindow.isDestroyed()) {
              installWindow.close();
            }
          } catch (error) {
            log.warn(`关闭安装窗口失败: ${error.message}`);
          }
        }, 3000);
      }
      
      // 根据结果决定是否成功
      if (results.failure.length === 0) {
        // 全部成功
        resolve(results);
      } else if (results.success.length > 0) {
        // 部分成功
        log.warn(`部分依赖安装成功，部分失败`);
        log.warn(`成功: ${results.success.join(', ')}`);
        log.warn(`失败: ${results.failure.map(f => f.package).join(', ')}`);
        
        // 检查核心依赖是否都安装成功
        const coreDeps = ['watchdog', 'fastapi', 'uvicorn', 'dashscope', 'faiss'];
        const failedCoreDeps = results.failure.filter(f => 
          coreDeps.some(core => f.package.toLowerCase().includes(core.toLowerCase()))
        );
        
        if (failedCoreDeps.length > 0 && options.required) {
          // 如果核心依赖安装失败，且是必要依赖，则整体视为失败
          reject(new Error(`核心依赖安装失败: ${failedCoreDeps.map(f => f.package).join(', ')}`));
        } else {
          // 非核心依赖失败可以接受
          resolve(results);
        }
      } else {
        // 全部失败
        reject(new Error(`所有依赖安装失败: ${results.failure.map(f => f.package).join(', ')}`));
      }
    }
    
    // 开始安装所有包
    installAllPackages().catch(reject);
  });
}

// 设置Python进程的监听器
function setupPythonProcessListeners(pythonProc, resolvePromise, rejectPromise, pythonInfo, pythonScript, envVars) {
  let serverStarted = false;
  const startTime = Date.now();
  log.info(`[${new Date().toISOString()}] 开始监听Python进程输出...`);
  
  // 用于收集过程中发现的缺失依赖
  const missingDependencies = new Set();
  
  // 处理Python进程的输出
  pythonProc.stdout.on('data', (data) => {
    const output = data.toString();
    const currentTime = Date.now();
    const elapsedSeconds = ((currentTime - startTime) / 1000).toFixed(2);
    log.info(`[${new Date().toISOString()}] [+${elapsedSeconds}s] Python输出: ${output}`);
    
    // 检查是否有依赖缺失消息
    if (output.includes('No module named') || output.includes('not found, please install') || output.includes('ImportError')) {
      // 尝试提取缺失的模块名
      const moduleMatch = output.match(/No module named ['"]([^'"]+)['"]/) || 
                           output.match(/`([^`]+)` package not found/) ||
                           output.match(/ImportError: ([^,]+) is required/);
      
      if (moduleMatch && moduleMatch[1]) {
        const missingModule = moduleMatch[1];
        log.warn(`[${new Date().toISOString()}] 检测到运行时缺少依赖: ${missingModule}`);
        missingDependencies.add(missingModule);
        
        // 如果已经找到了缺失的依赖，显示提示
        if (missingDependencies.size >= 1 && mainWindow && !serverStarted) {
          const missingModulesList = Array.from(missingDependencies);
          
          // 检查依赖类型，区分核心依赖和文档处理依赖
          const coreDeps = ['fastapi', 'uvicorn', 'watchdog', 'httpx', 'orjson', 'langchain', 'dashscope', 'faiss'];
          const docDeps = ['docx', 'pptx', 'PyMuPDF', 'fitz', 'pdfminer', 'pdf', 'pandas', 'openpyxl', 'pytesseract', 'unstructured', 'pypdf'];
          
          const missingCoreDeps = missingModulesList.filter(mod => 
            coreDeps.some(core => mod.toLowerCase().includes(core.toLowerCase())));
          const missingDocDeps = missingModulesList.filter(mod => 
            docDeps.some(doc => mod.toLowerCase().includes(doc.toLowerCase())));
          const otherDeps = missingModulesList.filter(mod => 
            !missingCoreDeps.includes(mod) && !missingDocDeps.includes(mod));
          
          // 优先处理核心依赖
          if (missingCoreDeps.length > 0) {
            // 使用强制安装窗口，不允许用户取消
            // 将模块名转换为pip包名
            const packagesToInstall = missingCoreDeps.map(mod => {
              if (mod === 'faiss') return 'faiss-cpu';
              return mod;
            });
            
            log.info(`自动安装核心依赖: ${packagesToInstall.join(', ')}`);
            
            // 安装核心依赖（强制安装，不允许取消）
            installDependency(pythonInfo.path, packagesToInstall.join(' '), {
              showWindow: true,
              required: true
            })
              .then(() => {
                dialog.showMessageBox(mainWindow, {
                  type: 'info',
                  title: '核心依赖安装完成',
                  message: '缺失的核心依赖已成功安装',
                  detail: '请重启应用以确保所有功能正常工作。',
                  buttons: ['确定', '立即重启'],
                  defaultId: 1
                }).then(restartResult => {
                  if (restartResult.response === 1) {
                    // 用户选择立即重启
                    app.relaunch();
                    app.exit(0);
                  }
                });
              })
              .catch(err => {
                dialog.showErrorBox(
                  '依赖安装失败',
                  `安装核心依赖时出错: ${err.message}\n\n应用可能无法正常工作。请尝试重启应用或手动安装这些依赖。`
                );
              });
          }
          // 然后处理文档处理依赖
          else if (missingDocDeps.length > 0) {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '检测到缺失文档处理依赖',
              message: `运行过程中检测到缺少以下文档处理依赖:`,
              detail: `${missingDocDeps.join(', ')}\n\n这些依赖用于处理特定类型的文件（Word、PDF、Excel等）。是否安装这些依赖？`,
              buttons: ['是，立即安装', '否，稍后再说'],
              defaultId: 0
            }).then(result => {
              if (result.response === 0) {
                // 将模块名转换为pip包名
                const packagesToInstall = missingDocDeps.map(mod => {
                  if (mod === 'docx') return 'python-docx';
                  if (mod === 'pptx') return 'python-pptx';
                  if (mod === 'fitz') return 'PyMuPDF';
                  if (mod === 'pdfminer') return 'pdfminer.six';
                  if (mod === 'pdf') return 'pypdf';
                  return mod;
                });
                
                // 安装依赖
                installDependency(pythonInfo.path, packagesToInstall.join(' '), {
                  showWindow: true,
                  required: false
                })
                  .then(() => {
                    dialog.showMessageBox(mainWindow, {
                      type: 'info',
                      title: '文档处理依赖安装完成',
                      message: '缺失的文档处理依赖已成功安装',
                      detail: '现在您可以处理更多类型的文档。可能需要重启应用才能使所有功能正常工作。',
                      buttons: ['确定', '立即重启'],
                      defaultId: 0
                    }).then(restartResult => {
                      if (restartResult.response === 1) {
                        // 用户选择立即重启
                        app.relaunch();
                        app.exit(0);
                      }
                    });
                  })
                  .catch(err => {
                    dialog.showErrorBox(
                      '依赖安装失败',
                      `安装文档处理依赖时出错: ${err.message}\n\n您可以稍后再尝试安装。`
                    );
                  });
              }
            });
          }
          // 最后处理其他依赖
          else if (otherDeps.length > 0) {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '检测到缺失依赖',
              message: `运行过程中检测到缺少以下依赖模块:`,
              detail: `${otherDeps.join(', ')}\n\n这些依赖可能是某些特定功能所需的。是否立即安装这些依赖？`,
              buttons: ['是，立即安装', '否，稍后再说'],
              defaultId: 0
            }).then(result => {
              if (result.response === 0) {
                // 安装依赖
                installDependency(pythonInfo.path, otherDeps.join(' '), {
                  showWindow: true,
                  required: false
                })
                  .then(() => {
                    dialog.showMessageBox(mainWindow, {
                      type: 'info',
                      title: '依赖安装完成',
                      message: '缺失的依赖已成功安装',
                      detail: '安装完成后，某些功能可能需要重启应用才能正常工作。',
                      buttons: ['确定', '立即重启'],
                      defaultId: 0
                    }).then(restartResult => {
                      if (restartResult.response === 1) {
                        // 用户选择立即重启
                        app.relaunch();
                        app.exit(0);
                      }
                    });
                  })
                  .catch(err => {
                    dialog.showErrorBox(
                      '依赖安装失败',
                      `安装依赖时出错: ${err.message}\n\n您可以尝试重启应用或手动安装这些依赖。`
                    );
                  });
              }
            });
          }
          
          // 清空已处理的依赖列表
          missingDependencies.clear();
        }
      }
    }
    
    // 检查特殊标记 - Python后端就绪
    if (output.includes('PYTHON_BACKEND_READY')) {
      log.info(`[${new Date().toISOString()}] [+${elapsedSeconds}s] 检测到Python后端就绪标记!`);
      
      // 如果还没有标记服务器启动，通过特殊标记提前标记为就绪
      if (!serverStarted) {
        log.info(`[${new Date().toISOString()}] [+${elapsedSeconds}s] 提前标记Python服务就绪`);
        serverStarted = true;
        appState.pythonServerRunning = true;
        appState.serverUrl = apiBaseUrl;
        
        // 立即提前通知，让UI能更快得到响应
        if (mainWindow) {
          // 发送preparing事件
          log.info(`[${new Date().toISOString()}] [+${elapsedSeconds}s] 发送python-preparing事件`);
          try {
            mainWindow.webContents.send('python-preparing', apiBaseUrl);
          } catch (err) {
            log.warn(`[${new Date().toISOString()}] 发送python-preparing事件失败: ${err.message}`);
          }
          
          // 也发送ready事件，不等待服务器真正启动完成
          log.info(`[${new Date().toISOString()}] [+${elapsedSeconds}s] 提前发送python-ready事件`);
          try {
            mainWindow.webContents.send('python-ready', apiBaseUrl);
            // 提前解析Promise，让主进程继续执行后续代码
            resolvePromise(apiBaseUrl);
          } catch (err) {
            log.warn(`[${new Date().toISOString()}] 提前发送python-ready事件失败: ${err.message}`);
          }
        } else {
          // 即使没有窗口，也解析Promise
          resolvePromise(apiBaseUrl);
        }
      }
    }
    
    // 检查是否提示缺少依赖库
    if (output.includes('ModuleNotFoundError: No module named')) {
      // 提取缺失的模块名
      const moduleMatch = output.match(/No module named '([^']+)'/);
      if (moduleMatch && moduleMatch[1]) {
        const missingModule = moduleMatch[1];
        log.error(`缺少Python依赖: ${missingModule}，尝试安装...`);
        
        // 特殊处理某些常见问题依赖
        let moduleToInstall = missingModule;
        
        // 如果是一些常见依赖的子模块，安装父模块
        if (missingModule.startsWith('watchdog.')) {
          moduleToInstall = 'watchdog>=3.0.0';
        } else if (missingModule.startsWith('langchain.')) {
          moduleToInstall = 'langchain>=0.3.24 langchain-core>=0.3.56 langchain-community>=0.3.22';
        } else if (missingModule.startsWith('faiss')) {
          moduleToInstall = 'faiss-cpu>=1.7.4';
        } else if (missingModule.startsWith('torch')) {
          // PyTorch可能需要特殊处理，尝试从镜像安装
          moduleToInstall = 'torch';
        }
        
        // 尝试安装缺失的依赖
        if (pythonProcess) {
          try {
            process.kill(pythonProcess.pid);
            pythonProcess = null;
          } catch (err) {
            log.error(`终止Python进程失败: ${err.message}`);
          }
        }
        
        // 确保Python可执行文件路径存在
        if (!pythonInfo || !pythonInfo.path) {
          log.error('Python可执行文件路径未定义，无法安装依赖');
          if (mainWindow) {
            dialog.showErrorBox(
              'Python环境错误',
              '无法定位Python可执行文件，请重启应用程序。'
            );
          }
          rejectPromise(new Error('Python可执行文件路径未定义'));
          return;
        }
        
        // 验证Python可执行文件是否存在
        try {
          if (!fs.existsSync(pythonInfo.path)) {
            log.error(`Python可执行文件不存在: ${pythonInfo.path}`);
            if (mainWindow) {
              dialog.showErrorBox(
                'Python环境错误',
                `无法找到Python可执行文件: ${pythonInfo.path}\n\n请重启应用程序或重新安装Python环境。`
              );
            }
            rejectPromise(new Error(`Python可执行文件不存在: ${pythonInfo.path}`));
            return;
          }
        } catch (error) {
          log.error(`验证Python可执行文件时出错: ${error.message}`);
          rejectPromise(error);
          return;
        }
        
        // 使用强制安装窗口安装缺失的模块
        installDependency(pythonInfo.path, moduleToInstall, {
          showWindow: true,
          required: true
        })
          .then(() => {
            // 确保Python脚本路径存在
            if (!pythonScript || !fs.existsSync(pythonScript)) {
              log.error(`Python脚本不存在: ${pythonScript}`);
              rejectPromise(new Error(`Python脚本不存在: ${pythonScript}`));
              return;
            }
            
            // 重新启动Python进程
            log.info(`重新启动Python服务: ${pythonInfo.path} ${pythonScript}`);
            pythonProcess = spawn(pythonInfo.path, [pythonScript], { env: envVars });
            setupPythonProcessListeners(pythonProcess, resolvePromise, rejectPromise, pythonInfo, pythonScript, envVars);
          })
          .catch(error => {
            log.error(`安装依赖失败: ${error.message}`);
            
            // 显示错误对话框
            if (mainWindow) {
              dialog.showErrorBox(
                '依赖安装失败',
                `安装Python依赖 ${moduleToInstall} 失败。错误信息: ${error.message}\n\n应用程序需要这些依赖才能正常运行。将尝试重新启动应用。`
              );
              
              // 如果安装失败，尝试重启应用
              setTimeout(() => {
                app.relaunch();
                app.exit(0);
              }, 3000);
            } else {
              // 无窗口时直接拒绝
              rejectPromise(error);
            }
          });
        return;
      }
    }
    
    // 检查服务器是否已启动
    if (output.includes('Running on http')) {
      // 提取URL
      const match = output.match(/Running on (http:\/\/[^\s]+)/);
      if (match && match[1]) {
        apiBaseUrl = match[1];
        const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
        log.info(`[${new Date().toISOString()}] [+${elapsedSeconds}s] API服务器运行在: ${apiBaseUrl}`);
        serverStarted = true;
        appState.pythonServerRunning = true;
        appState.serverUrl = apiBaseUrl;
        resolvePromise(apiBaseUrl);
      }
    }
    
    // 增加对Uvicorn启动消息的支持
    if (output.includes('Uvicorn running on http')) {
      const match = output.match(/Uvicorn running on (http:\/\/[^\s\)]+)/);
      if (match && match[1]) {
        apiBaseUrl = match[1];
        const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
        log.info(`[${new Date().toISOString()}] [+${elapsedSeconds}s] API服务器运行在: ${apiBaseUrl}`);
        serverStarted = true;
        appState.pythonServerRunning = true;
        appState.serverUrl = apiBaseUrl;
        resolvePromise(apiBaseUrl);
      }
    }
  });
  
  pythonProc.stderr.on('data', (data) => {
    const output = data.toString();
    const currentTime = Date.now();
    const elapsedSeconds = ((currentTime - startTime) / 1000).toFixed(2);
    log.error(`[${new Date().toISOString()}] [+${elapsedSeconds}s] Python错误: ${output}`);
    
    // 从stderr也检查服务器启动消息（某些版本的Uvicorn在stderr输出状态信息）
    if (output.includes('Uvicorn running on http')) {
      const match = output.match(/Uvicorn running on (http:\/\/[^\s\)]+)/);
      if (match && match[1]) {
        apiBaseUrl = match[1];
        const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
        log.info(`[${new Date().toISOString()}] [+${elapsedSeconds}s] 从stderr检测到API服务器运行在: ${apiBaseUrl}`);
        serverStarted = true;
        appState.pythonServerRunning = true;
        appState.serverUrl = apiBaseUrl;
        resolvePromise(apiBaseUrl);
      }
    }
    
    // 检查应用启动完成消息
    if (output.includes('Application startup complete') && !serverStarted) {
      // 如果看到启动完成消息但没有明确的URL，使用默认值
      const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
      log.info(`[${new Date().toISOString()}] [+${elapsedSeconds}s] 检测到应用启动完成，使用默认URL: ${apiBaseUrl}`);
      serverStarted = true;
      appState.pythonServerRunning = true;
      appState.serverUrl = apiBaseUrl;
      resolvePromise(apiBaseUrl);
    }
  });
  
  pythonProc.on('close', (code) => {
    log.info(`Python进程退出，代码: ${code}`);
    pythonProcess = null;
    appState.pythonServerRunning = false;
    
    if (code !== 0 && !serverStarted) {
      // 提供更详细的错误信息
      let errorMessage = `Python进程异常退出，代码: ${code}`;
      let errorDetail = '';
      
      // 根据退出代码提供可能的原因
      if (code === 1) {
        errorDetail = `可能原因：\n1. 缺少必要的环境变量\n2. Python依赖库未正确安装\n3. 脚本执行权限问题`;
        log.error('Python进程可能缺少必要的环境变量或依赖');
      } else if (code === 2) {
        errorDetail = `可能原因：Python脚本中有语法错误`;
        log.error('Python脚本可能存在语法错误');
      } else if (code === 3) {
        errorDetail = `可能原因：Python导入模块失败`;
        log.error('Python导入模块失败，可能缺少依赖');
      }
      
      if (mainWindow) {
        mainWindow.webContents.send('python-error', errorMessage);
        
        // 显示错误对话框并提供重试选项
        dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'Python后端错误',
          message: errorMessage,
          detail: `${errorDetail}\n\n应用程序需要Python后端服务才能正常运行。`,
          buttons: ['重试启动', '退出应用'],
          defaultId: 0
        }).then(({response}) => {
          if (response === 0) {
            // 用户选择重试
            log.info('用户选择重试启动Python服务');
            
            // 验证Python可执行文件和脚本是否存在
            if (!pythonInfo || !pythonInfo.path) {
              log.error('Python可执行文件路径未定义，无法重启服务');
              dialog.showErrorBox(
                'Python环境错误',
                '无法定位Python可执行文件，请重启应用程序。'
              );
              rejectPromise(new Error('Python可执行文件路径未定义'));
              return;
            }
            
            if (!fs.existsSync(pythonInfo.path)) {
              log.error(`Python可执行文件不存在: ${pythonInfo.path}`);
              dialog.showErrorBox(
                'Python环境错误',
                `无法找到Python可执行文件: ${pythonInfo.path}\n\n请重启应用程序或重新安装Python环境。`
              );
              rejectPromise(new Error(`Python可执行文件不存在: ${pythonInfo.path}`));
              return;
            }
            
            if (!pythonScript || !fs.existsSync(pythonScript)) {
              log.error(`Python脚本不存在: ${pythonScript}`);
              dialog.showErrorBox(
                'Python脚本错误',
                `无法找到Python脚本: ${pythonScript}\n\n请重启应用程序或重新安装。`
              );
              rejectPromise(new Error(`Python脚本不存在: ${pythonScript}`));
              return;
            }
            
            // 重新启动Python进程
            log.info(`重新启动Python服务: ${pythonInfo.path} ${pythonScript}`);
            pythonProcess = spawn(pythonInfo.path, [pythonScript], { env: envVars });
            setupPythonProcessListeners(pythonProcess, resolvePromise, rejectPromise, pythonInfo, pythonScript, envVars);
          } else {
            // 用户选择退出
            log.info('用户选择退出应用');
            rejectPromise(new Error(`Python进程异常退出，用户选择退出应用`));
            app.quit();
          }
        });
      } else {
        // 无窗口时直接拒绝
        rejectPromise(new Error(errorMessage));
      }
    }
  });
  
  // 设置超时
  setTimeout(() => {
    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    if (pythonProcess && !serverStarted) {
      log.info(`[${new Date().toISOString()}] [+${elapsedSeconds}s] 超时但Python进程仍在运行，假定服务器已启动，使用默认URL`);
      serverStarted = true;
      appState.pythonServerRunning = true;
      appState.serverUrl = apiBaseUrl;
      resolvePromise(apiBaseUrl);
    } else if (!pythonProcess && !serverStarted) {
      log.error(`[${new Date().toISOString()}] [+${elapsedSeconds}s] Python服务器启动超时，且进程已结束`);
      appState.pythonServerRunning = false;
      
      if (mainWindow) {
        // 显示超时错误对话框并提供重试选项
        dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'Python服务器启动超时',
          message: 'Python服务器启动超时',
          detail: '启动Python后端服务超时，可能是依赖安装不完整或者网络问题导致。',
          buttons: ['重试启动', '退出应用'],
          defaultId: 0
        }).then(({response}) => {
          if (response === 0) {
            // 用户选择重试
            log.info('用户选择重试启动Python服务');
            
            // 验证Python可执行文件和脚本是否存在
            if (!pythonInfo || !pythonInfo.path) {
              log.error('Python可执行文件路径未定义，无法重启服务');
              dialog.showErrorBox(
                'Python环境错误',
                '无法定位Python可执行文件，请重启应用程序。'
              );
              rejectPromise(new Error('Python可执行文件路径未定义'));
              return;
            }
            
            if (!fs.existsSync(pythonInfo.path)) {
              log.error(`Python可执行文件不存在: ${pythonInfo.path}`);
              dialog.showErrorBox(
                'Python环境错误',
                `无法找到Python可执行文件: ${pythonInfo.path}\n\n请重启应用程序或重新安装Python环境。`
              );
              rejectPromise(new Error(`Python可执行文件不存在: ${pythonInfo.path}`));
              return;
            }
            
            if (!pythonScript || !fs.existsSync(pythonScript)) {
              log.error(`Python脚本不存在: ${pythonScript}`);
              dialog.showErrorBox(
                'Python脚本错误',
                `无法找到Python脚本: ${pythonScript}\n\n请重启应用程序或重新安装。`
              );
              rejectPromise(new Error(`Python脚本不存在: ${pythonScript}`));
              return;
            }
            
            // 重新启动Python进程
            log.info(`重新启动Python服务: ${pythonInfo.path} ${pythonScript}`);
            pythonProcess = spawn(pythonInfo.path, [pythonScript], { env: envVars });
            setupPythonProcessListeners(pythonProcess, resolvePromise, rejectPromise, pythonInfo, pythonScript, envVars);
          } else {
            // 用户选择退出
            log.info('用户选择退出应用');
            rejectPromise(new Error('Python服务器启动超时，用户选择退出应用'));
            app.quit();
          }
        });
      } else {
        // 无窗口时直接拒绝
        rejectPromise(new Error('Python服务器启动超时'));
      }
    }
  }, 10000); // 10秒超时
}

// 添加一个获取当前平台镜像URL列表的辅助函数
function getMirrorUrlsForPlatform() {
  // 基于平台返回相应的镜像URL列表
  if (process.platform === 'darwin') {
    return [
      'https://mirrors.tuna.tsinghua.edu.cn/anaconda/miniconda/Miniconda3-latest-MacOSX-x86_64.sh',
      'https://mirrors.bfsu.edu.cn/anaconda/miniconda/Miniconda3-latest-MacOSX-x86_64.sh',
      'https://mirrors.aliyun.com/anaconda/miniconda/Miniconda3-latest-MacOSX-x86_64.sh',
      'https://mirrors.ustc.edu.cn/anaconda/miniconda/Miniconda3-latest-MacOSX-x86_64.sh',
      'https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-x86_64.sh' // 官方源作为最后备选
    ];
  } else if (process.platform === 'win32') {
    return [
      'https://mirrors.tuna.tsinghua.edu.cn/anaconda/miniconda/Miniconda3-latest-Windows-x86_64.exe',
      'https://mirrors.bfsu.edu.cn/anaconda/miniconda/Miniconda3-latest-Windows-x86_64.exe',
      'https://mirrors.aliyun.com/anaconda/miniconda/Miniconda3-latest-Windows-x86_64.exe',
      'https://mirrors.ustc.edu.cn/anaconda/miniconda/Miniconda3-latest-Windows-x86_64.exe',
      'https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-x86_64.exe' // 官方源作为最后备选
    ];
  } else {
    return [
      'https://mirrors.tuna.tsinghua.edu.cn/anaconda/miniconda/Miniconda3-latest-Linux-x86_64.sh',
      'https://mirrors.bfsu.edu.cn/anaconda/miniconda/Miniconda3-latest-Linux-x86_64.sh',
      'https://mirrors.aliyun.com/anaconda/miniconda/Miniconda3-latest-Linux-x86_64.sh',
      'https://mirrors.ustc.edu.cn/anaconda/miniconda/Miniconda3-latest-Linux-x86_64.sh',
      'https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh' // 官方源作为最后备选
    ];
  }
}

// 上传用户统计数据
async function uploadUserStatistics() {
  try {
    // 获取设备信息
    const deviceId = store.get('deviceId');
    if (!deviceId) {
      // 首次运行生成并存储设备ID
      const newDeviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      store.set('deviceId', newDeviceId);
    }

    // 收集基本系统信息
    const appVersion = app.getVersion();
    const osInfo = {
      type: process.platform,
      version: os.release(),
      arch: os.arch()
    };
    
    // 尝试获取公网IP地址信息
    let ipInfo = null;
    try {
      // 从ipinfo.io获取公网IP
      const response = await fetch('https://ipinfo.io/ip');
      if (response.ok) {
        ipInfo = (await response.text()).trim();
        log.info(`获取到公网IP地址: ${ipInfo} (来源: ipinfo.io)`);
      } else {
        log.warn(`无法从ipinfo.io获取公网IP，状态码: ${response.status}`);
      }
    } catch (error) {
      log.warn(`获取公网IP出错: ${error.message}`);
    }

    // 准备上传数据
    const statsData = {
      userId: store.get('deviceId'),
      appVersion: appVersion,
      osType: osInfo.type,
      osVersion: osInfo.version,
      ip: ipInfo,
      timestamp: Date.now(),
      eventType: 'app_launch'
    };

    log.info('准备上传统计数据', statsData);
    
    // 初始化MPServerless客户端
    const mpServerless = new MPServerless({
      timeout: 60 * 1000,
      spaceId: EMAS_CONFIG.spaceId,
      serverSecret: EMAS_CONFIG.serverSecret,
      endpoint: EMAS_CONFIG.endpoint,
    });
    
    // 调用云函数
    const response = await mpServerless.function.invoke('emas-statistics', statsData);
    
    log.info('统计数据上传成功', response);
    return response;
  } catch (error) {
    // 错误不应影响主程序流程
    log.error('统计数据上传失败', error.message);
    return { success: false, error: error.message };
  }
}

// 检查是否需要上传今日统计数据
function checkAndUploadStatistics() {
  try {
    const lastUploadDate = store.get('lastStatisticsUploadDate');
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD格式
    
    uploadUserStatistics().then(() => {
      // 记录上传日期
      store.set('lastStatisticsUploadDate', today);
    });
  } catch (error) {
    log.error('检查统计上传状态出错', error.message);
  }
}

// 提交用户反馈
async function submitUserFeedback(email, content) {
  try {
    // 获取设备信息
    const deviceId = store.get('deviceId');

    // 收集基本系统信息
    const appVersion = app.getVersion();
    const osInfo = {
      type: process.platform,
      version: os.release(),
      arch: os.arch()
    };
    
    // 准备上传数据
    const feedbackData = {
      email: email,
      content: content,
      userId: deviceId || 'anonymous',
      appVersion: appVersion,
      osType: osInfo.type,
      osVersion: osInfo.version,
      timestamp: Date.now()
    };

    log.info('准备提交反馈', feedbackData);
    
    // 初始化MPServerless客户端
    const mpServerless = new MPServerless({
      timeout: 60 * 1000,
      spaceId: EMAS_CONFIG.spaceId,
      serverSecret: EMAS_CONFIG.serverSecret,
      endpoint: EMAS_CONFIG.endpoint,
    });
    
    // 调用云函数
    const response = await mpServerless.function.invoke('emas-feedback', feedbackData);
    
    log.info('反馈提交成功', response);
    return response;
  } catch (error) {
    // 错误不应影响主程序流程
    log.error('反馈提交失败', error.message);
    return { success: false, message: `提交失败：${error.message}` };
  }
}

// 获取公告信息
async function getAnnouncements() {
  try {
    // 获取设备信息
    const deviceId = store.get('deviceId');

    // 收集基本系统信息
    const appVersion = app.getVersion();
    const osInfo = {
      type: process.platform,
      version: os.release()
    };
    
    // 准备请求数据
    const requestData = {
      appVersion: appVersion,
      osType: osInfo.type,
      timestamp: Date.now()
    };

    log.info('准备获取公告', requestData);
    
    // 初始化MPServerless客户端
    const mpServerless = new MPServerless({
      timeout: 60 * 1000,
      spaceId: EMAS_CONFIG.spaceId,
      serverSecret: EMAS_CONFIG.serverSecret,
      endpoint: EMAS_CONFIG.endpoint,
    });
    
    // 调用云函数
    const response = await mpServerless.function.invoke('emas-announcement', requestData);
    
    log.info('获取公告成功', response.result);
    return response.result;
  } catch (error) {
    // 错误不应影响主程序流程
    log.error('获取公告失败', error.message);
    return { 
      success: false, 
      data: [],
      message: `获取公告失败：${error.message}` 
    };
  }
}

// 检查更新函数
function checkForUpdates() {
  if (process.env.NODE_ENV === 'development') {
    log.info('开发环境下不检查更新');
    return;
  }

  log.info('检查更新...');
  
  autoUpdater.on('checking-for-update', () => {
    log.info('正在检查更新...');
  });
  
  autoUpdater.on('update-available', (info) => {
    log.info('发现新版本:', info);
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info);
    }
    
    dialog.showMessageBox({
      type: 'info',
      title: '发现更新',
      message: '发现新版本，正在下载...',
      detail: `当前版本: ${app.getVersion()}\n新版本: ${info.version}\n${info.releaseNotes ? info.releaseNotes : ''}`,
      buttons: ['确定']
    });
  });
  
  autoUpdater.on('update-not-available', (info) => {
    log.info('当前已是最新版本');
  });
  
  autoUpdater.on('error', (err) => {
    log.error('更新错误:', err);
    if (mainWindow) {
      mainWindow.webContents.send('update-error', err);
    }
  });
  
  autoUpdater.on('download-progress', (progressObj) => {
    let logMsg = `下载速度: ${progressObj.bytesPerSecond} - 已下载 ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
    log.info(logMsg);
    if (mainWindow) {
      mainWindow.webContents.send('download-progress', progressObj);
    }
  });
  
  autoUpdater.on('update-downloaded', (info) => {
    log.info('更新已下载:', info);
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', info);
    }
    
    dialog.showMessageBox({
      type: 'info',
      title: '更新已就绪',
      message: '更新已下载完成，是否立即安装并重启应用？',
      detail: `版本: ${info.version}\n${info.releaseNotes ? info.releaseNotes : ''}`,
      buttons: ['立即安装', '稍后安装'],
      defaultId: 0
    }).then((returnValue) => {
      if (returnValue.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });
  
  // 开始检查更新
  autoUpdater.checkForUpdatesAndNotify().catch(err => {
    log.error('自动更新检查失败:', err);
  });
}

// IPC处理程序 - 手动检查更新
ipcMain.handle('check-for-updates', async () => {
  try {
    log.info('手动检查更新...');
    return await autoUpdater.checkForUpdatesAndNotify();
  } catch (err) {
    log.error('手动检查更新失败:', err);
    throw err;
  }
});

// 验证核心依赖是否正确安装
async function verifyCoreDependencies(pythonExe) {
  try {
    log.info('开始验证核心依赖是否正确安装');
    // 核心依赖列表，按照功能分类
    const coreDeps = {
      // 基础依赖 - 应用必须的核心组件
      basic: ['fastapi', 'uvicorn', 'watchdog', 'httpx', 'orjson', 'langchain'],
      
      // 通义千问API依赖 - 嵌入和查询必须
      api: ['dashscope'],
      
      // 文档处理依赖 - 按文件类型可选
      docProcessing: [
        'pypdf', 'python-docx', 'docx', 'pandas', 'PyMuPDF', 'fitz', 
        'pdfminer.six', 'pdfminer', 'python-pptx', 'pptx', 'pytesseract', 
        'unstructured', 'openpyxl'
      ],
      
      // 向量数据库依赖 - 必须
      vectorDB: ['faiss', 'faiss-cpu']
    };
    
    // 创建一个验证脚本的内容
    const verifyScriptContent = `
import sys
import importlib

# 定义依赖分类
dependency_categories = ${JSON.stringify(coreDeps)}

# 合并所有依赖为一个列表
all_deps = []
for category in dependency_categories:
    all_deps.extend(dependency_categories[category])

# 结果存储
result = {
    "basic": {"success": [], "failed": []},
    "api": {"success": [], "failed": []},
    "docProcessing": {"success": [], "failed": []},
    "vectorDB": {"success": [], "failed": []}
}

# 尝试导入每个依赖
for dep in all_deps:
    # 确定依赖所属的类别
    category = None
    for cat, deps in dependency_categories.items():
        if dep in deps:
            category = cat
            break
    
    if not category:
        continue  # 跳过未分类的依赖
        
    try:
        # 特殊处理python-docx和python-pptx，实际import名称不同
        if dep == 'python-docx':
            importlib.import_module('docx')
        elif dep == 'python-pptx':
            importlib.import_module('pptx')
        elif dep == 'PyMuPDF':
            importlib.import_module('fitz')
        elif dep == 'pdfminer.six':
            importlib.import_module('pdfminer')
        elif dep == 'faiss-cpu':
            # 尝试导入faiss
            try:
                importlib.import_module('faiss')
            except ImportError:
                # 如果直接导入失败，尝试加载CPU版本特有路径
                import sys
                from pathlib import Path
                try:
                    # 检查site-packages中是否有faiss_cpu目录
                    import site
                    site_packages = site.getsitepackages()[0]
                    faiss_cpu_dir = Path(site_packages) / "faiss_cpu"
                    if faiss_cpu_dir.exists() and faiss_cpu_dir.is_dir():
                        sys.path.append(str(faiss_cpu_dir))
                        importlib.import_module('faiss')
                    else:
                        raise ImportError("faiss or faiss_cpu not found")
                except ImportError:
                    raise ImportError("faiss module not found - try installing faiss-cpu")
        else:
            importlib.import_module(dep)
            
        result[category]["success"].append(dep)
        print(f"✅ Successfully imported {dep}")
    except ImportError as e:
        result[category]["failed"].append(dep)
        print(f"❌ Failed to import {dep}: {e}")

# 核心依赖必须全部存在，否则应用无法启动
core_missing = len(result["basic"]["failed"]) > 0 or len(result["vectorDB"]["failed"]) > 0 or len(result["api"]["failed"]) > 0
doc_missing = len(result["docProcessing"]["failed"]) > 0

# 打印验证结果
if not core_missing and not doc_missing:
    print("CORE_DEPS_VERIFICATION_SUCCESS")
    print("DOC_DEPS_VERIFICATION_SUCCESS")
    sys.exit(0)
elif not core_missing and doc_missing:
    print("CORE_DEPS_VERIFICATION_SUCCESS")
    print("DOC_DEPS_VERIFICATION_PARTIAL")
    print(f"MISSING_DOC_DEPS: {','.join(result['docProcessing']['failed'])}")
    sys.exit(1)
else:
    print("CORE_DEPS_VERIFICATION_FAILED")
    core_failed = []
    core_failed.extend(result["basic"]["failed"])
    core_failed.extend(result["api"]["failed"])
    core_failed.extend(result["vectorDB"]["failed"])
    print(f"MISSING_CORE_DEPS: {','.join(core_failed)}")
    if doc_missing:
        print(f"MISSING_DOC_DEPS: {','.join(result['docProcessing']['failed'])}")
    sys.exit(2)
`;
    
    // 创建临时验证脚本
    const tempDir = app.getPath('temp');
    const verifyScriptPath = path.join(tempDir, 'verify_deps.py');
    
    fs.writeFileSync(verifyScriptPath, verifyScriptContent);
    log.info(`创建了临时验证脚本: ${verifyScriptPath}`);
    
    // 执行验证脚本
    const cmd = process.platform === 'win32'
      ? `"${pythonExe}" "${verifyScriptPath}"`
      : `${pythonExe} "${verifyScriptPath}"`;
      
    log.info(`执行验证命令: ${cmd}`);
    
    return new Promise((resolve, reject) => {
      exec(cmd, async (error, stdout, stderr) => {
        // 验证完成后删除临时脚本
        try {
          fs.unlinkSync(verifyScriptPath);
          log.info('已删除临时验证脚本');
        } catch (unlinkErr) {
          log.warn(`删除临时验证脚本失败: ${unlinkErr.message}`);
          // 不影响主流程
        }
        
        // 解析验证结果
        const coreSuccessMatch = stdout.includes('CORE_DEPS_VERIFICATION_SUCCESS');
        const docSuccessMatch = stdout.includes('DOC_DEPS_VERIFICATION_SUCCESS');
        const docPartialMatch = stdout.includes('DOC_DEPS_VERIFICATION_PARTIAL');
        const missingCoreMatch = stdout.match(/MISSING_CORE_DEPS: (.*)/);
        const missingDocMatch = stdout.match(/MISSING_DOC_DEPS: (.*)/);
                
        if (error || !coreSuccessMatch) {
          log.error(`验证核心依赖失败: ${error ? error.message : '缺少必要依赖'}`);
          log.error(`验证输出: ${stdout}\n${stderr}`);
          
          // 处理缺失依赖
          let missingCoreDeps = [];
          let missingDocDeps = [];
          
          if (missingCoreMatch && missingCoreMatch[1]) {
            missingCoreDeps = missingCoreMatch[1].split(',');
            log.error(`缺少核心依赖: ${missingCoreDeps.join(', ')}`);
          }
          
          if (missingDocMatch && missingDocMatch[1]) {
            missingDocDeps = missingDocMatch[1].split(',');
            log.warn(`缺少文档处理依赖: ${missingDocDeps.join(', ')}`);
          }
          
          // 如果缺少核心依赖，必须安装
          if (missingCoreDeps.length > 0) {
            log.info(`开始安装缺失的核心依赖: ${missingCoreDeps.join(', ')}`);
            
            // 创建强制安装窗口，不允许用户取消
            try {
              await installDependency(pythonExe, missingCoreDeps.join(' '), {
                showWindow: true,
                required: true
              });
              
              // 安装成功后通知用户
              if (mainWindow) {
                dialog.showMessageBox(mainWindow, {
                  type: 'info',
                  title: '核心依赖安装完成',
                  message: '缺失的核心依赖已成功安装',
                  detail: '应用现在将继续启动。可能需要重启应用以确保所有功能正常工作。',
                  buttons: ['确定', '立即重启'],
                  defaultId: 0
                }).then(restartResult => {
                  if (restartResult.response === 1) {
                    // 用户选择立即重启
                    app.relaunch();
                    app.exit(0);
                  }
                });
              }
              
              // 安装核心依赖成功后，检查是否还需要安装文档处理依赖
              if (missingDocDeps.length > 0) {
                // 询问是否安装文档处理依赖
                if (mainWindow) {
                  dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: '文档处理功能增强',
                    message: `发现可安装的文档处理依赖:`,
                    detail: `${missingDocDeps.join(', ')}\n\n这些依赖用于处理特定类型的文件（Word、PDF、Excel等）。\n\n是否安装这些依赖以增强文档处理功能？`,
                    buttons: ['现在安装', '稍后再说'],
                    defaultId: 0
                  }).then(docResult => {
                    if (docResult.response === 0) {
                      // 安装文档处理依赖
                      log.info(`开始安装文档处理依赖: ${missingDocDeps.join(', ')}`);
                      installDependency(pythonExe, missingDocDeps.join(' '), {
                        showWindow: true,
                        required: false
                      })
                        .then(() => {
                          dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: '文档处理依赖安装完成',
                            message: '文档处理依赖已成功安装',
                            detail: '现在您可以处理更多类型的文档。某些功能可能需要重启应用才能生效。',
                            buttons: ['确定', '立即重启'],
                            defaultId: 0
                          }).then(finalResult => {
                            if (finalResult.response === 1) {
                              // 用户选择立即重启
                              app.relaunch();
                              app.exit(0);
                            }
                          });
                        })
                        .catch(err => {
                          dialog.showErrorBox(
                            '依赖安装失败',
                            `安装文档处理依赖时出错: ${err.message}\n\n您可以稍后再尝试安装。`
                          );
                        });
                    }
                  });
                }
              }
            } catch (err) {
              log.error(`安装核心依赖失败: ${err.message}`);
              dialog.showErrorBox(
                '核心依赖安装失败',
                `安装核心依赖时出错: ${err.message}\n\n应用可能无法正常工作。请尝试重启应用。`
              );
            }
          }
          // 如果只缺少文档处理依赖，提供选择性安装
          else if (missingDocDeps.length > 0 && coreSuccessMatch && mainWindow) {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '文档处理功能增强',
              message: `检测到可安装的文档处理依赖:`,
              detail: `${missingDocDeps.join(', ')}\n\n这些依赖用于处理特定类型的文件（Word、PDF、Excel等）。\n\n是否安装这些依赖以增强文档处理功能？`,
              buttons: ['现在安装', '稍后再说'],
              defaultId: 0
            }).then(result => {
              if (result.response === 0) {
                // 用户选择安装文档处理依赖
                log.info(`开始安装文档处理依赖: ${missingDocDeps.join(', ')}`);
                installDependency(pythonExe, missingDocDeps.join(' '), {
                  showWindow: true,
                  required: false
                })
                  .then(() => {
                    dialog.showMessageBox(mainWindow, {
                      type: 'info',
                      title: '文档处理依赖安装完成',
                      message: '文档处理依赖已成功安装',
                      detail: '现在您可以处理更多类型的文档。某些功能可能需要重启应用才能生效。',
                      buttons: ['确定', '立即重启'],
                      defaultId: 0
                    }).then(restartResult => {
                      if (restartResult.response === 1) {
                        // 用户选择立即重启
                        app.relaunch();
                        app.exit(0);
                      }
                    });
                  })
                  .catch(err => {
                    dialog.showErrorBox(
                      '依赖安装失败',
                      `安装文档处理依赖时出错: ${err.message}\n\n您可以稍后再尝试安装。`
                    );
                  });
              }
            });
          }
          
          // 根据核心依赖状态返回结果
          resolve(coreSuccessMatch);
          return;
        }
        
        // 所有依赖都已正确安装
        if (coreSuccessMatch && docSuccessMatch) {
          log.info('验证依赖成功，所有依赖都已正确安装');
          resolve(true);
        } 
        // 核心依赖已安装，部分文档处理依赖缺失但不影响基本功能
        else if (coreSuccessMatch && docPartialMatch) {
          log.info('核心依赖已全部安装，部分文档处理依赖缺失');
          resolve(true);
        } 
        else {
          log.error(`验证依赖失败，输出: ${stdout}`);
          resolve(false);
        }
      });
    });
  } catch (error) {
    log.error(`验证依赖过程中出错: ${error.message}`);
    return false;
  }
}

// 依赖安装专用窗口
function showDependencyInstallationWindow(title, details, packages) {
  const installWindow = new BrowserWindow({
    width: 500,
    height: 350,
    parent: mainWindow,
    modal: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: false, // 禁止关闭窗口
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  // 创建HTML内容
  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
      body {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        padding: 20px;
        margin: 0;
        display: flex;
        flex-direction: column;
        height: 100vh;
        box-sizing: border-box;
        background-color: #f5f5f5;
        color: #333;
      }
      h2 {
        margin-top: 0;
        margin-bottom: 10px;
        color: #1976d2;
      }
      .details {
        margin-bottom: 20px;
        max-height: 100px;
        overflow-y: auto;
        padding: 10px;
        background-color: #fff;
        border-radius: 4px;
        border: 1px solid #e0e0e0;
      }
      .progress-container {
        width: 100%;
        height: 20px;
        background-color: #e0e0e0;
        border-radius: 10px;
        overflow: hidden;
        margin-bottom: 10px;
      }
      .progress-bar {
        height: 100%;
        width: 0%;
        background-color: #1976d2;
        transition: width 0.3s ease;
      }
      .status {
        margin-top: 15px;
        font-size: 14px;
        color: #555;
        flex-grow: 1;
        overflow-y: auto;
        padding: 10px;
        background-color: #fff;
        border-radius: 4px;
        border: 1px solid #e0e0e0;
      }
      .info {
        margin-top: 10px;
        font-size: 12px;
        color: #777;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <h2>${title}</h2>
    <div class="details">${details}</div>
    <div class="progress-container">
      <div class="progress-bar" id="progress-bar"></div>
    </div>
    <div id="progress-text">正在准备安装...</div>
    <div class="status" id="status"></div>
    <div class="info">依赖安装过程中请勿关闭此窗口，安装完成后将自动关闭</div>
    
    <script>
      const { ipcRenderer } = require('electron');
      const statusEl = document.getElementById('status');
      const progressBar = document.getElementById('progress-bar');
      const progressText = document.getElementById('progress-text');
      
      let logLines = [];
      
      // 监听安装进度更新
      ipcRenderer.on('dependency-install-progress', (event, data) => {
        progressBar.style.width = data.progress + '%';
        progressText.textContent = '进度: ' + data.progress + '% - ' + data.status;
      });
      
      // 监听日志消息
      ipcRenderer.on('dependency-install-log', (event, message) => {
        logLines.push(message);
        // 保持最新的30行日志
        if (logLines.length > 30) {
          logLines.shift();
        }
        statusEl.innerHTML = logLines.join('<br>');
        statusEl.scrollTop = statusEl.scrollHeight;
      });
      
      // 禁止用户关闭窗口
      window.onbeforeunload = (e) => {
        e.returnValue = false;
        return false;
      };
    </script>
  </body>
  </html>
  `;
  
  // 创建临时HTML文件
  const tempFilePath = path.join(app.getPath('temp'), 'dependency-install.html');
  fs.writeFileSync(tempFilePath, htmlContent);
  
  // 加载HTML文件
  installWindow.loadFile(tempFilePath);
  
  // 窗口准备好后显示
  installWindow.once('ready-to-show', () => {
    installWindow.show();
  });
  
  return installWindow;
}