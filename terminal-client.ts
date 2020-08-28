import {ITerminalOptions, Terminal} from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import * as FITADDON from 'xterm-addon-fit';
import { ResizeSensor } from 'css-element-queries';
import * as _ from 'lodash';


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

function startTerminal(elementId: string, id: string, wsUrl: string, cmd: string[] | undefined, cwd: string | undefined, theme: any) {

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
        && window.navigator.userAgent.indexOf("Windows NT 6.2") >= 0;
    const is_eclipse_old_mac_browser = typeof window.navigator.userAgent === 'string'
        && window.navigator.userAgent.indexOf("Safari/522.0") >= 0
    terminal.onData(function(data) {
        if (is_eclipse_old_win_browser || is_eclipse_old_mac_browser) {
            if (data.length === 1 && data === previousData) {
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

function produceOptions() {
    const urlParams = new URLSearchParams(window.location.search);
    const cmdParam = urlParams.get('cmd')
    const cmd = cmdParam ? cmdParam.split(/\s+/) : undefined;
    const cwd = urlParams.get('cwd') || undefined;
    const id = window.location.pathname.substr('/terminal/'.length);

    const theme: any = {
        background: urlParams.get('bg') || undefined,
        foreground: urlParams.get('fg') || undefined,
        cursor: urlParams.get('cursor') || undefined,
        cursorAccent: urlParams.get('cursorAccent') || undefined,
        selection: urlParams.get('selection') || undefined,
        fontFamily: urlParams.get('fontFamily') || undefined,
    };

    const fontSizeParam = urlParams.get('fontSize');
    if (fontSizeParam) {
        theme.fontSize = parseInt(fontSizeParam);
    }

    return {
        id,
        cmd,
        cwd,
        theme
    };
}

function launchTerminal(elementId: string) {
    const options = produceOptions();
    startTerminal(
        elementId,
        options.id,
        `${window.location.protocol.replace('http', 'ws')}//${window.location.host}/websocket`,
        options.cmd,
        options.cwd,
        options.theme
    );
}

(<any>window).launchTerminal = launchTerminal;
