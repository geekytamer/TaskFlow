# The assistant's model on the owner's Mac

Production (the Hostinger VPS) runs the assistant. The model (Ollama, `qwen3:8b`) runs on the owner's Mac.

The link is an outgoing SSH tunnel from the Mac:

- The Mac's `127.0.0.1:11434` shows up as `127.0.0.1:11434` on the server, on loopback only, because sshd there has `GatewayPorts no`.
- The production backend uses `AI_BASE_URL=http://127.0.0.1:11434/v1`.
- Nothing on the Mac is opened to the network, and the traffic is encrypted by SSH.

## Keep it running (install once)

```bash
cp deploy/ai-tunnel/com.alyarubi.taskflow-ai-tunnel.plist ~/Library/LaunchAgents/ && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.alyarubi.taskflow-ai-tunnel.plist
```

This needs:

- **Ollama** running, with `qwen3:8b` pulled.
- **The `hostinger` SSH alias** working without a prompt.
- **The Mac awake and online:** for example, System Settings → Battery → Options → "Prevent automatic sleeping on power adapter when the display is off".

When the Mac sleeps or is offline, the assistant answers "offline" and the rest of TaskFlow is unaffected.

## Check

```bash
ssh hostinger 'curl -s http://127.0.0.1:11434/v1/models'
```

## Remove

```bash
launchctl bootout gui/$(id -u)/com.alyarubi.taskflow-ai-tunnel; rm ~/Library/LaunchAgents/com.alyarubi.taskflow-ai-tunnel.plist
```
