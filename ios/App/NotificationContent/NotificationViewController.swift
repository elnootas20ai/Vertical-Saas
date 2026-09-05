import UIKit
import UserNotifications
import UserNotificationsUI

/// UI expandida al mantener pulsada una notificación VERTIAL_EXPANDABLE
/// (cierres de caja / resumen CEO). Misma piel que el resumen de Caja en Vertial.
class NotificationViewController: UIViewController, UNNotificationContentExtension {

  private let scrollView = UIScrollView()
  private let stack = UIStackView()
  private let accentBar = GradientBarView()

  // Tokens Vertial SaaS
  private let ink = UIColor(red: 0.043, green: 0.071, blue: 0.125, alpha: 1) // #0B1220
  private let muted = UIColor(red: 0.42, green: 0.45, blue: 0.50, alpha: 1)
  private let okGreen = UIColor(red: 0.133, green: 0.773, blue: 0.369, alpha: 1) // #22C55E
  private let warnAmber = UIColor(red: 0.851, green: 0.467, blue: 0.024, alpha: 1) // #D97706
  private let dangerRose = UIColor(red: 0.882, green: 0.114, blue: 0.282, alpha: 1) // #E11D48
  private let cardBgLight = UIColor(red: 0.961, green: 0.969, blue: 0.984, alpha: 1) // #F5F7FB
  private let hairline = UIColor(white: 0.55, alpha: 0.22)

  override func loadView() {
    let root = UIView()
    root.backgroundColor = .clear
    view = root
  }

