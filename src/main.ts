import './styles.css'
import { startApp } from './app'

const root = document.querySelector('#app')
if (!(root instanceof HTMLElement)) throw new Error('Missing #app')
startApp(root)
