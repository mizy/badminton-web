import { existsSync } from 'node:fs'
import path from 'node:path'
import type { StorybookConfig } from '@storybook/html-vite'

const publicDir = path.resolve(process.cwd(), 'public')

const config: StorybookConfig = {
  stories: process.env.STORYBOOK_VIDEO_MOTIONS_ONLY === '1'
    ? ['../src/stories/video-motion-library.stories.ts']
    : ['../src/**/*.stories.@(ts|mdx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-links',
  ],
  framework: {
    name: '@storybook/html-vite',
    options: {},
  },
  staticDirs: existsSync(publicDir) ? ['../public'] : [],
  viteFinal: async (viteConfig) => {
    // The game owns its service worker; Storybook serves its own assets normally.
    viteConfig.plugins = viteConfig.plugins?.filter(plugin => !(plugin && typeof plugin === 'object'
      && 'name' in plugin && plugin.name === 'offline-game'))
    return viteConfig
  },
}

export default config
