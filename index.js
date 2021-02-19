const { app, BrowserWindow, ipcMain, nativeTheme, globalShortcut  } = require('electron');
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')
const path = require('path');
const Credentials = require("./credentials/credentials");
const settings = require("electron-settings");
const update = require("./update");
const userAgent = require("./useragent");
const defaultSettings = require("./defaultSettings.json");
const contextMenu = require("electron-context-menu");
const { openProcessManager } = require('@krisdages/electron-process-manager');

settings.configure({
    atomicSave: true,
    fileName: 'settings.json',
    prettify: true
});

if (!settings.getSync().check) {
    settings.setSync(defaultSettings);
}

let argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 [options]')
    .option('login', {
        alias: 'l',
        type: 'array',
        description: 'Autologin on darkorbit. Example: --login user pass'
    })
    .option('dosid', {
        alias: 'sid',
        type: "string",
        description: "Run client with custom dosid"
    })
    .option('dev', {
        alias: 'd',
        type: 'boolean',
        description: 'Run in development mode',
        default: false
    })
    .epilog('for more information visit https://github.com/kaiserdj/Darkorbit-client')
    .argv;

if (argv.dev) {
    console.log(settings.getSync());
}

async function createWindow() {
    update.checkForUpdates();
    let Useragent = await userAgent.getVersion();

    contextMenu({
        shouldShowMenu: (event, params) => {
            switch (params.pageURL.split(":")[0]) {
                case "file":
                    if (argv.dev) {
                        return true;
                    } else {
                        return false;
                    }
                    default:
                        return true;
            }
        },
        prepend: (defaultActions, params, browserWindow) => [{
                label: 'Back',
                icon: `${__dirname}/contextMenu/back${nativeTheme.shouldUseDarkColors ? "" : "_dark"}.png`,
                enabled: browserWindow.webContents.canGoBack(),
                click: (menu, win) => win.webContents.goBack()
            },
            {
                label: 'Forward',
                icon: `${__dirname}/contextMenu/forward${nativeTheme.shouldUseDarkColors ? "" : "_dark"}.png`,
                enabled: browserWindow.webContents.canGoForward(),
                click: (menu, win) => win.webContents.goForward()
            },
            {
                label: 'Refresh',
                icon: `${__dirname}/contextMenu/refresh${nativeTheme.shouldUseDarkColors ? "" : "_dark"}.png`,
                click: (menu, win) => win.webContents.reload()  
            },
            {
                label: 'Full Screen',
                icon: `${__dirname}/contextMenu/fullscreen${nativeTheme.shouldUseDarkColors ? "" : "_dark"}.png`,
                visible: !browserWindow.isFullScreen(),
                click: (menu, win) => win.setFullScreen(true)  
            },
            {
                label: 'Full Screen',
                icon: `${__dirname}/contextMenu/fullscreen_exit${nativeTheme.shouldUseDarkColors ? "" : "_dark"}.png`,
                visible: browserWindow.isFullScreen(),
                click: (menu, win) => win.setFullScreen(false)  
            },
            {
                type: 'separator',
                visible: argv.dev
            },
            {
                label: 'Inspect Element',
                icon: `${__dirname}/contextMenu/inspectElement${nativeTheme.shouldUseDarkColors ? "" : "_dark"}.png`,
                visible: argv.dev,
                click: () => browserWindow.inspectElement(params.x, params.y)
            },
            {
                label: 'Process Manager',
                icon: `${__dirname}/contextMenu/processManager${nativeTheme.shouldUseDarkColors ? "" : "_dark"}.png`,
                visible: argv.dev,
                click: () => openProcessManager()
            }
        ],
        showLookUpSelection: false,
        showCopyImage: false,
        showCopyImageAddress: false,
        showSaveImage: false,
        showSaveImageAs: false,
        showSaveLinkAs: false,
        showInspectElement: false,
        showServices: false,
        showSearchWithGoogle: false
    });

    let mainWindow;

    mainWindow = new BrowserWindow({
        'width': settings.getSync().client.width,
        'height': settings.getSync().client.height,
        'x': settings.getSync().client.x,
        'y': settings.getSync().client.y,
        'webPreferences': {
            'preload': `${__dirname}/inject/main.js`,
            'contextIsolation': true,
            'nodeIntegration': true,
            'plugins': true,
            'devTools': argv.dev
        },
    });

    mainWindow.setMenuBarVisibility(false);

    let credentials = new Credentials(BrowserWindow, mainWindow, settings, ipcMain);

    if (argv.dev) {
        mainWindow.webContents.openDevTools();
    }

    if (argv.login) {
        if (argv.login.length === 2) {
            mainWindow.webContents.on('did-finish-load', () => {
                mainWindow.webContents.send("login", argv.login)
            });
        }
    }

    if (argv.dosid) {
        let sid = argv.dosid.match(/[?&](dosid|sid)=([^&]+)/);
        let baseUrl = new URL(argv.dosid).origin;

        if (sid !== null && baseUrl !== null) {
            const cookie = { url: baseUrl, name: 'dosid', value: sid[2] };
            mainWindow.webContents.session.cookies.set(cookie);
            mainWindow.loadURL(`${baseUrl}/indexInternal.es?action=internalStart`, { userAgent: Useragent });
        }
    } else {
        mainWindow.loadURL(`https://www.darkorbit.com/`, { userAgent: Useragent });
    }

    settingsWindow(mainWindow, "client");

    mainWindow.webContents.on('new-window', async function(e, url) {
        let windowType;
        e.preventDefault();

        if (new URL(url).search === "?action=internalMapRevolution") {
            windowType = "game";
        } else if (new URL(url).host.split(".")[1] === "darkorbit") {
            if (new URL(url).host.split(".")[0].search("board") !== -1 || new URL(url).search === "?action=portal.redirectToBoard") {
                windowType = "board";
            } else {
                if (new URL(url).search.split("&")[0] === "?action=externalLogout") {
                    return mainWindow.close();
                } else if (new URL(url).host.split(".")[1] === "darkorbit") {
                    return mainWindow.loadURL(url, { userAgent: Useragent });
                }
                windowType = "client";
            }
        } else if (new URL(url).host.split(".")[1] === "bpsecure") {
            windowType = "config";
        } else {
            require('open')(url);
            return;
        }

        let window = new BrowserWindow({
            'width': settings.getSync()[windowType].width,
            'height': settings.getSync()[windowType].height,
            'x': settings.getSync()[windowType].x,
            'y': settings.getSync()[windowType].y,
            'webPreferences': {
                'contextIsolation': true,
                'nodeIntegration': true,
                'plugins': true,
                'devTools': argv.dev
            }
        });

        window.setMenuBarVisibility(false);

        window.loadURL(url, { userAgent: Useragent });

        if (argv.dev) {
            window.webContents.openDevTools();
        }

        settingsWindow(window, windowType);
    });
};

