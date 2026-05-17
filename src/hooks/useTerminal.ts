import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "xterm-addon-fit";

export function useTerminal(
  workspaceRoot: string | null,
  terminalOpen: boolean,
  terminalHeight: number,
  activeTab: string | null,
  CHAT_TAB_ID: string,
  viewMode: string
) {
  const [terminals, setTerminals] = useState<Array<{ id: string; title: string }>>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const terminalViewportRef = useRef<HTMLDivElement>(null);
  const terminalInstancesRef = useRef(
    new Map<
      string,
      {
        term: XTerm;
        fit: FitAddon;
        wrap: HTMLDivElement;
        title: string;
      }
    >()
  );
  const isResizingRef = useRef(false);
  const terminalSeqRef = useRef(0);
  const pendingFitRef = useRef<number | null>(null);

  const requestFitActive = () => {
    if (pendingFitRef.current) window.cancelAnimationFrame(pendingFitRef.current);
    pendingFitRef.current = window.requestAnimationFrame(() => {
      pendingFitRef.current = null;
      if (!terminalOpen) return;
      const active = activeTerminalId;
      if (!active) return;
      const inst = terminalInstancesRef.current.get(active);
      if (!inst) return;
      inst.fit.fit();
      void window.codegrey?.terminal?.resize({ id: active, cols: inst.term.cols, rows: inst.term.rows });
    });
  };

  const resizeActiveTerminal = async () => {
    const active = activeTerminalId;
    if (!active) return;
    const inst = terminalInstancesRef.current.get(active);
    if (!inst) return;
    inst.fit.fit();
    await window.codegrey?.terminal?.resize({ id: active, cols: inst.term.cols, rows: inst.term.rows });
  };

  const createTerminal = async () => {
    const viewport = terminalViewportRef.current;
    if (!viewport) return null;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      drawBoldTextInBrightColors: true,
      theme: {
        background: "#151515",
        foreground: "#cccccc",
        cursor: "#cccccc",
        selectionBackground: "#264f78",
        black: "#000000",
        red: "#cd3131",
        green: "#0dbc79",
        yellow: "#e5e510",
        blue: "#2472c8",
        magenta: "#bc3fbc",
        cyan: "#11a8cd",
        white: "#e5e5e5",
        brightBlack: "#666666",
        brightRed: "#f14c4c",
        brightGreen: "#23d18b",
        brightYellow: "#f5f543",
        brightBlue: "#3b8eea",
        brightMagenta: "#d670d6",
        brightCyan: "#29b8db",
        brightWhite: "#e5e5e5",
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);

    const wrap = document.createElement("div");
    wrap.className = "terminal-instance";
    viewport.appendChild(wrap);

    term.open(wrap);
    fit.fit();

    const created = await window.codegrey?.terminal?.create({
      cols: term.cols || 80,
      rows: term.rows || 24,
      cwd: workspaceRoot ?? undefined,
    });

    if (!created?.id) {
      wrap.remove();
      term.dispose();
      return null;
    }

    terminalSeqRef.current += 1;
    const title = `Terminal ${terminalSeqRef.current}`;

    terminalInstancesRef.current.set(created.id, { term, fit, wrap, title });
    setTerminals((prev) => [...prev, { id: created.id, title }]);
    setActiveTerminalId(created.id);

    term.onData((data) => {
      void window.codegrey?.terminal?.write({ id: created.id, data });
    });

    requestFitActive();
    return created.id;
  };

  const closeTerminalInstance = async (id: string) => {
    const inst = terminalInstancesRef.current.get(id);
    terminalInstancesRef.current.delete(id);
    if (inst) {
      try {
        inst.term.dispose();
      } catch {
        // ignore
      }
      try {
        inst.wrap.remove();
      } catch {
        // ignore
      }
    }

    await window.codegrey?.terminal?.kill({ id });

    setTerminals((prev) => {
      const next = prev.filter((t) => t.id !== id);
      setActiveTerminalId((current) => (current === id ? next[next.length - 1]?.id ?? null : current));
      return next;
    });
  };

  useEffect(() => {
    if (!terminalOpen) return;
    const timer = window.setTimeout(() => {
      if (!activeTerminalId) {
        void createTerminal();
        return;
      }
      requestFitActive();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [terminalOpen, terminalHeight, activeTerminalId]);

  useEffect(() => {
    const disposeData = window.codegrey?.terminal?.onData?.((msg) => {
      const inst = terminalInstancesRef.current.get(String(msg.id));
      if (!inst) return;
      inst.term.write(msg.data);
    });
    const disposeExit = window.codegrey?.terminal?.onExit?.((msg) => {
      const sid = String(msg.id);
      const inst = terminalInstancesRef.current.get(sid);
      terminalInstancesRef.current.delete(sid);
      if (inst) {
        try {
          inst.term.dispose();
        } catch {
          // ignore
        }
        try {
          inst.wrap.remove();
        } catch {
          // ignore
        }
      }
      setTerminals((prev) => prev.filter((t) => t.id !== sid));
      setActiveTerminalId((prev) => (prev === sid ? null : prev));
    });

    return () => {
      try {
        disposeData?.();
        disposeExit?.();
      } catch {
        // ignore
      }

      const ids = Array.from(terminalInstancesRef.current.keys());
      terminalInstancesRef.current.forEach((inst) => {
        try {
          inst.term.dispose();
        } catch {
          // ignore
        }
        try {
          inst.wrap.remove();
        } catch {
          // ignore
        }
      });
      terminalInstancesRef.current.clear();
      ids.forEach((id) => void window.codegrey?.terminal?.kill({ id }));
    };
  }, []);

  useEffect(() => {
    terminalInstancesRef.current.forEach((inst, id) => {
      inst.wrap.dataset.active = id === activeTerminalId ? "true" : "false";
    });
    if (terminalOpen) requestFitActive();
  }, [activeTerminalId, terminalOpen]);

  useEffect(() => {
    const viewport = terminalViewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      if (terminalOpen) requestFitActive();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [terminalOpen]);

  return {
    terminals,
    activeTerminalId,
    setActiveTerminalId,
    terminalViewportRef,
    isResizingRef,
    createTerminal,
    closeTerminalInstance,
    resizeActiveTerminal,
    requestFitActive,
    terminalInstancesRef,
  };
}
