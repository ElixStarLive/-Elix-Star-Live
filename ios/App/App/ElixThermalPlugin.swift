import Foundation
import Capacitor

/**
 * iOS ProcessInfo.thermalState → Elix Live quality tiers.
 */
@objc(ElixThermalPlugin)
public class ElixThermalPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "ElixThermalPlugin"
  public let jsName = "ElixThermal"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "getThermalState", returnType: CAPPluginReturnPromise)
  ]

  private var observer: NSObjectProtocol?

  public override func load() {
    observer = NotificationCenter.default.addObserver(
      forName: ProcessInfo.thermalStateDidChangeNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      guard let self = self else { return }
      let payload = self.currentPayload()
      self.notifyListeners("thermalStateChange", data: payload)
    }
  }

  deinit {
    if let observer = observer {
      NotificationCenter.default.removeObserver(observer)
    }
  }

  @objc func getThermalState(_ call: CAPPluginCall) {
    call.resolve(currentPayload())
  }

  private func currentPayload() -> [String: Any] {
    let state = ProcessInfo.processInfo.thermalState
    return [
      "tier": tier(from: state),
      "raw": raw(from: state)
    ]
  }

  private func tier(from state: ProcessInfo.ThermalState) -> String {
    switch state {
    case .nominal: return "nominal"
    case .fair: return "fair"
    case .serious: return "serious"
    case .critical: return "critical"
    @unknown default: return "nominal"
    }
  }

  private func raw(from state: ProcessInfo.ThermalState) -> String {
    switch state {
    case .nominal: return "nominal"
    case .fair: return "fair"
    case .serious: return "serious"
    case .critical: return "critical"
    @unknown default: return "unknown"
    }
  }
}
