import { ITerminalOptions, ITheme, Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import * as FITADDON from 'xterm-addon-fit';
import { ResizeSensor } from 'css-element-queries';
import * as _ from 'lodash';

export interface Theme extends ITheme {
    fontFamily: string;
    fontSize: number;
}

function resizeTerminal(terminal: Terminal, fitAddon: FitAddon, ws: WebSocket, id: string) {
    if (terminal.element && terminal.element.clientWidth > 0 && terminal.element.clientHeight > 0) {
        fitAddon.fit();
        ws.send(JSON.stringify({
            type: 'size',
            id: id,
            size: {
                cols: terminal.cols,
                rows: terminal.rows
            }
        }));
    }
}

function ping(ws: WebSocket) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({type: "ping"}));
        setTimeout(ping, 50000);
    }
}

function startTerminal(elementId: string, id: string, wsUrl: string, cmd: string[] | undefined, cwd: string | undefined, theme: Theme) {

    const options: ITerminalOptions = {
        cursorBlink: false,
        theme: theme,
    };

    if (theme.fontFamily) {
        options.fontFamily = theme.fontFamily;
    }

    if (theme.fontSize) {
        options.fontSize = theme.fontSize;
    }

    const terminal = new Terminal(options);

    const fitAddon = new FITADDON.FitAddon();

    const terminalParent = document.getElementById(elementId);

    terminal.loadAddon(fitAddon);

    if (!terminalParent) {
        throw new Error('Element for embedding terminal cannot be determined');
    }

    terminalParent.style.backgroundColor = theme.background ? theme.background : 'rgb(0,0,0)';

    terminal.open(terminalParent);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        // Web Socket is connected, send data using send()
        // ws.send("Message to send");
        ws.send(JSON.stringify({
            type: 'init',
            id: id,
            cmd: cmd,
            cwd: cwd
        }));

        // Setup periodic ping messages
        ping(ws);

        // Send initial size of the terminal for the pty process to adjust
        // Unless the size of the parent element is 0
        resizeTerminal(terminal, fitAddon, ws, id);
    };

    ws.onmessage = (evt) => {
        const message = JSON.parse(evt.data);
        if (message.id === id) {
            terminal.write(message.data);
        } else {
            console.warn("Client id " + id + " received message for id " + message.id);
        }
    };

    ws.onclose = () => {
        terminal.write("Closed");
    };

    let previousData = '';
    const is_eclipse_old_win_browser = typeof window.navigator.userAgent === 'string'
        && window.navigator.userAgent.indexOf("Windows NT") >= 0 
        && window.navigator.userAgent.indexOf('Chrome') < 0 
        && window.navigator.userAgent.indexOf('Edg') < 0
        && window.navigator.userAgent.indexOf('WebKit') < 0;
    const is_eclipse_old_mac_browser = typeof window.navigator.userAgent === 'string'
        && window.navigator.userAgent.indexOf("Safari/522.0") >= 0
    terminal.onData(function(data) {
        if (is_eclipse_old_win_browser || is_eclipse_old_mac_browser) {
            if (data.length === 1 && data === previousData 
                && (data.charCodeAt(0) > 31 && (data.charCodeAt(0) < 127 || data.charCodeAt(0) > 159))) {
                // Workaround double input on eclipse browser on mac
                // skip - don't send the message. Let the next message however
                previousData = '';
                return;
            } else if (data === '\b' && is_eclipse_old_mac_browser) {
                // Ignore backspace char appearing on mac in eclipse browser. Otherwise pressing delete results in Del and Backspace. Thus ignore Backspace
                previousData = data;
                return;
            } else {
                previousData = data;
            }
        }

        ws.send(JSON.stringify({
            type: 'data',
            id: id,
            data: data
        }));

    });

    new ResizeSensor(terminalParent, _.throttle(function() {
        if (ws.readyState === WebSocket.OPEN) {
            resizeTerminal(terminal, fitAddon, ws, id);
        }
    }, 250));

}

(<any>window).startTerminal = startTerminal;
