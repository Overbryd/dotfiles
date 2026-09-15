import Foundation
import NetworkExtension

private let programName = "wg-tunnel"
private let wireGuardProvider = ProcessInfo.processInfo.environment["WG_TUNNEL_PROVIDER_BUNDLE_ID"]
    ?? "com.wireguard.macos.network-extension"
private let timeoutSeconds = Double(ProcessInfo.processInfo.environment["WG_TUNNEL_TIMEOUT_SECONDS"] ?? "15") ?? 15

private func usage() {
    print("""
    Usage:
      wg-tunnel list
      wg-tunnel show <tunnel>
      wg-tunnel status <tunnel>
      wg-tunnel is-connected <tunnel>
      wg-tunnel start <tunnel>
      wg-tunnel stop <tunnel>

    Control official WireGuard tunnels through macOS NetworkExtension.
    """)
}

private func fail(_ message: String, code: Int32 = 1) -> Never {
    FileHandle.standardError.write("\(programName): \(message)\n".data(using: .utf8)!)
    exit(code)
}

private func statusName(_ status: NEVPNStatus) -> String {
    switch status {
    case .invalid: return "invalid"
    case .disconnected: return "disconnected"
    case .connecting: return "connecting"
    case .connected: return "connected"
    case .reasserting: return "reasserting"
    case .disconnecting: return "disconnecting"
    @unknown default: return "unknown"
    }
}

private func isWireGuard(_ manager: NETunnelProviderManager) -> Bool {
    guard let configuration = manager.protocolConfiguration as? NETunnelProviderProtocol else {
        return false
    }
    return configuration.providerBundleIdentifier == wireGuardProvider
}

private final class CommandRunner {
    let command: String
    let tunnelName: String?

    init(command: String, tunnelName: String?) {
        self.command = command
        self.tunnelName = tunnelName
    }

    func run() {
        NETunnelProviderManager.loadAllFromPreferences { managers, error in
            if let error = error {
                fail("cannot load VPN configurations: \(error.localizedDescription)")
            }

            let tunnels = (managers ?? [])
                .filter(isWireGuard)
                .sorted { ($0.localizedDescription ?? "") < ($1.localizedDescription ?? "") }

            if self.command == "list" {
                for tunnel in tunnels {
                    print("\(statusName(tunnel.connection.status))\t\(tunnel.localizedDescription ?? "<unnamed>")")
                }
                exit(0)
            }

            guard let name = self.tunnelName,
                  let tunnel = tunnels.first(where: { $0.localizedDescription == name }) else {
                fail("no such WireGuard tunnel: \(self.tunnelName ?? "<missing>")")
            }

            self.run(command: self.command, on: tunnel)
        }
    }

    private func run(command: String, on tunnel: NETunnelProviderManager) {
        switch command {
        case "show":
            print("name: \(tunnel.localizedDescription ?? "<unnamed>")")
            print("provider: \(wireGuardProvider)")
            print("status: \(statusName(tunnel.connection.status))")
            print("enabled: \(tunnel.isEnabled)")
            print("on-demand: \(tunnel.isOnDemandEnabled)")
            exit(0)

        case "status":
            print(statusName(tunnel.connection.status))
            exit(0)

        case "is-connected":
            let status = tunnel.connection.status
            print(statusName(status))
            exit(status == .connected ? 0 : 1)

        case "start":
            start(tunnel)

        case "stop":
            stop(tunnel)

        default:
            fail("unknown command: \(command)", code: 64)
        }
    }

    private func start(_ tunnel: NETunnelProviderManager) {
        switch tunnel.connection.status {
        case .connected, .connecting, .reasserting:
            print(statusName(tunnel.connection.status))
            exit(0)
        default:
            break
        }

        if tunnel.isEnabled {
            startEnabled(tunnel)
            return
        }

        tunnel.isEnabled = true
        tunnel.saveToPreferences { error in
            if let error = error {
                fail("cannot enable tunnel '\(self.tunnelName!)': \(error.localizedDescription)")
            }
            tunnel.loadFromPreferences { error in
                if let error = error {
                    fail("cannot reload tunnel '\(self.tunnelName!)': \(error.localizedDescription)")
                }
                self.startEnabled(tunnel)
            }
        }
    }

    private func startEnabled(_ tunnel: NETunnelProviderManager) {
        guard let session = tunnel.connection as? NETunnelProviderSession else {
            fail("tunnel '\(tunnelName!)' has no provider session")
        }

        do {
            try session.startTunnel(options: nil)
        } catch {
            fail("cannot start tunnel '\(tunnelName!)': \(error.localizedDescription)")
        }

        waitFor(tunnel, desired: [.connected], operation: "connect")
    }

    private func stop(_ tunnel: NETunnelProviderManager) {
        switch tunnel.connection.status {
        case .invalid, .disconnected:
            print("disconnected")
            exit(0)
        default:
            tunnel.connection.stopVPNTunnel()
            waitFor(tunnel, desired: [.invalid, .disconnected], operation: "disconnect")
        }
    }

    private func waitFor(
        _ tunnel: NETunnelProviderManager,
        desired: Set<NEVPNStatus>,
        operation: String,
        remainingAttempts: Int? = nil
    ) {
        let attempts = remainingAttempts ?? max(1, Int(timeoutSeconds * 4))
        let status = tunnel.connection.status

        if desired.contains(status) {
            print(statusName(status))
            exit(0)
        }

        if attempts <= 1 {
            fail("tunnel '\(tunnelName!)' did not \(operation); status is \(statusName(status))")
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            self.waitFor(
                tunnel,
                desired: desired,
                operation: operation,
                remainingAttempts: attempts - 1
            )
        }
    }
}

let arguments = Array(CommandLine.arguments.dropFirst())
guard let command = arguments.first else {
    usage()
    exit(64)
}

if ["help", "-h", "--help"].contains(command) {
    usage()
    exit(0)
}

let needsTunnelName = command != "list"
let validCommands = ["list", "show", "status", "is-connected", "start", "stop"]
guard validCommands.contains(command),
      (needsTunnelName ? arguments.count == 2 : arguments.count == 1) else {
    usage()
    exit(64)
}

DispatchQueue.global().asyncAfter(deadline: .now() + timeoutSeconds + 10) {
    fail("operation timed out")
}

CommandRunner(command: command, tunnelName: needsTunnelName ? arguments[1] : nil).run()
dispatchMain()
