import * as fs from 'fs';
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { TimeTrackerStatusBarItem } from './statusBarItem';

interface ProjectTime {
    projectName: string;
    totalTimeSpent: number; // stored in seconds
}

let timeTrackerStatusBarItem: TimeTrackerStatusBarItem | undefined;
let startTime: Date | null = null;
let projectTimes: ProjectTime[] = [];
let savedDataPath: string;

// Variables for inactivity detection
let lastActivityTime: Date | null = null;
let inactivityCheckInterval: NodeJS.Timeout | undefined;
let isPausedDueToInactivity: boolean = false;
let inactivityTimer: NodeJS.Timeout | undefined;

function stopTracking(automaticPause: boolean = false) {
    if (startTime !== null) {
        const endTime = new Date();
        const elapsedTime = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
        startTime = null;

        const currentWorkspaceFolder = vscode.workspace.workspaceFolders?.[0]?.name;
        if (currentWorkspaceFolder) {
            const index = projectTimes.findIndex(project => project.projectName === currentWorkspaceFolder);
            if (index !== -1) {
                projectTimes[index].totalTimeSpent += elapsedTime;
                fs.writeFileSync(savedDataPath, JSON.stringify(projectTimes, null, 4), 'utf-8');
                
                if (!automaticPause) {
                    vscode.window.showInformationMessage(`Stopped time tracking. Total time: ${formatTime(projectTimes[index].totalTimeSpent)}.`);
                }
                
                if (timeTrackerStatusBarItem) {
                    timeTrackerStatusBarItem.updateTime(projectTimes[index].totalTimeSpent);
                    timeTrackerStatusBarItem.stopTimer();
                }
            }
        } else {
            vscode.window.showWarningMessage('No open projects.');
        }
    }
}

function setupInactivityDetection() {
    const config = vscode.workspace.getConfiguration('timeTracker');
    const inactivityTimeoutMinutes = config.get('inactivityTimeoutMinutes', 5);
    const checkInactivityInterval = 30000; // Verify every 30 seconds
    
    // Clear existing intervals
    if (inactivityCheckInterval) {
        clearInterval(inactivityCheckInterval);
    }
    
    //Configure inactivity detection only if tracking
    if (startTime !== null) {
        lastActivityTime = new Date(); // Initialize for real time
        
        // Register multiple events to detect user activity
        registerActivityEvents();
        
        // Crate interval to check inactivity
        inactivityCheckInterval = setInterval(() => {
            checkForInactivity(inactivityTimeoutMinutes);
        }, checkInactivityInterval);
    }
}

function registerActivityEvents() {
    // Register multiple events to detect user activity
    vscode.window.onDidChangeActiveTextEditor(() => recordActivity());
    vscode.window.onDidChangeTextEditorSelection(() => recordActivity());
    vscode.workspace.onDidChangeTextDocument(() => recordActivity());
    vscode.window.onDidChangeWindowState(() => recordActivity());
}

function recordActivity() {
    lastActivityTime = new Date();
    
    // If paused due to inactivity, resume automatically
    if (isPausedDueToInactivity && timeTrackerStatusBarItem) {
        resumeFromInactivity();
    }
    
    // Reinitialize the inactivity timer
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
    }
    
    const config = vscode.workspace.getConfiguration('timeTracker');
    const inactivityTimeoutMinutes = config.get('inactivityTimeoutMinutes', 5);
    const inactivityTimeoutMs = inactivityTimeoutMinutes * 60 * 1000;
    
    inactivityTimer = setTimeout(() => {
        if (startTime !== null && !isPausedDueToInactivity) {
            pauseDueToInactivity();
        }
    }, inactivityTimeoutMs);
}

function checkForInactivity(inactivityTimeoutMinutes: number) {
    if (lastActivityTime === null || startTime === null || isPausedDueToInactivity) {
        return;
    }
    
    const now = new Date();
    const inactiveTimeMs = now.getTime() - lastActivityTime.getTime();
    const inactivityTimeoutMs = inactivityTimeoutMinutes * 60 * 1000;
    
    if (inactiveTimeMs >= inactivityTimeoutMs) {
        pauseDueToInactivity();
    }
}

