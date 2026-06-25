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
class MainViewController: CAPBridgeViewController, UIScrollViewDelegate {
    override func viewDidLoad() {
        super.viewDidLoad()
        if let webView = self.webView {
            // Becoming the scrollView delegate is required so viewForZooming
            // returns non-nil — without it WKWebView's default delegate kills
            // pinch even when min/maxZoomScale are set. Setting it here also
            // overrides WKWebView's internal delegate; that's fine because
            // standard scroll/bounce/inertia behavior is implemented by
            // UIScrollView itself, not by the delegate.
            webView.scrollView.delegate = self
            webView.scrollView.minimumZoomScale = 1.0
            webView.scrollView.maximumZoomScale = 5.0
            webView.scrollView.bouncesZoom = true
        }
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? {
        return scrollView.subviews.first
    }
}
