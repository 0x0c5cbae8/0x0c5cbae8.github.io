// Copyleft (ɔ) 2025, Charlie Yang. All lefts reserved.

class IO {
    constructor() {
        this.term = new Terminal({cursorBlink: true, fontSize: 24, theme: {background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#cdd6f4'}});
        this.fitAddon = new FitAddon.FitAddon();
        this.buffer = '';
        this.cursor = 0;
        this.cursorOffset = {x: 0, y: 0};
        this.history = [''];
        this.historyIndex = 0;
        this.saveHistory = false;
        this.inputResolver = null;
        this.rejecter = null;
        this.rejected = false;

        this.term.loadAddon(this.fitAddon);
        this.term.open(document.getElementById('terminal'));
        this.fitAddon.fit();
        this.term.onData(data => {
            this.handleInput(data);
        });
    }

    async print(output) {
        return new Promise((resolve, reject) => {
            if (this.rejected) {
                this.rejected = false;
                reject(new Error('killed'));
                return;
            }
            this.term.write(output, () => {
                this.setCursorOffset();
                resolve();
            });
        });
    }

    async readLine(saveHistory = false) {
        return new Promise((resolve, reject) => {
            if (this.rejected) {
                this.rejected = false;
                reject(new Error('killed'));
                return;
            }
            this.term.write('\x1b[?25h', () => {
                this.saveHistory = saveHistory;
                this.inputResolver = resolve;
                this.rejecter = reject;
            });
        });
    }

    async sleep(ms) {
        return new Promise((resolve, reject) => {
            if (this.rejected) {
                this.rejected = false;
                reject(new Error('killed'));
                return;
            }
            this.rejecter = reject;
            setTimeout(() => {
                this.rejecter = null;
                resolve();
            }, ms);
        });
    }

    setCursorOffset() {
        let y = this.term.buffer.active.cursorY + this.term.buffer.active.viewportY;
        let x = this.term.buffer.active.cursorX;
        if (x >= this.term.cols) {
            y++;
            x = 0;
        }
        this.cursorOffset = {x: x, y: y};
    }

    setCursorPosition(pos) {
        let y = this.cursorOffset.y;
        let x = this.cursorOffset.x + pos;
        y += Math.floor(x / this.term.cols);
        x = x % this.term.cols;
        y -= this.term.buffer.active.viewportY;

        if (y==this.term.rows) {
            return`\x1b[${y};${x + 1}H\n`;
        }
        return `\x1b[${y + 1};${x + 1}H`;
    }

    rewriteInput() {
        let output = this.setCursorPosition(0);
        output += '\x1b[0J';
        output += this.buffer;
        output += this.setCursorPosition(this.cursor);
        return output;
    }

    handleReturnKey() {
        if(this.buffer.trim() !== '' && this.saveHistory) {
            this.history[this.history.length-1] = this.buffer;
            this.historyIndex = this.history.length;
            this.history.push('');
        }
        return this.setCursorPosition(Math.max(0, this.buffer.length - 1)) + '\r\n';
    }

    handleLeftKey() {
        if (this.cursor > 0) {
            this.cursor--;
            return this.setCursorPosition(this.cursor);
        }
        return '';
    }

    handleRightKey() {
        if (this.cursor < this.buffer.length) {
            this.cursor++;
            return this.setCursorPosition(this.cursor);
        }
        return '';
    }

    handleUpKey() {
        if (!this.saveHistory) {
            return '';
        }
        if (this.historyIndex === this.history.length - 1) {
            this.history[this.historyIndex] = this.buffer;
        }
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.buffer = this.history[this.historyIndex];
            this.cursor = this.buffer.length;
            return this.rewriteInput();
        }
        return '';
    }

    handleDownKey() {
        if (!this.saveHistory) {
            return '';
        }
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.buffer = this.history[this.historyIndex];
            this.cursor = this.buffer.length;
            return this.rewriteInput();
        } 
        return '';
    }

    handleBackspaceKey() {
        if(this.cursor===0) { return ''; }
        this.buffer = this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor);
        this.cursor--;
        return this.rewriteInput();
    }

    cleanString(str) {
        return str
            // Remove non-printable ASCII characters (\x00–\x1F, \x7F)
            .replace(/[\x00-\x1F\x7F]/g, '')
            // Replace non-ASCII characters (\x80 and above) with '?'
            .replace(/[^\x00-\x7F]/g, '?');
    }

    handleInput(data) {
        data = data.replace(/\r\n/g, '\r').replace(/\n/g, '\r');
        console.log([data]);
        if (data === '\x03') { // CTRL+C
            this.rejected = true;
            if (this.rejecter) {
                this.rejecter(new Error('killed'));
                this.inputResolver = null;
                this.rejecter = null;
                this.rejected = false;
            }
        }
        if (!this.inputResolver) {
            return;
        }
        if (data === '\r') { // ENTER
            this.term.write(this.handleReturnKey()+'\x1b[?25l', () => {
                this.setCursorOffset();
                if (this.inputResolver) {
                    this.inputResolver(this.buffer);
                    this.inputResolver = null;
                    this.rejecter = null;
                }
                this.buffer = '';
                this.cursor = 0;
            });
            return;
        }
        if (data === '\x1b[D') { // LEFT
            this.term.write(this.handleLeftKey());
        }
        else if (data === '\x1b[C') { // RIGHT
            this.term.write(this.handleRightKey());
        }
        else if (data === '\x1b[A') { // UP
            this.term.write(this.handleUpKey());
        }
        else if (data === '\x1b[B') { // DOWN
            this.term.write(this.handleDownKey());
        }
        else if (data === '\x7f') { // BACKSPACE
            this.term.write(this.handleBackspaceKey());
        }
        else{
            data = this.cleanString(data);
            if (data.length !== 1) { return; }
            this.buffer = this.buffer.slice(0, this.cursor) + data + this.buffer.slice(this.cursor);
            this.cursor += data.length;
            this.term.write(this.rewriteInput());
        }
    }
}

class Shell {
    constructor() {
        this.io = new IO();
        this.cwd = '[0x0c5cbae8 ~]$ ';
        this.io.print(this.cwd);
    }

    async run() {
        while (true) {
            try {
                const input = await this.io.readLine(true);
                await this.runCommand(input);
            } catch {
                await this.io.print('\r\n');
            }
            await this.io.print(this.cwd);
        }
    }

    async runCommand(cmd) {
        cmd = cmd.trim();
        if (cmd === '') {
            await this.io.print('');
            return;
        }
        if (cmd === 'clear') {
            this.io.term.clear();
            return;
        }
        if (cmd === 'test') {
            await this.io.print('Test command executed successfully.\r\n');
            const input = await this.io.readLine();
            await this.io.sleep(1000);
            await this.io.print(`You entered: ${input}\r\n`);
            await this.io.print('Test command executed successfully.\r\n');
            return;
        }
        if(cmd === 'test2') {
            while(true) {
                await this.io.print("yes\r\n");
            }
        }
        await this.io.print(`${cmd}: command not found\r\n`);
    }
}

const shell = new Shell();
shell.run();
