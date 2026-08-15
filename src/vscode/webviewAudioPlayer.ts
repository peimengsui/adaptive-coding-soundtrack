import * as vscode from "vscode";
import { Track } from "../core/types";

export type PlayerControl = "pause" | "resume" | "stop" | "setVolume";
export type PlayerControlHandler = (control: PlayerControl, value?: number) => void;

interface DesiredPlayback { track?: Track; paused: boolean; volume: number; fadeDurationMs: number; }

/** Context-agnostic procedural Web Audio player. */
export class WebviewAudioPlayer implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private ready = false;
  private disposing = false;
  private readonly desired: DesiredPlayback = { paused: false, volume: 0.45, fadeDurationMs: 1_400 };

  public constructor(private readonly onControl: PlayerControlHandler) {}

  public reveal(): void {
    if (this.panel) { this.panel.reveal(this.panel.viewColumn, true); return; }
    const panel = vscode.window.createWebviewPanel(
      "adaptiveMusic.player", "Adaptive Music Player",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel = panel;
    this.ready = false;
    panel.iconPath = new vscode.ThemeIcon("unmute");
    panel.webview.html = this.getHtml(panel.webview);
    panel.webview.onDidReceiveMessage((message: unknown) => this.handleMessage(message));
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.ready = false;
      if (!this.disposing) this.onControl("stop");
    });
  }

  public play(track: Track, volume: number, fadeDurationMs: number): void {
    this.desired.track = track;
    this.desired.paused = false;
    this.desired.volume = volume;
    this.desired.fadeDurationMs = fadeDurationMs;
    this.reveal();
    this.sendDesiredPlayback();
  }
  public pause(): void { this.desired.paused = true; this.post({ type: "pause", fadeDurationMs: this.desired.fadeDurationMs }); }
  public resume(): void {
    this.desired.paused = false;
    if (this.desired.track) this.post({ type: "resume", fadeDurationMs: this.desired.fadeDurationMs });
  }
  public stop(): void {
    this.desired.track = undefined;
    this.desired.paused = false;
    this.post({ type: "stop", fadeDurationMs: this.desired.fadeDurationMs });
  }
  public setVolume(volume: number): void { this.desired.volume = volume; this.post({ type: "volume", volume }); }

  public dispose(): void {
    this.disposing = true;
    this.panel?.dispose();
    this.panel = undefined;
    this.ready = false;
    this.disposing = false;
  }

  private sendDesiredPlayback(): void {
    if (!this.ready) return;
    this.post({ type: "volume", volume: this.desired.volume });
    if (this.desired.track) {
      this.post({ type: "play", track: this.desired.track, fadeDurationMs: this.desired.fadeDurationMs });
      if (this.desired.paused) this.post({ type: "pause", fadeDurationMs: this.desired.fadeDurationMs });
    }
  }
  private post(message: object): void { if (this.panel && this.ready) void this.panel.webview.postMessage(message); }
  private handleMessage(message: unknown): void {
    if (!message || typeof message !== "object" || !("type" in message)) return;
    const typed = message as { type: string; action?: string; value?: number };
    if (typed.type === "ready") { this.ready = true; this.sendDesiredPlayback(); return; }
    if (typed.type !== "control") return;
    if (typed.action === "pause" || typed.action === "resume" || typed.action === "stop") this.onControl(typed.action);
    else if (typed.action === "setVolume" && typeof typed.value === "number") this.onControl("setVolume", typed.value);
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = createNonce();
    const csp = ["default-src 'none'", `style-src ${webview.cspSource} 'unsafe-inline'`, `script-src 'nonce-${nonce}'`].join("; ");
    return `<!doctype html>
<html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${csp}"><title>Adaptive Music Player</title>
  <style>
    :root{color-scheme:light dark}*{box-sizing:border-box}body{display:grid;min-height:100vh;margin:0;padding:32px;place-items:center;color:var(--vscode-foreground);background:radial-gradient(circle at 20% 10%,color-mix(in srgb,var(--vscode-textLink-foreground) 18%,transparent),transparent 42%),var(--vscode-editor-background);font-family:var(--vscode-font-family)}
    main{width:min(520px,100%)}.eyebrow{margin:0 0 12px;color:var(--vscode-descriptionForeground);letter-spacing:.12em;text-transform:uppercase}h1{margin:0;font-size:clamp(28px,6vw,48px);line-height:1.08}#artist{margin:10px 0 26px;color:var(--vscode-descriptionForeground)}
    .visualizer{display:flex;align-items:end;gap:6px;height:72px;margin:24px 0}.visualizer span{width:8px;height:18%;border-radius:8px;background:var(--vscode-textLink-foreground);opacity:.72}body.playing .visualizer span{animation:pulse 1.15s ease-in-out infinite alternate;animation-delay:calc(var(--i)*-90ms)}@keyframes pulse{to{height:calc(26% + var(--i)*5%);opacity:1}}
    .controls{display:flex;flex-wrap:wrap;gap:12px;align-items:center}button{min-width:112px;padding:9px 14px;border:0;color:var(--vscode-button-foreground);background:var(--vscode-button-background);cursor:pointer}button:hover{background:var(--vscode-button-hoverBackground)}label{display:flex;flex:1;min-width:180px;gap:10px;align-items:center}input{flex:1;accent-color:var(--vscode-textLink-foreground)}#audioGate{display:none;width:100%;margin-top:18px}#audioGate.visible{display:block}#status{min-height:1.4em;margin-top:18px;color:var(--vscode-descriptionForeground)}
  </style>
</head><body><main>
  <p class="eyebrow">Adaptive Coding Soundtrack</p><h1 id="title">Waiting for coding activity</h1>
  <p id="artist">Original audio generated locally with Web Audio</p>
  <div class="visualizer" aria-hidden="true">${Array.from({ length: 12 }, (_, index) => `<span style="--i:${index % 7}"></span>`).join("")}</div>
  <div class="controls"><button id="toggle" type="button">Pause</button><button id="stop" type="button">Stop Session</button><label>Volume <input id="volume" type="range" min="0" max="1" step="0.01" value="0.45"></label></div>
  <button id="audioGate" type="button">Enable Audio</button><p id="status">The soundtrack will begin when activity is detected.</p>
</main><script nonce="${nonce}">
  const vscode=acquireVsCodeApi(),title=document.getElementById('title'),artist=document.getElementById('artist'),toggle=document.getElementById('toggle'),stopButton=document.getElementById('stop'),volumeInput=document.getElementById('volume'),audioGate=document.getElementById('audioGate'),status=document.getElementById('status');
  let audioContext,masterGain,currentScene,currentTrack,paused=false,targetVolume=.45,noiseBuffer;
  const midiToHz=(note)=>440*Math.pow(2,(note-69)/12);

  function reflectAudioState(){
    const running=Boolean(audioContext&&audioContext.state==='running');
    audioGate.classList.toggle('visible',!running);
    document.body.classList.toggle('playing',running&&Boolean(currentTrack)&&!paused);
    status.textContent=running?'Audio is playing locally.':'Playback is blocked. Click Enable Audio once to continue.';
  }
  function ensureAudio(){
    if(!audioContext){
      const AudioContextClass=window.AudioContext||window.webkitAudioContext;
      audioContext=new AudioContextClass();masterGain=audioContext.createGain();masterGain.gain.value=targetVolume;masterGain.connect(audioContext.destination);
      audioContext.addEventListener('statechange',reflectAudioState);
    }
    reflectAudioState();
    void audioContext.resume().then(reflectAudioState).catch(reflectAudioState);
    return audioContext;
  }
  function noise(context){
    if(noiseBuffer)return noiseBuffer;const length=context.sampleRate*2;noiseBuffer=context.createBuffer(1,length,context.sampleRate);const data=noiseBuffer.getChannelData(0);let seed=1234567;
    for(let i=0;i<length;i+=1){seed=(seed*16807)%2147483647;data[i]=(seed/1073741823.5-1)*.35}return noiseBuffer;
  }
  function envelope(gain,at,peak,duration){gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(peak,at+Math.min(.04,duration*.15));gain.gain.exponentialRampToValueAtTime(.0001,at+duration)}
  function scheduleNote(scene,note,at,duration,peak,type='sine'){
    const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),filter=audioContext.createBiquadFilter();oscillator.type=type;oscillator.frequency.value=midiToHz(note);filter.type='lowpass';filter.frequency.value=1500;envelope(gain,at,peak,duration);oscillator.connect(filter).connect(gain).connect(scene.gain);oscillator.start(at);oscillator.stop(at+duration+.1);
  }
  function scheduleBeat(scene,at,texture){
    const source=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter(),gain=audioContext.createGain();source.buffer=noise(audioContext);filter.type='highpass';filter.frequency.value=texture==='brushes'?2200:900;envelope(gain,at,texture==='brushes'?.025:.04,.09);source.connect(filter).connect(gain).connect(scene.gain);source.start(at);source.stop(at+.12);
  }
  function startScene(track,fadeMs){
    const context=ensureAudio(),now=context.currentTime,fade=Math.max(.02,fadeMs/1000),synth=track.synthesis,gain=context.createGain();gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.72,now+fade);gain.connect(masterGain);
    const scene={gain,nodes:[],timer:undefined,stopped:false,step:0,nextAt:now+.05};
    const baseChord=synth.chordProgression[0];baseChord.slice(0,3).forEach((interval,index)=>{const oscillator=context.createOscillator(),voice=context.createGain();oscillator.type=index===0?'sine':'triangle';oscillator.frequency.value=midiToHz(synth.rootMidi+interval);voice.gain.value=synth.texture==='air'?.045:.018;oscillator.connect(voice).connect(gain);oscillator.start();scene.nodes.push(oscillator)});
    const beat=60/synth.tempoBpm;
    const schedule=()=>{if(scene.stopped)return;while(scene.nextAt<context.currentTime+.8){const chord=synth.chordProgression[Math.floor(scene.step/8)%synth.chordProgression.length];if(scene.step%4===0)scheduleNote(scene,synth.rootMidi-12+chord[0],scene.nextAt,beat*.8,.1,synth.texture==='brushes'?'triangle':'sine');if(Math.random()<synth.melodyDensity*.32){const interval=synth.scale[(scene.step*3+2)%synth.scale.length];scheduleNote(scene,synth.rootMidi+12+interval,scene.nextAt,beat*1.4,.035,synth.texture==='tape'?'sine':'triangle')}if(synth.texture!=='air'&&Math.random()<synth.rhythmDensity*.7)scheduleBeat(scene,scene.nextAt,synth.texture);scene.step+=1;scene.nextAt+=beat/2}};
    schedule();scene.timer=setInterval(schedule,180);return scene;
  }
  function stopScene(scene,fadeMs){if(!scene||scene.stopped)return;scene.stopped=true;if(scene.timer)clearInterval(scene.timer);const now=audioContext.currentTime,fade=Math.max(.02,fadeMs/1000);scene.gain.gain.cancelScheduledValues(now);scene.gain.gain.setValueAtTime(Math.max(scene.gain.gain.value,.0001),now);scene.gain.gain.exponentialRampToValueAtTime(.0001,now+fade);setTimeout(()=>{scene.nodes.forEach((node)=>{try{node.stop()}catch(_){}});scene.gain.disconnect()},fadeMs+150)}
  function play(track,fadeMs){const previous=currentScene;currentTrack=track;currentScene=startScene(track,fadeMs);if(previous)stopScene(previous,fadeMs);const now=audioContext.currentTime,fade=Math.max(.02,fadeMs/1000);masterGain.gain.cancelScheduledValues(now);masterGain.gain.setValueAtTime(Math.max(masterGain.gain.value,.0001),now);masterGain.gain.exponentialRampToValueAtTime(Math.max(targetVolume,.0001),now+fade);paused=false;title.textContent=track.title;artist.textContent=track.artist+' · generated locally';toggle.textContent='Pause';reflectAudioState()}
  function setPaused(next,fadeMs){paused=next;toggle.textContent=paused?'Resume':'Pause';if(!audioContext||!masterGain){reflectAudioState();return}const now=audioContext.currentTime,fade=Math.max(.02,fadeMs/1000);masterGain.gain.cancelScheduledValues(now);masterGain.gain.setValueAtTime(Math.max(masterGain.gain.value,.0001),now);masterGain.gain.exponentialRampToValueAtTime(paused?.0001:Math.max(targetVolume,.0001),now+fade);reflectAudioState()}
  window.addEventListener('message',(event)=>{const message=event.data;if(message.type==='play')play(message.track,message.fadeDurationMs);if(message.type==='pause')setPaused(true,message.fadeDurationMs);if(message.type==='resume'){ensureAudio();setPaused(false,message.fadeDurationMs)}if(message.type==='stop'){stopScene(currentScene,message.fadeDurationMs);currentScene=undefined;currentTrack=undefined;document.body.classList.remove('playing');title.textContent='Session stopped';status.textContent='Start another session from the Command Palette.'}if(message.type==='volume'){targetVolume=Math.max(0,Math.min(1,message.volume));volumeInput.value=String(targetVolume);if(masterGain&&!paused)masterGain.gain.setTargetAtTime(Math.max(targetVolume,.0001),audioContext.currentTime,.08)}});
  toggle.addEventListener('click',()=>vscode.postMessage({type:'control',action:paused?'resume':'pause'}));stopButton.addEventListener('click',()=>vscode.postMessage({type:'control',action:'stop'}));volumeInput.addEventListener('input',()=>vscode.postMessage({type:'control',action:'setVolume',value:Number(volumeInput.value)}));audioGate.addEventListener('click',()=>{ensureAudio();if(currentTrack&&paused)vscode.postMessage({type:'control',action:'resume'})});vscode.postMessage({type:'ready'});
</script></body></html>`;
  }
}

function createNonce(): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => characters.charAt(Math.floor(Math.random() * characters.length))).join("");
}
