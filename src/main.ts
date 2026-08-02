/**
 * Badminton Web — 入口文件
 * @entry
 */

import { getAIConfig } from './ai/difficulty'
import { DemoController } from './demo/demoController'
import { startGame } from './play/start'

startGame(new DemoController(getAIConfig('medium'), getAIConfig('medium'), true))
