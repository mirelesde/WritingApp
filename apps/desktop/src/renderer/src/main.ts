import { mount } from 'svelte'

import './assets/main.css'

import App from './App.svelte'

// macOS draws its own translucent sidebar and traffic lights; the CSS keys off this.
if (navigator.platform.startsWith('Mac')) document.documentElement.classList.add('mac')

// Dropping a file anywhere the app does not take it must do nothing, not open the file.
for (const type of ['dragover', 'drop'] as const) {
  window.addEventListener(type, (event) => {
    if (event.dataTransfer?.types.includes('Files') && !event.defaultPrevented) event.preventDefault()
  })
}

const app = mount(App, {
  target: document.getElementById('app')!
})

export default app
