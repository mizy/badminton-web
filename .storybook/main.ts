import { existsSync } from 'node:fs'
import path from 'node:path'
import type { StorybookConfig } from '@storybook/html-vite'

const publicDir = path.resolve(process.cwd(), 'public')

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|mdx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-links',
  ],
  framework: {
    name: '@storybook/html-vite',
    options: {},
  },
  staticDirs: existsSync(publicDir) ? ['../public'] : [],
}

export default config
