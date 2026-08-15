import * as vscode from "vscode";
import { ActivityEvent } from "../core/types";

export type ActivityListener = (event: ActivityEvent) => void;

export class ActivityCollector implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  public constructor(private readonly listener: ActivityListener) {}

  public start(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.contentChanges.length > 0 && this.isCodingDocument(event.document)) this.emit("edit", event.document.languageId);
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (this.isCodingDocument(document)) this.emit("save", document.languageId);
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => this.emit("navigation", editor?.document.languageId)),
      vscode.window.onDidChangeTextEditorSelection((event) => this.emit("navigation", event.textEditor.document.languageId)),
      vscode.tasks.onDidStartTask(() => this.emit("task_started")),
      vscode.tasks.onDidEndTask(() => this.emit("task_completed")),
      vscode.window.onDidOpenTerminal(() => this.emit("terminal_opened")),
      vscode.window.onDidCloseTerminal(() => this.emit("terminal_closed")),
    );
    const current = vscode.window.activeTextEditor;
    if (current) this.emit("navigation", current.document.languageId);
  }

  public dispose(): void { for (const disposable of this.disposables.splice(0)) disposable.dispose(); }
  private emit(kind: ActivityEvent["kind"], language?: string): void { this.listener({ kind, at: Date.now(), language }); }
  private isCodingDocument(document: vscode.TextDocument): boolean { return document.uri.scheme === "file" || document.uri.scheme === "untitled"; }
}
