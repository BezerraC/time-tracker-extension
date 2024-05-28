import * as vscode from 'vscode';

export class TimeTrackerStatusBarItem {
    private statusBarItem: vscode.StatusBarItem;
    private intervalId: NodeJS.Timeout | undefined;
    private secondsElapsed: number = 0;
    private isTracking: boolean = false;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this.statusBarItem.tooltip = 'Click to start/stop counting'; 
        this.statusBarItem.command = 'extension.toggleTracking'; 
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
    }
}
