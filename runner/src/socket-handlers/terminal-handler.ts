import { Socket } from "socket.io";
var pty = require("node-pty");

export const handleTerminalConnection = (socket: Socket, ptys: Map<string, any>) => {
  // console.log("Client connected:", socket.id);
  const shell = process.platform === "win32" ? "cmd.exe" : "su";
  const args =
    process.platform === "win32"
      ? []
      : [
          "-",
          "devx",
          "-c",
          `cd /home/devx/workspace && export PS1="devx:\\w\\$ " && export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin" && /bin/bash`,
        ];

  const ptyProcess = pty.spawn(shell, args, {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    env: {
      ...process.env,
      TERM: "xterm-256color",
    },
  });

  ptys.set(socket.id, ptyProcess);

  ptyProcess.onData((data: string) => {
    socket.emit("terminal-output", data);
  });

  socket.on("terminal-input", (input: string) => {
    ptyProcess.write(input);
  });

  socket.on("terminal-request-initial-output", () => {
    // Send a carriage return to trigger the shell to print the prompt
    // ptyProcess.write("\r");
    // ptyProcess.write("\r && clear");
    // ptyProcess.write("\x1b[2J\x1b[H");
    // Or alternatively, you could store the last known terminal state
    // and replay it to new connections
  });

  socket.on("terminal-resize", (size: { cols: number; rows: number }) => {
    ptyProcess.resize(size.cols, size.rows);
  });

  socket.on("disconnect", () => {
    const ptyInstance = ptys.get(socket.id);
    if (ptyInstance) {
      ptyInstance.kill();
      ptys.delete(socket.id);
    }
  });

  ptyProcess.onExit(() => {
    socket.emit("terminal-exit");
    ptys.delete(socket.id);
  });
};
