import * as vscode from "vscode";
import { ActivityEvent } from "../core/types";

export type ActivityListener = (event: ActivityEvent) => void;

export class ActivityCollector implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly processReportedTasks = new WeakSet<vscode.TaskExecution>();
  private readonly pendingTaskFallbacks = new Map<vscode.TaskExecution, ReturnType<typeof setTimeout>>();
  private readonly terminalExecutionStarts = new WeakMap<vscode.TerminalShellExecution, number>();
  public constructor(private readonly listener: ActivityListener) {}

  public start(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.contentChanges.length > 0 && this.isCodingDocument(event.document)) this.emit("edit", event.document.languageId);
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (this.isCodingDocument(document)) this.emit("save", document.languageId);
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.emit("navigation", editor?.document.languageId);
        this.captureActiveDiagnostics(editor);
      }),
      vscode.window.onDidChangeTextEditorSelection((event) => this.emit("navigation", event.textEditor.document.languageId)),
      vscode.tasks.onDidStartTask(() => this.emit("task_started")),
      vscode.tasks.onDidEndTaskProcess((event) => {
        const fallback = this.pendingTaskFallbacks.get(event.execution);
        if (fallback) clearTimeout(fallback);
        this.pendingTaskFallbacks.delete(event.execution);
        if (this.processReportedTasks.has(event.execution)) return;
        this.processReportedTasks.add(event.execution);
        this.emit("task_completed", undefined, {
          outcome: event.exitCode === 0 ? "success" : event.exitCode === undefined ? "unknown" : "failure",
        });
      }),
      vscode.tasks.onDidEndTask((event) => {
        if (this.processReportedTasks.has(event.execution) || this.pendingTaskFallbacks.has(event.execution)) return;
        const fallback = setTimeout(() => {
          this.pendingTaskFallbacks.delete(event.execution);
          if (this.processReportedTasks.has(event.execution)) return;
          this.processReportedTasks.add(event.execution);
          this.emit("task_completed", undefined, { outcome: "unknown" });
        }, 100);
        this.pendingTaskFallbacks.set(event.execution, fallback);
      }),
      vscode.window.onDidOpenTerminal(() => this.emit("terminal_opened")),
      vscode.window.onDidCloseTerminal(() => this.emit("terminal_closed")),
      vscode.debug.onDidStartDebugSession(() => this.emit("debug_started")),
      vscode.debug.onDidTerminateDebugSession(() => this.emit("debug_completed", undefined, { outcome: "success" })),
      vscode.window.onDidChangeWindowState((state) => this.emit(state.focused ? "window_focused" : "window_blurred")),
      vscode.languages.onDidChangeDiagnostics((event) => this.captureDiagnostics(event)),
    );

    this.registerShellExecutionSignals();
    const current = vscode.window.activeTextEditor;
    if (current) {
      this.emit("navigation", current.document.languageId);
      this.captureActiveDiagnostics(current);
    }
  }

  public dispose(): void {
    for (const fallback of this.pendingTaskFallbacks.values()) clearTimeout(fallback);
    this.pendingTaskFallbacks.clear();
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }
  private emit(
    kind: ActivityEvent["kind"],
    language?: string,
    details: Omit<ActivityEvent, "kind" | "at" | "language"> = {},
  ): void {
    this.listener({ kind, at: Date.now(), language, ...details });
  }

  private registerShellExecutionSignals(): void {
    const shellWindow = vscode.window as typeof vscode.window & {
      onDidStartTerminalShellExecution?: typeof vscode.window.onDidStartTerminalShellExecution;
      onDidEndTerminalShellExecution?: typeof vscode.window.onDidEndTerminalShellExecution;
    };
    if (shellWindow.onDidStartTerminalShellExecution) {
      this.disposables.push(
        shellWindow.onDidStartTerminalShellExecution((event) => {
          this.terminalExecutionStarts.set(event.execution, Date.now());
          this.emit("terminal_command_started");
        }),
      );
    }
    if (shellWindow.onDidEndTerminalShellExecution) {
      this.disposables.push(
        shellWindow.onDidEndTerminalShellExecution((event) => {
          const startedAt = this.terminalExecutionStarts.get(event.execution);
          this.terminalExecutionStarts.delete(event.execution);
          this.emit("terminal_command_completed", undefined, {
            outcome: event.exitCode === 0 ? "success" : event.exitCode === undefined ? "unknown" : "failure",
            durationMs: startedAt === undefined ? undefined : Math.max(0, Date.now() - startedAt),
          });
        }),
      );
    }
  }

  private captureDiagnostics(event: vscode.DiagnosticChangeEvent): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !event.uris.some((uri) => uri.toString() === editor.document.uri.toString())) return;
    this.captureActiveDiagnostics(editor);
  }

  private captureActiveDiagnostics(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
      this.emit("diagnostics_changed", undefined, { diagnosticErrors: 0, diagnosticWarnings: 0 });
      return;
    }
    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
    let diagnosticErrors = 0;
    let diagnosticWarnings = 0;
    for (const diagnostic of diagnostics) {
      if (diagnostic.severity === vscode.DiagnosticSeverity.Error) diagnosticErrors += 1;
      else if (diagnostic.severity === vscode.DiagnosticSeverity.Warning) diagnosticWarnings += 1;
    }
    this.emit("diagnostics_changed", editor.document.languageId, { diagnosticErrors, diagnosticWarnings });
  }
  private isCodingDocument(document: vscode.TextDocument): boolean { return document.uri.scheme === "file" || document.uri.scheme === "untitled"; }
}
