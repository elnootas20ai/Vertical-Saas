import Foundation
import Capacitor
import UIKit
import Network

/**
 * Bridge nativo Vertial:
 * - openAppSettings
 * - requestLocalNetworkAccess (Bonjour → popup Red local)
 * - printEscPos / pingHost (impresión TCP 9100 de respaldo)
 */
@objc(VertialIosBridgePlugin)
public class VertialIosBridgePlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "VertialIosBridgePlugin"
  public let jsName = "VertialIosBridge"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "requestLocalNetworkAccess", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "printEscPos", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "pingHost", returnType: CAPPluginReturnPromise),
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

  @objc func printEscPos(_ call: CAPPluginCall) {
    guard let ip = call.getString("ip"), !ip.isEmpty else {
      call.reject("IP obligatoria")
      return
    }
    let port = call.getInt("port") ?? 9100
    guard let base64 = call.getString("message"), let data = Data(base64Encoded: base64) else {
      call.reject("Mensaje ESC/POS inválido")
      return
    }

    TcpEscpos.send(ip: ip, port: port, payload: data, timeoutSeconds: 8) { success in
      if success {
        call.resolve(["status": "printed"])
      } else {
        call.reject("No se pudo enviar a la impresora \(ip)")
      }
    }
  }

  @objc func pingHost(_ call: CAPPluginCall) {
    guard let ip = call.getString("ip"), !ip.isEmpty else {
      call.reject("IP obligatoria")
      return
    }
    let port = call.getInt("port") ?? 9100
    let start = DispatchTime.now()
    TcpEscpos.ping(ip: ip, port: port, timeoutSeconds: 3) { online in
      var body: [String: Any] = ["online": online]
      if online {
        let ms = Double(DispatchTime.now().uptimeNanoseconds - start.uptimeNanoseconds) / 1_000_000.0
        body["rtt"] = ms
      }
      call.resolve(body)
    }
  }

  private func cancelProbes() {
    bonjourTrigger?.stop()
    bonjourTrigger = nil
    connections.forEach { $0.cancel() }
    connections.removeAll()
  }
}

private enum TcpEscpos {
  static func send(ip: String, port: Int, payload: Data, timeoutSeconds: Int, completion: @escaping (Bool) -> Void) {
    guard let nwPort = NWEndpoint.Port(rawValue: UInt16(port)) else {
      completion(false)
      return
    }
    let connection = NWConnection(host: NWEndpoint.Host(ip), port: nwPort, using: .tcp)
    let queue = DispatchQueue(label: "vertial.escpos.print")
    var finished = false
    let finish: (Bool) -> Void = { ok in
      guard !finished else { return }
      finished = true
      completion(ok)
      connection.cancel()
    }

    connection.stateUpdateHandler = { state in
      switch state {
      case .ready:
        connection.send(content: payload, completion: .contentProcessed { error in
          finish(error == nil)
        })
      case .failed, .cancelled:
        finish(false)
      default:
        break
      }
    }
    connection.start(queue: queue)
    queue.asyncAfter(deadline: .now() + .seconds(timeoutSeconds)) {
      finish(false)
    }
  }

  static func ping(ip: String, port: Int, timeoutSeconds: Int, completion: @escaping (Bool) -> Void) {
    guard let nwPort = NWEndpoint.Port(rawValue: UInt16(port)) else {
      completion(false)
      return
    }
    let connection = NWConnection(host: NWEndpoint.Host(ip), port: nwPort, using: .tcp)
    let queue = DispatchQueue(label: "vertial.escpos.ping")
    var finished = false
    let finish: (Bool) -> Void = { ok in
      guard !finished else { return }
      finished = true
      completion(ok)
      connection.cancel()
    }
    connection.stateUpdateHandler = { state in
      switch state {
      case .ready:
        finish(true)
      case .failed, .cancelled:
        finish(false)
      default:
        break
      }
    }
    connection.start(queue: queue)
    queue.asyncAfter(deadline: .now() + .seconds(timeoutSeconds)) {
      finish(false)
    }
  }
}

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
