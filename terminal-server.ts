import * as express from 'express';
import * as WebSocket from 'ws';
import * as path from 'path';
import * as pty from 'node-pty';
import {IPty} from "node-pty";

const INVALID_TIMER = -1;
const MAX_PAGE = 3;
const PREFERRED_CHECK_PERIOD = 5000;


interface ColorTheme {
    /** The default foreground color */
    foreground?: string;
    /** The default background color */
    background?: string;
    /** The cursor color */
    cursor?: string;
    /** The accent color of the cursor (fg color for a block cursor) */
    cursorAccent?: string;
    /** The selection background color (can be transparent) */
    selection?: string;
}

interface Theme extends ColorTheme {
    fontFamily?: string;
    fontSize?: number;
}

interface Size {
    rows: number;
    cols: number;
}

interface Message {
    type: 'ping' | 'size' | 'data' | 'init';
    id: string;
    data: string;
    cmd: string[];
    cwd: string;
    size: Size;
}

interface PtyProperties {
    shutdown: 'NEVER' | 'IMMEDIATELY' | 'DELAY';
    shutdownDelay: number;
}

interface ShutdownProperties {
    on: boolean;
    delay: number;
}

class PtyProcessInfo {

    id: string;
    pty: IPty;
    buffer: string[];
    sockets: WebSocket[];
    terminationTimer: number;

    constructor(pty: IPty, id: string) {
        this.id = id;
        this.pty = pty;
        this.sockets = [];
        this.buffer = [];
        this.terminationTimer = INVALID_TIMER;
    }

    isOverBufferSize(): boolean {
        const max = this.pty.cols * this.pty.rows * MAX_PAGE;
        const totalLength = this.buffer.length === 0 ? 0 : this.buffer.map(s => s.length).reduce((s, c) => s + c);
        return totalLength > max;
    }
}

class PtyProcessManager {

    private processes: Map<string, PtyProcessInfo>;
    private options: PtyProperties;

    constructor(options: PtyProperties) {
        this.processes = new Map<string, PtyProcessInfo>();
        this.options = options || {
            on: false,
            delay: 60
        };
    }

    private broadcastData(processInfo: PtyProcessInfo, data: string) {
        const msg = {
          type: 'data',
          id: processInfo.id,
          data: data
        };

        processInfo.sockets.forEach(s => {
            s.send(JSON.stringify(msg));
        });

        if (processInfo.isOverBufferSize()) {
            processInfo.buffer.shift();
        }
        processInfo.buffer.push(msg.data);

    }

    private terminatePty(ptyProcessInfo: PtyProcessInfo): boolean {
        if (ptyProcessInfo && ptyProcessInfo.sockets.length === 0) {
            console.info("Terminating pty process for id=" + ptyProcessInfo.id);
            ptyProcessInfo.pty.kill();
            this.processes.delete(ptyProcessInfo.id);
            return true;
        }
        return false;
    }

    private connectSocket(ws: WebSocket, processInfo: PtyProcessInfo) {
        if (processInfo.terminationTimer !== INVALID_TIMER) {
            clearTimeout(processInfo.terminationTimer);
            processInfo.terminationTimer = INVALID_TIMER;
        }
        processInfo.sockets.push(ws);
    }

    public isEmpty() {
        return this.processes.size === 0;
    }

    public destroy() {
        this.processes.forEach(processInfo => this.terminatePty(processInfo));
    }

    create(id: string, cmd: string[], cwd: string): PtyProcessInfo {
        let processInfo = this.processes.get(id);
        if (!cmd || !cmd.length) {
            throw new Error('Shell command is empty!');
        }
        const shell = cmd.shift() || 'bash' ;
        if (!processInfo) {
            const ptyProcess = pty.spawn(shell, cmd, {
                name: 'xterm-color',
                cols: 120,
                rows: 30,
                cwd: cwd || process.cwd(),
                env: <any> process.env
            });
            const newProcessInfo = new PtyProcessInfo(ptyProcess, id);
            this.processes.set(id, newProcessInfo);

            ptyProcess.onData(data => this.broadcastData(newProcessInfo, data));
            processInfo = newProcessInfo;
        }
        return processInfo;
    }

    public createOrConnect(ws: WebSocket, id: string, cmd: string[], cwd: string): PtyProcessInfo {
        let processInfo = <PtyProcessInfo> this.processes.get(id);
        if (!processInfo) {
            processInfo = this.create(id, cmd, cwd);
            this.processes.set(id, processInfo);
        }
        this.connectSocket(ws, processInfo);
        return processInfo;
    }

    public disconnectSocket(ws: WebSocket) {
        this.processes.forEach(ptyProcessInfo => {
            const index = ptyProcessInfo.sockets.indexOf(ws);
            if (index >= 0) {
                ptyProcessInfo.sockets.splice(index, 1);
                switch (this.options.shutdown) {
                    case 'IMMEDIATELY':
                        this.terminatePty(ptyProcessInfo);
                        break;
                    case 'DELAY':
                        (<any>ptyProcessInfo).terminationTimer = setTimeout(() => this.terminatePty(ptyProcessInfo), this.options.shutdownDelay * 1000);
                        break;
                }
            }
        });
    }

    public get(id: string) {
        return this.processes.get(id);
    }

}


