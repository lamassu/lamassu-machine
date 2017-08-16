# node-prebuilt-bindings

[![npm](https://img.shields.io/npm/v/prebuilt-bindings.svg)](https://www.npmjs.com/package/prebuilt-bindings)

**node-prebuilt-bindings** is an alternative to [node-pre-gyp](https://github.com/mapbox/node-pre-gyp). It allows your users to automatically fetch prebuilt native modules from a location you provide (e.g. GitHub Releases), avoiding messy compilation issues.

## Benefits/philosophy

### Pros

* Leave legacy cruft behind. Only support most recent Node in [*active* Long-term Support](https://github.com/nodejs/LTS#lts-schedule) (currently v4) and newer.
    - Take advantage of [ES2015 and later features](http://node.green/) (but don't require `--harmony` flag).
* Configuration is code with sensible defaults.
    - Defaults to using [GitHub Releases](https://help.github.com/articles/about-releases/).
    - Easily implement features such as only building on specific platforms.
* Does not take over `node-gyp`.
    - Allows you to run `node-gyp` directly if you wish.
    - Works great with [windows-build-tools](https://github.com/felixrieseberg/windows-build-tools).
* Supports multiple bindings per module.
* Super easy [nvm](https://github.com/creationix/nvm) integration.
    - Global installation not required!
* Minimal bloat-free implementation.
* Dependency free!

### Cons

The current limitations are as follows.

* Not compatible with old Node.js versions.
    - Your module won't be either.
* Does not yet support `http_proxy` and friends.
* Does not support overriding hosted binary location at install time.
* Does not support multiple files (e.g. generated artifacts) per binding.

If any of these is a deal-breaker, you might want to consider [node-pre-gyp](https://github.com/mapbox/node-pre-gyp) instead.

## Installation

Do not install `prebuilt-bindings` globally. Do the following to add it to your package instead.

Using [yarn](https://yarnpkg.com/):

```sh
yarn add prebuilt-bindings
```

Using [npm](https://www.npmjs.com/):

```sh
npm install --save prebuilt-bindings
```

Now, create a file called `prebuilt-bindings.js` in your module's root folder. The filename does not actually matter, but it's a good convention to keep it that way.

The contents of the file should look like this:

```js
const prebuild = require('prebuilt-bindings')

module.exports = prebuild({
  context: __dirname,
  bindings: [{
    name: 'put_the_name_of_your_module_here'
  }]
})
```

This simple config file is all you need to get going with GitHub Releases. The remote location is inferred from your `package.json`'s `repository` field and does not need to be set.

Now, modify your `package.json` as follows to include an installation script:

```json
"scripts": {
  "install": "node ./prebuilt-bindings install",
  "prebuilt-bindings": "node ./prebuilt-bindings"
}
```

This replaces the built-in npm `install` script, which is just `node-gyp rebuild` by default.

Finally, you should have the following entries in your `.gitignore` and `.npmignore`:

```
/*.node.gz
/build/
```

The first one makes sure that you won't accidentally commit or embed the prebuilt bindings, and the second one does the same for the build folder.

## Usage

So, **prebuilt-bindings** is not installed globally and doesn't come with a binary. How exactly do you run it?

Thanks to the config we just set up, it's easy:

```sh
npm run prebuilt-bindings -- help
```

All arguments after `--` are passed to `prebuilt-bindings`.

Note that you can simply replace `npm` with `yarn` if you like.

Okay, but why go through `npm`? The reason is that `npm` manages a large collection of environment variables that are essential to building native bindings, such as `http_proxy` settings, the location of `python` on Windows when using tools like [windows-build-tools](https://github.com/felixrieseberg/windows-build-tools), and that `node-gyp` is prepended to `PATH` for the build fallback. Duplicating all of these would add hundreds of lines of error-prone code. It's much better to just rely on `npm` or `yarn` to set them for us. It also ensures that you're building with the correct version of `node-gyp`.

**_Aside from building_**, you can also use `node ./prebuilt-bindings.js` if you prefer. However, try the recommended way if you run into any issues.

Now that we've got that out of the way, let's get to packing.

```sh
npm run prebuilt-bindings -- clean build pack
```

This should create a properly named archive for you to attach to the corresponding GitHub release. Simply upload the files and any new installs of your module will fetch them.

### Recommended release flow

1. Tag a new release, preferably with `npm version <patch|minor|major>`.
2. For each Node version you want to prebuild for, run `npm run prebuilt-bindings -- clean build pack`. See [nvm integration](#nvm-integration) below for how to build for multiple versions.
3. Run `npm pack` to preview the archive you're about to publish.
4. Run `tar tf *.tgz` and make sure you're not accidentally embedding native modules to the archive. Remove unwanted files and/or add them to `.npmignore`. Then go back to the previous step and check again.
5. Push your tag and branch to GitHub with `git push -u origin master --tags`.
6. On the Releases tab in GitHub, select the new tag and create a release. Attach the prebuilt binding files to the release.
7. Run `npm publish`.

Please feel free to script or automate these steps.

### [nvm](https://github.com/creationix/nvm) integration

With `nvm exec`, it's easy to build and pack bindings for each version you support. For example, you might do the following:

```sh
nvm exec 4 npm run prebuilt-bindings -- clean build pack
nvm exec 5 npm run prebuilt-bindings -- clean build pack
nvm exec 6 npm run prebuilt-bindings -- clean build pack
nvm exec 7 npm run prebuilt-bindings -- clean build pack
```

You should now have a properly named archive for each version. Simply attach the files to the corresponding GitHub Release.

### Only build for some platforms

This is a thing that isn't easily doable with plain `node-gyp`. Thanks to our configuration being actual code, it's easy to achieve with `prebuilt-bindings`:

```js
const prebuild = require('prebuilt-bindings')

module.exports = prebuild({
  context: __dirname,
  bindings: (() => {
    switch (process.platform) {
      case 'darwin':
        return [{
          name: 'put_the_name_of_your_module_here'
        }]
      default:
        return []
    }
  })()
})
```

With this configuration, bindings only get downloaded and built on macOS. Other platforms simply do nothing since there are no bindings set.

Naturally, there are endless ways to write the configuration. You could do something like this to avoid even the require on other platforms:

```js
switch (process.platform) {
  case 'darwin': {
    const prebuild = require('prebuilt-bindings')
    module.exports = prebuild({
      context: __dirname,
      bindings: [{
        name: 'put_the_name_of_your_module_here'
      }]
    })
    break
  }
}
```

It isn't strictly necessary to export the returned promise, but it may assist in future tooling.

## Gotchas

If building fails with `Error: spawn node-gyp ENOENT`, it can pretty much only mean that you tried to run `node ./prebuilt-bindings.js` directly. See [Usage](#usage) for an explanation of why that doesn't work when building.

## License

See [LICENSE](LICENSE).
