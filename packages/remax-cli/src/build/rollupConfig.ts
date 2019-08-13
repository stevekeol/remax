import { RollupOptions, RollupWarning } from 'rollup';
import path from 'path';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import babel from 'rollup-plugin-babel';
import url from 'rollup-plugin-url';
import json from 'rollup-plugin-json';
import postcss from 'rollup-plugin-postcss';
import progress from 'rollup-plugin-progress';
import clear from 'rollup-plugin-clear';
import alias from 'rollup-plugin-alias';
import pxToUnits from 'postcss-px2units';
import getEntries from '../getEntries';
import getCssModuleConfig from '../getCssModuleConfig';
import template from './plugins/template';
import components from './plugins/components';
import page from './plugins/page';
import removeSrc from './plugins/removeSrc';
import removeConfig from './plugins/removeConfig';
import rename from './plugins/rename';
import replace from 'rollup-plugin-replace';
import * as React from 'react';
import * as scheduler from 'scheduler';
import { RemaxOptions } from '../getConfig';
import app from './plugins/app';
import removeESModuleFlag from './plugins/removeESModuleFlag';
import { Adapter } from './adapters';

export default function rollupConfig(
  options: RemaxOptions,
  argv: any,
  adapter: Adapter
) {
  const babelConfig = {
    presets: [
      require.resolve('@babel/preset-typescript'),
      [require.resolve('@babel/preset-env')],
      [require.resolve('@babel/preset-react')],
    ],
    plugins: [
      require.resolve('@babel/plugin-proposal-class-properties'),
      require.resolve('@babel/plugin-proposal-object-rest-spread'),
      [
        require.resolve('@babel/plugin-proposal-decorators'),
        {
          decoratorsBeforeExport: true,
        },
      ],
    ],
  };
  const entries = getEntries(options, adapter);
  const cssModuleConfig = getCssModuleConfig(options.cssModules);

  const plugins = [
    alias({
      resolve: [
        '',
        '.ts',
        '.js',
        '.tsx',
        '.jsx',
        '/index.js',
        '/index.jsx',
        '/index.ts',
        '/index.tsx',
      ],
      '@': path.resolve(options.cwd, 'src'),
    }),
    url({
      limit: 0,
      fileName: '[dirname][name][extname]',
      publicPath: '/',
      include: ['**/*.svg', '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif'],
    }),
    commonjs({
      include: /node_modules/,
      namedExports: {
        react: Object.keys(React).filter(k => k !== 'default'),
        scheduler: Object.keys(scheduler).filter(k => k !== 'default'),
      },
    }),
    babel({
      include: entries.pages,
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      plugins: [page, ...babelConfig.plugins],
      presets: babelConfig.presets,
    }),
    babel({
      include: entries.app,
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      plugins: [app, ...babelConfig.plugins],
      presets: babelConfig.presets,
    }),
    babel({
      babelrc: false,
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      plugins: [components(adapter), ...babelConfig.plugins],
      presets: babelConfig.presets,
    }),
    postcss({
      extract: true,
      modules: cssModuleConfig,
      plugins: [pxToUnits()],
    }),
    json({}),
    resolve({
      dedupe: [
        'react',
        'object-assign',
        'prop-types',
        'scheduler',
        'react-reconciler',
      ],
      extensions: ['.mjs', '.js', '.jsx', '.json', '.ts', '.tsx'],
      customResolveOptions: {
        moduleDirectory: 'node_modules',
      },
    }),
    replace({
      'process.env.NODE_ENV': JSON.stringify(
        process.env.NODE_ENV || 'development'
      ),
      'process.env.REMAX_PLATFORM': JSON.stringify(argv.target),
    }),
    rename({
      include: 'src/**',
      map: input => {
        if (!input) {
          return input;
        }

        input = input
          .replace(/^demo\/src\//, '')
          // stlye
          .replace(/\.less$/, '.less.js')
          // typescript
          .replace(/\.ts$/, '.js')
          .replace(/\.tsx$/, '.js')
          // image
          .replace(/\.png$/, '.png.js')
          .replace(/\.gif$/, '.gif.js')
          .replace(/\.svg$/, '.svg.js')
          .replace(/\.jpeg$/, '.jpeg.js')
          .replace(/\.jpg$/, '.jpg.js');

        // 不启用 css module 的 css 文件以及 app.css
        if (
          cssModuleConfig.globalModulePaths.some(reg => reg.test(input)) ||
          input.indexOf('app.css') !== -1
        ) {
          return input.replace(/\.css/, adapter.extensions.style);
        }

        return input.replace(/\.css/, '.css.js');
      },
    }),
    rename({
      matchAll: true,
      map: input => {
        return (
          input &&
          input
            .replace(/node_modules/, 'npm')
            .replace(/\.js_commonjs-proxy$/, '.js_commonjs-proxy.js')
        );
      },
    }),
    removeSrc({}),
    removeConfig(),
    removeESModuleFlag(),
    template(options, adapter),
  ];

  if (options.progress) {
    plugins.push(progress());
  }

  if (!argv.watch) {
    plugins.unshift(
      clear({
        targets: options.output,
      })
    );
  }

  const config: RollupOptions = {
    input: [
      entries.app,
      entries.appConfigPath,
      ...entries.pages,
      ...entries.pageConfigPath,
    ],
    output: {
      dir: options.output,
      format: adapter.moduleFormat,
      exports: 'named',
      sourcemap: false,
    },
    preserveModules: true,
    preserveSymlinks: true,
    onwarn(warning, warn) {
      if ((warning as RollupWarning).code === 'THIS_IS_UNDEFINED') return;
      warn(warning);
    },
    plugins,
  };

  return config;
}