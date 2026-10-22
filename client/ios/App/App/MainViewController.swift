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
    // Held so the observation stays alive for the controller's lifetime.
    private var zoomObservation: NSKeyValueObservation?

    override func viewDidLoad() {
        super.viewDidLoad()

        // Zoom BOUNDS are set here; the delegate is not.
        //
        // 8e6c02a7 removed the delegate steal (right — WKWebView needs its
        // own callbacks to re-render tiles and reposition fixed elements)
        // but removed these bounds with it, reasoning that the viewport meta
        // already enforces 1x-5x. On device that left pinch dead: in a
        // Capacitor WKWebView the scroll view's maximumZoomScale defaults to
        // 1, so the meta permits a zoom the scroll view has no room to
        // perform. That commit shipped marked NEEDS A DEVICE; this is the
        // device answer.
        //
        // Matched to the meta tag in index.html. If one moves, move both.
        webView?.scrollView.minimumZoomScale = 1.0
        webView?.scrollView.maximumZoomScale = 5.0

        // Report the zoom scale to the web layer.
        //
        // Observed via KVO, NOT by becoming the scroll view's delegate —
        // that is the mistake 8e6c02a7 correctly undid. WebKit keeps its
        // delegate and its rendering; we only watch.
        //
        // AppShell needs this because it re-pins the shell to
        // window.innerHeight on a ladder of triggers and must not do so
        // mid-zoom. Its existing guard reads visualViewport.scale, which
        // stays 1 under scroll-view zoom — so without this it cannot tell,
        // re-pins the shell shorter than the screen, and the tab bar rides
        // up with it. That is the "nav bar lifts when zoomed" symptom.
        zoomObservation = webView?.scrollView.observe(\.zoomScale, options: [.new]) { [weak self] scrollView, _ in
            let scale = scrollView.zoomScale
            self?.webView?.evaluateJavaScript("window.__nativeZoomScale=\(scale)", completionHandler: nil)
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
        zoomObservation?.invalidate()
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func resetWebViewLayout() {
        guard let webView = self.webView else { return }
        // Zoom reset is the loud symptom fix — a stuck zoomScale > 1 or
        // < 1 leaves the content mispositioned relative to the frame.
        if webView.scrollView.zoomScale != 1.0 {
            webView.scrollView.setZoomScale(1.0, animated: false)
            webView.evaluateJavaScript("window.__nativeZoomScale=1", completionHandler: nil)
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
