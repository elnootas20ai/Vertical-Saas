import UIKit
import UserNotifications
import UserNotificationsUI

/// UI expandida al mantener pulsada una notificación con category VERTIAL_EXPANDABLE
/// (cierres de caja / resumen CEO): texto completo con scroll.
class NotificationViewController: UIViewController, UNNotificationContentExtension {
  private let textView = UITextView()

  override func loadView() {
    let root = UIView()
    root.backgroundColor = .systemBackground
    view = root
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    textView.translatesAutoresizingMaskIntoConstraints = false
    textView.isEditable = false
    textView.isSelectable = true
    textView.backgroundColor = .clear
    textView.textContainerInset = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
    textView.font = UIFont.monospacedSystemFont(ofSize: 13, weight: .regular)
    textView.textColor = .label
    view.addSubview(textView)
    NSLayoutConstraint.activate([
      textView.topAnchor.constraint(equalTo: view.topAnchor),
      textView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      textView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      textView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
  }

  func didReceive(_ notification: UNNotification) {
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
    if headline.isEmpty {
      textView.text = body
    } else if body.isEmpty {
      textView.text = headline
    } else {
      textView.text = "\(headline)\n\n\(body)"
    }

    let width = max(view.bounds.width, UIScreen.main.bounds.width - 32)
    let fitting = textView.sizeThatFits(
      CGSize(width: width, height: .greatestFiniteMagnitude)
    )
    let height = min(max(fitting.height + 8, 140), 420)
    preferredContentSize = CGSize(width: width, height: height)
  }
}