  override func viewDidLoad() {
    super.viewDidLoad()

    accentBar.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(accentBar)

    scrollView.translatesAutoresizingMaskIntoConstraints = false
    scrollView.alwaysBounceVertical = true
    scrollView.showsVerticalScrollIndicator = true
    view.addSubview(scrollView)

    stack.axis = .vertical
    stack.spacing = 0
    stack.translatesAutoresizingMaskIntoConstraints = false
    scrollView.addSubview(stack)

    NSLayoutConstraint.activate([
      accentBar.topAnchor.constraint(equalTo: view.topAnchor),
      accentBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      accentBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      accentBar.heightAnchor.constraint(equalToConstant: 3),

      scrollView.topAnchor.constraint(equalTo: accentBar.bottomAnchor),
      scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

      stack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 10),
      stack.leadingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.leadingAnchor, constant: 14),
      stack.trailingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.trailingAnchor, constant: -14),
      stack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -12),
      stack.widthAnchor.constraint(equalTo: scrollView.frameLayoutGuide.widthAnchor, constant: -28),
    ])
  }

  func didReceive(_ notification: UNNotification) {
    stack.arrangedSubviews.forEach { $0.removeFromSuperview() }

    let content = notification.request.content
    let userInfo = content.userInfo
    let dataTitle = (userInfo["title"] as? String)?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let headline: String
    if let dataTitle, !dataTitle.isEmpty {
      headline = dataTitle
    } else {
      headline = content.title
    }
    let body = content.body

    let isDark = traitCollection.userInterfaceStyle == .dark
    view.backgroundColor = isDark
      ? UIColor(red: 0.11, green: 0.11, blue: 0.12, alpha: 1)
      : cardBgLight

    // Chip marca
    stack.addArrangedSubview(brandChip())
    stack.setCustomSpacing(8, after: stack.arrangedSubviews.last!)

    // Título
    if !headline.isEmpty {
      let titleLabel = UILabel()
      titleLabel.numberOfLines = 2
      titleLabel.font = roundedFont(size: 15, weight: .bold)
      titleLabel.textColor = primaryTextColor
      titleLabel.text = headline
      stack.addArrangedSubview(titleLabel)
      stack.setCustomSpacing(12, after: titleLabel)
    }

    let blocks = parseBody(body)
    if blocks.isEmpty {
      let fallback = UILabel()
      fallback.numberOfLines = 0
      fallback.font = roundedFont(size: 13, weight: .regular)
      fallback.textColor = primaryTextColor
      fallback.text = body.isEmpty ? "Sin detalle" : body
      stack.addArrangedSubview(fallback)
    } else {
      for (idx, block) in blocks.enumerated() {
        if idx > 0 {
          if let last = stack.arrangedSubviews.last {
            stack.setCustomSpacing(12, after: last)
          }
          let line = divider()
          stack.addArrangedSubview(line)
          stack.setCustomSpacing(12, after: line)
        }
        appendStoreBlock(block)
      }
    }

    view.layoutIfNeeded()
    let width = max(view.bounds.width, UIScreen.main.bounds.width - 32)
    let fitting = stack.systemLayoutSizeFitting(
      CGSize(width: width - 28, height: UIView.layoutFittingCompressedSize.height),
      withHorizontalFittingPriority: .required,
      verticalFittingPriority: .fittingSizeLevel
    )
    let height = min(max(fitting.height + 28, 160), 420)
    preferredContentSize = CGSize(width: width, height: height)
  }

  // MARK: - Builders

  private var primaryTextColor: UIColor {
    traitCollection.userInterfaceStyle == .dark ? .white : ink
  }

  private var secondaryTextColor: UIColor {
    traitCollection.userInterfaceStyle == .dark
      ? UIColor(white: 0.72, alpha: 1)
      : muted
  }

  private func brandChip() -> UIView {
    let row = UIStackView()
    row.axis = .horizontal
    row.alignment = .center
    row.spacing = 6

    let dot = UIView()
    dot.translatesAutoresizingMaskIntoConstraints = false
    dot.backgroundColor = okGreen
    dot.layer.cornerRadius = 3.5
    NSLayoutConstraint.activate([
      dot.widthAnchor.constraint(equalToConstant: 7),
      dot.heightAnchor.constraint(equalToConstant: 7),
    ])

    let label = UILabel()
    label.text = "Vertial · Caja"
    label.font = roundedFont(size: 11, weight: .semibold)
    label.textColor = secondaryTextColor

    row.addArrangedSubview(dot)
    row.addArrangedSubview(label)
    return row
  }

  private func divider() -> UIView {
    let line = UIView()
    line.backgroundColor = hairline
    line.translatesAutoresizingMaskIntoConstraints = false
    line.heightAnchor.constraint(equalToConstant: 1).isActive = true
    return line
  }

  private func appendStoreBlock(_ block: StoreBlock) {
    // Cabecera tienda
    let store = UILabel()
    store.font = roundedFont(size: 12, weight: .bold)
    store.textColor = primaryTextColor
    store.text = block.header.uppercased()
    stack.addArrangedSubview(store)
    stack.setCustomSpacing(8, after: store)

    // Marcas
    for brand in block.brands {
      stack.addArrangedSubview(kvRow(label: brand.name, value: brand.amount, valueBold: true))
      if let units = brand.units, !units.isEmpty {
        let u = UILabel()
        u.font = roundedFont(size: 11, weight: .medium)
        u.textColor = secondaryTextColor
        u.text = units
        stack.addArrangedSubview(u)
        stack.setCustomSpacing(4, after: u)
      }
    }

    if !block.brands.isEmpty {
      stack.setCustomSpacing(10, after: stack.arrangedSubviews.last!)
    }

    // Métricas clave (tarjeta / efectivo / fondo)
    let spotlight = block.metrics.filter {
      ["Tarjeta", "Efectivo", "Fondo"].contains($0.label)
    }
    if !spotlight.isEmpty {
      let grid = UIStackView()
      grid.axis = .horizontal
      grid.distribution = .fillEqually
      grid.spacing = 8
      for m in spotlight.prefix(3) {
        grid.addArrangedSubview(metricCard(title: m.label, value: m.value))
      }
      stack.addArrangedSubview(grid)
      stack.setCustomSpacing(10, after: grid)
    }
    for m in block.metrics where !["Tarjeta", "Efectivo", "Fondo"].contains(m.label) {
      stack.addArrangedSubview(kvRow(label: m.label, value: m.value, muted: true))
    }

    // Salidas / personas
    for out in block.outs {
      stack.addArrangedSubview(kvRow(label: out.name, value: out.amount, muted: true))
    }
    if !block.outs.isEmpty {
      stack.setCustomSpacing(8, after: stack.arrangedSubviews.last!)
    }

    // Estado cierre
    if let status = block.status, !status.isEmpty {
      let badge = statusBadge(status)
      stack.addArrangedSubview(badge)
    }

    // Notas
    if let notes = block.notes, !notes.isEmpty {
      let n = UILabel()
      n.numberOfLines = 4
      n.font = roundedFont(size: 11, weight: .regular)
      n.textColor = secondaryTextColor
      n.text = "Notas · \(notes)"
      stack.addArrangedSubview(n)
    }
  }

  private func kvRow(label: String, value: String, valueBold: Bool = false, muted: Bool = false) -> UIView {
    let row = UIStackView()
    row.axis = .horizontal
    row.distribution = .fill
    row.alignment = .firstBaseline
    row.spacing = 8

    let left = UILabel()
    left.font = roundedFont(size: 13, weight: muted ? .medium : .semibold)
    left.textColor = muted ? secondaryTextColor : primaryTextColor
    left.text = label
    left.setContentHuggingPriority(.defaultLow, for: .horizontal)

    let right = UILabel()
    right.font = roundedFont(size: 13, weight: valueBold ? .bold : .semibold)
    right.textColor = primaryTextColor
    right.textAlignment = .right
    right.text = value
    right.setContentHuggingPriority(.required, for: .horizontal)

    row.addArrangedSubview(left)
    row.addArrangedSubview(right)
    return row
  }

  private func metricCard(title: String, value: String) -> UIView {
    let wrap = UIView()
    wrap.backgroundColor = traitCollection.userInterfaceStyle == .dark
      ? UIColor(white: 1, alpha: 0.06)
      : UIColor.white
    wrap.layer.cornerRadius = 10
    wrap.layer.borderWidth = 1
    wrap.layer.borderColor = hairline.cgColor

    let col = UIStackView()
    col.axis = .vertical
    col.spacing = 2
    col.translatesAutoresizingMaskIntoConstraints = false

    let t = UILabel()
    t.font = roundedFont(size: 10, weight: .semibold)
    t.textColor = secondaryTextColor
    t.text = title.uppercased()

    let v = UILabel()
    v.font = roundedFont(size: 13, weight: .bold)
    v.textColor = primaryTextColor
    v.text = value
    v.adjustsFontSizeToFitWidth = true
    v.minimumScaleFactor = 0.75

    col.addArrangedSubview(t)
    col.addArrangedSubview(v)
    wrap.addSubview(col)
    NSLayoutConstraint.activate([
      col.topAnchor.constraint(equalTo: wrap.topAnchor, constant: 8),
      col.leadingAnchor.constraint(equalTo: wrap.leadingAnchor, constant: 8),
      col.trailingAnchor.constraint(equalTo: wrap.trailingAnchor, constant: -8),
      col.bottomAnchor.constraint(equalTo: wrap.bottomAnchor, constant: -8),
    ])
    return wrap
  }

  private func statusBadge(_ text: String) -> UIView {
    let isDiscrepancy = text.localizedCaseInsensitiveContains("descuadre")
    let color = isDiscrepancy ? warnAmber : okGreen

    let wrap = UIView()
    wrap.backgroundColor = color.withAlphaComponent(0.14)
    wrap.layer.cornerRadius = 8

    let label = UILabel()
    label.translatesAutoresizingMaskIntoConstraints = false
    label.font = roundedFont(size: 12, weight: .bold)
    label.textColor = color
    label.text = text

    wrap.addSubview(label)
    NSLayoutConstraint.activate([
      label.topAnchor.constraint(equalTo: wrap.topAnchor, constant: 7),
      label.leadingAnchor.constraint(equalTo: wrap.leadingAnchor, constant: 10),
      label.trailingAnchor.constraint(equalTo: wrap.trailingAnchor, constant: -10),
      label.bottomAnchor.constraint(equalTo: wrap.bottomAnchor, constant: -7),
    ])
    return wrap
  }

  private func roundedFont(size: CGFloat, weight: UIFont.Weight) -> UIFont {
    let base = UIFont.systemFont(ofSize: size, weight: weight)
    if let descriptor = base.fontDescriptor.withDesign(.rounded) {
      return UIFont(descriptor: descriptor, size: size)
    }
    return base
  }

  // MARK: - Parse push body (formato ceoDailyDigestFormat)

  private struct BrandLine {
    let name: String
    let amount: String
    var units: String?
  }

  private struct Metric {
    let label: String
    let value: String
  }

  private struct OutLine {
    let name: String
    let amount: String
  }

  private struct StoreBlock {
    var header: String = ""
    var brands: [BrandLine] = []
    var metrics: [Metric] = []
    var outs: [OutLine] = []
    var status: String?
    var notes: String?
  }

  private func parseBody(_ body: String) -> [StoreBlock] {
    let rawBlocks = body
      .components(separatedBy: "\n\n")
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }

    return rawBlocks.map { parseOneBlock($0) }
  }

  private func parseOneBlock(_ text: String) -> StoreBlock {
    var block = StoreBlock()
    let lines = text
      .components(separatedBy: "\n")
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }

    guard !lines.isEmpty else { return block }

    var i = 0
    block.header = lines[0]
    i = 1

    // Marcas: "MO 2195,61€" seguido opcionalmente de unidades "P 132" / "BL 16 taco 7"
    while i < lines.count {
      let line = lines[i]
      if isMetricLine(line) || isStatusLine(line) || isNotesBreak(lines, at: i) {
        break
      }
      if let brand = parseBrandAmount(line) {
        var b = brand
        if i + 1 < lines.count, isUnitsLine(lines[i + 1]) {
          b.units = lines[i + 1]
          i += 2
        } else {
          i += 1
        }
        block.brands.append(b)
        continue
      }
      // Línea suelta de unidades sin marca € (caso sin brands)
      if isUnitsLine(line) {
        block.brands.append(BrandLine(name: "Unidades", amount: "", units: line))
        i += 1
        continue
      }
      break
    }

    while i < lines.count {
      let line = lines[i]
      if isStatusLine(line) {
        block.status = line
        i += 1
        continue
      }
      if line.hasPrefix("Notas") || (i > 0 && lines[i - 1].isEmpty) {
        // resto = notas
        block.notes = lines[i...].joined(separator: " ")
        break
      }
      if let m = parseMetric(line) {
        block.metrics.append(m)
        i += 1
        continue
      }
      if let o = parseOut(line) {
        block.outs.append(o)
        i += 1
        continue
      }
      // Desconocido → notas
      let rest = lines[i...].joined(separator: "\n")
      if block.notes == nil {
        block.notes = rest
      } else {
        block.notes = (block.notes ?? "") + "\n" + rest
      }
      break
    }

    return block
  }

  private func isMetricLine(_ line: String) -> Bool {
    let lower = line.lowercased()
    return lower.hasPrefix("tarjeta")
      || lower.hasPrefix("efectivo")
      || lower.hasPrefix("fondo")
      || lower.hasPrefix("total ")
      || lower.hasPrefix("salidas")
      || lower.hasPrefix("entradas")
      || lower.hasPrefix("cobrado")
  }

  private func isStatusLine(_ line: String) -> Bool {
    let lower = line.lowercased()
    return lower.hasPrefix("descuadre") || lower.hasPrefix("cierre ok")
  }

  private func isNotesBreak(_ lines: [String], at i: Int) -> Bool {
    i > 0 && lines[i - 1].isEmpty
  }

  private func isUnitsLine(_ line: String) -> Bool {
    // "P 132", "BL 16 taco 7", "BB 4"
    if line.contains("€") { return false }
    if isMetricLine(line) || isStatusLine(line) { return false }
    let parts = line.split(separator: " ")
    guard parts.count >= 2 else { return false }
    // primera token corto (marca) + número
    let first = String(parts[0])
    let second = String(parts[1]).replacingOccurrences(of: ",", with: ".")
    if first.count > 4 { return false }
    return Double(second) != nil || Int(parts[1]) != nil
  }

  private func parseBrandAmount(_ line: String) -> BrandLine? {
    // "MO 2195,61€" / "Total 123,00€"
    guard line.contains("€") else { return nil }
    if isMetricLine(line) { return nil }
    let trimmed = line.replacingOccurrences(of: "€", with: "").trimmingCharacters(in: .whitespaces)
    guard let sp = trimmed.lastIndex(of: " ") else { return nil }
    let name = String(trimmed[..<sp]).trimmingCharacters(in: .whitespaces)
    let amount = String(trimmed[trimmed.index(after: sp)...]).trimmingCharacters(in: .whitespaces) + "€"
    guard !name.isEmpty else { return nil }
    return BrandLine(name: name, amount: amount, units: nil)
  }

  private func parseMetric(_ line: String) -> Metric? {
    let lower = line.lowercased()
    let labels = ["Tarjeta total", "Efectivo total", "Tarjeta", "Efectivo", "Fondo", "Total", "Cobrado", "Salidas", "Entradas"]
    for label in labels {
      if lower.hasPrefix(label.lowercased()) {
        let value = String(line.dropFirst(label.count)).trimmingCharacters(in: .whitespaces)
        let shortLabel: String
        switch label.lowercased() {
        case "tarjeta total", "tarjeta": shortLabel = "Tarjeta"
        case "efectivo total", "efectivo": shortLabel = "Efectivo"
        default: shortLabel = label
        }
        return Metric(label: shortLabel, value: value.isEmpty ? "—" : value)
      }
    }
    return nil
  }

  private func parseOut(_ line: String) -> OutLine? {
    // "Silvia 54" / "Gasolina 23" / "Repartidor 30"
    if line.contains("€") && isMetricLine(line) { return nil }
    if isStatusLine(line) || isMetricLine(line) { return nil }
    let parts = line.split(separator: " ")
    guard parts.count >= 2 else { return nil }
    let amountToken = String(parts.last!)
    let amountClean = amountToken
      .replacingOccurrences(of: "€", with: "")
      .replacingOccurrences(of: ",", with: ".")
    guard Double(amountClean) != nil || Int(amountToken) != nil else { return nil }
    let name = parts.dropLast().joined(separator: " ")
    guard !name.isEmpty, name.count < 40 else { return nil }
    let displayAmount = amountToken.contains("€") ? amountToken : "\(amountToken)€"
    return OutLine(name: name, amount: displayAmount)
  }
}

// MARK: - Accent bar (verde → teal → azul Vertial)

private final class GradientBarView: UIView {
  private let gradient = CAGradientLayer()

  override init(frame: CGRect) {
    super.init(frame: frame)
    gradient.colors = [
      UIColor(red: 0.133, green: 0.773, blue: 0.369, alpha: 1).cgColor, // #22C55E
      UIColor(red: 0.078, green: 0.722, blue: 0.651, alpha: 1).cgColor, // #14B8A6
      UIColor(red: 0.145, green: 0.388, blue: 0.922, alpha: 1).cgColor, // #2563EB
    ]
    gradient.startPoint = CGPoint(x: 0, y: 0.5)
    gradient.endPoint = CGPoint(x: 1, y: 0.5)
    layer.addSublayer(gradient)
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  override func layoutSubviews() {
    super.layoutSubviews()
    gradient.frame = bounds
  }
}
