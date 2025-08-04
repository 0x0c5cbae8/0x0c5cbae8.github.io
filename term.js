// Copyleft (ɔ) 2025, Charlie Yang. All lefts reserved.

class IO {
    constructor() {
        this.term = new Terminal({cursorBlink: true, fontSize: 24, theme: {background: "#1e1e2e", foreground: "#cdd6f4", cursor: "#cdd6f4"}});
        this.fitAddon = new FitAddon.FitAddon();
        this.buffer = "";
        this.cursor = 0;
        this.cursorOffset = {x: 0, y: 0};
        this.history = [""];
        this.historyIndex = 0;
        this.saveHistory = false;
        this.hideInput = false;
        this.inputResolver = null;
        this.rejecter = null;
        this.rejected = false;

        this.term.loadAddon(this.fitAddon);
        this.term.open(document.getElementById("terminal"));
        this.fitAddon.fit();
        this.term.onData(data => this.handleInput(data));
    }

    async print(output) {
        return new Promise((resolve, reject) => {
            if (this.rejected) {
                this.rejected = false;
                reject(new Error("killed"));
                return;
            }
            this.term.write(output, () => {
                this.setCursorOffset();
                this.buffer = "";
                this.cursor = 0;
                resolve();
            });
        });
    }

    async readLine({saveHistory = false, hideInput = false} = {}) {
        return new Promise((resolve, reject) => {
            if (this.rejected) {
                this.rejected = false;
                reject(new Error("killed"));
                return;
            }
            this.term.write(this.setCursorPosition(0)+"\x1b[?25h", () => {
                this.saveHistory = saveHistory;
                this.hideInput = hideInput;
                this.inputResolver = resolve;
                this.rejecter = reject;
            });
        });
    }

