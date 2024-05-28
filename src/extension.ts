import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
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
            {}
        );

        // Get the HTML content for the dashboard
        panel.webview.html = getWebviewContent(context.extensionPath, projectTimes);
    });

    context.subscriptions.push(startCommand);
    context.subscriptions.push(stopCommand);
    context.subscriptions.push(toggleTrackingCommand);
    context.subscriptions.push(resetCommand);
    context.subscriptions.push(showHistoryCommand);
}

// Helper function that converts seconds from totalTimeSpent
function formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// This function generates HTML content for the web panel
function getWebviewContent(extensionPath: string, projectTimes: ProjectTime[]): string {
    const rows = projectTimes.map(project => `
        <tr>
            <td>${project.projectName}</td>
            <td>${formatTime(project.totalTimeSpent)}</td>
        </tr>
    `).join('');

    // Read the content of the HTML file
    const htmlPath = path.join(extensionPath, 'src/webviewContent.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
  
    // Inject the rows into the div element in the HTML content
    return htmlContent.replace('<div id="projectTable">', `<div id="projectTable">${rows}`);
}

export function deactivate() {
    if (startTime !== null) {
        stopTracking();
    }

	if (timeTrackerStatusBarItem) {
        timeTrackerStatusBarItem.dispose();
    }
}
