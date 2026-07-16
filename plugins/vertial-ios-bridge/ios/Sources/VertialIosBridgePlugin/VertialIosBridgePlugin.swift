import Foundation
import Capacitor
import UIKit
import Network

/**
 * Bridge nativo Vertial:
 * - openAppSettings: abre Ajustes → Vertial (UIApplication.openSettingsURLString)
 * - requestLocalNetworkAccess: Bonjour + TCP LAN para forzar el popup / toggle «Red local»
 */
@objc(VertialIosBridgePlugin)
public class VertialIosBridgePlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "VertialIosBridgePlugin"
  public let jsName = "VertialIosBridge"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "requestLocalNetworkAccess", returnType: CAPPluginReturnPromise),
  ]

  private var browsers: [NWBrowser] = []
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

      // Tipos alineados con NSBonjourServices del Info.plist (disparan el permiso).
      let bonjourTypes = [
        "_pdl-datastream._tcp",
        "_printer._tcp",
        "_epos._tcp",
        "_jetdirect._tcp",
        "_ipp._tcp",
      ]

      for type in bonjourTypes {
        let params = NWParameters()
        params.includePeerToPeer = true
        let browser = NWBrowser(for: .bonjour(type: type, domain: "local."), using: params)
        browser.stateUpdateHandler = { _, _, _ in }
        browser.browseResultsChangedHandler = { _, _ in }
        browser.start(queue: .main)
        self.browsers.append(browser)
      }

      // TCP a IPs privadas: refuerza el prompt de red local en iPadOS.
      let probeHosts = ["192.168.1.1", "192.168.0.1", "10.0.0.1", "172.16.0.1"]
      for host in probeHosts {
        guard let port = NWEndpoint.Port(rawValue: 9100) else { continue }
        let connection = NWConnection(host: NWEndpoint.Host(host), port: port, using: .tcp)
        connection.stateUpdateHandler = { _ in }
        connection.start(queue: .main)
        self.connections.append(connection)
      }

      DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
        self?.cancelProbes()
        call.resolve(["triggered": true])
      }
    }
  }

  private func cancelProbes() {
    browsers.forEach { $0.cancel() }
    browsers.removeAll()
    connections.forEach { $0.cancel() }
    connections.removeAll()
  }
}
