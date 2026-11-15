// A small driver for the built app: starts Electron with a throwaway data folder and library,
// and talks to the page over the Chrome DevTools protocol. No extra packages: Node's own
// fetch and WebSocket are enough. Run `npm run build` first; `npm run e2e` runs the tests.
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, realpath } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const appDir = join(here, '..')
// The `electron` package's main export is the path of the binary, which works on every system.
const electronBin = createRequire(import.meta.url)('electron')

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Polls until `fn` returns something truthy, or fails after `ms`. */
export async function until(fn, what, ms = 8000) {
  const end = Date.now() + ms
  let last
  while (Date.now() < end) {
    try {
      last = await fn()
      if (last) return last
    } catch {
      // not ready yet
    }
    await sleep(100)
  }
  throw new Error(`Timed out waiting for ${what}`)
}

/** A library on disk made from `{ 'Group/Sheet.md': 'text' }`, in a fresh temp folder. */
export async function makeLibrary(files) {
  // Windows' temp folder can be an 8.3 short path (RUNNER~1); the app sees the long one.
  const root = await realpath(await mkdtemp(join(tmpdir(), 'wa-e2e-lib-')))
  for (const [rel, text] of Object.entries(files)) {
    const file = join(root, rel)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, text)
  }
  return root
}

export { readFile, readdir, rm, join, existsSync }

export class App {
  /** Starts the app on `library`. Keep `dataDir` between launches to test restarts. */
  static async launch(library, dataDir) {
    if (!existsSync(join(appDir, 'out', 'main', 'index.js'))) throw new Error('Build the app first: npm run build')
    const data = dataDir ?? (await mkdtemp(join(tmpdir(), 'wa-e2e-data-')))
    await writeFile(join(data, 'settings.json'), JSON.stringify({ libraryPath: library }))
    // The Linux CI sandbox cannot run Chromium's own sandbox; a developer's machine can.
    const extra = process.env.CI && process.platform === 'linux' ? ['--no-sandbox'] : []
    const child = spawn(electronBin, ['.', '--remote-debugging-port=0', '--inspect=0', `--user-data-dir=${data}`, ...extra], {
      cwd: appDir,
      stdio: ['ignore', 'ignore', 'pipe']
    })
    const urls = await new Promise((resolve, reject) => {
      let text = ''
      const timer = setTimeout(() => reject(new Error(`The app did not start:\n${text}`)), 30000)
      child.stderr.on('data', (d) => {
        text += d
        const page = text.match(/DevTools listening on (ws:\/\/[^\s]+)/)
        const main = text.match(/Debugger listening on (ws:\/\/[^\s]+)/)
        if (page && main) {
          clearTimeout(timer)
          resolve({ page: page[1], main: main[1] })
        }
      })
      child.on('exit', () => reject(new Error(`The app exited early:\n${text}`)))
    })
    const port = new URL(urls.page).port
    const app = new App(child, data, port)
    app.mainUrl = urls.main
    await app.connect()
    return app
  }

  constructor(child, dataDir, port) {
    this.child = child
    this.dataDir = dataDir
    this.port = port
    this.id = 0
    this.waiting = new Map()
  }

  async connect() {
    const targets = await until(
      async () => {
        const list = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json()
        return list.find((t) => t.type === 'page' && t.url.includes('index.html'))
      },
      'the window'
    )
    this.ws = new WebSocket(targets.webSocketDebuggerUrl)
    await new Promise((r) => (this.ws.onopen = r))
    this.ws.onmessage = (m) => {
      const d = JSON.parse(m.data)
      this.waiting.get(d.id)?.(d)
    }
    await until(() => this.eval(`document.querySelector('.cm-content, .sheet, .row, .welcome') !== null`), 'the UI')
  }

  send(method, params = {}) {
    return new Promise((resolve) => {
      const n = ++this.id
      this.waiting.set(n, (d) => {
        this.waiting.delete(n)
        resolve(d)
      })
      this.ws.send(JSON.stringify({ id: n, method, params }))
    })
  }

  /** Runs JavaScript in the page and returns its value. */
  async eval(expression) {
    const d = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (d.result?.exceptionDetails) throw new Error(d.result.exceptionDetails.exception?.description ?? 'page error')
    return d.result?.result?.value
  }