    async sleep(ms) {
        return new Promise((resolve, reject) => {
            if (this.rejected) {
                this.rejected = false;
                reject(new Error("killed"));
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
        output += "\x1b[0J";
        if (this.hideInput) {
            output += this.buffer.replace(/./g, "*");
        } else {
            output += this.buffer;
        }
        output += this.setCursorPosition(this.cursor);
        return output;
    }

    handleReturnKey() {
        if(this.buffer.trim() !== "" && this.saveHistory) {
            this.history[this.history.length-1] = this.buffer;
            this.historyIndex = this.history.length;
            this.history.push("");
        }
        return this.setCursorPosition(Math.max(0, this.buffer.length - 1)) + "\r\n";
    }

    handleLeftKey() {
        if (this.cursor > 0) {
            this.cursor--;
            return this.setCursorPosition(this.cursor);
        }
        return "";
    }

    handleRightKey() {
        if (this.cursor < this.buffer.length) {
            this.cursor++;
            return this.setCursorPosition(this.cursor);
        }
        return "";
    }

    handleUpKey() {
        if (!this.saveHistory) {
            return "";
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
        return "";
    }

    handleDownKey() {
        if (!this.saveHistory) {
            return "";
        }
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.buffer = this.history[this.historyIndex];
            this.cursor = this.buffer.length;
            return this.rewriteInput();
        } 
        return "";
    }

    handleBackspaceKey() {
        if(this.cursor===0) { return ""; }
        this.buffer = this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor);
        this.cursor--;
        return this.rewriteInput();
    }

    cleanString(str) {
        return str
            // Remove non-printable ASCII characters (\x00–\x1F, \x7F)
            .replace(/[\x00-\x1F\x7F]/g, "")
            // Replace non-ASCII characters (\x80 and above) with "?"
            .replace(/[^\x00-\x7F]/g, "?");
    }

    handleInput(data) {
        data = data.replace(/\r\n/g, "\r").replace(/\n/g, "\r");
        console.log([data]);
        if (data === "\x03") { // CTRL+C
            this.rejected = true;
            if (this.rejecter) {
                this.rejecter(new Error("killed"));
                this.inputResolver = null;
                this.rejecter = null;
                this.rejected = false;
            }
        }
        if (!this.inputResolver) {
            return;
        }
        if (data === "\r") { // ENTER
            this.term.write(this.handleReturnKey()+"\x1b[?25l", () => {
                if (this.inputResolver) {
                    this.inputResolver(this.buffer);
                    this.inputResolver = null;
                    this.rejecter = null;
                }
                this.setCursorOffset();
                this.buffer = "";
                this.cursor = 0;
            });
            return;
        }
        if (data === "\x1b[D") { // LEFT
            this.term.write(this.handleLeftKey());
        }
        else if (data === "\x1b[C") { // RIGHT
            this.term.write(this.handleRightKey());
        }
        else if (data === "\x1b[A") { // UP
            this.term.write(this.handleUpKey());
        }
        else if (data === "\x1b[B") { // DOWN
            this.term.write(this.handleDownKey());
        }
        else if (data === "\x7f") { // BACKSPACE
            this.term.write(this.handleBackspaceKey());
        }
        else if (data === "\x1b") {
            this.term.blur();
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
        this.cwd = "[0x0c5cbae8 ~]$ ";
        this.commands = { // PLEASE KEEP COMMANDS IN ALPHABETICAL ORDER
            clear: async () => this.io.term.clear(),

            echo: async (...args) => {
                const output = args.join(" ");
                await this.io.print(output + "\r\n");
            },

            emacs: async () => {
                await this.io.print("emacs: command not found. Did you mean 'vim'?\r\n");
            },

            exit: async () => {
                for (let i = 0; true; i++) {
                    let output = "Are you ";
                    for (let j = 0; j < i; j++) output += "REALLY ";
                    output += "sure you want to exit? (y/N) ";
                    await this.io.print(output);
                    const response = await this.io.readLine();
                    if (response.trim().toLowerCase() !== "y") {
                        await this.io.print("Exit cancelled.\r\n");
                        return;
                    }
                }
            },

            hello: async (...args) => {
                if (args.length > 0) {
                    const output = "Hello " + args.join(" ") + " to you too!\r\n";
                    await this.io.print(output);
                    return;
                }
                await this.io.print("Hi! What is your name?\r\nResponse: ");
                let name = await this.io.readLine();
                name = name.trim();
                if (name === "") {
                    await this.io.print("You didn't tell me your name, so I will call you 'Anonymous'.\r\n");
                    name = "Anonymous";
                }
                await this.io.print(`Hello, ${name}!\r\n`);
            },

            help: async (...args) => {
                if (args.length === 0) {
                    await this.io.print("Available commands:\r\n");
                    for (const cmd in this.commands) {
                        if (this.commands[cmd].help === "[HIDDEN]") continue;
                        await this.io.print(`- ${cmd}\r\n`);
                    }
                    await this.io.print("Type 'help [command]' for more information on a specific command.\r\n");
                } else if (args.length === 1) {
                    const cmdName = args[0];
                    const command = this.commands[cmdName];
                    if (command && command.help !== "[HIDDEN]") {
                        if (!command.help) {
                            await this.io.print(`idk what this command does...\r\njust type '${cmdName}' and see what happens i guess\r\n`);
                        } else {
                            await this.io.print(command.help + "\r\n");
                        }
                    } else {
                        await this.io.print("help is not available for this command.\r\n");
                    }
                }
            },

            neofetch: async () => {
                const output =
                    "\x1b[92m     .                            Charlie Yang\x1b[0m\r\n" +
                    "\x1b[92m .#@##%@+.                        \x1b[0m------------\r\n" +
                    "\x1b[92m:@+.   .@%:                       OS\x1b[0m: 0x0c5cbae8 OS\r\n" +
                    "\x1b[92m-@:     *@@=                      Host\x1b[0m: github.io\r\n" +
                    "\x1b[92m.#@-. .+@=:%#.                    Kernel\x1b[0m: corn\r\n" +
                    "\x1b[92m  :+@@%=.  .+@=                   Uptime\x1b[0m: 18yrs\r\n" +
                    "\x1b[92m       ......-@+........          Shell\x1b[0m: shush\r\n" +
                    "\x1b[92m      .+#######%@%######-         CPU\x1b[0m: Human(R) brain(TM)\r\n" +
                    "\x1b[92m                =@=      ..       GPU\x1b[0m: Human(R) brain(TM) [Integrated]\r\n" +
                    "\x1b[92m                 :%#. :@@#+%@+    Memory\x1b[0m: Healthy, no Alzheimer's\r\n" +
                    "\x1b[92m                  .*@+@=    :%#   Locale\x1b[0m: International\r\n" +
                    "\x1b[92m                    -@@.     #@   \x1b[0m\r\n" +
                    "\x1b[92m                     .#@-..:*@:   \x1b[30m██\x1b[31m██\x1b[32m██\x1b[33m██\x1b[34m██\x1b[35m██\x1b[36m██\x1b[37m██\x1b[0m\r\n" +
                    "\x1b[92m                       :+##*-.    \x1b[90m██\x1b[91m██\x1b[92m██\x1b[93m██\x1b[94m██\x1b[95m██\x1b[96m██\x1b[97m██\x1b[0m\r\n";
                await this.io.print(output);
            },

            no: async () => {
                await this.io.print("no u\r\n");
            },

            nvim: async () => {
                await this.io.print("nvim: command not found. Did you mean 'emacs'?\r\n");
            },

            sudo: async (...args) => {
                await this.io.print("[sudo] password for user: ");
                const password = await this.io.readLine({hideInput: true});
                if (password === "password" || password === "123456" || password === "0x0c5cbae8") {
                    await this.io.print(`You really thought I would set my password to '${password}'? Try harder next time.\r\n`);
                } else {
                    await this.io.print("Password incorrect, permission denied. This incident will be reported to your mom.\r\n");
                }
            },

            vi: async () => {
                await this.io.print("vi: command not found. Did you mean 'emacs'?\r\n");
            },

            vim: async () => {
                await this.io.print("vim: command not found. Did you mean 'emacs'?\r\n");
            },

            yes: async () => {
                while (true) {
                    await this.io.print("yes\r\n");
                    await this.io.sleep(100);
                }
            }
        }

        this.commands.clear.help = "Clears the terminal screen.";
        this.commands.echo.help = "Usage: echo [...arguments]\r\nEchoes the provided arguments back to the terminal.";
        this.commands.emacs.help = "[HIDDEN]";
        this.commands.exit.help = "Exits the shell.";
        this.commands.help.help = "Usage: 'help' or 'help [command]'\r\nDisplays a list of available commands or detailed information about a specific command.";
        this.commands.nvim.help = "[HIDDEN]";
        this.commands.sudo.help = "Usage: sudo [command] [...arguments]\r\nExecute a command with superuser privileges.\r\nYou will be prompted for a password.";
        this.commands.vi.help = "[HIDDEN]";
        this.commands.vim.help = "[HIDDEN]";
    }

    async run() {
        await this.io.print("Welcome to my personal website!\r\n");
        await this.io.print("Type 'help' to see available commands. Type 'help [command]' for more information on a specific command.\r\n");
        await this.io.print(this.cwd);
        this.io.term.focus();
        while (true) {
            try {
                const input = await this.io.readLine({saveHistory: true});
                await this.runCommand(input);
            } catch {
                await this.io.print("^C\r\n");
            }
            await this.io.print(this.cwd);
        }
    }

    async runCommand(cmd) {
        cmd = cmd.trim();
        if (cmd === "") {
            await this.io.print("");
            return;
        }
        const [cmdName, ...args] = cmd.split(/\s+/);
        const command = this.commands[cmdName];
        if (command) {
            await command(...args);
        } else {
            await this.io.print(`${cmdName}: command not found\r\n`);
        }
    }
}

const shell = new Shell();
shell.run();
