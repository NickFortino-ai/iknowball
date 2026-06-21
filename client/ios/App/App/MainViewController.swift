import Capacitor
import UIKit

// Custom CAPBridgeViewController subclass that re-enables pinch-to-zoom
// on the underlying WKWebView. Capacitor disables WebView zoom by
// default to mimic native app behavior, but for content-heavy screens
// — long-form text, dense tables, picks lists, league standings —
// pinch zoom is a real usability + accessibility need.
//
// Wired to the app via Main.storyboard's root view controller
// customClass reference. File must be registered in App.xcodeproj's
// project.pbxproj to be included in the build target — drag into
// Xcode's project navigator if it isn't already.
class MainViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        if let webView = self.webView {
            webView.scrollView.minimumZoomScale = 1.0
            webView.scrollView.maximumZoomScale = 5.0
            webView.scrollView.bouncesZoom = true
        }
    }
}
