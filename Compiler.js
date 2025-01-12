const { SyncHook } = require('tapable');

class Compiler {
  constructor(options) {
    this.options = options
    this.hooks = {
      run: new SyncHook(),
      done: new SyncHook(),
    };
  }

  run(callback) {
    this.hooks.run.call();
    console.log('Compiler run');
    this.hooks.done.call();
    callback(null, {
      toJson: () => {
        return {
          modules: [],
          chunks: [],
          assets: [],
        };
      },
    });
  }
}

module.exports = Compiler;