const ARG_PORT_PREFIX = '--server.port=';
const ARG_PTY_SHUTDOWN = '--terminal.pty.shutdown=';
const ARG_PTY_SHUTDOWN_DELAY = '--terminal.pty.shutdown-delay=';
const ARG_APP_AUTO_SHUTDOWN = '--terminal.auto-shutdown.on=';
const ARG_APP_AUTO_SHUTDOWN_DELAY = '--terminal.auto-shutdown.delay=';

const ptyProperties: PtyProperties = {
    shutdown: 'NEVER',
    shutdownDelay: 60
};

const shutdownProperties: ShutdownProperties = {
    on: false,
    delay: 60
};

let cliPort = '';

for (let i = 0; i < process.argv.length; i++) {
    const value = process.argv[i];
    if (value.startsWith(ARG_PORT_PREFIX)) {
        cliPort = value.substr(ARG_PORT_PREFIX.length);
    } else if (value.startsWith(ARG_PTY_SHUTDOWN)) {
        (<any>ptyProperties).shutdown = value.substr(ARG_PTY_SHUTDOWN.length).toUpperCase();
    } else if (value.startsWith(ARG_PTY_SHUTDOWN_DELAY)) {
        ptyProperties.shutdownDelay = parseInt(value.substr(ARG_PTY_SHUTDOWN_DELAY.length));
    } else if (value.startsWith(ARG_APP_AUTO_SHUTDOWN)) {
        shutdownProperties.on = 'true' === value.substr(ARG_APP_AUTO_SHUTDOWN.length).toLowerCase();
    } else if (value.startsWith(ARG_APP_AUTO_SHUTDOWN_DELAY)) {
        shutdownProperties.delay = parseInt(value.substr(ARG_APP_AUTO_SHUTDOWN_DELAY.length));
    }
}

console.info('shutdown props: ' + JSON.stringify(shutdownProperties, null, 2));
console.info('pty props: ' + JSON.stringify(ptyProperties, null, 2));

const app = express();

const PORT = cliPort || process.env.TERMINAL_PORT || 3001;

//initialize a simple http server
const server = app.listen(PORT, function() { console.log(`Express server currently running on port ${PORT}`); });

//initialize the WebSocket server instance
const wss = new WebSocket.Server({ server });

const ptyProcessManager = new PtyProcessManager(ptyProperties);

wss.on('connection', (ws: WebSocket) => {

    ws.on('message', (message: string) => {
        const msg: Message = JSON.parse(message);
        let processInfo: PtyProcessInfo | undefined;
        switch (msg.type) {
            case 'init':
                processInfo = ptyProcessManager.createOrConnect(ws, msg.id, msg.cmd, msg.cwd);
                ws.send(JSON.stringify({
                    type: 'data',
                    id: msg.id,
                    data: processInfo.buffer.join('')
                }));
                break;
            case 'data':
                processInfo = ptyProcessManager.get(msg.id);
                if (processInfo) {
                    processInfo.pty.write(msg.data);
                }
                break;
            case 'size':
                processInfo = ptyProcessManager.get(msg.id);
                if (processInfo) {
                    processInfo.pty.resize(msg.size.cols, msg.size.rows);
                }
                break;
            default:
            // Else it is a ping message with is just empty object {}
            // Sent periodically from the client to keep the WS opened
        }
    });

    ws.on('close', () => {
        ptyProcessManager.disconnectSocket(ws);
    });

    ws.on('error', () => {
        ptyProcessManager.disconnectSocket(ws);
    });

});

function stopApp() {
    ptyProcessManager.destroy();
    server.close();
    process.exit();
}

if (shutdownProperties.on) {
    let timeMark = new Date().getTime();
    const delay = 1000 * shutdownProperties.delay;
    const period = delay * 1000 < PREFERRED_CHECK_PERIOD ? 1000 : PREFERRED_CHECK_PERIOD;
    setInterval(() => {
        const current = new Date().getTime();
        if (ptyProcessManager.isEmpty()) {
            if (current - timeMark > delay ) {
                console.info("Auto shutting down due to no activity...");
                stopApp();
            }
        } else {
            timeMark = current;
        }
    }, period);
}

app.use('/xterm.css', express.static(path.join(__dirname, './xterm.css')));

app.use('/terminal-client-bundled.js', express.static(path.join(__dirname, './terminal-client-bundled.js')));

app.get('/', (req, res) => {
   res.send("Xterm is UP");
});

app.post('/shutdown', (req, res) => {
    res.status(200).send();
    stopApp();
});

app.get('/terminal/:id', (req, res) => {

    const options: any = {
        id: req.params.id,
        cmd: (<string>req.query.cmd || (process.platform.startsWith('win') ? 'cmd.exe' : 'bash')).split(/\s+/),
        cwd: req.query.cwd,
        theme: {
            background: req.query.bg,
            foreground: req.query.fg,
            selection: req.query.selection,
            cursor: req.query.cursor,
            cursorAccent: req.query.cursorAccent,
            fontFamily: req.query.fontFamily,
        }
    };


    if (req.query.fontSize) {
        options.theme.fontSize = parseInt(<string>req.query.fontSize);
    }

    res.sendFile(path.join(__dirname, 'terminal.html'));
    // res.render('terminal', {
    //     options: JSON.stringify(options)
    // });
});

