// End-to-end checks of the built app. Each test starts the app on a throwaway library.
// Run: npm run build && npm run e2e   (needs a display; on Linux CI use xvfb-run)
import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { App, makeLibrary, readFile, readdir, rm, join, until, sleep } from './harness.mjs'

const LIB = {
  'Novel/Alpha.md': '# Alpha\n\nFirst sheet.\n',
  'Novel/Beta.md': '# Beta\n\nSecond sheet.\n',
  'Novel/Part/Gamma.md': '# Gamma\n\nThird.\n'
}

let app
let library
afterEach(async () => {
  await app?.quit().catch(() => undefined)
  if (library) await rm(library, { recursive: true, force: true })
  if (app?.dataDir) await rm(app.dataDir, { recursive: true, force: true })
  app = library = undefined
})

async function start(files = LIB) {
  library = await makeLibrary(files)
  app = await App.launch(library)
  await app.click(app.groupRow('Novel'))
  await until(() => app.eval(`document.querySelectorAll('.sheet').length >= 2`), 'the sheet list')
}

const names = async (dir) => (await readdir(join(library, dir))).filter((n) => n.endsWith('.md')).sort()

describe('the app', () => {
  it('opens a library and shows its sheets', async () => {
    await start()
    assert.ok(await app.eval(`${app.sheetCard('Alpha')} !== undefined`))
    assert.ok(await app.eval(`${app.sheetCard('Beta')} !== undefined`))
  })

  it('opens a sheet and saves what is typed', async () => {
    await start()
    await app.open('Alpha')
    await app.type('TYPED ')
    await until(async () => (await readFile(join(library, 'Novel', 'Alpha.md'), 'utf8')).includes('TYPED'), 'the save')
  })

  it('duplicates and trashes from the right-click menu', async () => {
    await start()
    await app.open('Beta')
    await app.chooseFromMenu(app.sheetCard('Beta'), 'Duplicate')
    await until(async () => (await names('Novel')).length === 3, 'the copy')
    await app.open('Beta')
    await app.chooseFromMenu(app.sheetCard('Beta'), 'Move to Trash')
    await until(async () => (await names('Novel')).length === 2, 'the trash')
  })

  it('copies a sheet into another group with the keyboard', async () => {
    await start()
    await app.open('Beta')
    await app.key('c', app.mod)
    await app.click(app.groupRow('Novel'))
    await app.key('ArrowRight') // opens the group, so Part shows
    await until(() => app.eval(`${app.groupRow('Part')} !== undefined`), 'the Part group')
    await app.click(app.groupRow('Part'))
    await app.key('v', app.mod)
    await until(async () => (await names('Novel/Part')).length === 2, 'the paste')
    assert.deepEqual(await names('Novel'), ['Alpha.md', 'Beta.md'])
  })

  it('brings back text that was typed when the app was killed', async () => {
    await start()
    await app.open('Alpha')
    // Manual saving, so the only copy of the text is the recovery journal.
    await app.eval(`window.api.setView({ saveMode: 'manual' })`)
    await sleep(300)
    await app.type('LOSTTEXT ')
    await sleep(1500) // the journal writes shortly after a keystroke
    const data = app.dataDir
    await app.crash()
    assert.ok(!(await readFile(join(library, 'Novel', 'Alpha.md'), 'utf8')).includes('LOSTTEXT'))
    app = await App.launch(library, data)
    await until(() => app.eval(`document.body.innerText.includes('LOSTTEXT')`), 'the recovery offer')
  })

  it('does not bring back text that Don’t Save discarded, even with the sheet in two tabs', async () => {
    await start()
    await app.eval(`window.api.setView({ saveMode: 'manual' })`)
    await sleep(300)
    await app.open('Alpha')
    // New tab: a copy of the open sheet, then type in it and close it without saving.
    await app.click(`document.querySelector('[aria-label="New tab"]')`)
    await until(() => app.eval(`document.querySelectorAll('.tab').length === 2`), 'the second tab')
    await app.type('DISCARDME ')
    await app.click(`document.querySelectorAll('.tab-close')[1]`)
    await until(() => app.eval(`${app.button('Don’t Save')} !== undefined`), 'the question')
    await app.click(app.button('Don’t Save'))
    await until(() => app.eval(`document.querySelectorAll('.tab').length === 1`), 'one tab left')
    assert.equal(await app.eval(`document.querySelector('.cm-content').innerText.includes('DISCARDME')`), false)
    assert.ok(!(await readFile(join(library, 'Novel', 'Alpha.md'), 'utf8')).includes('DISCARDME'))
  })
})
