import * as fs from 'fs';
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { TimeTrackerStatusBarItem } from './statusBarItem';

interface ProjectTime {
    projectName: string;
    totalTimeSpent: number;
}

let timeTrackerStatusBarItem: TimeTrackerStatusBarItem | undefined;
let startTime: Date | null = null;
let projectTimes: ProjectTime[] = [];
let savedDataPath: string;

function stopTracking() {
    if (startTime !== null) {
        const endTime = new Date();
        const elapsedTime = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
        startTime = null;

        const currentWorkspaceFolder = vscode.workspace.workspaceFolders?.[0]?.name;
        if (currentWorkspaceFolder) {
            const index = projectTimes.findIndex(project => project.projectName === currentWorkspaceFolder);
            if (index !== -1) {
                projectTimes[index].totalTimeSpent += elapsedTime;
                // Save updated data to JSON file
                fs.writeFileSync(savedDataPath, JSON.stringify(projectTimes, null, 4), 'utf-8');
                vscode.window.showInformationMessage(`Stopped time tracking. Total time: ${formatTime(projectTimes[index].totalTimeSpent)} minutes.`);
                if (timeTrackerStatusBarItem) {
                    timeTrackerStatusBarItem.updateTime(projectTimes[index]. totalTimeSpent);
                    timeTrackerStatusBarItem.stopTimer();
                }
            }
        } else {
            vscode.window.showWarningMessage('No open projects.');
        }
    }
}


export function activate(context: vscode.ExtensionContext) {
    timeTrackerStatusBarItem = new TimeTrackerStatusBarItem();

    // Path to JSON file
    savedDataPath = context.asAbsolutePath('projects.json');

    // Checks if the JSON file exists and if it doesn't, creates it with an initial structure
    if (!fs.existsSync(savedDataPath)) {
        fs.writeFileSync(savedDataPath, JSON.stringify([], null, 4), 'utf-8');
    }

    // Try to load data from the JSON file
    try {
        const data = fs.readFileSync(savedDataPath, 'utf-8');
        projectTimes = JSON.parse(data);
    } catch (err) {
        console.error('Error loading data from JSON file:', err);
    }

    console.log('Congratulations, your extension "time-tracker" is now active!');

    // Automatically start the timer with the saved time when a project is opened
    const currentWorkspaceFolder = vscode.workspace.workspaceFolders?.[0]?.name;
    if (currentWorkspaceFolder) {
        const index = projectTimes.findIndex(project => project.projectName === currentWorkspaceFolder);
        if (index !== -1 && timeTrackerStatusBarItem) {
            timeTrackerStatusBarItem.updateTime(projectTimes[index].totalTimeSpent);
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
            if (timeTrackerStatusBarItem) {
                timeTrackerStatusBarItem.toggleTracking(initialTime);
            }
            if (startTime === null) {
                startTime = new Date();
                vscode.window.showInformationMessage(`Time tracking started at "${currentWorkspaceFolder}".`);
            } else {
                stopTracking();
            }
        } else {
            vscode.window.showWarningMessage('No open projects.');
        }
    });

    let startCommand = vscode.commands.registerCommand('extension.startTracking', () => {
		if (startTime === null) {
			startTime = new Date();
			const currentWorkspaceFolder = vscode.workspace.workspaceFolders?.[0]?.name;
			if (currentWorkspaceFolder) {
				const index = projectTimes.findIndex(project => project.projectName === currentWorkspaceFolder);
				if (index === -1) {
					projectTimes.push({ projectName: currentWorkspaceFolder, totalTimeSpent: 0 });
				}
				vscode.window.showInformationMessage(`Time tracking started at "${currentWorkspaceFolder}".`);
				if (timeTrackerStatusBarItem) {
					timeTrackerStatusBarItem.startTimer(projectTimes[index].totalTimeSpent); 
				}
			} else {
				vscode.window.showWarningMessage('No open projects.');
			}
		} else {
			vscode.window.showWarningMessage('Time tracking is already underway.');
		}
	});

    let stopCommand = vscode.commands.registerCommand('extension.stopTracking', () => {
        if (startTime !== null) {
            stopTracking();
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
                // Save updated data to JSON file
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

    // Automatically record time when changing workspace
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
        if (startTime !== null) {
            stopTracking();
        }
    }));

    // Command to open the web panel with time history
    let showHistoryCommand = vscode.commands.registerCommand('extension.showTimeHistory', () => {
        const panel = vscode.window.createWebviewPanel(
            'timeTrackerHistory', // Internal panel identifier
            'Project Time History', // Panel title
            vscode.ViewColumn.One, // Column editor to show the new panel
            { enableScripts: true } // Enable scripts in the webview
        );

          // Get the HTML content for the dashboard
        panel.webview.html = getWebviewContentWithButton(projectTimes);

        // Handle messages from the webview
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
}

// Helper function that converts seconds from totalTimeSpent
function formatTime(totalSeconds: number): string {
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${days > 0 ? days + ' Days ' : ''}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// This function generates HTML content for the web panel
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

	if (timeTrackerStatusBarItem) {
        timeTrackerStatusBarItem.dispose();
    }
}