function pauseDueToInactivity() {
    if (startTime !== null && !isPausedDueToInactivity) {
        isPausedDueToInactivity = true;
        stopTracking(true); // Stop tracking without showing a message
        
        const currentWorkspaceFolder = vscode.workspace.workspaceFolders?.[0]?.name;
        if (currentWorkspaceFolder) {
            vscode.window.showInformationMessage(`Time tracking paused due to inactivity in "${currentWorkspaceFolder}". Activity will resume tracking automatically.`);
        }
    }
}

function resumeFromInactivity() {
    if (isPausedDueToInactivity) {
        isPausedDueToInactivity = false;
        
        const currentWorkspaceFolder = vscode.workspace.workspaceFolders?.[0]?.name;
        if (currentWorkspaceFolder) {
            const index = projectTimes.findIndex(project => project.projectName === currentWorkspaceFolder);
            
            startTime = new Date();
            const initialTime = index !== -1 ? projectTimes[index].totalTimeSpent : 0;
            
            if (timeTrackerStatusBarItem) {
                timeTrackerStatusBarItem.startTimer(initialTime);
            }
            
            vscode.window.showInformationMessage(`Time tracking resumed for "${currentWorkspaceFolder}" after detecting activity.`);
        }
    }
}

export function activate(context: vscode.ExtensionContext) {
    timeTrackerStatusBarItem = new TimeTrackerStatusBarItem();

    const globalStoragePath = context.globalStorageUri.fsPath;
    savedDataPath = path.join(globalStoragePath, 'projects.json');

    if (!fs.existsSync(globalStoragePath)) {
        fs.mkdirSync(globalStoragePath, { recursive: true });
    }

    const oldSavedDataPath = context.asAbsolutePath('projects.json');
    if (fs.existsSync(oldSavedDataPath) && !fs.existsSync(savedDataPath)) {
        fs.renameSync(oldSavedDataPath, savedDataPath);
    }

    if (!fs.existsSync(savedDataPath)) {
        fs.writeFileSync(savedDataPath, JSON.stringify([], null, 4), 'utf-8');
    }

    try {
        const data = fs.readFileSync(savedDataPath, 'utf-8');
        projectTimes = JSON.parse(data);
    } catch (err) {
        console.error('Error loading data from JSON file:', err);
    }
    
    console.log('Congratulations, your extension "time-tracker" is now active!');

    const currentWorkspaceFolder = vscode.workspace.workspaceFolders?.[0]?.name;
    if (currentWorkspaceFolder) {
        const index = projectTimes.findIndex(project => project.projectName === currentWorkspaceFolder);
        if (index !== -1 && timeTrackerStatusBarItem) {
            timeTrackerStatusBarItem.updateTime(projectTimes[index].totalTimeSpent);
        }
        
        // Auto-start time tracking if configured
        const config = vscode.workspace.getConfiguration('timeTracker');
        const autoStartEnabled = config.get('autoStartOnOpen', false);
        if (autoStartEnabled && startTime === null) {
            startTimeTracking();
        }
    }

    let toggleTrackingCommand = vscode.commands.registerCommand('extension.toggleTracking', () => {
        const currentWorkspaceFolder = vscode.workspace.workspaceFolders?.[0]?.name;
        if (currentWorkspaceFolder) {
            const index = projectTimes.findIndex(project => project.projectName === currentWorkspaceFolder);
            if (index === -1) {
                projectTimes.push({ projectName: currentWorkspaceFolder, totalTimeSpent: 0 });
            }
            const initialTime = index !== -1 ? projectTimes[index].totalTimeSpent : 0;
            
            if (startTime === null) {
                // Start tracking
                startTime = new Date();
                isPausedDueToInactivity = false;
                
                if (timeTrackerStatusBarItem) {
                    timeTrackerStatusBarItem.toggleTracking(initialTime);
                }
                
                vscode.window.showInformationMessage(`Time tracking started at "${currentWorkspaceFolder}".`);
                
                // Config the inactivity detection
                setupInactivityDetection();
                
                // Register initial activity
                recordActivity();
            } else {
                // Stop tracking
                if (timeTrackerStatusBarItem) {
                    timeTrackerStatusBarItem.toggleTracking(initialTime);
                }
                stopTracking();
                
                // Clear inactivity detection
                if (inactivityCheckInterval) {
                    clearInterval(inactivityCheckInterval);
                    inactivityCheckInterval = undefined;
                }
                
                if (inactivityTimer) {
                    clearTimeout(inactivityTimer);
                    inactivityTimer = undefined;
                }
                
                isPausedDueToInactivity = false;
            }
        } else {
            vscode.window.showWarningMessage('No open projects.');
        }
    });

    let startCommand = vscode.commands.registerCommand('extension.startTracking', () => {
        startTimeTracking();
    });

    // Function to start time tracking
    function startTimeTracking() {
        if (startTime === null) {
            startTime = new Date();
            isPausedDueToInactivity = false;
            
            const currentWorkspaceFolder = vscode.workspace.workspaceFolders?.[0]?.name;
            if (currentWorkspaceFolder) {
                const index = projectTimes.findIndex(project => project.projectName === currentWorkspaceFolder);
                if (index === -1) {
                    projectTimes.push({ projectName: currentWorkspaceFolder, totalTimeSpent: 0 });
                    const newIndex = projectTimes.length - 1;
                    if (timeTrackerStatusBarItem) {
                        timeTrackerStatusBarItem.startTimer(0);
                    }
                } else {
                    if (timeTrackerStatusBarItem) {
                        timeTrackerStatusBarItem.startTimer(projectTimes[index].totalTimeSpent);
                    }
                }
                vscode.window.showInformationMessage(`Time tracking started at "${currentWorkspaceFolder}".`);
                
                // Configure inactivity detection
                setupInactivityDetection();
                
                // Register initial activity
                recordActivity();
            } else {
                vscode.window.showWarningMessage('No open projects.');
            }
        } else {
            vscode.window.showWarningMessage('Time tracking is already underway.');
        }
    }

    let stopCommand = vscode.commands.registerCommand('extension.stopTracking', () => {
        if (startTime !== null) {
            stopTracking();
            
            // Clear inactivity detection
            if (inactivityCheckInterval) {
                clearInterval(inactivityCheckInterval);
                inactivityCheckInterval = undefined;
            }
            
            if (inactivityTimer) {
                clearTimeout(inactivityTimer);
                inactivityTimer = undefined;
            }
            
            isPausedDueToInactivity = false;
        } else {
            vscode.window.showWarningMessage('Time tracking has not started.');
        }
    });

    let resetCommand = vscode.commands.registerCommand('extension.resetTracking', () => {
        const currentWorkspaceFolder = vscode.workspace.workspaceFolders?.[0]?.name;
        if (currentWorkspaceFolder) {
            const index = projectTimes.findIndex(project => project.projectName === currentWorkspaceFolder);
            if (index !== -1) {
                projectTimes[index].totalTimeSpent = 0;
                fs.writeFileSync(savedDataPath, JSON.stringify(projectTimes, null, 4), 'utf-8');
                vscode.window.showInformationMessage(`Total time for project "${currentWorkspaceFolder}" has been reset to zero.`);
                if (timeTrackerStatusBarItem) {
                    timeTrackerStatusBarItem.updateTime(0);
                }
            } else {
                vscode.window.showWarningMessage(`Project "${currentWorkspaceFolder}" not found.`);
            }
        } else {
            vscode.window.showWarningMessage('No open projects.');
        }
    });

    // Toggle auto-start setting
    let toggleAutoStartCommand = vscode.commands.registerCommand('extension.toggleAutoStart', () => {
        const config = vscode.workspace.getConfiguration('timeTracker');
        const currentSetting = config.get('autoStartOnOpen', false);
        
        config.update('autoStartOnOpen', !currentSetting, vscode.ConfigurationTarget.Global)
            .then(() => {
                const newStatus = !currentSetting ? 'Enabled' : 'Disabled';
                vscode.window.showInformationMessage(
                    `Auto-start time tracking on workspace open: ${newStatus}`
                );
                
                // Update the button's appearance
                if (timeTrackerStatusBarItem) {
                    timeTrackerStatusBarItem.updateAutoStartButton();
                }
            });
    });

    // Configure inactivity timeout
    let configureInactivityCommand = vscode.commands.registerCommand('extension.configureInactivity', async () => {
        const config = vscode.workspace.getConfiguration('timeTracker');
        const currentTimeout = config.get('inactivityTimeoutMinutes', 5);
        
        const result = await vscode.window.showInputBox({
            prompt: 'Enter the inactivity timeout in minutes before pausing time tracking',
            value: currentTimeout.toString(),
            validateInput: (value) => {
                const num = parseInt(value);
                return (isNaN(num) || num <= 0) ? 'Please enter a positive number' : null;
            }
        });
        
        if (result) {
            const newTimeout = parseInt(result);
            await config.update('inactivityTimeoutMinutes', newTimeout, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Inactivity timeout set to ${newTimeout} minute${newTimeout !== 1 ? 's' : ''}`);
        }
    });
    
    // Listener for changes in configuration
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('timeTracker.autoStartOnOpen')) {
                if (timeTrackerStatusBarItem) {
                    timeTrackerStatusBarItem.updateAutoStartButton();
                }
            }
            
            if (e.affectsConfiguration('timeTracker.inactivityTimeoutMinutes')) {
                // Reconfgure inactivity detection
                if (startTime !== null) {
                    setupInactivityDetection();
                }
            }
        })
    );

    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
        // Stop current tracking
        if (startTime !== null) {
            stopTracking();
            
            // Clear inactivity detection
            if (inactivityCheckInterval) {
                clearInterval(inactivityCheckInterval);
                inactivityCheckInterval = undefined;
            }
            
            if (inactivityTimer) {
                clearTimeout(inactivityTimer);
                inactivityTimer = undefined;
            }
        }
        
        // Check if auto-start is enabled when changing workspaces
        const config = vscode.workspace.getConfiguration('timeTracker');
        const autoStartEnabled = config.get('autoStartOnOpen', false);
        
        if (autoStartEnabled && vscode.workspace.workspaceFolders?.length) {
            setTimeout(() => {
                if (startTime === null) {
                    startTimeTracking();
                }
            }, 1000); // Small delay to ensure workspace is fully loaded
        }
    }));

    let showHistoryCommand = vscode.commands.registerCommand('extension.showTimeHistory', () => {
        const panel = vscode.window.createWebviewPanel(
            'timeTrackerHistory',
            'Project Time History',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = getWebviewContentWithButton(projectTimes);

        panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'openInBrowser':
                    const tempFilePath = path.join(os.tmpdir(), 'project-time-history.html');
                    fs.writeFileSync(tempFilePath, getWebviewContent(projectTimes));
                    vscode.env.openExternal(vscode.Uri.file(tempFilePath));
                    break;
            }
        });
    });

    context.subscriptions.push(startCommand);
    context.subscriptions.push(stopCommand);
    context.subscriptions.push(toggleTrackingCommand);
    context.subscriptions.push(resetCommand);
    context.subscriptions.push(showHistoryCommand);
    context.subscriptions.push(toggleAutoStartCommand);
    context.subscriptions.push(configureInactivityCommand);
}

function formatTime(totalSeconds: number): string {
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${days > 0 ? days + ' Days ' : ''}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function getWebviewContent(projectTimes: ProjectTime[]): string {
    const rows = projectTimes.map(project => `
        <tr>
            <td>${project.projectName}</td>
             <td>${formatTime(project.totalTimeSpent)}</td>
        </tr>
    `).join('');

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Project Time History</title>
            <style>
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid black; padding: 8px; text-align: left; }
                .header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .hidden { display: none; }
                .vscode-button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: 1px solid var(--vscode-button-border);
                    padding: 13px 8px;
                    border-radius: 2px;
                    cursor: pointer;
                }
                .vscode-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Project Time History</h1>
                <button id="openBrowserBtn" class="vscode-button hidden">Open in Browser</button>
            </div>
            
            <table>
                <tr>
                    <th>Projects</th>
                    <th>Total Time</th>
                </tr>
                ${rows}
            </table>
            <script>
                if (typeof acquireVsCodeApi !== 'undefined') {
                    const vscode = acquireVsCodeApi();
                    document.getElementById('openBrowserBtn').classList.remove('hidden');
                    document.getElementById('openBrowserBtn').addEventListener('click', () => {
                        vscode.postMessage({ command: 'openInBrowser' });
                    });
                }
            </script>
        </body>
        </html>
    `;
}

function getWebviewContentWithButton(projectTimes: ProjectTime[]): string {
    return getWebviewContent(projectTimes);
}

export function deactivate() {
    if (startTime !== null) {
        stopTracking();
    }

    // Clear intervals
    if (inactivityCheckInterval) {
        clearInterval(inactivityCheckInterval);
    }
    
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
    }

    if (timeTrackerStatusBarItem) {
        timeTrackerStatusBarItem.dispose();
    }
}
