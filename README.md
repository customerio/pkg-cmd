# pkg-cmd

> Set of scripts to help with common package tasks. Supports Node and Go.

## Install

To install pkg-cmd, run:

```sh
npm install test
```

## Usage

When installed, you can run the following commands to initialize a new package:

```sh
npx pkg-cmd init
```

This will start an interactive prompt to help you set up your package.

## API

### `pkg-cmd init`

Starts an interactive prompt to help you set up your package.

### `pkg-cmd format`

Runs prettier.

### `pkg-cmd lint`

Runs all lint commands.

### `pkg-cmd lint:eslint`

Runs eslint.

### `pkg-cmd lint:alex`

Runs alex.

### `pkg-cmd release`

Runs np.

### `pkg-cmd test`

Runs jest commands.

---

## License

Released under the MIT License. See file [LICENSE](./LICENSE) for more details.

<!-- pkg-cmd
	init
	build - runs esbuild
	watch - runs esbuild in watch mode
	test - runs all test:*
	lint - runs all lint:*
	format - run prettier
	update - update the pkg-cmd and run codemods

	test:jest - runs jest test
	test:playwright - runs playwright tests
	test:new - adds a new test? https://github.com/vercel/next.js/blob/canary/plopfile.js#L7
	lint:eslint - runs eslint
	lint:alex - alex -->
