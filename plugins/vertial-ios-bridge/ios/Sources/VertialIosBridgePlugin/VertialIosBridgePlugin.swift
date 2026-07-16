import Foundation
import Capacitor
import UIKit
import Network

/**
 * Bridge nativo Vertial:
 * - openAppSettings: abre Ajustes → Vertial
 * - requestLocalNetworkAccess: Bonjour (NetServiceBrowser) + TCP para forzar
 *   el popup iOS y que aparezca el interruptor «Red local» en Ajustes.
 */
@objc(VertialIosBridgePlugin)
public class VertialIosBridgePlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "VertialIosBridgePlugin"
  public let jsName = "VertialIosBridge"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "requestLocalNetworkAccess", returnType: CAPPluginReturnPromise),
  ]

  private var bonjourTrigger: BonjourPermissionTrigger?
  private var connections: [NWConnection] = []

  @objc func openAppSettings(_ call: CAPPluginCall) {
    DispatchQueue.main.async {
      guard let url = URL(string: UIApplication.openSettingsURLString) else {
        call.reject("No se pudo resolver la URL de Ajustes")
        return
      }
      UIApplication.shared.open(url, options: [:]) { success in
        if success {
          call.resolve(["opened": true])
        } else {
          call.reject("iOS no abrió Ajustes")
        }
      }
    }
  }

  @objc func requestLocalNetworkAccess(_ call: CAPPluginCall) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else {
        call.resolve(["triggered": false])
        return
      }

      self.cancelProbes()

      // NetServiceBrowser es lo que iOS usa para mostrar el popup «Red local»
      // y crear el interruptor en Ajustes → Vertial (NWBrowser a veces no basta).
      let trigger = BonjourPermissionTrigger()
      self.bonjourTrigger = trigger
      trigger.start(types: [
        "_pdl-datastream._tcp.",
        "_printer._tcp.",
        "_epos._tcp.",
        "_jetdirect._tcp.",
        "_ipp._tcp.",
      ])

      let probeHosts = ["192.168.1.20", "192.168.1.1", "192.168.0.1", "10.0.0.1"]
      for host in probeHosts {
        guard let port = NWEndpoint.Port(rawValue: 9100) else { continue }
        let connection = NWConnection(host: NWEndpoint.Host(host), port: port, using: .tcp)
        connection.stateUpdateHandler = { _ in }
        connection.start(queue: .main)
        self.connections.append(connection)
      }

      DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) { [weak self] in
        self?.cancelProbes()
        call.resolve(["triggered": true])
      }
    }
  }

  private func cancelProbes() {
    bonjourTrigger?.stop()
    bonjourTrigger = nil
    connections.forEach { $0.cancel() }
    connections.removeAll()
  }
}

/// Mantiene vivos los browsers hasta stop(); sin strong ref iOS cancela el browse.
private final class BonjourPermissionTrigger: NSObject, NetServiceBrowserDelegate {
  private var browsers: [NetServiceBrowser] = []

  func start(types: [String]) {
    for type in types {
      let browser = NetServiceBrowser()
      browser.delegate = self
      browsers.append(browser)
      browser.searchForServices(ofType: type, inDomain: "local.")
    }
  }

  func stop() {
    browsers.forEach { $0.stop() }
    browsers.removeAll()
  }

  func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {}
  func netServiceBrowser(_ browser: NetServiceBrowser, didNotSearch errorDict: [String: NSNumber]) {}
  func netServiceBrowserDidStopSearch(_ browser: NetServiceBrowser) {}
}
