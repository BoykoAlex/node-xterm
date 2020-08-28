"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const xterm_1 = require("xterm");
const FITADDON = require("xterm-addon-fit");
const css_element_queries_1 = require("css-element-queries");
const _ = require("lodash");
function resizeTerminal(terminal, fitAddon, ws, id) {
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
function ping(ws) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
        setTimeout(ping, 50000);
    }
}
function startTerminal(elementId, id, wsUrl, cmd, cwd, theme) {
    const options = {
        cursorBlink: false,
        theme: theme,
    };
    if (theme.fontFamily) {
        options.fontFamily = theme.fontFamily;
    }
    if (theme.fontSize) {
        options.fontSize = theme.fontSize;
    }
    const terminal = new xterm_1.Terminal(options);
    const fitAddon = new FITADDON.FitAddon();
    const terminalParent = document.getElementById(elementId);
    terminal.loadAddon(fitAddon);
    if (!terminalParent) {
        throw new Error('Element for embedding terminal cannot be determined');
    }
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
        }
        else {
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
        && window.navigator.userAgent.indexOf("Safari/522.0") >= 0;
    terminal.onData(function (data) {
        if (is_eclipse_old_win_browser || is_eclipse_old_mac_browser) {
            if (data.length === 1 && data === previousData) {
                // Workaround double input on eclipse browser on mac
                // skip - don't send the message. Let the next message however
                previousData = '';
                return;
            }
            else if (data === '\b' && is_eclipse_old_mac_browser) {
                // Ignore backspace char appearing on mac in eclipse browser. Otherwise pressing delete results in Del and Backspace. Thus ignore Backspace
                previousData = data;
                return;
            }
            else {
                previousData = data;
            }
        }
        ws.send(JSON.stringify({
            type: 'data',
            id: id,
            data: data
        }));
    });
    new css_element_queries_1.ResizeSensor(terminalParent, _.throttle(function () {
        if (ws.readyState === WebSocket.OPEN) {
            resizeTerminal(terminal, fitAddon, ws, id);
        }
    }, 250));
}
window.startTerminal = startTerminal;
//# sourceMappingURL=terminal-client.js.map