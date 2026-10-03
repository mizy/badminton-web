import { startGame } from './play/start'

const dispose = startGame()
if (import.meta.hot) import.meta.hot.dispose(dispose)
