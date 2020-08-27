function resizeTerminal(terminal, fitAddon, ws, id) {
    if (terminal.element.clientWidth > 0 && terminal.element.clientHeight > 0) {
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
        ws.send(JSON.stringify({type: "ping"}));
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

    const terminal = new Terminal(options);

    const fitAddon = new FitAddon.FitAddon();

    const terminalParent = document.getElementById(elementId);

    terminal.loadAddon(fitAddon);

    terminal.open(terminalParent);

    const ws = new WebSocket(wsUrl);

    ws.onopen = function() {
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

    ws.onmessage = function (evt) {
        const message = JSON.parse(evt.data);
        if (message.id === id) {
            terminal.write(message.data);
        } else {
            console.warning("Client id " + id + " received message for id " + message.id);
        }
    };

    ws.onclose = function(evt) {
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
