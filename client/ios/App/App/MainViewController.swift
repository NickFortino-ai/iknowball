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

        // Reset zoom + relayout on:
        //  - App returning from background (fixes the "half-screen render"
        //    bug where WKWebView holds onto a smaller frame from before
        //    the user backgrounded the app in landscape / with keyboard).
        //  - Device rotation (fixes the "too zoomed in after rotating
        //    landscape → portrait" symptom).
        // Both fire didBecomeActive / orientation notifications reliably
        // even after the iOS app is swiped away and cold-launched from
        // recents, so this is safe as a catch-all.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(resetWebViewLayout),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(resetWebViewLayout),
            name: UIDevice.orientationDidChangeNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func resetWebViewLayout() {
        guard let webView = self.webView else { return }
        // Zoom reset is the loud symptom fix — a stuck zoomScale > 1 or
        // < 1 leaves the content mispositioned relative to the frame.
        if webView.scrollView.zoomScale != 1.0 {
            webView.scrollView.setZoomScale(1.0, animated: false)
        }
        // Snap frame back to the container's current bounds. On foreground-
        // from-landscape, WKWebView sometimes holds a stale frame that
        // matches the old orientation — resetting to view.bounds forces
        // the correct rectangle before layout runs.
        webView.frame = self.view.bounds
        webView.setNeedsLayout()
        webView.layoutIfNeeded()
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? {
        return scrollView.subviews.first
    }
}
