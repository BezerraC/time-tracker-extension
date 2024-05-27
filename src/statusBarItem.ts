import * as vscode from 'vscode';

export class TimeTrackerStatusBarItem {
    private statusBarItem: vscode.StatusBarItem;
    private intervalId: NodeJS.Timeout | undefined;
    private secondsElapsed: number = 0;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this.statusBarItem.tooltip = 'Click to open start counting'; 
        this.statusBarItem.command = 'extension.startTracking'; 
        this.statusBarItem.text = '⏱︎ 00:00:00';
        this.statusBarItem.show();
    }

    private updateTimer() {
        this.secondsElapsed++;
        const hours = Math.floor(this.secondsElapsed / 3600);
        const minutes = Math.floor((this.secondsElapsed % 3600) / 60);
        const seconds = this.secondsElapsed % 60;
        const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        this.statusBarItem.text = `⏱︎ ${formattedTime}`;
    }

    public updateTime(seconds: number) {
        this.secondsElapsed = seconds;
        this.updateTimer();
    }

    public startTimer(seconds: number) {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }

        this.secondsElapsed = seconds; 
        this.intervalId = setInterval(() => {
            this.updateTimer();
        }, 1000);
    }

    public stopTimer() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
    }

    public dispose() {
        this.stopTimer();
        this.statusBarItem.dispose();
    }
}
