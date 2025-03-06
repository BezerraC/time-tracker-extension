import * as vscode from 'vscode';

export class TimeTrackerStatusBarItem {
    private statusBarItem: vscode.StatusBarItem;
    private autoStartStatusBarItem: vscode.StatusBarItem;
    private intervalId: NodeJS.Timeout | undefined;
    private secondsElapsed: number = 0;
    private isTracking: boolean = false;

    constructor() {
        // Main stopwatch button
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.tooltip = 'Click to start/stop counting';
        this.statusBarItem.command = 'extension.toggleTracking';
        this.statusBarItem.text = '⏱︎ 00:00:00';
        this.statusBarItem.show();
        
        // Auto Start Button
        this.autoStartStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        this.autoStartStatusBarItem.command = 'extension.toggleAutoStart';
        this.updateAutoStartButton();
        this.autoStartStatusBarItem.show();
    }

    public updateAutoStartButton() {
        const config = vscode.workspace.getConfiguration('timeTracker');
        const autoStartEnabled = config.get('autoStartOnOpen', false);
        
        if (autoStartEnabled) {
            this.autoStartStatusBarItem.text = '▶ Auto Start';
            this.autoStartStatusBarItem.tooltip = 'Auto Start enabled. Click to disable';
        } else {
            this.autoStartStatusBarItem.text = '◼ Auto Start';
            this.autoStartStatusBarItem.tooltip = 'Auto Start disabled. Click to enable';
        }
    }

    private updateTimer() {
        this.secondsElapsed++;
        this.updateTime(this.secondsElapsed);
    }

    public updateTime(seconds: number) {
        this.secondsElapsed = seconds;
        const hours = Math.floor(this.secondsElapsed / 3600);
        const minutes = Math.floor((this.secondsElapsed % 3600) / 60);
        const secondsPart = this.secondsElapsed % 60;
        const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secondsPart.toString().padStart(2, '0')}`;
        this.statusBarItem.text = `⏱︎ ${formattedTime}`;
    }

    public startTimer(seconds: number) {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }

        this.secondsElapsed = seconds;
        this.updateTime(seconds);
        this.intervalId = setInterval(() => {
            this.updateTimer();
        }, 1000);
        this.isTracking = true;
    }

    public stopTimer() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
        this.isTracking = false;
    }

    public toggleTracking(seconds: number) {
        if (this.isTracking) {
            this.stopTimer();
        } else {
            this.startTimer(seconds);
        }
    }

    public dispose() {
        this.stopTimer();
        this.statusBarItem.dispose();
        this.autoStartStatusBarItem.dispose();
    }
}