  /** Runs JavaScript in Electron's main process, where dialogs can be given fixed answers. */
  async mainEval(expression) {
    const ws = new WebSocket(this.mainUrl)
    await new Promise((r) => (ws.onopen = r))
    const out = await new Promise((resolve) => {
      ws.onmessage = (m) => resolve(JSON.parse(m.data))
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    })
    ws.close()
    if (out.result?.exceptionDetails) throw new Error(out.result.exceptionDetails.exception?.description ?? 'main error')
    return out.result?.result?.value
  }

  /** Makes the next save and open dialogs answer without showing: the paths are given when each is opened. */
  async stubDialogs() {
    await this.mainEval(`(()=>{const d=process.mainModule.require('electron').dialog; globalThis.__answer={save:null,open:[]}; d.showSaveDialog=async()=>({canceled:false,filePath:globalThis.__answer.save}); d.showOpenDialog=async()=>({canceled:false,filePaths:globalThis.__answer.open}); return 1})()`)
  }

  answerDialogs({ save, open }) {
    return this.mainEval(`(globalThis.__answer.save=${JSON.stringify(save ?? null)}, globalThis.__answer.open=${JSON.stringify(open ?? [])}, 1)`)
  }

  /** Sends a menu command to the window, as choosing it from the menu would. */
  menu(command) {
    return this.mainEval(`process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].webContents.send('menu:command', ${JSON.stringify(command)})`)
  }

  /** Where the middle of the first element matching `js` (an expression giving an element) is. */
  async center(js) {
    const p = await this.eval(`(()=>{const e=(${js}); if(!e) return null; const b=e.getBoundingClientRect(); return [b.x+b.width/2,b.y+b.height/2]})()`)
    if (!p) throw new Error(`No element for ${js}`)
    return p
  }

  /** A real mouse click, the way a person would make it. */
  async click(js, button = 'left') {
    const [x, y] = await this.center(js)
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 })
  }

  /** A real key press; `modifiers` is a bitmask: alt 1, ctrl 2, meta 4, shift 8. */
  async key(key, modifiers = 0) {
    const code = key.length === 1 ? `Key${key.toUpperCase()}` : key
    const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, windowsVirtualKeyCode: vk })
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers })
  }

  /** The cmd key on a Mac, ctrl elsewhere. */
  get mod() {
    return process.platform === 'darwin' ? 4 : 2
  }

  /** Types into the editor at the cursor, or into the element `selector` names. */
  async type(text, selector = '.cm-content') {
    await this.eval(`(()=>{const c=document.querySelector(${JSON.stringify(selector)}); c.focus(); document.execCommand('insertText', false, ${JSON.stringify(text)}); return true})()`)
  }

  sheetCard = (text) => `[...document.querySelectorAll('.sheet')].find(s => s.innerText.includes(${JSON.stringify(text)}))`
  groupRow = (text) => `[...document.querySelectorAll('.row')].find(r => r.innerText.includes(${JSON.stringify(text)}))`
  button = (text) => `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})`
  menuItem = (text) => `[...document.querySelectorAll('[role=menuitem]')].find(m => m.innerText.trim().startsWith(${JSON.stringify(text)}))`

  /** Clicks a sheet's card and waits until the editor shows it. */
  async open(title) {
    await this.click(this.sheetCard(title))
    await until(() => this.eval(`document.querySelector('.cm-content')?.innerText.includes(${JSON.stringify(title)})`), `the sheet ${title}`)
  }

  /** Right-clicks `target` and chooses `item` from the menu that opens. */
  async chooseFromMenu(target, item) {
    await this.click(target, 'right')
    await until(() => this.eval(`document.querySelector('[role=menu]') !== null`), 'the menu')
    await this.click(this.menuItem(item))
  }

  /** Closes the app the polite way. */
  async quit() {
    this.ws?.close()
    this.child.kill('SIGTERM')
    // With unsaved text the app asks before quitting, so it may not leave by itself.
    const force = setTimeout(() => this.child.kill('SIGKILL'), 3000)
    await this.exited()
    clearTimeout(force)
  }

  /** Resolves once the process is gone, and lets go of its pipes so the test run can end. */
  async exited() {
    if (this.child.exitCode === null && this.child.signalCode === null) await new Promise((r) => this.child.once('exit', r))
    this.child.stderr?.destroy()
    this.child.unref()
  }

  /** Kills it the way a crash or power cut would. */
  async crash() {
    this.ws?.close()
    this.child.kill('SIGKILL')
    await this.exited()
  }
}