let ppapi_flash_path;

if (process.platform == 'win32') {
    ppapi_flash_path = path.join(app.getAppPath(), '../flash/pepflashplayer.dll');
} else if (process.platform == 'linux') {
    ppapi_flash_path = path.join(process.resourcesPath, './flash/libpepflashplayer.so');
    app.commandLine.appendSwitch("--no-sandbox");
} else if (process.platform == 'darwin') {
    ppapi_flash_path = path.join(app.getAppPath(), '../flash/PepperFlashPlayer.plugin');
}

app.commandLine.appendSwitch('ppapi-flash-path', ppapi_flash_path);

app.whenReady().then(() => {
    globalShortcut.register('CommandOrControl+Shift+K', () => {
        argv.dev = argv.dev? false : true;
    })
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

function settingsWindow(window, type) {
    if (settings.getSync()[type].max) {
        window.maximize();
    }

    window.on('maximize', () => {
        let backup = settings.getSync();
        backup[type].max = true;
        settings.setSync(backup);
    });

    window.on("unmaximize", () => {
        let backup = settings.getSync();
        backup[type].max = false;
        settings.setSync(backup);
    });

    window.on('resize', () => {
        let backup = settings.getSync();
        let size = window.getSize();
        backup[type].width = size[0];
        backup[type].height = size[1];

        settings.setSync(backup);
    })

    window.on('move', (data) => {
        let backup = settings.getSync();
        let pos = data.sender.getBounds();
        backup[type].x = pos.x;
        backup[type].y = pos.y;

        settings.setSync(backup);
    });
}