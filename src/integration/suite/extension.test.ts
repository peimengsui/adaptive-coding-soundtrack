import assert from "node:assert/strict";
import * as vscode from "vscode";

suite("Adaptive Coding Soundtrack Extension Host", () => {
  test("activates and registers the public command surface", async () => {
    const extension = vscode.extensions.getExtension("adaptive-soundtrack.adaptive-coding-soundtrack");
    assert.ok(extension, "Development extension is discoverable");
    await extension.activate();
    assert.equal(extension.isActive, true);

    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      "adaptiveMusic.start",
      "adaptiveMusic.stop",
      "adaptiveMusic.togglePause",
      "adaptiveMusic.chooseStyle",
      "adaptiveMusic.setVolume",
      "adaptiveMusic.showCurrentState",
      "adaptiveMusic.showPlayer",
      "adaptiveMusic.calibrateSensitivity",
      "adaptiveMusic.showDiagnostics",
      "adaptiveMusic.chooseMusicSource",
      "adaptiveMusic.configureProvider",
      "adaptiveMusic.testProviderConnection",
      "adaptiveMusic.removeProviderCredentials",
      "adaptiveMusic.generateCurrentStyle",
      "adaptiveMusic.previewGenerationPrompt",
      "adaptiveMusic.showGeneratedCache",
      "adaptiveMusic.clearGeneratedCache",
    ]) {
      assert.ok(commands.includes(command), `${command} is registered`);
    }
  });

  test("configuration defaults are available", () => {
    const configuration = vscode.workspace.getConfiguration("adaptiveMusic");
    assert.equal(configuration.get("defaultStyle"), "ambient");
    assert.equal(configuration.get("contextSensitivity"), "balanced");
    assert.equal(configuration.get("minimumAdaptiveConfidence"), 0.65);
    assert.equal(configuration.get("terminalAdaptation"), "longRunningOnly");
    assert.equal(configuration.get("terminalMinimumDurationSeconds"), 5);
    assert.equal(configuration.get("completionCueCooldownSeconds"), 20);
    assert.equal(configuration.get("eventCueVolume"), 0.18);
    assert.equal(configuration.get("musicSource"), "local");
    assert.equal(configuration.get("generatedTrackDurationSeconds"), 30);
    assert.equal(configuration.get("generatedCacheSizeMb"), 250);
    assert.equal(configuration.get("remoteDailyGenerationLimit"), 1);
    assert.equal(configuration.get("customPromptSuffix"), "");
  });

  test("starts the Webview player and stops a session", async () => {
    const started = await vscode.commands.executeCommand<boolean>("adaptiveMusic.__testStart");
    assert.equal(started, true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const idleState = await vscode.commands.executeCommand<string>("adaptiveMusic.__testSetIdle");
    assert.equal(idleState, "context_paused");
    const resumedState = await vscode.commands.executeCommand<string>("adaptiveMusic.__testResume");
    assert.equal(resumedState, "playing");
    const cuePlayed = await vscode.commands.executeCommand<boolean>("adaptiveMusic.__testCue");
    assert.equal(cuePlayed, true);
    const stopped = await vscode.commands.executeCommand<boolean>("adaptiveMusic.__testStop");
    assert.equal(stopped, true);
  });
});
