import { ArrowLeft, ArrowRight, RotateCcw, Search, Monitor, Book } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export function Browser({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("about:home");
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const webviewRef = useRef<any>(null);

  useEffect(() => {
    // Only add listeners if we have a webview
    const webview = webviewRef.current;
    if (!webview) return;

    const handleStartLoading = () => setLoading(true);
    const handleStopLoading = () => setLoading(false);
    const handleNavigate = (e: any) => {
      // Logic for actual navigation
      setUrl(e.url);
      setInputValue(e.url);
    };

    webview.addEventListener("did-start-loading", handleStartLoading);
    webview.addEventListener("did-stop-loading", handleStopLoading);
    webview.addEventListener("did-navigate", handleNavigate);
    webview.addEventListener("did-navigate-in-page", handleNavigate);

    return () => {
      webview.removeEventListener("did-start-loading", handleStartLoading);
      webview.removeEventListener("did-stop-loading", handleStopLoading);
      webview.removeEventListener("did-navigate", handleNavigate);
      webview.removeEventListener("did-navigate-in-page", handleNavigate);
    };
  }, [url === "about:home"]); // Re-run when we toggle between home and web

  const navigate = (customUrl?: string) => {
    let targetUrl = (customUrl || inputValue).trim();
    if (!targetUrl) return;

    const isUrl = !targetUrl.includes(" ") && (
      targetUrl.includes(".") || 
      targetUrl.startsWith("localhost") || 
      targetUrl.includes(":") ||
      /^\d+\.\d+\.\d+\.\d+/.test(targetUrl)
    );

    if (!isUrl) {
      targetUrl = `https://www.google.com/search?q=${encodeURIComponent(targetUrl)}`;
    } else if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      const isLocal = targetUrl.startsWith("localhost") || /^(127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(targetUrl);
      targetUrl = (isLocal ? "http://" : "https://") + targetUrl;
    }

    setUrl(targetUrl);
    setInputValue(targetUrl);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      navigate();
    }
  };

  const reload = () => {
    if (url === "about:home") return;
    if (webviewRef.current) {
      webviewRef.current.reload();
    }
  };

  const goBack = () => {
    if (webviewRef.current && webviewRef.current.canGoBack()) {
      webviewRef.current.goBack();
    } else {
      setUrl("about:home");
      setInputValue("");
    }
  };

  const goForward = () => {
    if (webviewRef.current && webviewRef.current.canGoForward()) {
      webviewRef.current.goForward();
    }
  };

  const isHome = url === "about:home";

  return (
    <div className="browser-container">
      <header className="browser-header">
        <div className="browser-nav-actions">
          <button className="browser-nav-btn" onClick={goBack} data-tooltip="Go Back">
            <ArrowLeft size={16} />
          </button>
          <button className="browser-nav-btn" onClick={goForward} data-tooltip="Go Forward">
            <ArrowRight size={16} />
          </button>
          <button className="browser-nav-btn" onClick={reload} data-tooltip="Reload Page" disabled={isHome}>
            <RotateCcw size={16} className={loading ? "spin" : ""} />
          </button>
        </div>

        <div className="browser-address-bar">
          <Search size={14} className="browser-search-icon" />
          <input
            type="text"
            className="browser-address-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search or enter address"
          />
        </div>
      </header>

      <div className="browser-viewport">
        {isHome ? (
          <div className="browser-home-overlay">
            <div className="hero">
              <div className="logo">Codegrey Browser</div>
              <div className="sub">Ready for your next exploration.</div>
            </div>
            <div className="cards-grid">
              <div className="card">
                <div className="icon-wrap">
                  <Search size={18} />
                </div>
                <div>
                  <h3 className="card-title">Search Web</h3>
                  <p className="card-desc">Find docs and resources.</p>
                </div>
              </div>
              <div className="card">
                <div className="icon-wrap">
                  <Monitor size={18} />
                </div>
                <div>
                  <h3 className="card-title">Local Servers</h3>
                  <p className="card-desc">Preview localhost:3000.</p>
                </div>
              </div>
              <div className="card">
                <div className="icon-wrap">
                  <Book size={18} />
                </div>
                <div>
                  <h3 className="card-title">Explore Docs</h3>
                  <p className="card-desc">MDN and GitHub.</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* @ts-ignore */
          <webview
            ref={webviewRef}
            src={url}
            className="browser-webview"
            style={{ 
              width: '100%', 
              height: '100%', 
              background: '#fff'
            }}
          />
        )}
      </div>
    </div>
  );
}
