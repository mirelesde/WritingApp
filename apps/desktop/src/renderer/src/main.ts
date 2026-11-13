import { mount } from 'svelte'

import './assets/main.css'

import App from './App.svelte'

// macOS draws its own translucent sidebar and traffic lights; the CSS keys off this.
if (navigator.platform.startsWith('Mac')) document.documentElement.classList.add('mac')

const app = mount(App, {
  target: document.getElementById('app')!
})

export default app
