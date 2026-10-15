import Capacitor
import UIKit

// Custom CAPBridgeViewController subclass that fixes WKWebView's layout
// after backgrounding and rotation.
//
// IT NO LONGER TOUCHES ZOOM. Pinch-to-zoom is owned entirely by the
// viewport meta tag in index.html (maximum-scale=5.0), which is the same
// mechanism — webView.scrollView zoom IS viewport zoom, not a second engine
// beside it.
//
// This file used to set scrollView.delegate = self and implement
// viewForZooming, which was necessary in June 2026 when the meta tag
// carried user-scalable=no: WebKit refuses pinch outright when the page
// forbids scaling, so the only way back in was to drive the scroll view
// directly. The meta tag was reopened to maximum-scale=5.0 two days later
// (bda6fb81) and the override was left behind.
//
// Keeping it is worse than removing it. WKWebView installs its own scroll
// view delegate and relies on those callbacks to re-render tiles at the new
// scale, reposition fixed elements, and report window.visualViewport. The
// old comment argued the steal was safe because "scroll/bounce/inertia is
// implemented by UIScrollView itself" — true of the scrolling PHYSICS,
// false of WebKit's rendering, which is what made zoom feel wrong.
//
// Wired to the app via Main.storyboard's root view controller
// customClass reference. File must be registered in App.xcodeproj's
// project.pbxproj to be included in the build target — drag into
// Xcode's project navigator if it isn't already.
class MainViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()

        // Zoom bounds are NOT set here. minimum/maximumZoomScale on the
        // scroll view are redundant with the viewport meta tag, which WebKit
        // already enforces at 1x-5x, and setting them was only ever paired
        // with the delegate steal above.

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

}
