// Copyleft (ɔ) 2025, Charlie Yang. All lefts reserved.

class Shell {
    constructor() {
        this.term = new Terminal({cursorBlink: true, fontSize: 24, theme: {background: '#1e1e2e', foreground: '#cdd6f4'}});
        this.fitAddon = new FitAddon.FitAddon();
        this.cwd = '[0x0c5cbae8 ~]$ ';
        this.buffer = '';
        this.cursor = 0;
        this.promptMarker = 0;
        this.history = [''];
        this.historyIndex = 0;

        this.term.loadAddon(this.fitAddon);
        this.term.open(document.getElementById('terminal'));
        this.fitAddon.fit();
        this.term.onData(data => {
            data = data.replace(/\r\n/g, '\r').replace(/\n/g, '\r');
            const lines = data.split(/(\r)/);
            lines.forEach(line => this.handleInput(line));
        });
        this.term.write(this.cwd);
    }

    setCursorPosition(pos) {
        pos += this.cwd.length;
        const offset = this.promptMarker - this.term.buffer.active.viewportY;
        const y = Math.floor(pos / this.term.cols) + offset;
        const x = pos % this.term.cols;
        if (y==this.term.rows) {
            return`\x1b[${y};${x + 1}H\n`;
        }
        return `\x1b[${y + 1};${x + 1}H`;
    }

    rewriteLine(len) {
        let output = this.setCursorPosition(-this.cwd.length);
        const numLines = Math.ceil((this.cwd.length + len) / this.term.cols);
        for (let i = 0; i < numLines; i++) {
            output += '\x1b[2K';
            if (i < numLines - 1) output += '\n';
        }
        output += this.setCursorPosition(-this.cwd.length) + this.cwd + this.buffer;
        output += this.setCursorPosition(this.cursor);
        return output;
    }

    handleReturnKey() {
        if(this.buffer.trim() !== '') {
            this.history[this.history.length-1] = this.buffer;
            this.historyIndex = this.history.length;
            this.history.push('');
        }
        let output = this.setCursorPosition(this.buffer.length - 1) + '\r\n';
        output += this.runCommand(this.buffer);
        output += this.cwd;
        let newMarker = this.promptMarker;
        newMarker += (output.match(/\n/g)||[]).length;
        const lines = output.split('\r\n');
        newMarker += Math.ceil((this.cwd.length + this.buffer.length) / this.term.cols) - 1;
        for (let i = 0; i < lines.length; i++) {
            newMarker += Math.max(0, Math.ceil(lines[i].length / this.term.cols)-1);
        }
        this.buffer = '';
        this.cursor = 0;
        this.promptMarker = newMarker;
        this.term.write(output, () => {
            this.promptMarker = this.term.buffer.active.cursorY+this.term.buffer.active.viewportY;
        });
    }

    handleLeftKey() {
        if (this.cursor > 0) {
            this.cursor--;
            this.term.write('\x1b[D');
        }
    }

    handleRightKey() {
        if (this.cursor < this.buffer.length) {
            this.cursor++;
            this.term.write('\x1b[C');
        }
    }

    handleUpKey() {
        if (this.historyIndex === this.history.length - 1) {
            this.history[this.historyIndex] = this.buffer;
        }
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.buffer = this.history[this.historyIndex];
            this.cursor = this.buffer.length;
            this.term.write(this.rewriteLine());
        }
    }

    handleDownKey() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.buffer = this.history[this.historyIndex];
            this.cursor = this.buffer.length;
            this.term.write(this.rewriteLine());
        } 
    }

    handleBackspaceKey() {
        if(this.cursor===0) { return; }
        this.buffer = this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor);
        this.cursor--;
        this.term.write(this.rewriteLine(this.buffer.length + 1));
    }

    cleanString(str) {
        return str
            // Remove non-printable ASCII characters (\x00–\x1F, \x7F)
            .replace(/[\x00-\x1F\x7F]/g, '')
            // Replace non-ASCII characters (\x80 and above) with '?'
            .replace(/[^\x00-\x7F]/g, '?');
    }

    handleInput(data) {
        if (data === '') { return; }
        console.log([data]);
        if (data === '\r') { // ENTER
            this.handleReturnKey();
            return;
        }
        if (data === '\x1b[D') { // LEFT
            this.handleLeftKey();
            return;
        }
        if (data === '\x1b[C') { // RIGHT
            this.handleRightKey();
            return;
        }
        if (data === '\x1b[A') { // UP
            this.handleUpKey();
            return;
        }
        if (data === '\x1b[B') { // DOWN
            this.handleDownKey();
            return;
        }
        if (data === '\x7f') { // BACKSPACE
            this.handleBackspaceKey();
            return;
        }
        data = this.cleanString(data);
        this.buffer = this.buffer.slice(0, this.cursor) + data + this.buffer.slice(this.cursor);
        this.cursor += data.length;
        this.term.write(this.rewriteLine());
    }

    runCommand(cmd) {
        cmd = cmd.trim();
        if(cmd==='clear'){
            return '\x1b[2J\x1b[0;0H';
        }
        return `${cmd}: command not found\r\n`;
    }
}

const shell = new Shell();
